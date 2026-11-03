//! The engine as callers see it: [`Engine::start`] spawns the audio thread,
//! commands go in through a lock-free queue, live MIDI keys through their own
//! channel, and position and statistics come back through atomics.
//!
//! The audio thread itself is two parts: the musician ([`crate::renderer`] —
//! synth, song, mix; the same on every system) and a driver that owns the
//! sound card (`wasapi_driver.rs` on Windows). Windows-only features live in
//! the driver, never in the musician.

use crate::song::Song;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicU8, Ordering::Relaxed};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread::JoinHandle;
use std::time::Instant;

/// Low latency: Exclusive takes the sound card for Orfeo alone (Windows), Shared
/// plays through the system mixer like any other app
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutputMode { Exclusive, Shared }

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
    /// Blocks the sound card asked for, and their frames in total (diagnostics)
    pub blocks: AtomicU64,
    pub block_frames: AtomicU64,
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

pub(crate) struct LiveMsg { pub status: u8, pub d1: u8, pub d2: u8, pub at: Instant }

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
        // WASAPI needs a watcher thread to follow a new default output; the CPAL
        // driver's own supervising thread does that
        #[cfg(all(windows, not(feature = "cpal-driver")))]
        crate::wasapi_driver::spawn_default_device_watcher(reopen, stop_watch.clone());
        #[cfg(any(not(windows), feature = "cpal-driver"))]
        drop(reopen);

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

// ── The audio thread: the system's driver around the shared renderer ────────
// Windows ships the WASAPI driver (exclusive mode, MMCSS, endpoint volume);
// macOS and Linux use CPAL. The `cpal-driver` feature builds CPAL on Windows
// too, for development.
#[cfg(all(windows, not(feature = "cpal-driver")))]
use crate::wasapi_driver::audio_thread;
#[cfg(any(not(windows), feature = "cpal-driver"))]
use crate::cpal_driver::audio_thread;
