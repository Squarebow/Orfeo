//! Export to audio: plays a song offline (faster than real time, no sound
//! card) through a fresh FluidSynth and the same mix the live audio thread
//! makes — per-channel volume/pan, each sound set's own reverb/chorus sends,
//! Orfeo's plate reverb and chorus, master gain → compressor → safety limiter
//! → tone. No auto-level (a file is levelled once, afterwards), no clicks, no
//! live keys. Keep in step with engine.rs's audio_thread mix.

use crate::dsp::HighShelf;
use crate::dynamics::Compressor;
use crate::engine::pan_cc;
use crate::fluid::Fluid;
use crate::reverb::{Chorus, Reverb};
use crate::sf2::{preset_sends, CHORUS_LEVEL, REVERB_LEVEL};
use crate::song::Song;
use std::path::{Path, PathBuf};

const BLOCK: usize = 512;

#[derive(Clone, Copy, Debug)]
pub struct OfflineChannel { pub volume: f32, pub pan: f32, pub reverb: f32, pub chorus: f32 }

#[derive(Clone, Debug)]
pub struct OfflineOptions {
    pub sample_rate: u32,
    /// Silence rendered after the song's duration, so the last notes ring out
    pub tail_sec: f64,
    pub channels: [Option<OfflineChannel>; 16],
    pub master_gain: f32,
    pub tone_db: f32,
    pub comp_enabled: bool,
    pub comp_preset: usize,
}

/// Renders the whole song plus the tail. `progress(0..1)` is called now and
/// then; returning false cancels (Err("cancelled")).
/// The longest song an export takes (a few hundred MB of audio at 44.1 kHz)
const MAX_SECONDS: f64 = 4.0 * 3600.0;

