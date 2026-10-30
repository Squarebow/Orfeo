//! The audio thread: owns the output device and FluidSynth, plays the song
//! sample-accurately (each period is split at event times), mixes the 16 MIDI
//! channels itself (volume, pan, mute fades, level meters), keeps the live
//! channel out of the compressor, adds metronome / count-in clicks, and
//! survives the device going away (reopens the new default and carries on).

use crate::clicks::Clicks;
use crate::dsp::{soft_clip, HighShelf};
use crate::dynamics::{AutoLevel, Brickwall, Compressor};
use crate::fluid::Fluid;
use crate::output::{Output, OutputMode, EXCLUSIVE_STEPS};
use crate::reverb::{Chorus, Reverb};
use crate::sf2::{preset_sends, PresetSend, CHORUS_LEVEL, REVERB_LEVEL};
use crate::song::Song;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering::Relaxed};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::{Duration, Instant};

pub struct EngineConfig {
    pub fluid_dir: PathBuf,
    /// Loaded in order; later sets win for presets they have (layering)
    pub soundfonts: Vec<PathBuf>,
    pub mode: OutputMode,
    /// Open every MIDI input port and play it live
    pub midi_inputs: bool,
}

/// Live keys and previews play on MIDI channel 16 (index 15)
pub const LIVE_CH: usize = 15;

pub enum Command {
    LoadSong(Box<Song>),
    Play,
    Pause,
    Seek(f64),
    /// Start playing after `delay` seconds — the count-in's last beat, sample-exact
    PlayAfter(f64),
    /// Playback speed relative to the file (1.0 = as written)
    SetTempoRatio(f64),
    SetTranspose(i32),
    /// One flag per song track; a muted track's notes are skipped and a
    /// channel whose tracks are all muted fades out
    SetAudibleTracks(Box<Vec<bool>>),
    /// Mixer strip for one MIDI channel: volume 0..1, pan -1..1, sends 0..1
    SetChannel { ch: u8, volume: f32, pan: f32, reverb: f32, chorus: f32 },
    /// Instrument chosen in Orfeo for a channel; the file's own program changes
    /// on that channel are then ignored (None = follow the file)
    SetChannelProgram { ch: u8, program: Option<u8> },
    SetMasterGain(f32),
    SetToneDb(f32),
    SetCompressor { enabled: bool, preset: usize },
    /// Metronome: on/off, volume 0..1, and every click of the song as (file time, accent)
    SetMetronome { enabled: bool, volume: f32 },
    SetSongClicks(Box<Vec<(f64, bool)>>),
    /// A click `delay` seconds from now (count-in), regardless of playback
    ClickAfter { delay: f64, accent: bool },
    CancelPendingClicks,
    /// A message played right now (live keys arriving from the UI, controllers)
    Midi { status: u8, d1: u8, d2: u8, at: Instant },
    /// A note that stops by itself after `dur` seconds (previews, step-through)
    NoteFor { ch: u8, key: u8, vel: u8, dur: f64 },
    AllNotesOff,
    /// Switch exclusive/shared: the device is reopened, the music carries on
    SetOutputMode(OutputMode),
    /// Test only: block the audio thread for this many ms (a device that
    /// signals late looks exactly like this to the engine)
    DebugStall(u64),
    Shutdown,
}

