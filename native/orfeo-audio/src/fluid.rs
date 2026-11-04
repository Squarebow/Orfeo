//! FluidSynth, loaded at runtime from a folder (libfluidsynth-3.dll + its own
//! DLLs). Only the synth is used — Orfeo renders it itself, so FluidSynth's
//! audio drivers, MIDI player and threads are never started.

use libloading::Library;
use std::ffi::{c_char, c_double, c_float, c_int, c_void, CString};
use std::path::Path;

type Ptr = *mut c_void;

pub struct Fluid {
    _lib: Library,
    settings: Ptr,
    synth: Ptr,
    noteon: unsafe extern "C" fn(Ptr, c_int, c_int, c_int) -> c_int,
    noteoff: unsafe extern "C" fn(Ptr, c_int, c_int) -> c_int,
    cc: unsafe extern "C" fn(Ptr, c_int, c_int, c_int) -> c_int,
    program: unsafe extern "C" fn(Ptr, c_int, c_int) -> c_int,
    get_program: unsafe extern "C" fn(Ptr, c_int, *mut c_int, *mut c_int, *mut c_int) -> c_int,
    bend: unsafe extern "C" fn(Ptr, c_int, c_int) -> c_int,
    chan_pressure: unsafe extern "C" fn(Ptr, c_int, c_int) -> c_int,
    key_pressure: unsafe extern "C" fn(Ptr, c_int, c_int, c_int) -> c_int,
    all_notes_off: unsafe extern "C" fn(Ptr, c_int) -> c_int,
    all_sounds_off: unsafe extern "C" fn(Ptr, c_int) -> c_int,
    write_float: unsafe extern "C" fn(Ptr, c_int, Ptr, c_int, c_int, Ptr, c_int, c_int) -> c_int,
    process: unsafe extern "C" fn(Ptr, c_int, c_int, *mut *mut c_float, c_int, *mut *mut c_float) -> c_int,
    set_gain: unsafe extern "C" fn(Ptr, c_float),
    set_gen: unsafe extern "C" fn(Ptr, c_int, c_int, c_float) -> c_int,
    sfload: unsafe extern "C" fn(Ptr, *const c_char, c_int) -> c_int,
    sfunload: unsafe extern "C" fn(Ptr, c_int, c_int) -> c_int,
    delete_synth: unsafe extern "C" fn(Ptr),
    delete_settings: unsafe extern "C" fn(Ptr),
}

// The synth is only ever touched by the audio thread after creation
unsafe impl Send for Fluid {}

/// FluidSynth renders in 64-sample blocks: an event lands on the next one.
pub const FLUID_GRAIN: usize = 64;

/// SoundFont generator number of the low-pass filter's resonance (`GEN_FILTERQ`)
const GEN_FILTERQ: c_int = 9;
/// What the channels add to every sound's filter resonance, in centibels, so a
/// sound's brightness matches the Studio engine's. A resonance of 0 should give a
/// flat filter: FluidSynth takes 3.01 dB off for that, spessasynth 3.01 centibels
/// (0.301 dB), which leaves a small lift around the cutoff. Sounds with a filter
/// (pianos, strings, brass) measured 1.5-2 dB duller here at 4-12 kHz, unfiltered
/// ones (hi-hats, cymbals) identical. Measured on FluidR3, single notes, no effects.
const STUDIO_FILTER_Q_CB: c_float = 27.09;

/// Synths are created one at a time (see `Fluid::new`)
static CREATING: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// The FluidSynth library file in `dir`, as each system names it
#[cfg(windows)]
const LIBRARY: &str = "libfluidsynth-3.dll";
#[cfg(target_os = "macos")]
const LIBRARY: &str = "libfluidsynth.3.dylib";
#[cfg(all(unix, not(target_os = "macos")))]
const LIBRARY: &str = "libfluidsynth.so.3";

#[cfg(windows)]
unsafe fn load_library(dir: &Path) -> Result<Library, String> {
    let dll = dir.join(LIBRARY);
    // Altered search path: libsndfile (for .sf3) and SDL3 are found next to it
    Ok(libloading::os::windows::Library::load_with_flags(&dll, libloading::os::windows::LOAD_WITH_ALTERED_SEARCH_PATH)
        .map_err(|e| format!("cannot load {}: {e}", dll.display()))?
        .into())
}

/// macOS/Linux: the library's own dependencies are found through its install
/// name / rpath (set when the bundled copy is built — see the cross-platform plan)
#[cfg(not(windows))]
unsafe fn load_library(dir: &Path) -> Result<Library, String> {
    let lib = dir.join(LIBRARY);
    Library::new(&lib).map_err(|e| format!("cannot load {}: {e}", lib.display()))
}