pub fn render_offline(fluid_dir: &Path, soundfonts: &[PathBuf], song: &Song, o: &OfflineOptions, progress: &mut dyn FnMut(f64) -> bool) -> Result<(Vec<f32>, Vec<f32>), String> {
    let length = song.duration + o.tail_sec;
    if !length.is_finite() || song.duration < 0.0 || length > MAX_SECONDS || o.sample_rate == 0 {
        return Err(format!("can't export a song {length:.0} s long"));
    }
    let rate = o.sample_rate as f32;
    let mut fluid = Fluid::new(fluid_dir, o.sample_rate as f64)?;
    let mut sf_ids = Vec::new();
    for sf in soundfonts { sf_ids.push(fluid.load_soundfont(sf)?); }
    let own_sends: Vec<_> = soundfonts.iter().map(|p| preset_sends(p)).collect();

    // ── The channel strips, as SetChannel sets them (unused channels stay neutral)
    let strip = |ch: usize| o.channels[ch].unwrap_or(OfflineChannel { volume: 1.0, pan: 0.0, reverb: 0.0, chorus: 0.0 });
    let mut file_cc7 = [127u8; 16];
    let send_volume = |fluid: &mut Fluid, ch: usize, cc7: u8| {
        let v = (cc7 as f32 * strip(ch).volume).round().clamp(0.0, 127.0) as u8;
        fluid.midi(0xB0 | ch as u8, 7, v);
    };
    for ch in 0..16 {
        let s = strip(ch);
        fluid.midi(0xB0 | ch as u8, 91, (s.reverb.clamp(0.0, 1.0) * 127.0) as u8);
        fluid.midi(0xB0 | ch as u8, 93, (s.chorus.clamp(0.0, 1.0) * 127.0) as u8);
        fluid.midi(0xB0 | ch as u8, 10, pan_cc(s.pan));
        send_volume(&mut fluid, ch, 127);
    }

    let total = ((song.duration + o.tail_sec) * o.sample_rate as f64).round() as usize;
    let (mut out_l, mut out_r) = (vec![0f32; total], vec![0f32; total]);
    let mut chans: [Vec<f32>; 32] = std::array::from_fn(|_| vec![0f32; BLOCK]);
    let mut fx: [Vec<f32>; 4] = std::array::from_fn(|_| vec![0f32; BLOCK]);
    let (mut sl, mut sr) = (vec![0f32; BLOCK], vec![0f32; BLOCK]);
    let (mut plate_in, mut chorus_in) = (vec![0f32; BLOCK], vec![0f32; BLOCK]);
    let mut plate = Reverb::new(rate);
    let mut chorus = Chorus::new();
    let mut comp = Compressor::new(rate);
    comp.set(o.comp_enabled, o.comp_preset);
    let mut safety = Compressor::safety(rate);
    let mut tone = HighShelf::new(rate, 3000.0, o.tone_db);
    let use_tone = o.tone_db.abs() > 0.01;

    let mut idx = 0usize;
    let mut since_progress = 0usize;
    let mut frame = 0usize;
    while frame < total {
        let avail = BLOCK.min(total - frame);
        for b in chans.iter_mut() { b[..avail].fill(0.0) }
        for b in fx.iter_mut() { b[..avail].fill(0.0) }
        // ── Render, split at song events (the same handling as the audio thread)
        let mut done = 0usize;
        while done < avail {
            let pos = (frame + done) as f64 / o.sample_rate as f64;
            while idx < song.events.len() && song.events[idx].time <= pos + 1e-9 {
                let e = song.events[idx];
                idx += 1;
                let kind = e.status & 0xF0;
                let ch = (e.status & 0x0F) as usize;
                if kind == 0xB0 && (e.d1 == 91 || e.d1 == 93) { continue }
                if kind == 0xB0 && e.d1 == 7 { file_cc7[ch] = e.d2; send_volume(&mut fluid, ch, e.d2); continue }
                fluid.midi(e.status, e.d1, e.d2);
            }
            let mut chunk = avail - done;
            if let Some(next) = song.events.get(idx) {
                chunk = chunk.min(((next.time - pos) * o.sample_rate as f64).ceil().max(1.0) as usize);
            }
            fluid.process(chunk, &mut fx, &mut chans, done);
            done += chunk;
        }

        // ── 16 channels → song bus, with each sound set's own sends into the plate and chorus
        sl[..avail].fill(0.0); sr[..avail].fill(0.0);
        plate_in[..avail].fill(0.0); chorus_in[..avail].fill(0.0);
        for ch in 0..16 {
            let s = strip(ch);
            let (cl, cr) = (&chans[2 * ch], &chans[2 * ch + 1]);
            let ps = fluid.channel_program(ch as u8)
                .and_then(|(sf, bank, prog)| sf_ids.iter().position(|&id| id == sf).and_then(|i| own_sends[i].get(&(bank, prog)).copied()))
                .unwrap_or_default();
            let send = ps.send(ps.reverb, s.reverb, s.pan, REVERB_LEVEL);
            let csend = ps.send(ps.chorus, s.chorus, s.pan, CHORUS_LEVEL);
            for i in 0..avail {
                sl[i] += cl[i]; sr[i] += cr[i];
                let dry = cl[i] + cr[i];
                plate_in[i] += dry * send; chorus_in[i] += dry * csend;
            }
        }
        plate.process(&plate_in[..avail], &mut sl[..avail], &mut sr[..avail]);
        chorus.process(&chorus_in[..avail], &mut sl[..avail], &mut sr[..avail]);

        // ── Master: gain → compressor → safety limiter → tone
        for i in 0..avail {
            let (mut a, mut b) = (sl[i] * o.master_gain, sr[i] * o.master_gain);
            comp.process(&mut a, &mut b);
            safety.process(&mut a, &mut b);
            if use_tone { a = tone.process(0, a); b = tone.process(1, b); }
            out_l[frame + i] = a; out_r[frame + i] = b;
        }
        frame += avail;
        since_progress += avail;
        if since_progress >= o.sample_rate as usize / 2 || frame >= total {
            since_progress = 0;
            if !progress(frame as f64 / total as f64) { return Err("cancelled".into()) }
        }
    }
    Ok((out_l, out_r))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::song::SongEvent;

    fn paths() -> (PathBuf, Vec<PathBuf>) {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"));
        (root.join("../build/fluidsynth"), vec![root.join("../../public/GeneralUser-GS.sf2")])
    }
    fn one_note() -> Song {
        let ev = |time, status, d1, d2| SongEvent { time, track: 0, status, d1, d2 };
        Song { events: vec![ev(0.0, 0xC0, 0, 0), ev(0.0, 0x90, 60, 100), ev(0.5, 0x80, 60, 0)], duration: 0.5, track_count: 1 }
    }
    fn opts() -> OfflineOptions {
        let mut channels = [None; 16];
        channels[0] = Some(OfflineChannel { volume: 1.0, pan: 0.0, reverb: 0.2, chorus: 0.0 });
        OfflineOptions { sample_rate: 44_100, tail_sec: 2.0, channels, master_gain: 1.0, tone_db: 0.0, comp_enabled: false, comp_preset: 0 }
    }

    #[test]
    fn renders_song_with_tail() {
        let (dir, sf) = paths();
        let (l, r) = render_offline(&dir, &sf, &one_note(), &opts(), &mut |_| true).expect("render");
        let want = ((0.5 + 2.0) * 44_100.0) as usize;
        assert!((l.len() as i64 - want as i64).abs() <= 1 && l.len() == r.len(), "length {} vs {want}", l.len());
        let peak = l.iter().chain(r.iter()).fold(0f32, |m, v| m.max(v.abs()));
        assert!(peak > 0.01, "makes sound, peak {peak}");
        let last = &l[l.len() - 22_050..];
        let tail_peak = last.iter().fold(0f32, |m, v| m.max(v.abs()));
        assert!(tail_peak < 1e-3, "rings out by the end, last 0.5 s peak {tail_peak}");
        let (l2, _) = render_offline(&dir, &sf, &one_note(), &opts(), &mut |_| true).expect("render again");
        assert!(l == l2, "two renders are identical");
    }

    #[test]
    fn impossible_length_is_an_error_not_a_crash() {
        let (dir, sf) = paths();
        for d in [f64::INFINITY, f64::NAN, -1.0, 1.0e9] {
            let mut s = one_note();
            s.duration = d;
            let r = render_offline(&dir, &sf, &s, &opts(), &mut |_| true);
            assert!(r.is_err(), "duration {d} should be refused");
        }
    }

    #[test]
    fn cancel_stops() {
        let (dir, sf) = paths();
        let r = render_offline(&dir, &sf, &one_note(), &opts(), &mut |_| false);
        assert_eq!(r.err().as_deref(), Some("cancelled"));
    }
}
