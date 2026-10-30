//! Node add-on for Orfeo's native audio engine. Thin: every method turns into
//! one engine command or one read of its stats. Loaded only inside Orfeo's
//! audio utility process (electron/audioHost.ts), never in the renderer.

use napi::bindgen_prelude::*;
use napi_derive::napi;
use orfeo_audio::{Command, Engine, EngineConfig, OutputMode, Song, SongEvent};
use orfeo_audio::offline::{render_offline, OfflineChannel, OfflineOptions};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering::Relaxed};
use std::sync::{Arc, Mutex};
use std::time::Instant;

#[napi(object)]
pub struct StartOptions {
    pub fluid_dir: String,
    /// Loaded in order; later sets win for presets they have
    pub soundfonts: Vec<String>,
    pub exclusive: bool,
}

#[napi(object)]
pub struct Status {
    pub position: f64,
    pub playing: bool,
    /// "exclusive" | "shared" | "none"
    pub mode: String,
    pub rate: u32,
    pub period_frames: u32,
    pub buffer_frames: u32,
    pub reported_latency_ms: f64,
    pub late_wakeups: u32,
    pub reopens: u32,
    pub period_step: u32,
    pub worst_render_ms: f64,
    pub device_name: String,
    pub fallback_reason: Option<String>,
    pub error: Option<String>,
    /// Peak per MIDI channel since the last status read
    pub channel_peaks: Vec<f64>,
    pub master_peak: f64,
    pub comp_reduction_db: f64,
    /// Windows' volume the engine applies itself in exclusive mode (gain), or null
    pub windows_gain: Option<f64>,
    /// How fast the sound card really takes audio in exclusive mode (Hz), or null
    pub measured_rate: Option<u32>,
    /// e.g. "48000 Hz · 32-bit float"
    pub format: String,
    pub live_notes: u32,
    pub live_wait_avg_ms: f64,
    pub live_wait_max_ms: f64,
    pub live_queued_avg_ms: f64,
}

/// `e` is None after `shutdown()` — JS garbage collection decides when an
/// object is freed, but the sound card must be released NOW (an exclusive
/// stream still open would make the next engine's open fail), so shutting
/// down is explicit.
#[napi]
pub struct NativeEngine { e: Option<Engine> }

#[napi]
impl NativeEngine {
    #[napi(constructor)]
    pub fn new(o: StartOptions) -> Result<Self> {
        let e = Engine::start(EngineConfig {
            fluid_dir: o.fluid_dir.into(),
            soundfonts: o.soundfonts.into_iter().map(Into::into).collect(),
            mode: if o.exclusive { OutputMode::Exclusive } else { OutputMode::Shared },
            // Orfeo's renderer owns the keyboard (Web MIDI, its filters and
            // settings) and forwards live keys with `midi()`
            midi_inputs: false,
        }).map_err(Error::from_reason)?;
        Ok(NativeEngine { e: Some(e) })
    }

    fn send(&self, c: Command) { if let Some(e) = &self.e { e.send(c); } }

    /// Stops the audio thread and releases the sound card immediately
    #[napi]
    pub fn shutdown(&mut self) { self.e = None; }

