//! macOS and Linux: the audio thread's device side, through CPAL (CoreAudio on
//! macOS; on Linux the sound server directly — PulseAudio, or PipeWire through
//! its PulseAudio side — and ALSA when no server runs, which CPAL decides).
//! Windows ships `wasapi_driver.rs` instead; this one also builds on Windows
//! with the `cpal-driver` feature, for development only.
//!
//! The difference from WASAPI: CPAL *calls us* for each block ("fill these
//! 128 frames now") on its own real-time thread. So the musician lives in a
//! `Mutex` shared by that callback and this supervising thread: the callback
//! renders with it (never waiting — if the supervisor happens to hold it, that
//! block is silence), and the supervisor only touches it while no stream runs
//! (opening, reopening after a device change).
//!
//! Low latency (`OutputMode::Exclusive` in the shared API — no exclusive access
//! is taken here) asks for small blocks: 128 frames, then 256 and 512 when the
//! card can't keep up, as the WASAPI driver steps up its period. Normal
//! (`Shared`) asks for 1024.

use crate::engine::{Command, LiveMsg, OutputMode, Stats};
use crate::renderer::Renderer;
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{BufferSize, ErrorKind, FromSample, SampleFormat, SizedSample, StreamConfig, SupportedBufferSize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering::Relaxed};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Low latency block sizes, smallest first
const LOW_LATENCY_STEPS: [u32; 3] = [128, 256, 512];
const NORMAL_FRAMES: u32 = 1024;
/// The renderer's buffers; a callback asking for more is rendered in pieces
const MAX_BLOCK: usize = 4096;

/// The system's sound host. Testing aid: ORFEO_AUDIO_HOST=alsa forces ALSA on
/// Linux (the app never sets it).
fn pick_host() -> cpal::Host {
    #[cfg(target_os = "linux")]
    if std::env::var("ORFEO_AUDIO_HOST").as_deref() == Ok("alsa") {
        if let Ok(h) = cpal::host_from_id(cpal::HostId::Alsa) { return h }
    }
    cpal::default_host()
}

/// What the callback and the error callback tell the supervisor
#[derive(Default)]
struct Signals {
    /// the stream must be rebuilt (device gone, invalidated, output mode changed)
    rebuild: AtomicBool,
    /// Low latency can't keep up with this block size: try the next one
    step_up: AtomicBool,
    shutdown: AtomicBool,
    /// the output mode the caller asked for (0 low latency, 1 normal)
    want_mode: AtomicU32,
}

/// Owned by the callback while a stream runs, by the supervisor in between
struct Musician {
    r: Renderer,
    cmds: rtrb::Consumer<Command>,
    live: Receiver<LiveMsg>,
}

/// One opened output: the device and what we'll ask of it
struct Opened {
    device: cpal::Device,
    id: Option<cpal::DeviceId>,
    name: String,
    config: StreamConfig,
    format: SampleFormat,
    mode: OutputMode,
    fallback_reason: Option<String>,
}

fn mode_code(m: OutputMode) -> u32 { if m == OutputMode::Exclusive { 0 } else { 1 } }
fn mode_of(code: u32) -> OutputMode { if code == 0 { OutputMode::Exclusive } else { OutputMode::Shared } }

