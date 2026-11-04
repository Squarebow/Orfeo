//! What a sound set says about each instrument's reverb and chorus: most
//! SoundFonts give every instrument a little of its own (GeneralUser GS 3–7 %
//! reverb, FluidR3 10 %), which a synth adds to the song's amount (CC91 /
//! CC93). The Samples engine does; the native engine's effects (reverb.rs)
//! need it from here, since FluidSynth keeps its own sends to itself. Reads only the small preset
//! part of the file (not the samples), .sf2 and .sf3 alike.

use std::collections::HashMap;
use std::fs::File;
use std::io::{Read, Seek, SeekFrom};
use std::path::Path;

/// Per preset, its effect sends as the engine uses them: `reverb` / `chorus` =
/// the instrument's own sends (0–1, as in the file), and `scale` = what the
/// song's amount (CC91 / CC93, 0–1) is multiplied by before adding it.
/// Both are averaged over the preset's zones and already include how a
/// zone's sample reaches FluidSynth's channel output: a mono sample comes out
/// centred (-3 dB a side, so its send is × 1/√2 of the channel's L + R), a
/// stereo pair hard left and right (× 1).
#[derive(Clone, Copy, Debug)]
pub struct PresetSend { pub reverb: f32, pub chorus: f32, pub scale: f32, /** share of mono zones */ pub mono: f32 }

impl Default for PresetSend { fn default() -> Self { PresetSend { reverb: 0.0, chorus: 0.0, scale: std::f32::consts::FRAC_1_SQRT_2, mono: 1.0 } } }

impl PresetSend {
    /// A channel's send into an effect, as spessasynth makes it: the instrument's own
    /// send + the song's amount (CC91/CC93, which spessasynth takes at 5× the SoundFont
    /// default: 100 % at full), capped at full, on FluidSynth's channel output (L + R).
    /// `level` is spessasynth's send level against that output (REVERB_LEVEL,
    /// CHORUS_LEVEL); `pan` corrects for
    /// FluidSynth's output being after panning: a mono sound moved to one side adds
    /// up to less in L + R (1 instead of √2 fully to one side).
    pub fn send(&self, own: f32, amount: f32, pan: f32, level: f32) -> f32 {
        let theta = (pan.clamp(-1.0, 1.0) + 1.0) * std::f32::consts::FRAC_PI_4;
        let pan_fix = 1.0 + self.mono * (std::f32::consts::SQRT_2 / (theta.cos() + theta.sin()) - 1.0);
        level * (own + amount * self.scale).min(self.scale) * pan_fix
    }
}

/// Send levels into the native engine's reverb and chorus that give the Studio
/// engine's amounts, measured on single notes with FluidR3 against spessasynth
/// with a sound set loaded. Equal, as they are in spessasynth.
pub const REVERB_LEVEL: f32 = 1.0;
pub const CHORUS_LEVEL: f32 = 1.0;

/// (bank, program) → its send; empty when the file can't be read
pub fn preset_sends(path: &Path) -> HashMap<(u16, u16), PresetSend> {
    read(path).unwrap_or_default()
}

