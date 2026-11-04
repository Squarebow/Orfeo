//! The musician: everything the audio thread does to turn the song, your keys
//! and the mixer into sound — FluidSynth, sample-accurate song playback (each
//! block split at event times), the 16-channel mix (volume, pan, mute fades,
//! level meters), each sound set's own reverb/chorus sends into Orfeo's plate
//! and chorus, the live channel kept out of the compressor, metronome and
//! count-in clicks, and the master chain.
//!
//! It knows nothing about sound cards. A driver (`wasapi_driver.rs` on Windows)
//! owns the device, asks for blocks with [`Renderer::render`] and hands the
//! result to the card. Everything about the music survives a device change;
//! the DSP state starts fresh for each device ([`Renderer::begin_device`]), as
//! it always has.

use crate::clicks::Clicks;
use crate::dsp::{soft_clip, HighShelf};
use crate::dynamics::{AutoLevel, Brickwall, Compressor};
use crate::engine::{Command, Stats, LIVE_CH};
use crate::fluid::Fluid;
use crate::reverb::{Chorus, Reverb};
use crate::sf2::{preset_sends, PresetSend, CHORUS_LEVEL, REVERB_LEVEL};
use crate::song::Song;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering::Relaxed};
use std::sync::Arc;
use std::time::Instant;

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

/// Per-device processing state: buffers sized for the device, filters and
/// dynamics at its sample rate. Made fresh by `begin_device`.
struct Dsp {
    chans: [Vec<f32>; 32],
    fx: [Vec<f32>; 4],
    sl: Vec<f32>, sr: Vec<f32>,   // song bus (the finished block after `render`)
    ll: Vec<f32>, lr: Vec<f32>,   // live bus
    // metronome clicks: their own volume, not the master's (as in the Web Audio metronome)
    kl: Vec<f32>, kr: Vec<f32>,
    tone: HighShelf,
    tone_live: HighShelf,
    comp: Compressor,
    agc: AutoLevel,
    safety: Compressor,
    ceiling: Brickwall,
    plate: Reverb,
    plate_in: Vec<f32>,
    chorus: Chorus,
    chorus_in: Vec<f32>,
    clicks: Clicks,
    smooth: f32,
    /// The system volume the engine applies itself (Windows exclusive), ramped
    os_gain: f32,
}

pub struct Renderer {
    fluid_dir: PathBuf,
    soundfonts: Vec<PathBuf>,
    // each sound set's own reverb and chorus per instrument (sf2.rs), in load order;
    // `sf_ids` are FluidSynth's ids for them in the current synth
    own_sends: Vec<HashMap<(u16, u16), PresetSend>>,
    fluid: Fluid,
    sf_ids: Vec<i32>,
    stats: Arc<Stats>,
    rate: f64,

    tr: Transport,
    mix: Mix,
    comp_enabled: bool,
    comp_preset: usize,
    sends: [(f32, f32); 16],
    // Each channel's volume as the song file sets it (CC7, GM default 100)
    file_cc7: [u8; 16],
    clicks_volume: f32,
    // (frames from now, accent) — count-in clicks and a pending start
    pending_clicks: Vec<(u64, bool)>,
    pending_play: Option<u64>,
    // (frames left, channel, key) — timed preview notes
    timed_offs: Vec<(u64, u8, u8)>,

    dsp: Option<Dsp>,
}

fn make_fluid(fluid_dir: &std::path::Path, soundfonts: &[PathBuf], rate: u32) -> Result<(Fluid, Vec<i32>), String> {
    let mut f = Fluid::new(fluid_dir, rate as f64)?;
    let mut ids = Vec::new();
    for sf in soundfonts { ids.push(f.load_soundfont(sf)?); }
    for ch in 0..16u8 { f.midi(0xB0 | ch, 91, 0); f.midi(0xB0 | ch, 93, 0); }
    f.midi(0xC0 | LIVE_CH as u8, 0, 0);
    Ok((f, ids))
}

#[inline]
fn transpose_note(status: u8, key: u8, t: i32) -> u8 {
    if status & 0x0F == 9 { key } else { (key as i32 + t).clamp(0, 127) as u8 }
}