impl Fluid {
    pub fn new(dir: &Path, sample_rate: f64) -> Result<Self, String> {
        unsafe {
            let lib = load_library(dir)?;
            macro_rules! sym { ($n:literal) => { *lib.get($n).map_err(|e| format!("missing {}: {e}", String::from_utf8_lossy($n)))? } }
            let new_settings: unsafe extern "C" fn() -> Ptr = sym!(b"new_fluid_settings");
            let setnum: unsafe extern "C" fn(Ptr, *const c_char, c_double) -> c_int = sym!(b"fluid_settings_setnum");
            let setint: unsafe extern "C" fn(Ptr, *const c_char, c_int) -> c_int = sym!(b"fluid_settings_setint");
            let new_synth: unsafe extern "C" fn(Ptr) -> Ptr = sym!(b"new_fluid_synth");
            let c = |s: &str| CString::new(s).unwrap();

            // FluidSynth fills its shared tables (interpolation, conversions) on the
            // first synth a process creates, unguarded: a second synth created at
            // that moment can start playing before they're filled and sound wrong
            // (measured: 3 runs in 25 with 12 synths started together — see
            // tests::concurrent_first_start). The live engine and an export, or two
            // exports, can start together, so synths are created one at a time.
            let _one_at_a_time = CREATING.lock().unwrap_or_else(|e| e.into_inner());
            let settings = new_settings();
            if settings.is_null() { return Err("new_fluid_settings failed".into()) }
            setnum(settings, c("synth.sample-rate").as_ptr(), sample_rate);
            setnum(settings, c("synth.gain").as_ptr(), 1.0);
            setint(settings, c("synth.polyphony").as_ptr(), 256);
            setint(settings, c("synth.cpu-cores").as_ptr(), 1);
            // One stereo output per MIDI channel, so Orfeo mixes the channels
            // itself: pan, mute fades, real level meters, and the live channel
            // kept out of the compressor. (Reverb/chorus stay one shared unit —
            // one per channel measured 16 reverbs' worth of CPU for little gain.)
            // NB: FluidSynth's glib-free ("cpp11") Windows builds crash with 8 or
            // more audio groups (2.5.7 and 2.6.x, also in fluidsynth.exe itself);
            // the glib build of 2.5.7 is fine. Use a glib build until fixed upstream.
            setint(settings, c("synth.audio-groups").as_ptr(), 16);
            setint(settings, c("synth.audio-channels").as_ptr(), 16);
            // Reverb and chorus are the engine's own (reverb.rs, the Samples
            // engine's), not FluidSynth's
            setint(settings, c("synth.reverb.active").as_ptr(), 0);
            setint(settings, c("synth.chorus.active").as_ptr(), 0);
            let synth = new_synth(settings);
            if synth.is_null() { return Err("new_fluid_synth failed".into()) }

            let mut fluid = Fluid {
                settings, synth,
                noteon: sym!(b"fluid_synth_noteon"),
                noteoff: sym!(b"fluid_synth_noteoff"),
                cc: sym!(b"fluid_synth_cc"),
                program: sym!(b"fluid_synth_program_change"),
                get_program: sym!(b"fluid_synth_get_program"),
                bend: sym!(b"fluid_synth_pitch_bend"),
                chan_pressure: sym!(b"fluid_synth_channel_pressure"),
                key_pressure: sym!(b"fluid_synth_key_pressure"),
                all_notes_off: sym!(b"fluid_synth_all_notes_off"),
                all_sounds_off: sym!(b"fluid_synth_all_sounds_off"),
                write_float: sym!(b"fluid_synth_write_float"),
                process: sym!(b"fluid_synth_process"),
                set_gain: sym!(b"fluid_synth_set_gain"),
                set_gen: sym!(b"fluid_synth_set_gen"),
                sfload: sym!(b"fluid_synth_sfload"),
                sfunload: sym!(b"fluid_synth_sfunload"),
                delete_synth: sym!(b"delete_fluid_synth"),
                delete_settings: sym!(b"delete_fluid_settings"),
                _lib: lib,
            };
            for ch in 0..16 { fluid.studio_filter(ch) }
            Ok(fluid)
        }
    }

    /// Loads a .sf2/.sf3; the most recently loaded set wins for presets it
    /// has, earlier ones fill the gaps (FluidSynth's sound-set stack).
    pub fn load_soundfont(&mut self, path: &Path) -> Result<i32, String> {
        let p = CString::new(path.to_string_lossy().as_bytes()).map_err(|e| e.to_string())?;
        let id = unsafe { (self.sfload)(self.synth, p.as_ptr(), 1) };
        if id < 0 { Err(format!("FluidSynth could not load {}", path.display())) } else { Ok(id) }
    }
    pub fn unload_soundfont(&mut self, id: i32) { unsafe { (self.sfunload)(self.synth, id, 1); } }

    /// The sound set, bank and program a channel plays (`None` before it has one)
    pub fn channel_program(&self, ch: u8) -> Option<(i32, u16, u16)> {
        let (mut sf, mut bank, mut prog) = (0, 0, 0);
        let ok = unsafe { (self.get_program)(self.synth, ch as c_int, &mut sf, &mut bank, &mut prog) } == 0;
        (ok && sf > 0).then_some((sf, bank as u16, prog as u16))
    }