/// Read by the caller any time; written only by the audio thread
#[derive(Default)]
pub struct Stats {
    pub position_bits: AtomicU64, // f64 file seconds
    pub playing: AtomicBool,
    pub mode: AtomicU8,           // 0 exclusive, 1 shared, 255 no device
    pub rate: AtomicU32,
    pub period_frames: AtomicU32,
    pub buffer_frames: AtomicU32,
    pub reported_latency_bits: AtomicU64,
    pub late_wakeups: AtomicU32,
    pub worst_render_us: AtomicU32,
    pub reopens: AtomicU32,
    /// Exclusive buffer step in use (0 = smallest); raised when the device can't keep up
    pub period_step: AtomicU8,
    pub live_notes: AtomicU32,
    pub live_wait_sum_us: AtomicU64,
    pub live_wait_max_us: AtomicU32,
    pub live_queued_sum_us: AtomicU64,
    /// Peak level per MIDI channel since the caller last swapped it to 0 (f32 bits)
    pub channel_peaks: [AtomicU32; 16],
    pub master_peak: AtomicU32,
    pub comp_reduction_db: AtomicU32,
    /// Windows' volume the engine applies itself (exclusive, software volume), as
    /// f32 gain bits; u32::MAX = not applied (Windows or the sound card does it)
    pub windows_gain: AtomicU32,
    /// How fast the sound card really takes audio (frames per second, measured
    /// over the first seconds of a Low latency stream); 0 = not measured
    pub measured_rate: AtomicU32,
    /// The stream format, e.g. "48000 Hz · 32-bit float"
    pub format: Mutex<String>,
    pub device_name: Mutex<String>,
    pub fallback_reason: Mutex<Option<String>>,
    pub error: Mutex<Option<String>>,
}

impl Stats {
    pub fn position(&self) -> f64 { f64::from_bits(self.position_bits.load(Relaxed)) }
    pub fn reported_latency_ms(&self) -> f64 { f64::from_bits(self.reported_latency_bits.load(Relaxed)) }
    pub fn take_channel_peak(&self, ch: usize) -> f32 { f32::from_bits(self.channel_peaks[ch].swap(0, Relaxed)) }
    pub fn take_master_peak(&self) -> f32 { f32::from_bits(self.master_peak.swap(0, Relaxed)) }
}

struct LiveMsg { status: u8, d1: u8, d2: u8, at: Instant }

pub struct Engine {
    commands: Mutex<rtrb::Producer<Command>>,
    pub stats: Arc<Stats>,
    /// Every live key/pedal message, for the UI (lights, chord display)
    pub live_out: Mutex<Receiver<(u8, u8, u8)>>,
    _midi: Vec<midir::MidiInputConnection<()>>,
    stop_watch: Arc<AtomicBool>,
    thread: Option<JoinHandle<()>>,
}

impl Engine {
    pub fn start(cfg: EngineConfig) -> Result<Engine, String> {
        let (prod, cons) = rtrb::RingBuffer::<Command>::new(8192);
        let (live_tx, live_rx) = mpsc::channel::<LiveMsg>();
        let (ui_tx, ui_rx) = mpsc::channel::<(u8, u8, u8)>();
        let stats = Arc::new(Stats::default());
        let (ready_tx, ready_rx) = mpsc::channel::<Result<(), String>>();
        let reopen = Arc::new(AtomicBool::new(false));
        let stop_watch = Arc::new(AtomicBool::new(false));

        let st = stats.clone();
        let ro = reopen.clone();
        let stop = stop_watch.clone();
        let thread = std::thread::Builder::new().name("orfeo-audio".into()).spawn(move || {
            audio_thread(cfg.fluid_dir, cfg.soundfonts, cfg.mode, cons, live_rx, st, ready_tx, ro, stop)
        }).map_err(|e| e.to_string())?;
        ready_rx.recv().map_err(|_| "audio thread ended during start-up".to_string())??;
        spawn_default_device_watcher(reopen, stop_watch.clone());

        let midi = if cfg.midi_inputs { open_midi_inputs(live_tx, ui_tx) } else { Vec::new() };
        Ok(Engine { commands: Mutex::new(prod), stats, live_out: Mutex::new(ui_rx), _midi: midi, stop_watch, thread: Some(thread) })
    }

    /// False if the queue is full (the audio thread has stopped draining it)
    pub fn send(&self, cmd: Command) -> bool { self.commands.lock().unwrap().push(cmd).is_ok() }
}

impl Drop for Engine {
    fn drop(&mut self) {
        self.stop_watch.store(true, Relaxed);
        self.send(Command::Shutdown);
        if let Some(t) = self.thread.take() { let _ = t.join(); }
    }
}

