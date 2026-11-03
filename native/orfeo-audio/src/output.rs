//! WASAPI output: exclusive (bypasses the Windows mixer, ~3 ms periods) with
//! automatic fallback to shared mode when the device refuses or is busy.

use wasapi::*;
use windows::Win32::Media::Audio::Endpoints::IAudioEndpointVolume;
use windows::Win32::System::Com::CLSCTX_ALL;

pub use crate::engine::OutputMode;

#[derive(Clone, Copy)]
pub enum SampleFmt { F32, I32, I24, I16 }

pub struct Output {
    pub client: AudioClient,
    pub render: AudioRenderClient,
    pub event: Handle,
    pub mode: OutputMode,
    pub rate: u32,
    pub fmt: SampleFmt,
    pub bytes_per_frame: usize,
    pub period_frames: u32,
    pub buffer_frames: u32,
    pub device_name: String,
    /// Delay the device reports for the stream (exclusive: the buffer itself)
    pub reported_latency_ms: f64,
    pub fallback_reason: Option<String>,
    /// Exclusive streams skip Windows' own volume (the taskbar slider, the
    /// volume keys) unless the sound card does it in hardware: then this is the
    /// device's volume control, which the engine applies itself
    volume: Option<IAudioEndpointVolume>,
}

fn fmt_of(f: &WaveFormat) -> SampleFmt {
    match (f.get_subformat().ok(), f.get_bitspersample()) {
        (Some(SampleType::Float), _) => SampleFmt::F32,
        (_, 32) => SampleFmt::I32,
        (_, 24) => SampleFmt::I24,
        _ => SampleFmt::I16,
    }
}

/// Exclusive period steps: the device minimum, about 6 ms, then 10 ms. The
/// engine moves up a step when the device can't keep the smaller one on time.
pub const EXCLUSIVE_STEPS: usize = 3;

fn open_exclusive(client: &mut AudioClient, rate: u32, step: usize) -> Result<(WaveFormat, u32), String> {
    let candidates = [(32usize, 32usize, SampleType::Float), (32, 24, SampleType::Int), (24, 24, SampleType::Int), (16, 16, SampleType::Int), (32, 32, SampleType::Int)];
    let fmt = candidates.iter()
        .find_map(|(s, v, t)| client.is_supported_exclusive_with_quirks(&WaveFormat::new(*s, *v, t, rate as usize, 2, None)).ok())
        .ok_or("the device accepts no usual exclusive format")?;
    let (_, min) = client.get_device_period().map_err(|e| e.to_string())?;
    let desired = match step { 0 => min, 1 => min.max(60_000), _ => min.max(100_000) }; // 100 ns units
    let period = client.calculate_aligned_period_near(desired, Some(128), &fmt).unwrap_or(desired);
    client.initialize_client(&fmt, &Direction::Render, &StreamMode::EventsExclusive { period_hns: period })
        .map_err(|e| format!("exclusive mode refused ({e}) — another app may be using the device, or exclusive control is disabled for it"))?;
    Ok((fmt, (period as f64 / 1e7 * rate as f64).round() as u32))
}

impl Output {
    /// Must be called on the thread that will render (COM is initialised there).
    /// `rate_for`: sound cards found to really run at another rate than Windows
    /// reports for them; their exclusive stream opens at that rate instead.
    pub fn open(want: OutputMode, step: usize, rate_for: &[(String, u32)]) -> Result<Output, String> {
        let en = DeviceEnumerator::new().map_err(|e| e.to_string())?;
        // Testing aid: ORFEO_AUDIO_DEVICE=<part of a device's name> picks that output
        // instead of Windows' default (the app never sets it)
        let pick = std::env::var("ORFEO_AUDIO_DEVICE").ok().and_then(|want| {
            en.get_device_collection(&Direction::Render).ok()?.into_iter().flatten()
                .find(|d| d.get_friendlyname().map(|n| n.contains(want.as_str())).unwrap_or(false))
        });
        let dev = match pick { Some(d) => d, None => en.get_default_device(&Direction::Render).map_err(|e| format!("no output device: {e}"))? };
        let device_name = dev.get_friendlyname().unwrap_or_default();
        let mut client = dev.get_iaudioclient().map_err(|e| e.to_string())?;
        let mix = client.get_mixformat().map_err(|e| e.to_string())?;
        let shared_rate = mix.get_samplespersec();
        let mut rate = rate_for.iter().find(|(d, _)| *d == device_name).map(|x| x.1).unwrap_or(shared_rate);

        let mut fallback_reason = None;
        let mut mode = want;
        let (fmt, period_frames) = if want == OutputMode::Exclusive {
            match open_exclusive(&mut client, rate, step) {
                Ok(x) => x,
                Err(e) => {
                    fallback_reason = Some(e);
                    mode = OutputMode::Shared;
                    // A failed Initialize leaves the client unusable — start from a fresh one
                    client = dev.get_iaudioclient().map_err(|e| e.to_string())?;
                    rate = shared_rate;
                    Self::init_shared(&mut client, rate)?
                }
            }
        } else {
            rate = shared_rate;
            Self::init_shared(&mut client, rate)?
        };
        let event = client.set_get_eventhandle().map_err(|e| e.to_string())?;
        let render = client.get_audiorenderclient().map_err(|e| e.to_string())?;
        let buffer_frames = client.get_buffer_size().map_err(|e| e.to_string())?;
        let reported_latency_ms = unsafe { client.as_iaudioclient().GetStreamLatency() }.map(|h| h as f64 / 1e4).unwrap_or(0.0);
        let volume = if mode == OutputMode::Exclusive { software_volume(&dev) } else { None };
        Ok(Output {
            bytes_per_frame: fmt.get_blockalign() as usize, fmt: fmt_of(&fmt),
            client, render, event, mode, rate, period_frames, buffer_frames, device_name, reported_latency_ms, fallback_reason, volume,
        })
    }