impl Renderer {
    /// Loads FluidSynth and the sound sets at the device's sample rate
    pub fn new(fluid_dir: PathBuf, soundfonts: Vec<PathBuf>, rate: u32, stats: Arc<Stats>) -> Result<Renderer, String> {
        let own_sends = soundfonts.iter().map(|p| preset_sends(p)).collect();
        let (fluid, sf_ids) = make_fluid(&fluid_dir, &soundfonts, rate)?;
        Ok(Renderer {
            fluid_dir, soundfonts, own_sends, fluid, sf_ids, stats, rate: rate as f64,
            tr: Transport {
                song: Box::default(), idx: 0, pos: 0.0, playing: false, ratio: 1.0, transpose: 0,
                audible: Box::default(), track_channels: Vec::new(), channel_muted: [false; 16],
                program_override: [None; 16], song_clicks: Box::default(), click_idx: 0,
            },
            mix: Mix { strips: [Strip { volume: 1.0, pan: 0.0, gain: 1.0 }; 16], master: 1.0, tone_db: 0.0, metronome_on: false },
            comp_enabled: false,
            comp_preset: 0,
            sends: [(0f32, 0f32); 16],
            file_cc7: [127u8; 16],
            clicks_volume: 0.6,
            pending_clicks: Vec::new(),
            pending_play: None,
            timed_offs: Vec::new(),
            dsp: None,
        })
    }

    /// A device is opened (or reopened): fresh buffers for blocks of up to
    /// `max_frames`, and the filters and dynamics at its rate. `os_gain` is the
    /// system volume the engine starts applying (1 where the system does it).
    pub fn begin_device(&mut self, rate: u32, max_frames: usize, os_gain: f32) {
        self.rate = rate as f64;
        let rate = self.rate;
        let n = max_frames;
        let mut comp = Compressor::new(rate as f32);
        comp.set(self.comp_enabled, self.comp_preset);
        let mut clicks = Clicks::new(rate as f32);
        clicks.volume = self.clicks_volume;
        self.dsp = Some(Dsp {
            chans: std::array::from_fn(|_| vec![0f32; n]),
            fx: std::array::from_fn(|_| vec![0f32; n]),
            sl: vec![0f32; n], sr: vec![0f32; n],
            ll: vec![0f32; n], lr: vec![0f32; n],
            kl: vec![0f32; n], kr: vec![0f32; n],
            tone: HighShelf::new(rate as f32, 3000.0, self.mix.tone_db),
            tone_live: HighShelf::new(rate as f32, 3000.0, self.mix.tone_db),
            comp,
            agc: AutoLevel::new(rate as f32),
            safety: Compressor::safety(rate as f32),
            // never above -0.1 dBFS (where the Samples engine's limiter lets peaks reach), on
            // any sound card; holds the song and clicks back 2 ms
            ceiling: Brickwall::new(rate as f32, -0.1, 0.002, 0.08),
            // the Samples engine's room: every channel's reverb send, summed, into its plate
            plate: Reverb::new(rate as f32),
            plate_in: vec![0f32; n],
            chorus: Chorus::new(rate as f32),
            chorus_in: vec![0f32; n],
            clicks,
            smooth: 1.0 - (-1.0 / (0.005 * rate as f32)).exp(), // ~5 ms gain ramps
            os_gain,
        });
    }

    /// The song bus as it stands — silence right after `begin_device`, the
    /// finished block after `render`
    pub fn output(&self, frames: usize) -> (&[f32], &[f32]) {
        let d = self.dsp.as_ref().expect("begin_device first");
        (&d.sl[..frames], &d.sr[..frames])
    }

    pub fn position(&self) -> f64 { self.tr.pos }
    pub fn playing(&self) -> bool { self.tr.playing }

    /// The device went away: nothing may keep ringing into the next one
    pub fn all_sounds_off(&mut self) { self.fluid.all_sounds_off() }

    /// The new device runs at another rate: FluidSynth is built for one sample
    /// rate, so it is rebuilt and the mixer's sends and pans are sent again
    pub fn rebuild_for_rate(&mut self, rate: u32) -> Result<(), String> {
        let (f, ids) = make_fluid(&self.fluid_dir, &self.soundfonts, rate)?;
        self.fluid = f;
        self.sf_ids = ids;
        for (c, s) in self.sends.iter().enumerate() {
            self.fluid.midi(0xB0 | c as u8, 91, (s.0 * 127.0) as u8);
            self.fluid.midi(0xB0 | c as u8, 93, (s.1 * 127.0) as u8);
            self.fluid.midi(0xB0 | c as u8, 10, pan_cc(self.mix.strips[c].pan));
        }
        Ok(())
    }

    /// Instruments, controllers and pedals as they stand at the playhead
    pub fn replay(&mut self) { replay_state(&mut self.fluid, &self.tr, &mut self.file_cc7, &self.mix.strips) }