    /// One flattened song: per event its file time, track and 3 MIDI bytes
    #[napi]
    pub fn load_song(&self, times: Float64Array, tracks: Uint16Array, bytes: Uint8Array, track_count: u32, duration: f64) -> Result<()> {
        let (t, tr, b) = (times.as_ref(), tracks.as_ref(), bytes.as_ref());
        if tr.len() != t.len() || b.len() != t.len() * 3 { return Err(Error::from_reason("loadSong: array lengths don't match")) }
        let events = (0..t.len()).map(|i| SongEvent { time: t[i], track: tr[i], status: b[3 * i], d1: b[3 * i + 1], d2: b[3 * i + 2] }).collect();
        self.send(Command::LoadSong(Box::new(Song { events, duration, track_count: track_count as u16 })));
        Ok(())
    }
    #[napi] pub fn play(&self) { self.send(Command::Play) }
    #[napi] pub fn pause(&self) { self.send(Command::Pause) }
    #[napi] pub fn seek(&self, sec: f64) { self.send(Command::Seek(sec)) }
    #[napi] pub fn play_after(&self, sec: f64) { self.send(Command::PlayAfter(sec)) }
    #[napi] pub fn set_tempo_ratio(&self, r: f64) { self.send(Command::SetTempoRatio(r)) }
    #[napi] pub fn set_transpose(&self, semis: i32) { self.send(Command::SetTranspose(semis)) }
    #[napi] pub fn set_audible_tracks(&self, flags: Vec<bool>) { self.send(Command::SetAudibleTracks(Box::new(flags))) }
    #[napi]
    pub fn set_channel(&self, ch: u32, volume: f64, pan: f64, reverb: f64, chorus: f64) {
        self.send(Command::SetChannel { ch: ch as u8, volume: volume as f32, pan: pan as f32, reverb: reverb as f32, chorus: chorus as f32 })
    }
    /// program < 0 = follow the file
    #[napi]
    pub fn set_channel_program(&self, ch: u32, program: i32) {
        self.send(Command::SetChannelProgram { ch: ch as u8, program: if program < 0 { None } else { Some(program as u8) } })
    }
    #[napi] pub fn set_master_gain(&self, g: f64) { self.send(Command::SetMasterGain(g as f32)) }
    #[napi] pub fn set_tone_db(&self, db: f64) { self.send(Command::SetToneDb(db as f32)) }
    #[napi] pub fn set_compressor(&self, enabled: bool, preset: u32) { self.send(Command::SetCompressor { enabled, preset: preset as usize }) }
    #[napi] pub fn set_metronome(&self, enabled: bool, volume: f64) { self.send(Command::SetMetronome { enabled, volume: volume as f32 }) }
    #[napi]
    pub fn set_song_clicks(&self, times: Float64Array, accents: Uint8Array) {
        let (t, a) = (times.as_ref(), accents.as_ref());
        self.send(Command::SetSongClicks(Box::new((0..t.len()).map(|i| (t[i], a.get(i).copied().unwrap_or(0) != 0)).collect())))
    }
    #[napi] pub fn click_after(&self, sec: f64, accent: bool) { self.send(Command::ClickAfter { delay: sec, accent }) }
    #[napi] pub fn cancel_pending_clicks(&self) { self.send(Command::CancelPendingClicks) }
    /// A MIDI message played now (live keys, pedals). `ageMs`: how long ago the
    /// key was pressed, so the delay check measures from the real key press
    #[napi]
    pub fn midi(&self, status: u32, d1: u32, d2: u32, age_ms: Option<f64>) {
        let at = Instant::now() - std::time::Duration::from_micros((age_ms.unwrap_or(0.0).max(0.0) * 1000.0) as u64);
        self.send(Command::Midi { status: status as u8, d1: d1 as u8, d2: d2 as u8, at })
    }
    #[napi]
    pub fn note_for(&self, ch: u32, key: u32, vel: u32, dur_sec: f64) {
        self.send(Command::NoteFor { ch: ch as u8, key: key as u8, vel: vel as u8, dur: dur_sec })
    }
    #[napi] pub fn all_notes_off(&self) { self.send(Command::AllNotesOff) }
    #[napi] pub fn set_exclusive(&self, exclusive: bool) { self.send(Command::SetOutputMode(if exclusive { OutputMode::Exclusive } else { OutputMode::Shared })) }

    #[napi]
    pub fn status(&self) -> Result<Status> {
        let Some(e) = &self.e else { return Err(Error::from_reason("engine is shut down")) };
        let s = &e.stats;
        let notes = s.live_notes.swap(0, Relaxed);
        let wait = s.live_wait_sum_us.swap(0, Relaxed) as f64;
        let queued = s.live_queued_sum_us.swap(0, Relaxed) as f64;
        let n = notes.max(1) as f64;
        Ok(Status {
            position: s.position(),
            playing: s.playing.load(Relaxed),
            mode: match s.mode.load(Relaxed) { 0 => "exclusive", 1 => "shared", _ => "none" }.into(),
            rate: s.rate.load(Relaxed),
            period_frames: s.period_frames.load(Relaxed),
            buffer_frames: s.buffer_frames.load(Relaxed),
            reported_latency_ms: s.reported_latency_ms(),
            late_wakeups: s.late_wakeups.load(Relaxed),
            reopens: s.reopens.load(Relaxed),
            period_step: s.period_step.load(Relaxed) as u32,
            worst_render_ms: s.worst_render_us.swap(0, Relaxed) as f64 / 1000.0,
            device_name: s.device_name.lock().unwrap().clone(),
            fallback_reason: s.fallback_reason.lock().unwrap().clone(),
            error: s.error.lock().unwrap().clone(),
            channel_peaks: (0..16).map(|c| s.take_channel_peak(c) as f64).collect(),
            master_peak: s.take_master_peak() as f64,
            comp_reduction_db: f32::from_bits(s.comp_reduction_db.load(Relaxed)) as f64,
            windows_gain: match s.windows_gain.load(Relaxed) { u32::MAX => None, b => Some(f32::from_bits(b) as f64) },
            measured_rate: match s.measured_rate.load(Relaxed) { 0 => None, r => Some(r) },
            format: s.format.lock().unwrap().clone(),
            live_notes: notes,
            live_wait_avg_ms: wait / n / 1000.0,
            live_wait_max_ms: s.live_wait_max_us.swap(0, Relaxed) as f64 / 1000.0,
            live_queued_avg_ms: queued / n / 1000.0,
        })
    }
}