    fn init_shared(client: &mut AudioClient, rate: u32) -> Result<(WaveFormat, u32), String> {
        let fmt = WaveFormat::new(32, 32, &SampleType::Float, rate as usize, 2, None);
        let (def, _) = client.get_device_period().map_err(|e| e.to_string())?;
        client.initialize_client(&fmt, &Direction::Render, &StreamMode::EventsShared { autoconvert: true, buffer_duration_hns: def })
            .map_err(|e| format!("shared mode failed: {e}"))?;
        Ok((fmt, (def as f64 / 1e7 * rate as f64).round() as u32))
    }

    pub fn has_software_volume(&self) -> bool { self.volume.is_some() }

    /// e.g. "48000 Hz · 32-bit float", for reports
    pub fn format_name(&self) -> String {
        let f = match self.fmt { SampleFmt::F32 => "32-bit float", SampleFmt::I32 => "32-bit", SampleFmt::I24 => "24-bit", SampleFmt::I16 => "16-bit" };
        format!("{} Hz · {f}", self.rate)
    }

    /// Windows' volume for this stream as a gain (0 when muted), or 1 when
    /// Windows applies it anyway (shared mode, or a sound card with hardware volume)
    pub fn windows_gain(&self) -> f32 {
        let Some(v) = &self.volume else { return 1.0 };
        unsafe {
            if v.GetMute().map(|m| m.as_bool()).unwrap_or(false) { return 0.0 }
            v.GetMasterVolumeLevel().map(|db| 10f32.powf(db / 20.0)).unwrap_or(1.0)
        }
    }

    /// Interleaves and converts to the device format, then hands it over
    pub fn write(&self, l: &[f32], r: &[f32], scratch: &mut Vec<u8>) -> Result<(), String> {
        scratch.clear();
        for i in 0..l.len() {
            for s in [l[i], r[i]] {
                match self.fmt {
                    SampleFmt::F32 => scratch.extend_from_slice(&s.to_le_bytes()),
                    SampleFmt::I32 => scratch.extend_from_slice(&((s.clamp(-1.0, 1.0) as f64 * 2147483647.0) as i32).to_le_bytes()),
                    SampleFmt::I24 => { let v = (s.clamp(-1.0, 1.0) * 8388607.0) as i32; scratch.extend_from_slice(&v.to_le_bytes()[0..3]) }
                    SampleFmt::I16 => scratch.extend_from_slice(&((s.clamp(-1.0, 1.0) * 32767.0) as i16).to_le_bytes()),
                }
            }
        }
        self.render.write_to_device(l.len(), scratch, None).map_err(|e| e.to_string())
    }
}

/// The device's volume control, when it is done in software by Windows' mixer —
/// which an exclusive stream bypasses, so the engine must apply it itself
fn software_volume(dev: &Device) -> Option<IAudioEndpointVolume> {
    const HARDWARE_VOLUME: u32 = 1; // ENDPOINT_HARDWARE_SUPPORT_VOLUME
    let v: IAudioEndpointVolume = unsafe { dev.as_immdevice().Activate(CLSCTX_ALL, None) }.ok()?;
    let hw = unsafe { v.QueryHardwareSupport() }.unwrap_or(0);
    if hw & HARDWARE_VOLUME != 0 { None } else { Some(v) }
}