    /// One command from the caller. `now` is when this block's wake-up came and
    /// `padding` the frames already queued in the device (for the live-key
    /// statistics). Driver-level commands (output mode, stall, shutdown) are the
    /// driver's and never arrive here.
    pub fn command(&mut self, c: Command, now: Instant, padding: f64) {
        let rate = self.rate;
        let fluid = &mut self.fluid;
        let tr = &mut self.tr;
        let mix = &mut self.mix;
        match c {
            Command::LoadSong(s) => {
                fluid.all_sounds_off();
                let mut tc = vec![0u16; s.track_count as usize];
                for e in &s.events { if let Some(m) = tc.get_mut(e.track as usize) { *m |= 1 << (e.status & 0x0F) } }
                tr.song = s; tr.track_channels = tc; tr.idx = 0; tr.pos = 0.0; tr.playing = false; tr.click_idx = 0;
                tr.recompute_channel_mutes();
            }
            Command::Play => {
                if !tr.playing { replay_state(fluid, tr, &mut self.file_cc7, &mix.strips); tr.click_idx = tr.song_clicks.partition_point(|c| c.0 < tr.pos); }
                tr.playing = true; self.pending_play = None;
            }
            Command::PlayAfter(d) => self.pending_play = Some((d * rate).round() as u64),
            Command::Pause => { tr.playing = false; self.pending_play = None; fluid.all_sounds_off(); }
            Command::Seek(t) => {
                fluid.all_sounds_off();
                tr.pos = t.max(0.0); tr.idx = tr.song.index_at(tr.pos);
                tr.click_idx = tr.song_clicks.partition_point(|c| c.0 < tr.pos);
                replay_state(fluid, tr, &mut self.file_cc7, &mix.strips);
            }
            Command::SetTempoRatio(x) => tr.ratio = x.clamp(0.05, 8.0),
            Command::SetTranspose(t) => { if t != tr.transpose { fluid.all_notes_off(); tr.transpose = t } }
            Command::SetAudibleTracks(a) => { tr.audible = a; tr.recompute_channel_mutes(); }
            Command::SetChannel { ch, volume, pan, reverb, chorus } => {
                let c = (ch & 0x0F) as usize;
                mix.strips[c].volume = volume.clamp(0.0, 16.0); // × the song's own volume: may be well above 1
                send_volume(fluid, c, &self.file_cc7, &mix.strips);
                // pan goes to FluidSynth, which places each note's samples as the Samples synth
                // does (a stereo recording's two sides separately, keeping its width)
                let pan = pan.clamp(-1.0, 1.0);
                if mix.strips[c].pan != pan { mix.strips[c].pan = pan; fluid.midi(0xB0 | c as u8, 10, pan_cc(pan)); }
                let (rv, cv) = ((reverb.clamp(0.0, 1.0) * 127.0) as u8, (chorus.clamp(0.0, 1.0) * 127.0) as u8);
                if self.sends[c] != (reverb, chorus) { fluid.midi(0xB0 | c as u8, 91, rv); fluid.midi(0xB0 | c as u8, 93, cv); self.sends[c] = (reverb, chorus); }
            }
            Command::SetChannelProgram { ch, program } => {
                let c = (ch & 0x0F) as usize;
                tr.program_override[c] = program;
                if let Some(p) = program { fluid.midi(0xC0 | c as u8, p, 0) }
            }
            Command::SetMasterGain(g) => mix.master = g.max(0.0),
            Command::SetToneDb(db) => {
                mix.tone_db = db;
                if let Some(d) = self.dsp.as_mut() { d.tone.set(rate as f32, 3000.0, db); d.tone_live.set(rate as f32, 3000.0, db) }
            }
            Command::SetCompressor { enabled, preset } => {
                self.comp_enabled = enabled; self.comp_preset = preset;
                if let Some(d) = self.dsp.as_mut() { d.comp.set(enabled, preset) }
            }
            Command::SetMetronome { enabled, volume } => {
                mix.metronome_on = enabled; self.clicks_volume = volume;
                if let Some(d) = self.dsp.as_mut() { d.clicks.volume = volume }
            }
            Command::SetSongClicks(c) => { tr.song_clicks = c; tr.click_idx = tr.song_clicks.partition_point(|x| x.0 < tr.pos) }
            Command::ClickAfter { delay, accent } => self.pending_clicks.push(((delay * rate).round() as u64, accent)),
            Command::CancelPendingClicks => { self.pending_clicks.clear(); self.pending_play = None }
            Command::Midi { status, d1, d2, at } => {
                if status & 0xF0 == 0x90 && d2 > 0 { record_live(&self.stats, now, at, padding, rate) }
                fluid.midi(status, d1, d2)
            }
            Command::NoteFor { ch, key, vel, dur } => {
                let c = ch & 0x0F;
                // re-striking a ringing preview note: release it first
                self.timed_offs.retain(|&(_, tc, tk)| { if tc == c && tk == key { fluid.midi(0x80 | c, key, 0); false } else { true } });
                fluid.midi(0x90 | c, key, vel.max(1));
                self.timed_offs.push(((dur.max(0.01) * rate) as u64, c, key));
            }
            Command::AllNotesOff => { fluid.all_sounds_off(); self.timed_offs.clear() }
            // the driver's own: handled there, never forwarded
            Command::SetOutputMode(_) | Command::DebugStall(_) | Command::Shutdown => {}
        }
    }

