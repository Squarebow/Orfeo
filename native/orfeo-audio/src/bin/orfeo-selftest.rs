//! Phase 1 self-test: drives the engine through every feature on the real
//! output device and checks the results numerically.
//!   orfeo-selftest --fluid DIR --sf2 PATH [--virtual] <multi-track song.mid>
//! --virtual: a virtual machine with a virtual sound card (CI). Its CPU stalls
//! make the audio arrive in bursts, so the steadiness checks only report there;
//! every musical check stays strict.

use orfeo_audio::{Command, Engine, EngineConfig, OutputMode, Song, LIVE_CH};
use std::path::PathBuf;
use std::sync::atomic::Ordering::Relaxed;
use std::time::{Duration, Instant};

fn sleep(ms: u64) { std::thread::sleep(Duration::from_millis(ms)) }

struct T { pass: u32, fail: u32 }
impl T {
    fn check(&mut self, ok: bool, what: &str, detail: String) {
        if ok { self.pass += 1; println!("  PASS  {what}  ({detail})") } else { self.fail += 1; println!("  FAIL  {what}  ({detail})") }
    }
}

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let (mut fluid, mut sf2, mut song_path, mut virt) = (PathBuf::new(), PathBuf::new(), String::new(), false);
    let mut i = 0;
    while i < a.len() {
        match a[i].as_str() { "--fluid" => { i += 1; fluid = a[i].clone().into() } "--sf2" => { i += 1; sf2 = a[i].clone().into() } "--virtual" => virt = true, s => song_path = s.into() }
        i += 1;
    }
    let mut t = T { pass: 0, fail: 0 };
    // steadiness on a virtual machine: reported, not failed (see --virtual above)
    let steady = |t: &mut T, ok: bool, what: &str, detail: String| {
        if ok || !virt { t.check(ok, what, detail) } else { println!("  INFO  {what}  ({detail}; virtual machine — not counted)") }
    };
    let e = Engine::start(EngineConfig { fluid_dir: fluid, soundfonts: vec![sf2], mode: OutputMode::Exclusive, midi_inputs: false }).expect("start");
    let s = &e.stats;
    println!("Device: {} ({})", s.device_name.lock().unwrap(), if s.mode.load(Relaxed) == 0 { "exclusive" } else { "shared" });
    let song = Song::from_smf(&std::fs::read(&song_path).unwrap()).unwrap();
    let tracks = song.track_count as usize;
    let used: Vec<usize> = (0..16).filter(|&c| song.events.iter().any(|e| (e.status & 0x0F) as usize == c && e.status & 0xF0 == 0x90)).collect();
    println!("Song: {} tracks, channels {:?}, {:.0} s", tracks, used, song.duration);
    // what the sound card asks for: blocks a second and frames a second vs the rate
    let pace = |label: &str| {
        let (b0, f0, w) = (s.blocks.load(Relaxed), s.block_frames.load(Relaxed), Instant::now());
        sleep(1000);
        let (b, f, el) = (s.blocks.load(Relaxed) - b0, s.block_frames.load(Relaxed) - f0, w.elapsed().as_secs_f64());
        println!("    pace {label}: {:.0} blocks/s, {:.0} frames/s ({:.0}% of {} Hz), {:.0} frames per block, period {} frames, mode {}",
            b as f64 / el, f as f64 / el, 100.0 * f as f64 / el / s.rate.load(Relaxed).max(1) as f64, s.rate.load(Relaxed),
            if b > 0 { f as f64 / b as f64 } else { 0.0 }, s.period_frames.load(Relaxed), s.mode.load(Relaxed));
    };
    pace("idle");
    e.send(Command::LoadSong(Box::new(song)));
    let peaks = || -> (f32, Vec<f32>) { let ch: Vec<f32> = (0..16).map(|c| s.take_channel_peak(c)).collect(); (s.take_master_peak(), ch) };

    println!("\n1. Playback timing");
    e.send(Command::Seek(10.0)); e.send(Command::Play);
    pace("playing");
    sleep(300); let p0 = s.position(); let w0 = Instant::now();
    sleep(3000);
    let adv = s.position() - p0; let wall = w0.elapsed().as_secs_f64();
    steady(&mut t, (adv - wall).abs() < 0.03, "song clock follows real time", format!("{adv:.3} s in {wall:.3} s"));

    println!("\n2. Per-channel level meters and volume");
    peaks(); sleep(500); let (_, ch) = peaks();
    let loud: Vec<usize> = used.iter().copied().filter(|&c| ch[c] > 0.001).collect();
    t.check(!loud.is_empty(), "channels playing show levels", format!("{} of {} channels", loud.len(), used.len()));
    if let Some(&c) = loud.first() {
        e.send(Command::SetChannel { ch: c as u8, volume: 0.0, pan: 0.0, reverb: 0.0, chorus: 0.0 });
        sleep(150); peaks(); sleep(400); let (_, ch2) = peaks();
        t.check(ch2[c] < 1e-4, "volume 0 silences that channel", format!("ch {} peak {:.5}", c + 1, ch2[c]));
        e.send(Command::SetChannel { ch: c as u8, volume: 1.0, pan: 0.0, reverb: 0.0, chorus: 0.0 });
    }

    println!("\n3. Mute (all tracks) fades the music out");
    e.send(Command::SetAudibleTracks(Box::new(vec![false; tracks])));
    sleep(200); peaks(); sleep(400); let (_, ch) = peaks();
    let dry: f32 = used.iter().map(|&c| ch[c]).fold(0.0, f32::max);
    t.check(dry < 1e-4, "muted channels go silent at once", format!("loudest channel {dry:.5}"));
    sleep(2500); peaks(); sleep(300); let (m, _) = peaks();
    t.check(m < 0.003, "their reverb tails are gone within 3 s", format!("master peak {m:.4}"));
    e.send(Command::SetAudibleTracks(Box::new(vec![true; tracks])));
    sleep(600); let (m2, _) = peaks();
    t.check(m2 > 0.01, "unmuted plays again", format!("master peak {m2:.3}"));

    println!("\n4. Compressor");
    e.send(Command::SetMasterGain(3.0));
    e.send(Command::SetCompressor { enabled: true, preset: 4 });
    sleep(800);
    let red = f32::from_bits(s.comp_reduction_db.load(Relaxed));
    let mut worst = 0f32; for _ in 0..10 { sleep(50); worst = worst.min(f32::from_bits(s.comp_reduction_db.load(Relaxed))) }
    t.check(worst < -1.0, "Limiter preset pulls loud passages down", format!("reduction now {red:.1} dB, deepest {worst:.1} dB"));
    e.send(Command::SetCompressor { enabled: false, preset: 0 });
    e.send(Command::SetMasterGain(1.0));

    println!("\n5. Preview note on the live channel");
    e.send(Command::NoteFor { ch: LIVE_CH as u8, key: 72, vel: 110, dur: 0.3 });
    sleep(150); let (_, ch) = peaks();
    t.check(ch[LIVE_CH] > 0.005, "preview note sounds", format!("ch 16 peak {:.3}", ch[LIVE_CH]));
    sleep(2500); peaks(); sleep(300); let (_, ch) = peaks();
    t.check(ch[LIVE_CH] < 0.002, "and stops by itself", format!("ch 16 peak {:.5}", ch[LIVE_CH]));

    println!("\n6. Count-in: 4 clicks, the song starts on the 5th beat");
    e.send(Command::Pause); sleep(200);
    e.send(Command::SetAudibleTracks(Box::new(vec![false; tracks])));
    e.send(Command::SetMetronome { enabled: true, volume: 0.8 });
    let beat = 0.4;
    for k in 0..4 { e.send(Command::ClickAfter { delay: k as f64 * beat, accent: k == 0 }); }
    e.send(Command::PlayAfter(4.0 * beat));
    let c0 = Instant::now();
    let mut heard = 0; let mut was = false;
    while c0.elapsed() < Duration::from_millis(1500) { sleep(10); let m = s.take_master_peak(); if m > 0.05 && !was { heard += 1 } was = m > 0.05 }
    t.check(heard == 4, "4 clicks heard", format!("{heard}"));
    t.check(!s.playing.load(Relaxed), "not playing before the 5th beat", String::new());
    sleep(300);
    t.check(s.playing.load(Relaxed), "playing right after it", format!("at {:.2} s", c0.elapsed().as_secs_f64()));

    println!("\n7. Song metronome clicks");
    let start = s.position();
    let clicks: Vec<(f64, bool)> = (0..40).map(|k| (start + 0.5 + k as f64 * 0.5, k % 4 == 0)).collect();
    e.send(Command::SetSongClicks(Box::new(clicks)));
    let c1 = Instant::now(); let mut n = 0; let mut was = false;
    while c1.elapsed() < Duration::from_millis(2100) { sleep(10); let m = s.take_master_peak(); if m > 0.05 && !was { n += 1 } was = m > 0.05 }
    t.check((3..=5).contains(&n), "a click every half second", format!("{n} in 2.1 s"));
    e.send(Command::SetMetronome { enabled: false, volume: 0.8 });
    e.send(Command::SetAudibleTracks(Box::new(vec![true; tracks])));

    println!("\n8. Seek and tempo");
    e.send(Command::Seek(60.0)); sleep(300);
    t.check((s.position() - 60.3).abs() < 0.5, "jump to 1:00", format!("{:.2} s", s.position()));
    steady(&mut t, (s.position() - 60.3).abs() < 0.1, "  … right on time", format!("{:.2} s", s.position()));
    e.send(Command::SetTempoRatio(2.0)); sleep(100); let p = s.position(); sleep(1000);
    let d = s.position() - p;
    // the musical part, strict everywhere: double speed is clearly double, not normal
    t.check((d - 2.0).abs() < 0.3, "double speed runs the song about twice as fast", format!("{d:.2} s in 1 s"));
    steady(&mut t, (d - 2.0).abs() < 0.08, "  … and exactly", format!("{d:.2} s in 1 s"));
    e.send(Command::SetTempoRatio(1.0));

    println!("\n9. Switching exclusive → shared → exclusive while playing");
    let before = s.reopens.load(Relaxed);
    e.send(Command::SetOutputMode(OutputMode::Shared)); sleep(1500);
    t.check(s.mode.load(Relaxed) == 1 && s.reopens.load(Relaxed) == before + 1, "now shared", format!("mode {} reopens {}", s.mode.load(Relaxed), s.reopens.load(Relaxed)));
    pace("after switching to normal");
    let p = s.position(); sleep(1000);
    t.check(s.position() - p > 0.9, "music carried on", format!("{:.2} s", s.position() - p));
    e.send(Command::SetOutputMode(OutputMode::Exclusive)); sleep(1500);
    t.check(s.mode.load(Relaxed) == 0, "back to exclusive", format!("mode {}", s.mode.load(Relaxed)));

    println!("\n10. Stability");
    // The engine steps the buffer up after 4 misses in 2 s; beyond those, none
    let (late, step) = (s.late_wakeups.load(Relaxed), s.period_step.load(Relaxed) as u32);
    steady(&mut t, late <= 4 * step + 2, "steady after any automatic buffer step-up", format!("{late} late wake-ups, {step} step-ups"));
    println!("    worst render {:.2} ms | buffer step {} ({} frames) | reopens {}", s.worst_render_us.load(Relaxed) as f64 / 1000.0,
        s.period_step.load(Relaxed), s.period_frames.load(Relaxed), s.reopens.load(Relaxed));
    if let Some(err) = s.error.lock().unwrap().as_ref() { println!("    last error: {err}") }

    println!("\n11. A device that keeps signalling late: the engine steps up its buffer");
    let step0 = s.period_step.load(Relaxed);
    let frames0 = s.period_frames.load(Relaxed);
    for _ in 0..6 { e.send(Command::DebugStall(15)); sleep(120); }
    sleep(1500);
    let step1 = s.period_step.load(Relaxed);
    // timing-driven: on a virtual machine its own stalls can restart the 2 s count mid-test
    steady(&mut t, step1 == step0 + 1, "stepped up one buffer size", format!("step {step0} -> {step1}, {} -> {} frames", frames0, s.period_frames.load(Relaxed)));
    let p = s.position(); sleep(1000);
    let d = s.position() - p;
    t.check(d > 0.7, "and plays on", format!("{d:.3} s in 1 s"));
    steady(&mut t, (d - 1.0).abs() < 0.05, "  … steadily", format!("{d:.3} s in 1 s"));

    e.send(Command::Pause);
    println!("\n{} passed, {} failed", t.pass, t.fail);
    std::process::exit(if t.fail == 0 { 0 } else { 1 });
}
