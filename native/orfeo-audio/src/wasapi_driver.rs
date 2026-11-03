//! Windows: the audio thread's device side. Owns the WASAPI stream (exclusive
//! with fallback to shared, `output.rs`), runs at MMCSS "Pro Audio" priority,
//! wakes when the card asks for audio, and survives the device going away
//! (reopens the new default and carries on). Everything that is music — the
//! synth, the song, the mix — is the [`Renderer`]'s; this file only decides
//! when and how much to render, and hands the result to the card.
//!
//! Windows-only features live here and nowhere else: exclusive mode and its
//! period steps, the speed check, the endpoint volume the engine applies in
//! exclusive mode, and the default-device watcher.

use crate::engine::{Command, LiveMsg, OutputMode, Stats};
use crate::output::{Output, EXCLUSIVE_STEPS};
use crate::renderer::Renderer;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering::Relaxed};
use std::sync::mpsc::{Receiver, Sender};
use std::sync::Arc;
use std::time::{Duration, Instant};

// The user picking another default output in Windows (headphones plugged in,
// a USB interface chosen) → follow it. Checked once a second on its own thread
// so the audio thread never makes these slow calls.
pub(crate) fn spawn_default_device_watcher(reopen: Arc<AtomicBool>, stop: Arc<AtomicBool>) {
    std::thread::spawn(move || {
        if wasapi::initialize_mta().ok().is_err() { return }
        let id = || wasapi::DeviceEnumerator::new().ok()
            .and_then(|en| en.get_default_device(&wasapi::Direction::Render).ok())
            .and_then(|d| d.get_id().ok());
        let mut last = id();
        while !stop.load(Relaxed) {
            std::thread::sleep(Duration::from_secs(1));
            let now = id();
            if now != last { last = now; reopen.store(true, Relaxed); }
        }
    });
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn audio_thread(fluid_dir: PathBuf, soundfonts: Vec<PathBuf>, mut mode: OutputMode, mut cmds: rtrb::Consumer<Command>,
    live: Receiver<LiveMsg>, stats: Arc<Stats>, ready: Sender<Result<(), String>>, reopen: Arc<AtomicBool>, stop: Arc<AtomicBool>) {
    if let Err(e) = wasapi::initialize_mta().ok() { let _ = ready.send(Err(format!("COM: {e}"))); return }
    // Windows' "Pro Audio" scheduling class (MMCSS), as audio software uses: this
    // thread runs on time even while the screen, Orfeo's UI or other programs are busy
    let _mmcss = pro_audio_priority();
    let mut step = 0usize;
    // Sound cards found running at another rate than Windows reports for them
    // (a studio interface whose own control app sets it): Low latency opens them
    // at the rate they really play
    let mut synced: Vec<(String, u32)> = Vec::new();
    // Sound cards whose Low latency stream proved unusable this session, with why:
    // they get the shared stream instead (Windows' mixer handles them correctly)
    let mut refused: Vec<(String, String)> = Vec::new();
    let mut out_slot = match open_output(mode, step, &synced, &refused) { Ok(o) => Some(o), Err(e) => { let _ = ready.send(Err(e)); return } };
    let mut r = match Renderer::new(fluid_dir, soundfonts, out_slot.as_ref().unwrap().rate, stats.clone()) { Ok(r) => r, Err(e) => { let _ = ready.send(Err(e)); return } };
    let _ = ready.send(Ok(()));

    'device: loop {
        let out = out_slot.as_ref().unwrap();
        let rate = out.rate as f64;
        stats.mode.store(if out.mode == OutputMode::Exclusive { 0 } else { 1 }, Relaxed);
        stats.rate.store(out.rate, Relaxed);
        stats.period_frames.store(out.period_frames, Relaxed);
        stats.buffer_frames.store(out.buffer_frames, Relaxed);
        stats.reported_latency_bits.store(out.reported_latency_ms.to_bits(), Relaxed);
        *stats.device_name.lock().unwrap() = out.device_name.clone();
        *stats.fallback_reason.lock().unwrap() = out.fallback_reason.clone();
        *stats.format.lock().unwrap() = out.format_name();
        if out.mode == OutputMode::Exclusive { stats.measured_rate.store(0, Relaxed) } // a new measurement follows

        let n = out.buffer_frames as usize;
        let mut scratch = Vec::with_capacity(n * 8);
        // Windows' volume (exclusive only): read ~20 times a second, ramped
        let mut os_target = out.windows_gain();
        r.begin_device(out.rate, n, os_target);
        let mut os_poll = 0usize;
        let os_every = (rate * 0.05) as usize;

        let avail = out.client.get_available_space_in_frames().unwrap_or(0) as usize;
        { let (sl, sr) = r.output(avail); let _ = out.write(sl, sr, &mut scratch); }
        if let Err(e) = out.client.start_stream() { *stats.error.lock().unwrap() = Some(e.to_string()); }

        let period_ms = out.period_frames as f64 * 1000.0 / rate;
        let started = Instant::now();
        let mut last_wake = Instant::now();
        let mut silent_waits = 0u32;
        // late wake-ups in the last two seconds → step up the buffer
        let mut late_window: (Instant, u32) = (Instant::now(), 0);
        let mut step_up = false;
        stats.period_step.store(step as u8, Relaxed);
        // The speed check (Low latency only): some cards accept a stream at one
        // sample rate while really running at another (a pro interface whose own
        // control app is set to a different rate than Windows). Everything then
        // plays slowed down or sped up, and distorted. Count the audio the card
        // takes on time, over 2 s of wake-ups, against the clock.
        let mut speed = (0u64, 0f64); // (frames, seconds) from on-time wake-ups
        let mut speed_checked = out.mode != OutputMode::Exclusive;
        let mut refuse: Option<String> = None;

        let device_lost: bool = 'run: loop {
            if reopen.swap(false, Relaxed) { break 'run true }
            if out.event.wait_for_event(200).is_err() {
                silent_waits += 1;
                if silent_waits >= 2 { break 'run true } // 400 ms without the device asking for audio
                continue;
            }
            silent_waits = 0;
            let now = Instant::now();
            let gap = now.duration_since(last_wake).as_secs_f64() * 1000.0;
            last_wake = now;
            let late = gap > period_ms * 1.8;
            if late && started.elapsed() > Duration::from_millis(500) {
                stats.late_wakeups.fetch_add(1, Relaxed);
                if now.duration_since(late_window.0) > Duration::from_secs(2) { late_window = (now, 0) }
                late_window.1 += 1;
                // A few misses in two seconds: this buffer is too small for the device — the
                // way a pianist would hear it is crackling, so trade a few ms for steadiness;
                // already at the largest one, the card can't do Low latency here at all
                if late_window.1 >= 4 && out.mode == OutputMode::Exclusive {
                    if step + 1 < EXCLUSIVE_STEPS { step_up = true }
                    else { refuse = Some("the sound card couldn't keep up with Low latency, even with the largest buffer".into()) }
                    break 'run true
                }
            }
            let padding = match out.client.get_current_padding() { Ok(p) => p as f64, Err(_) => break 'run true };

            // ── Commands: the device's own here, the music's to the renderer ──
            while let Ok(c) = cmds.pop() {
                match c {
                    // Asking again for exclusive after a fallback to shared retries it
                    Command::SetOutputMode(m) => { if m != mode || m != out.mode { mode = m; reopen.store(true, Relaxed) } }
                    Command::DebugStall(ms) => std::thread::sleep(Duration::from_millis(ms)),
                    Command::Shutdown => break 'device,
                    c => r.command(c, now, padding),
                }
            }

            // ── Live keys: straight into the synth, at the start of this period ──
            while let Ok(m) = live.try_recv() { r.live_key(m.status, m.d1, m.d2, m.at, now, padding) }

            let avail = match out.client.get_available_space_in_frames() { Ok(a) => a as usize, Err(_) => break 'run true };
            // what the card freed since an on-time wake-up is what it played in that time
            if !speed_checked && !late && started.elapsed() > Duration::from_millis(500) {
                speed.0 += avail as u64;
                speed.1 += gap / 1000.0;
                if speed.1 >= 2.0 {
                    speed_checked = true;
                    let measured = speed.0 as f64 / speed.1;
                    stats.measured_rate.store(measured.round() as u32, Relaxed);
                    if (measured / rate - 1.0).abs() > 0.03 {
                        // Running at a standard rate other than the one it reported: play at
                        // that rate (checked again); anything else, or a second miss, → shared
                        let real = [44_100u32, 48_000, 88_200, 96_000, 176_400, 192_000].into_iter()
                            .find(|r| (measured / *r as f64 - 1.0).abs() < 0.01);
                        match real {
                            Some(r) if !synced.iter().any(|(d, _)| *d == out.device_name) => synced.push((out.device_name.clone(), r)),
                            _ => refuse = Some(format!("the sound card plays at about {} Hz, not the {} Hz it reported, and Orfeo couldn't match it", (measured / 100.0).round() * 100.0, out.rate)),
                        }
                        break 'run true
                    }
                }
            }
            if avail == 0 { continue }
            stats.blocks.fetch_add(1, Relaxed);
            stats.block_frames.fetch_add(avail as u64, Relaxed);
            let r0 = Instant::now();
            os_poll += avail;
            if os_poll >= os_every { os_poll = 0; os_target = out.windows_gain(); }
            stats.windows_gain.store(if out.mode == OutputMode::Exclusive && out.has_software_volume() { os_target.to_bits() } else { u32::MAX }, Relaxed);
            r.render(avail, os_target);
            stats.worst_render_us.fetch_max(r0.elapsed().as_micros() as u32, Relaxed);

            { let (sl, sr) = r.output(avail); if out.write(sl, sr, &mut scratch).is_err() { break 'run true } }
            stats.position_bits.store(r.position().to_bits(), Relaxed);
            stats.playing.store(r.playing(), Relaxed);
        };

        // ── The device went away or the default changed: reopen and carry on ──
        let _ = out.client.stop_stream();
        if !device_lost { break }
        let old_rate = out.rate;
        if let Some(why) = refuse.take() { refused.push((out.device_name.clone(), why)); step = 0 }
        // Release the device first — an exclusive stream we still hold would
        // make our own reopen fail with "device in use"
        drop(out_slot.take());
        if step_up { step += 1 }
        stats.mode.store(255, Relaxed);
        r.all_sounds_off();
        loop {
            // closing Orfeo must never wait for a device that isn't coming back
            if stop.load(Relaxed) || matches!(cmds.peek(), Ok(Command::Shutdown)) { break 'device }
            match open_output(mode, step, &synced, &refused) {
                Ok(o) => {
                    if o.rate != old_rate {
                        // FluidSynth is built for one sample rate: rebuild it, then restore the song state
                        if let Err(e) = r.rebuild_for_rate(o.rate) { *stats.error.lock().unwrap() = Some(e); break 'device }
                    }
                    r.replay();
                    out_slot = Some(o);
                    // Unplugging fires twice — the device vanishing, then Windows naming a
                    // new default a moment later. We just opened that new default: the
                    // second signal has nothing left to do.
                    std::thread::sleep(Duration::from_millis(50));
                    reopen.store(false, Relaxed);
                    *stats.error.lock().unwrap() = None;
                    stats.reopens.fetch_add(1, Relaxed);
                    break;
                }
                Err(e) => { *stats.error.lock().unwrap() = Some(format!("waiting for an output device: {e}")); std::thread::sleep(Duration::from_millis(500)) }
            }
        }
    }
}

/// Opens the default sound card; one whose Low latency stream proved unusable
/// this session gets the shared stream, with the reason to show
fn open_output(mode: OutputMode, step: usize, synced: &[(String, u32)], refused: &[(String, String)]) -> Result<Output, String> {
    let o = Output::open(mode, step, synced)?;
    match refused.iter().find(|(d, _)| *d == o.device_name) {
        Some((_, why)) if o.mode == OutputMode::Exclusive => {
            drop(o); // release the card before asking for it again
            let mut s = Output::open(OutputMode::Shared, 0, &[])?;
            s.fallback_reason = Some(why.clone());
            Ok(s)
        }
        _ => Ok(o),
    }
}

/// Registers the calling thread with MMCSS "Pro Audio" at high priority;
/// the registration lasts as long as the returned guard
struct Mmcss(Option<windows::Win32::Foundation::HANDLE>);
impl Drop for Mmcss {
    fn drop(&mut self) { if let Some(h) = self.0 { unsafe { let _ = windows::Win32::System::Threading::AvRevertMmThreadCharacteristics(h); } } }
}
fn pro_audio_priority() -> Mmcss {
    use windows::Win32::System::Threading::{AvSetMmThreadCharacteristicsW, AvSetMmThreadPriority, AVRT_PRIORITY_HIGH};
    let mut index = 0u32;
    match unsafe { AvSetMmThreadCharacteristicsW(windows::core::w!("Pro Audio"), &mut index) } {
        Ok(h) => { unsafe { let _ = AvSetMmThreadPriority(h, AVRT_PRIORITY_HIGH); } Mmcss(Some(h)) }
        Err(_) => Mmcss(None),
    }
}