    /// A key from a MIDI keyboard: straight into the synth, at the start of this block
    pub fn live_key(&mut self, status: u8, d1: u8, d2: u8, at: Instant, now: Instant, padding: f64) {
        let kind = status & 0xF0;
        if kind == 0x90 && d2 > 0 { record_live(&self.stats, now, at, padding, self.rate) }
        self.fluid.midi(kind | LIVE_CH as u8, d1, d2);
    }

    /// Renders `avail` frames into the song bus (read it with [`Renderer::output`]).
    /// `os_target`: the system volume to ramp to (1 when the system applies it).
    pub fn render(&mut self, avail: usize, os_target: f32) {
        let rate = self.rate;
        let stats = &self.stats;
        let fluid = &mut self.fluid;
        let tr = &mut self.tr;
        let mix = &mut self.mix;
        let d = self.dsp.as_mut().expect("begin_device first");
        let (pending_clicks, timed_offs) = (&mut self.pending_clicks, &mut self.timed_offs);
        let pending_play = &mut self.pending_play;
        let file_cc7 = &mut self.file_cc7;

        for b in d.chans.iter_mut() { b[..avail].fill(0.0) }
        for b in d.fx.iter_mut() { b[..avail].fill(0.0) }

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
                    if kind == 0xB0 && e.d1 == 7 { file_cc7[ch] = e.d2; send_volume(fluid, ch, file_cc7, &mix.strips); continue }
                    let is_note = kind == 0x90 || kind == 0x80 || kind == 0xA0;
                    let muted = tr.audible.get(e.track as usize).map(|a| !a).unwrap_or(false);
                    if is_note && muted && kind == 0x90 && e.d2 > 0 { continue }
                    let d1 = if is_note { transpose_note(e.status, e.d1, tr.transpose) } else { e.d1 };
                    fluid.midi(e.status, d1, e.d2);
                }
                while tr.click_idx < tr.song_clicks.len() && tr.song_clicks[tr.click_idx].0 <= tr.pos + 1e-9 {
                    if mix.metronome_on { d.clicks.trigger(tr.song_clicks[tr.click_idx].1) }
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
            for (f, accent) in pending_clicks.iter_mut() { if *f == 0 { d.clicks.trigger(*accent); *f = u64::MAX } }
            pending_clicks.retain(|c| c.0 != u64::MAX);
            if *pending_play == Some(0) { *pending_play = None; replay_state(fluid, tr, file_cc7, &mix.strips); tr.playing = true; continue }
            timed_offs.retain(|&(f, c, k)| { if f == 0 { fluid.midi(0x80 | c, k, 0); false } else { true } });
            for f in pending_clicks.iter().map(|c| c.0).chain(*pending_play).chain(timed_offs.iter().map(|t| t.0)) {
                chunk = chunk.min(f.max(1) as usize);
            }

            fluid.process(chunk, &mut d.fx, &mut d.chans, done);
            if tr.playing { tr.pos += chunk as f64 * tr.ratio / rate; }
            for c in pending_clicks.iter_mut() { c.0 -= chunk as u64 }
            if let Some(p) = pending_play.as_mut() { *p -= chunk as u64 }
            for t in timed_offs.iter_mut() { t.0 -= chunk as u64 }
            // clicks: never compressed, never auto-levelled, not on the master fader
            d.clicks.render(&mut d.kl[done..done + chunk], &mut d.kr[done..done + chunk]);
            done += chunk;
        }