/// The default output, with the block size for `mode` (clamped to what the
/// device says it supports)
fn open(host: &cpal::Host, mode: OutputMode, step: usize) -> Result<Opened, String> {
    let device = host.default_output_device().ok_or("no output device")?;
    let name = device.description().map(|d| d.name().to_string()).unwrap_or_else(|_| "Default output".into());
    let id = device.id().ok();
    let supported = device.default_output_config().map_err(|e| format!("{name}: {e}"))?;
    let want = if mode == OutputMode::Exclusive { LOW_LATENCY_STEPS[step.min(LOW_LATENCY_STEPS.len() - 1)] } else { NORMAL_FRAMES };
    let frames = match supported.buffer_size() {
        SupportedBufferSize::Range { min, max } => want.clamp(*min, *max),
        SupportedBufferSize::Unknown => want,
    };
    let config = StreamConfig { channels: supported.channels(), sample_rate: supported.sample_rate(), buffer_size: BufferSize::Fixed(frames) };
    Ok(Opened { device, id, name, config, format: supported.sample_format(), mode, fallback_reason: None })
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn audio_thread(fluid_dir: PathBuf, soundfonts: Vec<PathBuf>, mode: OutputMode, cmds: rtrb::Consumer<Command>,
    live: Receiver<LiveMsg>, stats: Arc<Stats>, ready: Sender<Result<(), String>>, reopen: Arc<AtomicBool>, stop: Arc<AtomicBool>) {
    let host = pick_host();
    let host_name = host.id().name();
    let sig = Arc::new(Signals::default());
    sig.want_mode.store(mode_code(mode), Relaxed);
    let mut step = 0usize;

    let mut opened = match open(&host, mode, step) { Ok(o) => o, Err(e) => { let _ = ready.send(Err(e)); return } };
    let r = match Renderer::new(fluid_dir, soundfonts, opened.config.sample_rate, stats.clone()) { Ok(r) => r, Err(e) => { let _ = ready.send(Err(e)); return } };
    let musician = Arc::new(Mutex::new(Musician { r, cmds, live }));
    *stats.device_name.lock().unwrap() = opened.name.clone();
    let _ = ready.send(Ok(()));

    'device: loop {
        if stop.load(Relaxed) || sig.shutdown.load(Relaxed) { break }
        let rate = opened.config.sample_rate;
        musician.lock().unwrap().r.begin_device(rate, MAX_BLOCK, 1.0);

        let stream = match build_stream(&opened, musician.clone(), sig.clone(), stats.clone()) {
            Ok(s) => s,
            // a block size the device turned down: let it choose its own
            Err(e) if matches!(opened.config.buffer_size, BufferSize::Fixed(_)) => {
                opened.config.buffer_size = BufferSize::Default;
                opened.fallback_reason = Some(format!("the sound card wouldn't take small blocks ({e})"));
                opened.mode = OutputMode::Shared;
                match build_stream(&opened, musician.clone(), sig.clone(), stats.clone()) {
                    Ok(s) => s,
                    Err(e) => { retry_later(&host, &stop, &musician, &stats, &mut opened, &sig, step, e); continue 'device }
                }
            }
            Err(e) => { retry_later(&host, &stop, &musician, &stats, &mut opened, &sig, step, e); continue 'device }
        };
        // a step-up asked for by the previous stream's last blocks is already
        // answered by this one
        sig.step_up.store(false, Relaxed);
        if let Err(e) = stream.play() { *stats.error.lock().unwrap() = Some(e.to_string()); }

        let frames = match opened.config.buffer_size { BufferSize::Fixed(f) => f, BufferSize::Default => stream.buffer_size().unwrap_or(0) };
        stats.mode.store(if opened.mode == OutputMode::Exclusive { 0 } else { 1 }, Relaxed);
        stats.rate.store(rate, Relaxed);
        stats.period_frames.store(frames, Relaxed);
        stats.buffer_frames.store(frames, Relaxed);
        stats.period_step.store(step as u8, Relaxed);
        stats.windows_gain.store(u32::MAX, Relaxed); // the system applies its own volume
        stats.measured_rate.store(0, Relaxed);
        *stats.device_name.lock().unwrap() = opened.name.clone();
        *stats.fallback_reason.lock().unwrap() = opened.fallback_reason.clone();
        *stats.format.lock().unwrap() = format!("{rate} Hz · {} · {host_name}", opened.format);
        *stats.error.lock().unwrap() = None;

        // ── Supervise: shutdown, mode changes, device changes, step-ups ──
        let mut last_check = Instant::now();
        loop {
            std::thread::sleep(Duration::from_millis(50));
            if stop.load(Relaxed) || sig.shutdown.load(Relaxed) { break 'device }
            if reopen.swap(false, Relaxed) || sig.rebuild.swap(false, Relaxed) { break }
            if sig.step_up.swap(false, Relaxed) {
                if opened.mode == OutputMode::Exclusive && step + 1 < LOW_LATENCY_STEPS.len() { step += 1; break }
            }
            // the user picked another default output (headphones plugged in…): follow it
            if last_check.elapsed() >= Duration::from_secs(1) {
                last_check = Instant::now();
                let now_id = host.default_output_device().and_then(|d| d.id().ok());
                if now_id.is_some() && now_id != opened.id { break }
            }
        }

        // ── Rebuild: stop the stream, open the (new) default, carry on ──
        drop(stream);
        stats.mode.store(255, Relaxed);
        musician.lock().unwrap().r.all_sounds_off();
        wait_for_device(&host, &stop, &musician, &stats, &mut opened, &sig, step);
        if stop.load(Relaxed) { break 'device }
    }
}

/// The stream couldn't be built: say why, give the device a moment, try again
#[allow(clippy::too_many_arguments)]
fn retry_later(host: &cpal::Host, stop: &AtomicBool, musician: &Mutex<Musician>, stats: &Stats, opened: &mut Opened, sig: &Signals, step: usize, why: String) {
    *stats.error.lock().unwrap() = Some(why);
    stats.mode.store(255, Relaxed);
    std::thread::sleep(Duration::from_millis(500));
    wait_for_device(host, stop, musician, stats, opened, sig, step);
}

/// Opens the default output again (retrying while there is none), rebuilding
/// the synth for a new sample rate and restoring the song state
fn wait_for_device(host: &cpal::Host, stop: &AtomicBool, musician: &Mutex<Musician>, stats: &Stats, opened: &mut Opened, sig: &Signals, step: usize) {
    let old_rate = opened.config.sample_rate;
    loop {
        // closing Orfeo must never wait for a device that isn't coming back
        if stop.load(Relaxed) || sig.shutdown.load(Relaxed) { return }
        if matches!(musician.lock().unwrap().cmds.peek(), Ok(Command::Shutdown)) { sig.shutdown.store(true, Relaxed); return }
        match open(host, mode_of(sig.want_mode.load(Relaxed)), step) {
            Ok(o) => {
                let mut m = musician.lock().unwrap();
                if o.config.sample_rate != old_rate {
                    // FluidSynth is built for one sample rate: rebuild it, then restore the song state
                    if let Err(e) = m.r.rebuild_for_rate(o.config.sample_rate) { *stats.error.lock().unwrap() = Some(e); sig.shutdown.store(true, Relaxed); return }
                }
                m.r.replay();
                *opened = o;
                stats.reopens.fetch_add(1, Relaxed);
                return;
            }
            Err(e) => { *stats.error.lock().unwrap() = Some(format!("waiting for an output device: {e}")); std::thread::sleep(Duration::from_millis(500)) }
        }
    }
}

fn build_stream(o: &Opened, musician: Arc<Mutex<Musician>>, sig: Arc<Signals>, stats: Arc<Stats>) -> Result<cpal::Stream, String> {
    match o.format {
        SampleFormat::F32 => build::<f32>(o, musician, sig, stats),
        SampleFormat::F64 => build::<f64>(o, musician, sig, stats),
        SampleFormat::I16 => build::<i16>(o, musician, sig, stats),
        SampleFormat::I32 => build::<i32>(o, musician, sig, stats),
        SampleFormat::U16 => build::<u16>(o, musician, sig, stats),
        SampleFormat::I8 => build::<i8>(o, musician, sig, stats),
        SampleFormat::U8 => build::<u8>(o, musician, sig, stats),
        f => Err(format!("the sound card's sample format ({f}) isn't supported yet")),
    }
}

fn build<T: SizedSample + FromSample<f32> + Send + 'static>(o: &Opened, musician: Arc<Mutex<Musician>>, sig: Arc<Signals>, stats: Arc<Stats>) -> Result<cpal::Stream, String> {
    let channels = o.config.channels as usize;
    let rate = o.config.sample_rate as f64;
    let current_mode = o.mode;
    let low_latency = current_mode == OutputMode::Exclusive;
    let started = Instant::now();
    let mut last_wake: Option<Instant> = None;
    // underruns or late blocks in the last two seconds → a bigger block size
    let mut late_window: (Instant, u32) = (Instant::now(), 0);
    let (sig_cb, stats_cb) = (sig.clone(), stats.clone());

    let data_cb = move |data: &mut [T], info: &cpal::OutputCallbackInfo| {
        let frames = data.len() / channels.max(1);
        stats_cb.blocks.fetch_add(1, Relaxed);
        stats_cb.block_frames.fetch_add(frames as u64, Relaxed);
        let Ok(mut m) = musician.try_lock() else { data.fill(T::EQUILIBRIUM); return };
        let now = Instant::now();
        // how far ahead of the speaker this block is: the live-key statistics and the delay check
        let ts = info.timestamp();
        let ahead = ts.playback.checked_duration_since(ts.callback).map(|d| d.as_secs_f64()).unwrap_or(0.0);
        stats_cb.reported_latency_bits.store((ahead * 1000.0).to_bits(), Relaxed);
        let padding = ahead * rate;

        if let Some(prev) = last_wake {
            let period = frames as f64 / rate;
            if now.duration_since(prev).as_secs_f64() > period * 1.8 && started.elapsed() > Duration::from_millis(500) {
                stats_cb.late_wakeups.fetch_add(1, Relaxed);
                if now.duration_since(late_window.0) > Duration::from_secs(2) { late_window = (now, 0) }
                late_window.1 += 1;
                if late_window.1 >= 4 && low_latency { sig_cb.step_up.store(true, Relaxed) }
            }
        }
        last_wake = Some(now);

        // ── Commands: the device's own here, the music's to the renderer ──
        let m = &mut *m;
        while let Ok(c) = m.cmds.pop() {
            match c {
                // Asking again for Low latency after a fallback to normal retries it
                Command::SetOutputMode(mode) => {
                    sig_cb.want_mode.store(mode_code(mode), Relaxed);
                    if mode != current_mode { sig_cb.rebuild.store(true, Relaxed) }
                }
                Command::DebugStall(ms) => std::thread::sleep(Duration::from_millis(ms)),
                Command::Shutdown => { sig_cb.shutdown.store(true, Relaxed); break }
                c => m.r.command(c, now, padding),
            }
        }
        // ── Live keys: straight into the synth, at the start of this block ──
        while let Ok(k) = m.live.try_recv() { m.r.live_key(k.status, k.d1, k.d2, k.at, now, padding) }

        // ── Render, in pieces if the device asks for more than the buffers hold ──
        let r0 = Instant::now();
        let mut done = 0usize;
        while done < frames {
            let n = (frames - done).min(MAX_BLOCK);
            m.r.render(n, 1.0);
            let (l, r) = m.r.output(n);
            for i in 0..n {
                let frame = &mut data[(done + i) * channels..(done + i + 1) * channels];
                match channels {
                    1 => frame[0] = T::from_sample((l[i] + r[i]) * 0.5),
                    _ => {
                        frame[0] = T::from_sample(l[i]);
                        frame[1] = T::from_sample(r[i]);
                        for s in &mut frame[2..] { *s = T::EQUILIBRIUM }
                    }
                }
            }
            done += n;
        }
        stats_cb.worst_render_us.fetch_max(r0.elapsed().as_micros() as u32, Relaxed);
        stats_cb.position_bits.store(m.r.position().to_bits(), Relaxed);
        stats_cb.playing.store(m.r.playing(), Relaxed);
    };

    let mut xruns: (Instant, u32) = (Instant::now(), 0);
    let err_cb = move |e: cpal::Error| match e.kind() {
        // a gap in the sound: in Low latency, a few in two seconds mean the block is too small
        ErrorKind::Xrun => {
            stats.late_wakeups.fetch_add(1, Relaxed);
            let now = Instant::now();
            if now.duration_since(xruns.0) > Duration::from_secs(2) { xruns = (now, 0) }
            xruns.1 += 1;
            if xruns.1 >= 4 && low_latency { sig.step_up.store(true, Relaxed) }
        }
        ErrorKind::DeviceNotAvailable | ErrorKind::StreamInvalidated | ErrorKind::DeviceChanged => sig.rebuild.store(true, Relaxed),
        // plays on at normal priority — worth knowing in the delay check
        ErrorKind::RealtimeDenied => *stats.fallback_reason.lock().unwrap() = Some("the system didn't allow real-time priority for the sound".into()),
        _ => *stats.error.lock().unwrap() = Some(e.to_string()),
    };

    o.device.build_output_stream::<T, _, _>(o.config.clone(), data_cb, err_cb, None).map_err(|e| e.to_string())
}
