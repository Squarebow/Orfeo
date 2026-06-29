# Orfeo — Roadmap

---

## ✅ Completed

### Core App & Playback
- [x] Electron + Vite + React + TypeScript scaffold
- [x] Design system — amber `#e8a027` theme, CSS variables, typography
- [x] App layout — topbar, piano roll, keyboard, track panel, drawers
- [x] Global state — Zustand store with full type definitions
- [x] MIDI file open via native file dialog
- [x] Falling note piano roll — PixiJS WebGL, 60fps, color per track
- [x] Piano roll key range respects selected keyboard size (61/73/88)
- [x] Piano roll zoom — wired to renderer, real-time seconds display
- [x] Basic playback — play / pause / stop
- [x] Tempo control — BPM ▲/▼ arrows with long-press acceleration
- [x] Metronome — full MIDI tempo-map support, phase-aligned to playback position
- [x] Track mute / solo / visible per track
- [x] Track panel — auto-opens on file load; auto-mutes non-keyboard groups

### Keyboard & Audio
- [x] Virtual keyboard — 61 / 73 / 88 keys, proportional height, ResizeObserver
- [x] Keyboard docked mode — notes land on correct keys
- [x] Keyboard floating mode — draggable, width-resizable (650–1200px)
- [x] Click to play — any key produces sound (JZZ, Grand Piano ch14)
- [x] Glissando — drag across keys while mouse button held
- [x] Key lighting — keys light in track color during playback
- [x] GM Synth audio engine — JZZ + jzz-synth-tiny, lazy init
- [x] Samples audio engine — SpessaSynth + GeneralUser GS SF2 (~31MB download on first use)
- [x] Master volume knob — SVG dial in toolbar, persists across sessions
- [x] MIDI device indicator in top bar — shows device name when connected

### Chord & Scale Features
- [x] Real-time chord detection during playback and manual key presses
- [x] Chord display above keyboard — slash notation (C/E), inversion labels (1st inv)
- [x] Chord lock — Shift+click to build and lock a chord; cycle inversions
- [x] Chord Explorer — 20 chord types (Common/Extended tiers), root selector, hand/note filters, search, progressions, inversion cycling
- [x] Scale Explorer — Circle of Fifths SVG, 10 scale types, diatonic chord grid, Roman numeral labels, 20 named progressions, inversion cycling
- [x] Inversion display — slash notation everywhere; original chord identity preserved across all cycling; no re-detection on inverted sets
- [x] Major chord suffix `M` removed globally (CM → C)

### Note Naming & Accidentals
- [x] Note naming systems — UK/US (English), EU (Central European H), Solfège, Hidden
- [x] Accidentals toggle — ♭ flats / ♯ sharps; single source of truth via `convertAccidentals()`
- [x] Central European: pitch class 10 always displays as `B`, never `A#`

### MIDI Editing & Library
- [x] MIDI Playback Editor — separate window; track include/exclude, instrument reassignment (all 128 GM programs), track merge; saves as `_ORFEO.mid`, never modifies originals
- [x] MIDI file library — folder picker, subfolder scanning, star favourites, one-click load
- [x] Settings persistence — note naming, accidentals, library folder, favourites, master volume, audio engine saved to `orfeo-prefs.json`

### UI & Infrastructure
- [x] Logo click — resets app to initial state, preserves user preferences
- [x] App launches maximized
- [x] Explorer modals open positioned above keyboard by default
- [x] Warm/dark theme toggle
- [x] Windows installer — `electron-builder` + NSIS, `npm run dist`
- [x] Portable build — single `.exe`, no installation required
- [x] User Manual link in left drawer

---

## 🔧 Known Issues

| # | Issue | Priority |
|---|---|---|
| 1 | Chord Explorer search — unreliable across naming systems; needs full rewrite using Fuse.js | High |
| 2 | TrackPanel SVG — intermittent renderer crash on certain MIDI files; root cause unknown | High |
| 3 | Loop region — store state exists, no UI yet | Medium |
| 4 | Scrub/seek bar — `seek()` exists in hook, no UI yet | Medium |
| 5 | Per-track volume and pan — store fields exist, not yet wired to audio | Medium |
| 6 | Hardware MIDI input — device detection, key lighting, chord display for external keyboards | Medium |
| 7 | CSS magic numbers — hardcoded colors/spacing/z-indexes need extracting into CSS variables | Low |
| 8 | CSS Grid migration — replace flexbox in multi-row components (explorers, topbar, settings) | Low |
| 9 | HOW_TO_USE.md — full rewrite needed; current content is outdated | Low |