fn read(path: &Path) -> Option<HashMap<(u16, u16), PresetSend>> {
    let mut f = File::open(path).ok()?;
    let mut head = [0u8; 12];
    f.read_exact(&mut head).ok()?;
    if &head[0..4] != b"RIFF" { return None }
    let end = 8 + u32::from_le_bytes(head[4..8].try_into().ok()?) as u64;
    // find LIST pdta, skipping the (large) sample data
    let mut pos = 12u64;
    let pdta = loop {
        if pos + 12 > end { return None }
        f.seek(SeekFrom::Start(pos)).ok()?;
        let mut h = [0u8; 12];
        f.read_exact(&mut h).ok()?;
        let len = u32::from_le_bytes(h[4..8].try_into().ok()?) as u64;
        if &h[0..4] == b"LIST" && &h[8..12] == b"pdta" {
            let mut b = vec![0u8; len as usize - 4];
            f.read_exact(&mut b).ok()?;
            break b;
        }
        pos += 8 + len + (len & 1);
    };
    let mut c: HashMap<[u8; 4], &[u8]> = HashMap::new();
    let mut o = 0usize;
    while o + 8 <= pdta.len() {
        let id: [u8; 4] = pdta[o..o + 4].try_into().ok()?;
        let len = u32::from_le_bytes(pdta[o + 4..o + 8].try_into().ok()?) as usize;
        c.insert(id, pdta.get(o + 8..o + 8 + len)?);
        o += 8 + len + (len & 1);
    }
    let u16_at = |b: &[u8], i: usize| u16::from_le_bytes([b[i], b[i + 1]]);
    let (phdr, pbag, pgen) = (*c.get(b"phdr")?, *c.get(b"pbag")?, *c.get(b"pgen")?);
    let (inst, ibag, igen, shdr) = (*c.get(b"inst")?, *c.get(b"ibag")?, *c.get(b"igen")?, *c.get(b"shdr")?);
    // zone z of a bag list → its generators
    let gens = |bags: &[u8], gen: &[u8], z: usize| -> Vec<(u16, i16)> {
        let (a, b) = (u16_at(bags, z * 4) as usize, u16_at(bags, z * 4 + 4) as usize);
        (a..b).filter(|g| g * 4 + 4 <= gen.len()).map(|g| (u16_at(gen, g * 4), u16_at(gen, g * 4 + 2) as i16)).collect()
    };
    let get = |g: &[(u16, i16)], t: u16| g.iter().find(|x| x.0 == t).map(|x| x.1);
    const CHORUS: u16 = 15; const REVERB: u16 = 16; const INSTRUMENT: u16 = 41; const SAMPLE: u16 = 53;
    let mut out = HashMap::new();
    let presets = phdr.len() / 38;
    for p in 0..presets.saturating_sub(1) {
        let r = &phdr[p * 38..];
        let (prog, bank) = (u16_at(r, 20), u16_at(r, 22));
        let (zb, ze) = (u16_at(r, 24) as usize, u16_at(&phdr[(p + 1) * 38..], 24) as usize);
        let pz: Vec<_> = (zb..ze).map(|z| gens(pbag, pgen, z)).collect();
        let pglobal = |t| pz.first().filter(|g| get(g, INSTRUMENT).is_none()).and_then(|g| get(g, t)).unwrap_or(0);
        let (mut reverb, mut chorus, mut scale, mut mono, mut n) = (0f32, 0f32, 0f32, 0f32, 0u32);
        for z in &pz {
            let Some(i) = get(z, INSTRUMENT) else { continue };
            let i = i as u16 as usize;
            if (i + 2) * 22 > inst.len() { continue }
            let (ib, ie) = (u16_at(inst, i * 22 + 20) as usize, u16_at(inst, (i + 1) * 22 + 20) as usize);
            let iz: Vec<_> = (ib..ie).map(|q| gens(ibag, igen, q)).collect();
            let iglobal = |t| iz.first().filter(|g| get(g, SAMPLE).is_none()).and_then(|g| get(g, t)).unwrap_or(0);
            for q in &iz {
                let Some(s) = get(q, SAMPLE) else { continue };
                let s = s as u16 as usize;
                let kind = if s * 46 + 46 <= shdr.len() { u16_at(shdr, s * 46 + 44) & 0x7FFF } else { 1 };
                let per_side = if kind == 2 || kind == 4 { 1.0 } else { std::f32::consts::FRAC_1_SQRT_2 };
                let own = |t| (get(q, t).unwrap_or(iglobal(t)) as f32 + get(z, t).unwrap_or(pglobal(t)) as f32).clamp(0.0, 1000.0) / 1000.0;
                reverb += own(REVERB) * per_side; chorus += own(CHORUS) * per_side; scale += per_side; n += 1;
                if per_side < 1.0 { mono += 1.0 }
            }
        }
        if n > 0 { let k = n as f32; out.insert((bank, prog), PresetSend { reverb: reverb / k, chorus: chorus / k, scale: scale / k, mono: mono / k }); }
    }
    Some(out)
}
