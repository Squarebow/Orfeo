//! Orfeo's native audio engine.
//!
//! One audio thread owns the output device and the synth. Callers talk to it
//! through [`Engine`]: commands go in through a lock-free queue, position and
//! statistics come back through atomics — nothing the audio thread does ever
//! waits on the caller.

pub mod clicks;
pub mod dsp;
pub mod dynamics;
pub mod engine;
pub mod fluid;
pub mod offline;
#[cfg(all(windows, not(feature = "cpal-driver")))]
pub mod output;
pub mod renderer;
pub mod reverb;
pub mod sf2;
pub mod song;
#[cfg(all(windows, not(feature = "cpal-driver")))]
mod wasapi_driver;
#[cfg(any(not(windows), feature = "cpal-driver"))]
mod cpal_driver;

pub use engine::{Command, Engine, EngineConfig, OutputMode, Stats, LIVE_CH};
pub use song::{Song, SongEvent};