fn open_midi_inputs(tx: Sender<LiveMsg>, ui: Sender<(u8, u8, u8)>) -> Vec<midir::MidiInputConnection<()>> {
    let mut conns = Vec::new();
    let Ok(probe) = midir::MidiInput::new("orfeo") else { return conns };
    for p in probe.ports() {
        let Ok(input) = midir::MidiInput::new("orfeo") else { continue };
        let (tx, ui) = (tx.clone(), ui.clone());
        if let Ok(c) = input.connect(&p, "orfeo-in", move |_, m, _| {
            if m.len() >= 2 && m[0] < 0xF0 {
                let (s, a, b) = (m[0], m[1], *m.get(2).unwrap_or(&0));
                let _ = tx.send(LiveMsg { status: s, d1: a, d2: b, at: Instant::now() });
                let _ = ui.send((s, a, b));
            }
        }, ()) { conns.push(c) }
    }
    conns
}

// The user picking another default output in Windows (headphones plugged in,
// a USB interface chosen) → follow it. Checked once a second on its own thread
// so the audio thread never makes these slow calls.
fn spawn_default_device_watcher(reopen: Arc<AtomicBool>, stop: Arc<AtomicBool>) {
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

#[inline] fn fmax_atomic(a: &AtomicU32, v: f32) {
    let mut cur = a.load(Relaxed);
    while v > f32::from_bits(cur) {
        match a.compare_exchange_weak(cur, v.to_bits(), Relaxed, Relaxed) { Ok(_) => break, Err(x) => cur = x }
    }
}

/// Everything about the music that must survive a device change
struct Transport {
    song: Box<Song>,
    idx: usize,
    pos: f64,
    playing: bool,
    ratio: f64,
    transpose: i32,
    audible: Box<Vec<bool>>,
    track_channels: Vec<u16>, // bit per MIDI channel each track uses
    channel_muted: [bool; 16],
    program_override: [Option<u8>; 16],
    song_clicks: Box<Vec<(f64, bool)>>,
    click_idx: usize,
}

impl Transport {
    fn recompute_channel_mutes(&mut self) {
        let mut used = [false; 16];
        let mut any_audible = [false; 16];
        for (t, mask) in self.track_channels.iter().enumerate() {
            let on = self.audible.get(t).copied().unwrap_or(true);
            for ch in 0..16 { if mask & (1 << ch) != 0 { used[ch] = true; if on { any_audible[ch] = true } } }
        }
        for ch in 0..16 { self.channel_muted[ch] = used[ch] && !any_audible[ch] }
    }
}

#[derive(Clone, Copy)]
struct Strip { volume: f32, pan: f32, gain: f32 /* smoothed actual */ }

struct Mix {
    strips: [Strip; 16],
    master: f32,
    tone_db: f32,
    metronome_on: bool,
}