---

## 🗓️ Planned Features

### Near Term

- [ ] **Chord Explorer search rewrite** — Fuse.js fuzzy matching; single character returns results immediately; searches display name, aliases, note names, and numeric suffixes (7, 9, 11, 13)
- [ ] **Mixer Console** — floating modal with vertical channel strips per MIDI track (max 8 visible); volume fader, reverb/chorus/pan knobs (SpessaSynth CC messages), mute/solo buttons, VU meter per strip; master fader; triggered from Track Panel; settings persist per file
- [ ] **Chord memory log** — during MIDI playback, record detected chord name + bar number in real time; exportable as text/PDF chord sheet; viewable in scrollable panel or separate window
- [ ] **Finger numbers on keyboard** — show suggested fingering on lit keys during chord/inversion display: 1–3–5 for triads, 1–2–3–5 / 1–2–4–5 for seventh chords; inversion-aware

### Settings Panel Rework

- [ ] Full redesign using CSS Grid, icon-based compact controls
- [ ] Light / dark theme toggle
- [ ] UI density — Compact (current) / Comfortable (larger text and spacing)
- [ ] Default keyboard size on launch (61/73/88)
- [ ] Default docked/floating keyboard mode
- [ ] Key highlight color picker
- [ ] Count-in bars before playback (1 / 2 / 4)
- [ ] Auto-scroll piano roll during playback on/off
- [ ] Loop playback on/off by default
- [ ] MIDI output device selector
- [ ] Note release time (how long keys glow after note ends)
- [ ] Default accidentals preference exposed in UI
- [ ] Default scale type when Scale Explorer opens
- [ ] Default chord tier (Common/Extended) when Chord Explorer opens
- [ ] Remember last explorer selection on/off
- [ ] Welcome screen on/off (show on first launch only)
- [ ] Reopen last file on launch
- [ ] Window position memory

### Explorers

- [ ] **Arpeggiator** — rhythmic preset patterns (Alberti bass, ascending/descending, octave jump, syncopated) defined as step sequences with note duration and rest slots; BPM-configurable; lights keys in real time
- [ ] **Chord progression playback improvements** — random inversion cycles sound musical, not mechanical
- [ ] **Welcome / onboarding screen** — shown on first install; explains core concept and key gestures; toggleable from Settings

### Help & Documentation

- [ ] **Help window** — separate Electron `BrowserWindow` loading `public/help/index.html`; triggered by ℹ icon in topbar; full HTML/CSS layout with images and video; content editable without touching React code

### Audio

- [ ] **Per-track portamento** — CC65/CC5 toggle and time knob per channel in the Track Panel; SpessaSynth only; greyed out on GM Synth
- [ ] **Per-track reverb, chorus, pan** — CC91, CC93, CC10 wired to SpessaSynth per channel in the mixer console
- [ ] **Soundfont selector** — browse and load custom `.sf2` files from disk

### Infrastructure

- [ ] **GitHub Actions** — automated multi-platform builds (Windows, macOS, Linux) triggered on release tag push; attaches installers to GitHub Releases automatically
- [ ] **macOS build** — `.dmg` via contributor or CI
- [ ] **Linux build** — `.AppImage` via contributor or CI
- [ ] **CSS Grid migration** — replace inline flexbox throughout with CSS Grid in multi-row/multi-column components
- [ ] **CSS variable extraction** — all hardcoded colors, spacing, z-indexes into `index.css` variables (see `docs/MAGIC_NUMBERS_AUDIT.md`)

---

## 🔮 Future / Phase 3

- [ ] **VST3 plugin** — separate JUCE/C++ project; same visual engine; DAW integration (Reaper, Cubase, Studio One)
- [ ] **Playlist** — save and recall collections of MIDI files with settings
- [ ] **Key signature display** — treble clef with sharps/flats in topbar
- [ ] **MIDI step sequencer** — grid-based pattern editor with MIDI import/export