        // ── Mix the 16 channels into the song bus and the live bus ──────
        d.sl[..avail].fill(0.0); d.sr[..avail].fill(0.0);
        d.plate_in[..avail].fill(0.0); d.chorus_in[..avail].fill(0.0);
        // (metronome clicks for this block already sit in kl/kr)
        for ch in 0..16 {
            let st = &mut mix.strips[ch];
            let target = if tr.channel_muted[ch] { 0.0 } else { 1.0 };
            let (bl, br) = if ch == LIVE_CH && !song_uses_channel(tr, LIVE_CH) { (&mut d.ll, &mut d.lr) } else { (&mut d.sl, &mut d.sr) };
            let (cl, cr) = (&d.chans[2 * ch], &d.chans[2 * ch + 1]);
            // reverb and chorus sends as the Samples synth makes them (sf2.rs)
            let ps = fluid.channel_program(ch as u8)
                .and_then(|(sf, bank, prog)| self.sf_ids.iter().position(|&id| id == sf).and_then(|i| self.own_sends[i].get(&(bank, prog)).copied()))
                .unwrap_or_default();
            let send = ps.send(ps.reverb, self.sends[ch].0, st.pan, REVERB_LEVEL);
            // drums stay out of the chorus, as in spessasynth (its GS drum map sends none)
            let csend = if ch == 9 { 0.0 } else { ps.send(ps.chorus, self.sends[ch].1, st.pan, CHORUS_LEVEL) };
            let mut peak = 0f32;
            for i in 0..avail {
                st.gain += (target - st.gain) * d.smooth;
                let (a, b) = (cl[i] * st.gain, cr[i] * st.gain);
                bl[i] += a; br[i] += b;
                let dry = (cl[i] + cr[i]) * st.gain;
                d.plate_in[i] += dry * send; d.chorus_in[i] += dry * csend;
                peak = peak.max(a.abs()).max(b.abs());
            }
            fmax_atomic(&stats.channel_peaks[ch], peak);
        }

        d.plate.process(&d.plate_in[..avail], &mut d.sl[..avail], &mut d.sr[..avail]);
        d.chorus.process(&d.chorus_in[..avail], &mut d.sl[..avail], &mut d.sr[..avail]);

        // ── Song bus: master → auto-level → compressor → safety limiter → tone, + clicks → ceiling (-0.1 dBFS look-ahead);
        //    live bus: master → tone, added after; then the system volume (when the engine applies it) and the soft clip ──
        let use_tone = mix.tone_db.abs() > 0.01;
        let mut mpeak = 0f32;
        for i in 0..avail {
            let (mut a, mut b) = (d.sl[i] * mix.master, d.sr[i] * mix.master);
            d.agc.process(d.comp.enabled, &mut a, &mut b);
            d.comp.process(&mut a, &mut b);
            d.safety.process(&mut a, &mut b);
            if use_tone { a = d.tone.process(0, a); b = d.tone.process(1, b); }
            // the clicks join the song for the ceiling (both scheduled, both held back 2 ms)
            let (mut a, mut b) = (a + d.kl[i], b + d.kr[i]);
            d.ceiling.process(&mut a, &mut b);
            // your own keys join after it, undelayed
            let (mut la, mut lb) = (d.ll[i] * mix.master, d.lr[i] * mix.master);
            if use_tone { la = d.tone_live.process(0, la); lb = d.tone_live.process(1, lb); }
            // the system volume before the soft clip, so a turned-down Orfeo stays clean
            d.os_gain += (os_target - d.os_gain) * d.smooth;
            let (o1, o2) = (soft_clip((a + la) * d.os_gain), soft_clip((b + lb) * d.os_gain));
            d.sl[i] = o1; d.sr[i] = o2;
            mpeak = mpeak.max(o1.abs()).max(o2.abs());
        }
        d.ll[..avail].fill(0.0); d.lr[..avail].fill(0.0);
        d.kl[..avail].fill(0.0); d.kr[..avail].fill(0.0);
        fmax_atomic(&stats.master_peak, mpeak);
        stats.comp_reduction_db.store(d.comp.reduction_db.to_bits(), Relaxed);
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::offline::{render_offline, OfflineChannel, OfflineOptions};
    use crate::song::SongEvent;
    use std::path::Path;

    const RATE: u32 = 44_100;

    fn paths() -> (PathBuf, Vec<PathBuf>) {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"));
        (root.join("../build/fluidsynth"), vec![root.join("../../public/GeneralUser-GS.sf2")])
    }