    fn studio_filter(&mut self, ch: u8) {
        unsafe { (self.set_gen)(self.synth, ch as c_int, GEN_FILTERQ, STUDIO_FILTER_Q_CB); }
    }

    /// One raw MIDI channel message
    pub fn midi(&mut self, status: u8, d1: u8, d2: u8) {
        let ch = (status & 0x0F) as c_int;
        let (a, b) = (d1 as c_int, d2 as c_int);
        unsafe {
            match status & 0xF0 {
                0x90 if d2 > 0 => { (self.noteon)(self.synth, ch, a, b); }
                0x90 | 0x80 => { (self.noteoff)(self.synth, ch, a); }
                0xB0 => {
                    (self.cc)(self.synth, ch, a, b);
                    // "Reset all controllers" clears a channel's generator offsets too
                    if d1 == 121 { self.studio_filter(status & 0x0F) }
                }
                0xC0 => { (self.program)(self.synth, ch, a); }
                0xE0 => { (self.bend)(self.synth, ch, a | (b << 7)); }
                0xD0 => { (self.chan_pressure)(self.synth, ch, a); }
                0xA0 => { (self.key_pressure)(self.synth, ch, a, b); }
                _ => {}
            }
        }
    }
    pub fn all_notes_off(&mut self) { unsafe { (self.all_notes_off)(self.synth, -1); } }
    pub fn all_sounds_off(&mut self) { unsafe { (self.all_sounds_off)(self.synth, -1); } }
    pub fn set_gain(&mut self, g: f32) { unsafe { (self.set_gain)(self.synth, g) } }

    /// Renders (adds nothing — overwrites) `l.len()` frames
    pub fn render(&mut self, l: &mut [f32], r: &mut [f32]) {
        unsafe {
            (self.write_float)(self.synth, l.len() as c_int, l.as_mut_ptr() as Ptr, 0, 1, r.as_mut_ptr() as Ptr, 0, 1);
        }
    }
}

impl Fluid {
    /// Renders `len` frames at `offset`, ADDING into 32 dry buffers (channel c →
    /// out[2c], out[2c+1]) and 4 effect buffers (reverb L/R, chorus L/R).
    /// Callers zero them first.
    pub fn process(&mut self, len: usize, fx: &mut [Vec<f32>; 4], out: &mut [Vec<f32>; 32], offset: usize) {
        let mut fxp: [*mut c_float; 4] = std::array::from_fn(|i| unsafe { fx[i].as_mut_ptr().add(offset) });
        let mut outp: [*mut c_float; 32] = std::array::from_fn(|i| unsafe { out[i].as_mut_ptr().add(offset) });
        unsafe { (self.process)(self.synth, len as c_int, 4, fxp.as_mut_ptr(), 32, outp.as_mut_ptr()); }
    }
}

impl Drop for Fluid {
    fn drop(&mut self) {
        unsafe { (self.delete_synth)(self.synth); (self.delete_settings)(self.settings); }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Barrier};

    /// Several synths started at the same instant must all sound the same.
    /// Only meaningful as the first FluidSynth use in its process — run alone:
    /// `cargo test -p orfeo-audio --lib concurrent_first_start`
    #[test]
    fn concurrent_first_start() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"));
        let (dir, sf) = (root.join("../build/fluidsynth"), root.join("../../public/GeneralUser-GS.sf2"));
        const N: usize = 12;
        let gate = Arc::new(Barrier::new(N));
        let runs: Vec<_> = (0..N).map(|_| {
            let (dir, sf, gate) = (dir.clone(), sf.clone(), gate.clone());
            std::thread::spawn(move || {
                gate.wait();
                let mut f = Fluid::new(&dir, 44_100.0).expect("synth");
                f.load_soundfont(&sf).expect("sound set");
                f.midi(0xC0, 0, 0);
                f.midi(0x90, 60, 100);
                let (mut l, mut r) = (vec![0f32; 8192], vec![0f32; 8192]);
                f.render(&mut l, &mut r);
                l
            })
        }).collect();
        let outs: Vec<Vec<f32>> = runs.into_iter().map(|t| t.join().unwrap()).collect();
        let differing = outs.iter().filter(|o| **o != outs[0]).count();
        assert!(differing == 0, "{differing} of {N} synths started together sound different");
    }

    /// A song's "reset all controllers" must not take the Studio brightness away
    #[test]
    fn reset_all_controllers_keeps_the_filter() {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"));
        let (dir, sf) = (root.join("../build/fluidsynth"), root.join("../../public/GeneralUser-GS.sf2"));
        let play = |reset: bool| {
            let mut f = Fluid::new(&dir, 44_100.0).expect("synth");
            f.load_soundfont(&sf).expect("sound set");
            f.midi(0xC0, 0, 0);
            if reset { f.midi(0xB0, 121, 0); }
            f.midi(0x90, 72, 100);
            let (mut l, mut r) = (vec![0f32; 16384], vec![0f32; 16384]);
            f.render(&mut l, &mut r);
            l
        };
        assert!(play(false) == play(true), "the note sounds different after reset all controllers");
    }
}