// ── Export to audio: a whole song rendered offline on its own thread ─────────
// Never touches the live engine. The audio process polls progress() and
// takes the result when done; cancel() stops it within ~0.5 s of audio.

#[napi(object)]
pub struct OfflineChannelJs { pub volume: f64, pub pan: f64, pub reverb: f64, pub chorus: f64 }

#[napi(object)]
pub struct OfflineJob {
    pub fluid_dir: String,
    pub soundfonts: Vec<String>,
    pub sample_rate: u32,
    pub tail_sec: f64,
    /// 16 entries; null = channel not used
    pub channels: Vec<Option<OfflineChannelJs>>,
    pub master_gain: f64,
    pub tone_db: f64,
    pub comp_enabled: bool,
    pub comp_preset: u32,
}

type Rendered = std::result::Result<(Vec<f32>, Vec<f32>), String>;

#[napi]
pub struct OfflineRender { progress: Arc<AtomicU64>, cancel: Arc<AtomicBool>, result: Arc<Mutex<Option<Rendered>>> }

#[napi]
impl OfflineRender {
    #[napi(constructor)]
    pub fn new(job: OfflineJob, times: Float64Array, tracks: Uint16Array, bytes: Uint8Array, track_count: u32, duration: f64) -> Result<Self> {
        let (t, tr, b) = (times.as_ref(), tracks.as_ref(), bytes.as_ref());
        if tr.len() != t.len() || b.len() != t.len() * 3 { return Err(Error::from_reason("renderOffline: array lengths don't match")) }
        let events = (0..t.len()).map(|i| SongEvent { time: t[i], track: tr[i], status: b[3 * i], d1: b[3 * i + 1], d2: b[3 * i + 2] }).collect();
        let song = Song { events, duration, track_count: track_count as u16 };
        let mut channels = [None; 16];
        for (i, c) in job.channels.iter().take(16).enumerate() {
            channels[i] = c.as_ref().map(|c| OfflineChannel { volume: c.volume as f32, pan: c.pan as f32, reverb: c.reverb as f32, chorus: c.chorus as f32 });
        }
        let opts = OfflineOptions { sample_rate: job.sample_rate, tail_sec: job.tail_sec, channels, master_gain: job.master_gain as f32,
            tone_db: job.tone_db as f32, comp_enabled: job.comp_enabled, comp_preset: job.comp_preset as usize };
        let fluid_dir: std::path::PathBuf = job.fluid_dir.into();
        let soundfonts: Vec<std::path::PathBuf> = job.soundfonts.into_iter().map(Into::into).collect();
        let (progress, cancel, result) = (Arc::new(AtomicU64::new(0)), Arc::new(AtomicBool::new(false)), Arc::new(Mutex::new(None)));
        let (p, c, r) = (progress.clone(), cancel.clone(), result.clone());
        std::thread::spawn(move || {
            // a panic in the render must still finish the job (as an error), or
            // the audio process would wait for it forever
            let out = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                render_offline(&fluid_dir, &soundfonts, &song, &opts, &mut |x| { p.store(x.to_bits(), Relaxed); !c.load(Relaxed) })
            })).unwrap_or_else(|_| Err("the export stopped unexpectedly".into()));
            *r.lock().unwrap_or_else(|e| e.into_inner()) = Some(out);
        });
        Ok(OfflineRender { progress, cancel, result })
    }

    /// 0..1
    #[napi] pub fn progress(&self) -> f64 { f64::from_bits(self.progress.load(Relaxed)) }
    #[napi] pub fn cancel(&self) { self.cancel.store(true, Relaxed) }

    /// null while still rendering; [left, right] when done; throws on failure or cancel
    #[napi]
    pub fn take(&self) -> Result<Option<Vec<Float32Array>>> {
        match self.result.lock().unwrap_or_else(|e| e.into_inner()).take() {
            None => Ok(None),
            Some(Ok((l, r))) => Ok(Some(vec![Float32Array::new(l), Float32Array::new(r)])),
            Some(Err(e)) => Err(Error::from_reason(e)),
        }
    }
}
