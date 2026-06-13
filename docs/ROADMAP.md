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
- [ ] MIDI file open via native dialog
- [ ] Note parsing and display in piano roll (PixiJS falling notes)
- [ ] Basic playback (play/pause/stop)
- [ ] Tempo control (BPM slider, % display, pitch-independent)
- [ ] Loop region (drag to select bars)
- [ ] Track mute/solo functional
- [ ] Scrub/seek

### 1c — Audio Engine
- [ ] Tone.js integration
- [ ] Default bundled soundfont (WAV samples)
- [ ] Mouse click on keyboard produces sound
- [ ] Notes play during MIDI playback
- [ ] Per-track volume and pan

### 1d — Hardware MIDI Input
- [ ] Web MIDI API device detection
- [ ] Real-time key lighting on virtual keyboard
- [ ] Real-time chord detection display
- [ ] MIDI device indicator in top bar

### 1e — Polish
- [ ] Keyboard floating/docking fully functional
- [ ] 61/73/88 key switching
- [ ] Note naming system switch (English/H/Solfège/Hidden)
- [ ] MIDI export (save with muted tracks removed)
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