    /// Piano on channel 1 (a chord, a pedal, a melody), strings on channel 2
    fn song() -> Song {
        let ev = |time, track, status, d1, d2| SongEvent { time, track, status, d1, d2 };
        let mut e = vec![ev(0.0, 0, 0xC0, 0, 0), ev(0.0, 1, 0xC1, 48, 0)];
        for (i, k) in [60u8, 64, 67].iter().enumerate() { e.push(ev(0.0, 0, 0x90, *k, 90 + i as u8)); e.push(ev(1.0, 0, 0x80, *k, 0)); }
        e.push(ev(0.25, 0, 0xB0, 64, 127)); e.push(ev(1.4, 0, 0xB0, 64, 0));
        for (i, k) in [72u8, 74, 76, 77].iter().enumerate() { let t = 0.3 + i as f64 * 0.2; e.push(ev(t, 0, 0x90, *k, 80)); e.push(ev(t + 0.15, 0, 0x80, *k, 0)); }
        e.push(ev(0.1, 1, 0x91, 55, 70)); e.push(ev(1.2, 1, 0x81, 55, 0));
        e.sort_by(|a, b| a.time.partial_cmp(&b.time).unwrap());
        Song { events: e, duration: 1.5, track_count: 2 }
    }

    fn strips() -> [Option<OfflineChannel>; 16] {
        let mut c = [None; 16];
        c[0] = Some(OfflineChannel { volume: 1.0, pan: -0.3, reverb: 0.25, chorus: 0.0 });
        c[1] = Some(OfflineChannel { volume: 0.7, pan: 0.4, reverb: 0.4, chorus: 0.3 });
        c
    }

    /// The live renderer, fed the way the app feeds it, in device-sized blocks
    fn render_live(block: usize, frames: usize) -> (Vec<f32>, Vec<f32>) {
        let (dir, sf) = paths();
        let mut r = Renderer::new(dir, sf, RATE, Arc::new(Stats::default())).expect("renderer");
        r.begin_device(RATE, block, 1.0);
        let now = Instant::now();
        for (ch, s) in strips().iter().enumerate() {
            if let Some(s) = s { r.command(Command::SetChannel { ch: ch as u8, volume: s.volume, pan: s.pan, reverb: s.reverb, chorus: s.chorus }, now, 0.0) }
        }
        r.command(Command::LoadSong(Box::new(song())), now, 0.0);
        r.command(Command::Play, now, 0.0);
        let (mut l, mut rr) = (Vec::new(), Vec::new());
        while l.len() < frames {
            let n = block.min(frames - l.len());
            r.render(n, 1.0);
            let (a, b) = r.output(n);
            l.extend_from_slice(a); rr.extend_from_slice(b);
        }
        (l, rr)
    }

    /// With the compressor off, the live mix is the export's mix held back by
    /// the -0.1 dBFS ceiling's 2 ms look-ahead: same synth, same strips, same
    /// sends, plate, chorus and master chain. If moving the musician out of the
    /// Windows audio thread had changed anything audible, this would differ.
    #[test]
    fn live_mix_matches_the_export_mix() {
        let (dir, sf) = paths();
        let o = OfflineOptions { sample_rate: RATE, tail_sec: 1.0, channels: strips(), master_gain: 1.0, tone_db: 0.0, comp_enabled: false, comp_preset: 0 };
        let (el, er) = render_offline(&dir, &sf, &song(), &o, &mut |_| true).expect("export render");
        let lat = Brickwall::new(RATE as f32, -0.1, 0.002, 0.08).latency();
        for block in [128usize, 441, 512] {
            let (ll, lr) = render_live(block, el.len() + lat);
            let peak = el.iter().fold(0f32, |m, v| m.max(v.abs()));
            assert!(peak > 0.05, "the song makes sound (peak {peak})");
            let mut worst = 0f32;
            for i in 0..el.len() { worst = worst.max((ll[i + lat] - el[i]).abs()).max((lr[i + lat] - er[i]).abs()); }
            assert!(worst < 1e-5, "block {block}: live and export differ by up to {worst} (peak {peak})");
            assert!(ll[..lat].iter().all(|&x| x == 0.0), "block {block}: nothing before the look-ahead");
        }
    }

    /// Same input, same output: two runs and two block sizes agree exactly
    #[test]
    fn rendering_is_deterministic() {
        let (a, _) = render_live(256, 30_000);
        let (b, _) = render_live(256, 30_000);
        assert!(a == b, "two identical runs differ");
    }
}