#[allow(clippy::too_many_arguments)]
fn audio_thread(fluid_dir: PathBuf, soundfonts: Vec<PathBuf>, mut mode: OutputMode, mut cmds: rtrb::Consumer<Command>,
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
    // each sound set's own reverb and chorus per instrument (sf2.rs), in load order;
    // `sf_ids` are FluidSynth's ids for them in the current synth
    let own_sends: Vec<std::collections::HashMap<(u16, u16), PresetSend>> = soundfonts.iter().map(|p| preset_sends(p)).collect();
    let make_fluid = |rate: u32| -> Result<(Fluid, Vec<i32>), String> {
        let mut f = Fluid::new(&fluid_dir, rate as f64)?;
        let mut ids = Vec::new();
        for sf in &soundfonts { ids.push(f.load_soundfont(sf)?); }
        for ch in 0..16u8 { f.midi(0xB0 | ch, 91, 0); f.midi(0xB0 | ch, 93, 0); }
        f.midi(0xC0 | LIVE_CH as u8, 0, 0);
        Ok((f, ids))
    };
    let (mut fluid, mut sf_ids) = match make_fluid(out_slot.as_ref().unwrap().rate) { Ok(f) => f, Err(e) => { let _ = ready.send(Err(e)); return } };
    let _ = ready.send(Ok(()));

    let mut tr = Transport {
        song: Box::default(), idx: 0, pos: 0.0, playing: false, ratio: 1.0, transpose: 0,
        audible: Box::default(), track_channels: Vec::new(), channel_muted: [false; 16],
        program_override: [None; 16], song_clicks: Box::default(), click_idx: 0,
    };
    let mut mix = Mix { strips: [Strip { volume: 1.0, pan: 0.0, gain: 1.0 }; 16], master: 1.0, tone_db: 0.0, metronome_on: false };
    let mut comp_enabled = false;
    let mut comp_preset = 0usize;
    let mut sends = [(0f32, 0f32); 16];
    // Each channel's volume as the song file sets it (CC7, GM default 100)
    let mut file_cc7 = [127u8; 16];
    let mut clicks_volume = 0.6f32;
    // (frames from now, accent) — count-in clicks and a pending start
    let mut pending_clicks: Vec<(u64, bool)> = Vec::new();
    let mut pending_play: Option<u64> = None;
    // (frames left, channel, key) — timed preview notes
    let mut timed_offs: Vec<(u64, u8, u8)> = Vec::new();

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
        let mut chans: [Vec<f32>; 32] = std::array::from_fn(|_| vec![0f32; n]);
        let mut fx: [Vec<f32>; 4] = std::array::from_fn(|_| vec![0f32; n]);
        let (mut sl, mut sr) = (vec![0f32; n], vec![0f32; n]); // song bus
        let (mut ll, mut lr) = (vec![0f32; n], vec![0f32; n]); // live bus
        // metronome clicks: their own volume, not the master's (as in the Web Audio metronome)
        let (mut kl, mut kr) = (vec![0f32; n], vec![0f32; n]);
        let mut scratch = Vec::with_capacity(n * 8);
        let mut tone = HighShelf::new(rate as f32, 3000.0, mix.tone_db);
        let mut tone_live = HighShelf::new(rate as f32, 3000.0, mix.tone_db);
        let mut comp = Compressor::new(rate as f32);
        comp.set(comp_enabled, comp_preset);
        let mut agc = AutoLevel::new(rate as f32);
        let mut safety = Compressor::safety(rate as f32);
        // never above -0.1 dBFS (where the Samples engine's limiter lets peaks reach), on
        // any sound card; holds the song and clicks back 2 ms
        let mut ceiling = Brickwall::new(rate as f32, -0.1, 0.002, 0.08);
        // the Samples engine's room: every channel's reverb send, summed, into its plate
        let mut plate = Reverb::new(rate as f32);
        let mut plate_in = vec![0f32; n];
        let mut chorus = Chorus::new();
        let mut chorus_in = vec![0f32; n];
        let mut clicks = Clicks::new(rate as f32);
        clicks.volume = clicks_volume;
        let smooth = 1.0 - (-1.0 / (0.005 * rate as f32)).exp(); // ~5 ms gain ramps
        // Windows' volume (exclusive only): read ~20 times a second, ramped
        let mut os_target = out.windows_gain();
        let mut os_gain = os_target;
        let mut os_poll = 0usize;
        let os_every = (rate * 0.05) as usize;

        let avail = out.client.get_available_space_in_frames().unwrap_or(0) as usize;
        let _ = out.write(&sl[..avail], &sr[..avail], &mut scratch);
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

        let transpose_note = |status: u8, key: u8, t: i32| -> u8 {
            if status & 0x0F == 9 { key } else { (key as i32 + t).clamp(0, 127) as u8 }
        };

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

            // ── Commands ──────────────────────────────────────────────────
            while let Ok(c) = cmds.pop() {
                match c {
                    Command::LoadSong(s) => {
                        fluid.all_sounds_off();
                        let mut tc = vec![0u16; s.track_count as usize];
                        for e in &s.events { if let Some(m) = tc.get_mut(e.track as usize) { *m |= 1 << (e.status & 0x0F) } }
                        tr.song = s; tr.track_channels = tc; tr.idx = 0; tr.pos = 0.0; tr.playing = false; tr.click_idx = 0;
                        tr.recompute_channel_mutes();
                    }
                    Command::Play => {
                        if !tr.playing { replay_state(&mut fluid, &tr, &mut file_cc7, &mix.strips); tr.click_idx = tr.song_clicks.partition_point(|c| c.0 < tr.pos); }
                        tr.playing = true; pending_play = None;
                    }
                    Command::PlayAfter(d) => pending_play = Some((d * rate).round() as u64),
                    Command::Pause => { tr.playing = false; pending_play = None; fluid.all_sounds_off(); }
                    Command::Seek(t) => {
                        fluid.all_sounds_off();
                        tr.pos = t.max(0.0); tr.idx = tr.song.index_at(tr.pos);
                        tr.click_idx = tr.song_clicks.partition_point(|c| c.0 < tr.pos);
                        replay_state(&mut fluid, &tr, &mut file_cc7, &mix.strips);
                    }
                    Command::SetTempoRatio(x) => tr.ratio = x.clamp(0.05, 8.0),
                    Command::SetTranspose(t) => { if t != tr.transpose { fluid.all_notes_off(); tr.transpose = t } }
                    Command::SetAudibleTracks(a) => { tr.audible = a; tr.recompute_channel_mutes(); }
                    Command::SetChannel { ch, volume, pan, reverb, chorus } => {
                        let c = (ch & 0x0F) as usize;
                        mix.strips[c].volume = volume.clamp(0.0, 16.0); // × the song's own volume: may be well above 1
                        send_volume(&mut fluid, c, &file_cc7, &mix.strips);
                        // pan goes to FluidSynth, which places each note's samples as the Samples synth
                        // does (a stereo recording's two sides separately, keeping its width)
                        let pan = pan.clamp(-1.0, 1.0);
                        if mix.strips[c].pan != pan { mix.strips[c].pan = pan; fluid.midi(0xB0 | c as u8, 10, pan_cc(pan)); }
                        let (rv, cv) = ((reverb.clamp(0.0, 1.0) * 127.0) as u8, (chorus.clamp(0.0, 1.0) * 127.0) as u8);
                        if sends[c] != (reverb, chorus) { fluid.midi(0xB0 | c as u8, 91, rv); fluid.midi(0xB0 | c as u8, 93, cv); sends[c] = (reverb, chorus); }
                    }
                    Command::SetChannelProgram { ch, program } => {
                        let c = (ch & 0x0F) as usize;
                        tr.program_override[c] = program;
                        if let Some(p) = program { fluid.midi(0xC0 | c as u8, p, 0) }
                    }
                    Command::SetMasterGain(g) => mix.master = g.max(0.0),
                    Command::SetToneDb(db) => { mix.tone_db = db; tone.set(rate as f32, 3000.0, db); tone_live.set(rate as f32, 3000.0, db) }
                    Command::SetCompressor { enabled, preset } => { comp_enabled = enabled; comp_preset = preset; comp.set(enabled, preset) }
                    Command::SetMetronome { enabled, volume } => { mix.metronome_on = enabled; clicks_volume = volume; clicks.volume = volume }
                    Command::SetSongClicks(c) => { tr.song_clicks = c; tr.click_idx = tr.song_clicks.partition_point(|x| x.0 < tr.pos) }
                    Command::ClickAfter { delay, accent } => pending_clicks.push(((delay * rate).round() as u64, accent)),
                    Command::CancelPendingClicks => { pending_clicks.clear(); pending_play = None }
                    Command::Midi { status, d1, d2, at } => {
                        if status & 0xF0 == 0x90 && d2 > 0 { record_live(&stats, now, at, padding, rate) }
                        fluid.midi(status, d1, d2)
                    }
                    Command::NoteFor { ch, key, vel, dur } => {
                        let c = ch & 0x0F;
                        // re-striking a ringing preview note: release it first
                        timed_offs.retain(|&(_, tc, tk)| { if tc == c && tk == key { fluid.midi(0x80 | c, key, 0); false } else { true } });
                        fluid.midi(0x90 | c, key, vel.max(1));
                        timed_offs.push(((dur.max(0.01) * rate) as u64, c, key));
                    }
                    Command::AllNotesOff => { fluid.all_sounds_off(); timed_offs.clear() }
                    // Asking again for exclusive after a fallback to shared retries it
                    Command::SetOutputMode(m) => { if m != mode || m != out.mode { mode = m; reopen.store(true, Relaxed) } }
                    Command::DebugStall(ms) => std::thread::sleep(Duration::from_millis(ms)),
                    Command::Shutdown => break 'device,
                }
            }

            // ── Live keys: straight into the synth, at the start of this period ──
            while let Ok(m) = live.try_recv() {
                let kind = m.status & 0xF0;
                if kind == 0x90 && m.d2 > 0 { record_live(&stats, now, m.at, padding, rate) }
                fluid.midi(kind | LIVE_CH as u8, m.d1, m.d2);
            }

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
            let r0 = Instant::now();
            for b in chans.iter_mut() { b[..avail].fill(0.0) }
            for b in fx.iter_mut() { b[..avail].fill(0.0) }

            // ── Render, split at song events, clicks, a pending start and note-offs ──
            let mut done = 0usize;
            while done < avail {
                let mut chunk = avail - done;
                if tr.playing {
                    while tr.idx < tr.song.events.len() && tr.song.events[tr.idx].time <= tr.pos + 1e-9 {
                        let e = tr.song.events[tr.idx];
                        tr.idx += 1;
                        let kind = e.status & 0xF0;
                        let ch = (e.status & 0x0F) as usize;
                        if kind == 0xC0 && tr.program_override[ch].is_some() { continue }
                        // Reverb/chorus amounts belong to Orfeo's mixer (as in the Web Audio engine)
                        if kind == 0xB0 && (e.d1 == 91 || e.d1 == 93) { continue }
                        // The file's own volume, scaled by Orfeo's fader
                        if kind == 0xB0 && e.d1 == 7 { file_cc7[ch] = e.d2; send_volume(&mut fluid, ch, &file_cc7, &mix.strips); continue }
                        let is_note = kind == 0x90 || kind == 0x80 || kind == 0xA0;
                        let muted = tr.audible.get(e.track as usize).map(|a| !a).unwrap_or(false);
                        if is_note && muted && kind == 0x90 && e.d2 > 0 { continue }
                        let d1 = if is_note { transpose_note(e.status, e.d1, tr.transpose) } else { e.d1 };
                        fluid.midi(e.status, d1, e.d2);
                    }
                    while tr.click_idx < tr.song_clicks.len() && tr.song_clicks[tr.click_idx].0 <= tr.pos + 1e-9 {
                        if mix.metronome_on { clicks.trigger(tr.song_clicks[tr.click_idx].1) }
                        tr.click_idx += 1;
                    }
                    let next_ev = tr.song.events.get(tr.idx).map(|e| e.time);
                    let next_click = tr.song_clicks.get(tr.click_idx).map(|c| c.0);
                    if let Some(t) = [next_ev, next_click].into_iter().flatten().reduce(f64::min) {
                        chunk = chunk.min(((t - tr.pos) / tr.ratio * rate).ceil().max(1.0) as usize);
                    } else if tr.pos > tr.song.duration + 2.0 {
                        tr.playing = false;
                    }
                }
                // frame-counted things (count-in clicks, delayed start, preview note-offs)
                for (f, accent) in pending_clicks.iter_mut() { if *f == 0 { clicks.trigger(*accent); *f = u64::MAX } }
                pending_clicks.retain(|c| c.0 != u64::MAX);
                if pending_play == Some(0) { pending_play = None; replay_state(&mut fluid, &tr, &mut file_cc7, &mix.strips); tr.playing = true; continue }
                timed_offs.retain(|&(f, c, k)| { if f == 0 { fluid.midi(0x80 | c, k, 0); false } else { true } });
                for f in pending_clicks.iter().map(|c| c.0).chain(pending_play).chain(timed_offs.iter().map(|t| t.0)) {
                    chunk = chunk.min(f.max(1) as usize);
                }

                fluid.process(chunk, &mut fx, &mut chans, done);
                if tr.playing { tr.pos += chunk as f64 * tr.ratio / rate; }
                for c in pending_clicks.iter_mut() { c.0 -= chunk as u64 }
                if let Some(p) = pending_play.as_mut() { *p -= chunk as u64 }
                for t in timed_offs.iter_mut() { t.0 -= chunk as u64 }
                // clicks: never compressed, never auto-levelled, not on the master fader
                clicks.render(&mut kl[done..done + chunk], &mut kr[done..done + chunk]);
                done += chunk;
            }

            // ── Mix the 16 channels into the song bus and the live bus ──────
            sl[..avail].fill(0.0); sr[..avail].fill(0.0);
            plate_in[..avail].fill(0.0); chorus_in[..avail].fill(0.0);
            // (metronome clicks for this period already sit in kl/kr)
            for ch in 0..16 {
                let st = &mut mix.strips[ch];
                let target = if tr.channel_muted[ch] { 0.0 } else { 1.0 };
                let (bl, br) = if ch == LIVE_CH && !song_uses_channel(&tr, LIVE_CH) { (&mut ll, &mut lr) } else { (&mut sl, &mut sr) };
                let (cl, cr) = (&chans[2 * ch], &chans[2 * ch + 1]);
                // reverb and chorus sends as the Samples synth makes them (sf2.rs)
                let ps = fluid.channel_program(ch as u8)
                    .and_then(|(sf, bank, prog)| sf_ids.iter().position(|&id| id == sf).and_then(|i| own_sends[i].get(&(bank, prog)).copied()))
                    .unwrap_or_default();
                let send = ps.send(ps.reverb, sends[ch].0, st.pan, REVERB_LEVEL);
                let csend = ps.send(ps.chorus, sends[ch].1, st.pan, CHORUS_LEVEL);
                let mut peak = 0f32;
                for i in 0..avail {
                    st.gain += (target - st.gain) * smooth;
                    let (a, b) = (cl[i] * st.gain, cr[i] * st.gain);
                    bl[i] += a; br[i] += b;
                    let dry = (cl[i] + cr[i]) * st.gain;
                    plate_in[i] += dry * send; chorus_in[i] += dry * csend;
                    peak = peak.max(a.abs()).max(b.abs());
                }
                fmax_atomic(&stats.channel_peaks[ch], peak);
            }

            plate.process(&plate_in[..avail], &mut sl[..avail], &mut sr[..avail]);
            chorus.process(&chorus_in[..avail], &mut sl[..avail], &mut sr[..avail]);

            // ── Song bus: master → auto-level → compressor → safety limiter → tone, + clicks → ceiling (-0.1 dBFS look-ahead);
            //    live bus: master → tone, added after; then Windows' volume (when the engine applies it) and the soft clip ──
            let use_tone = mix.tone_db.abs() > 0.01;
            let mut mpeak = 0f32;
            os_poll += avail;
            if os_poll >= os_every { os_poll = 0; os_target = out.windows_gain(); }
            stats.windows_gain.store(if out.mode == OutputMode::Exclusive && out.has_software_volume() { os_target.to_bits() } else { u32::MAX }, Relaxed);
            for i in 0..avail {
                let (mut a, mut b) = (sl[i] * mix.master, sr[i] * mix.master);
                agc.process(comp.enabled, &mut a, &mut b);
                comp.process(&mut a, &mut b);
                safety.process(&mut a, &mut b);
                if use_tone { a = tone.process(0, a); b = tone.process(1, b); }
                // the clicks join the song for the ceiling (both scheduled, both held back 2 ms)
                let (mut a, mut b) = (a + kl[i], b + kr[i]);
                ceiling.process(&mut a, &mut b);
                // your own keys join after it, undelayed
                let (mut la, mut lb) = (ll[i] * mix.master, lr[i] * mix.master);
                if use_tone { la = tone_live.process(0, la); lb = tone_live.process(1, lb); }
                // Windows' volume before the soft clip, so a turned-down Orfeo stays clean
                os_gain += (os_target - os_gain) * smooth;
                let (o1, o2) = (soft_clip((a + la) * os_gain), soft_clip((b + lb) * os_gain));
                sl[i] = o1; sr[i] = o2;
                mpeak = mpeak.max(o1.abs()).max(o2.abs());
            }
            ll[..avail].fill(0.0); lr[..avail].fill(0.0);
            kl[..avail].fill(0.0); kr[..avail].fill(0.0);
            fmax_atomic(&stats.master_peak, mpeak);
            stats.comp_reduction_db.store(comp.reduction_db.to_bits(), Relaxed);
            stats.worst_render_us.fetch_max(r0.elapsed().as_micros() as u32, Relaxed);

            if out.write(&sl[..avail], &sr[..avail], &mut scratch).is_err() { break 'run true }
            stats.position_bits.store(tr.pos.to_bits(), Relaxed);
            stats.playing.store(tr.playing, Relaxed);
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
        fluid.all_sounds_off();
        loop {
            // closing Orfeo must never wait for a device that isn't coming back
            if stop.load(Relaxed) || matches!(cmds.peek(), Ok(Command::Shutdown)) { break 'device }
            match open_output(mode, step, &synced, &refused) {
                Ok(o) => {
                    if o.rate != old_rate {
                        // FluidSynth is built for one sample rate: rebuild it, then restore the song state
                        match make_fluid(o.rate) { Ok((f, ids)) => { fluid = f; sf_ids = ids }, Err(e) => { *stats.error.lock().unwrap() = Some(e); break 'device } }
                        for (c, s) in sends.iter().enumerate() { fluid.midi(0xB0 | c as u8, 91, (s.0 * 127.0) as u8); fluid.midi(0xB0 | c as u8, 93, (s.1 * 127.0) as u8); fluid.midi(0xB0 | c as u8, 10, pan_cc(mix.strips[c].pan)); }
                    }
                    replay_state(&mut fluid, &tr, &mut file_cc7, &mix.strips);
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

/// Orfeo's pan (-1…1) as CC10, as the Samples engine sends it
pub(crate) fn pan_cc(pan: f32) -> u8 { ((pan + 1.0) * 63.5).round().clamp(0.0, 127.0) as u8 }

fn song_uses_channel(tr: &Transport, ch: usize) -> bool { tr.track_channels.iter().any(|m| m & (1 << ch) != 0) }

/// Synth volume for a channel = the song's CC7 at this moment × the strip's
/// volume, so the channel's reverb and chorus follow both. The app sends the
/// song's volume moves and, as the strip's volume, the fader ÷ the song's
/// first volume (src/audio/songVolume.ts): untouched, the song plays exactly
/// as written. A channel the song never sets stays at 127 × the fader.
fn send_volume(fluid: &mut Fluid, ch: usize, file_cc7: &[u8; 16], strips: &[Strip; 16]) {
    let v = (file_cc7[ch] as f32 * strips[ch].volume).round().clamp(0.0, 127.0) as u8;
    fluid.midi(0xB0 | ch as u8, 7, v);
}

/// Instruments, banks, controllers and pedals as they stand at the playhead
fn replay_state(fluid: &mut Fluid, tr: &Transport, file_cc7: &mut [u8; 16], strips: &[Strip; 16]) {
    *file_cc7 = [127; 16];
    // expression starts full; a swell the song made later must not linger after a jump back
    for ch in 0..16u8 { fluid.midi(0xB0 | ch, 11, 127) }
    for &(s, a, b) in &tr.song.state_before(tr.pos) {
        let ch = (s & 0x0F) as usize;
        if s & 0xF0 == 0xC0 && tr.program_override[ch].is_some() { continue }
        if s & 0xF0 == 0xB0 && (a == 91 || a == 93) { continue }
        if s & 0xF0 == 0xB0 && a == 7 { file_cc7[ch] = b; continue }
        fluid.midi(s, a, b);
    }
    for (ch, p) in tr.program_override.iter().enumerate() { if let Some(p) = p { fluid.midi(0xC0 | ch as u8, *p, 0) } }
    for ch in 0..16 { send_volume(fluid, ch, file_cc7, strips) }
}

fn record_live(stats: &Stats, now: Instant, at: Instant, padding: f64, rate: f64) {
    let wait = now.saturating_duration_since(at).as_micros() as u64;
    stats.live_notes.fetch_add(1, Relaxed);
    stats.live_wait_sum_us.fetch_add(wait, Relaxed);
    stats.live_wait_max_us.fetch_max(wait as u32, Relaxed);
    stats.live_queued_sum_us.fetch_add((padding * 1e6 / rate) as u64, Relaxed);
}
