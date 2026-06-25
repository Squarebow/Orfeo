# Orfeo Roadmap

## Phase 1 — Core App

### 1a — Scaffold & Visual Shell ✅
- [x] Project structure
- [x] Electron + Vite + React setup
- [x] Design system (colors, typography, CSS variables)
- [x] App layout (topbar, piano roll area, keyboard, track panel)
- [x] Global state (Zustand)
- [x] Type definitions

### 1b — MIDI Playback
- [x] MIDI file open via native dialog
- [x] Note parsing and display in piano roll (PixiJS falling notes)
- [x] Basic playback (play/pause/stop)
- [x] Tempo control (BPM ▲/▼ with long-press, pitch-independent via JZZ speed ratio)
- [ ] Loop region (drag to select bars) — store state exists, no UI yet
- [x] Track mute/solo functional
- [ ] Scrub/seek — `seek()` exists in hook, no scrub bar UI yet

### 1c — Audio Engine
- [ ] Default bundled soundfont (WAV/SF2 samples) — deferred; using jzz-synth-tiny (GM MIDI) for now
- [x] Mouse click on keyboard produces sound (JZZ ch14, Grand Piano)
- [x] Notes play during MIDI playback (JZZ SMF player + jzz-synth-tiny)
- [x] Metronome with full tempo-map support
- [ ] Per-track volume and pan — store fields exist, not yet wired to audio

### 1d — Hardware MIDI Input
- [ ] Web MIDI API / jazz-midi-electron device detection
- [ ] Real-time key lighting on virtual keyboard
- [ ] Real-time chord detection display
- [x] MIDI device indicator in top bar (shows device name when connected)

### 1e — Polish ✅
- [x] Keyboard floating/docking fully functional (draggable, width-resizable)
- [x] 61/73/88 key switching (proportional key height via ResizeObserver)
- [x] Note naming system switch (UK/US · EU · Solfège · Hidden) + ♭/♯ accidentals toggle
- [x] MIDI export — track include/exclude, instrument reassignment, track merge (MIDI Playback Editor)
- [x] Settings persistence across sessions (noteNaming, accidentals, library folder, favourites)
- [x] MIDI file library with subfolder support, favourites, and one-click load
- [x] Warm/dark theme toggle
- [x] Chord display during playback + chord lock with inversion browser
- [ ] Smooth animations, transitions

---

## Phase 2 — Commercial Features

- [ ] Chord library window (all chords, inversions, arpeggio)
- [ ] Licensing system (Keygen.sh + WooCommerce)
- [ ] Free vs licensed feature gating
- [ ] Playlist (save/load MIDI collections)
- [ ] Key signature display (treble clef, sharps/flats)
- [ ] Custom soundfont loading (user SF2/WAV)
- [ ] Sophisticated Windows installer (Electron Forge + Squirrel)
- [ ] Auto-updater

---

## Phase 3 — VST3 Plugin

- [ ] JUCE/C++ project setup
- [ ] VST3 plugin shell
- [ ] Shared visualization engine
- [ ] DAW integration testing (Reaper, Cubase, Studio One)
