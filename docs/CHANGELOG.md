# Changelog

All notable changes to Orfeo are documented here.
Format: [Semantic Versioning](https://semver.org)

---

## [0.5.1] — 2026-06 — Chord Explorer

### Added
- **Chord Explorer modal** — draggable, no backdrop, opens from "Chords" label in the keyboard chord bar; auto-forces 61-key layout while open, restores on close; pauses playback on open
- **Root selector** — 12 pitch-class buttons using active accidentals + note naming; clicking a root while a chord is selected re-plays it in the new key
- **Chord grid** — Common / Extended tier toggle; 3-column grid of chord tiles; clicking a tile lights the keyboard and plays the chord
- **Hand filter** — All / 1H / 2H filter (span-based heuristic); 1H icon rotated –20°, 2H icons angled inward
- **Note count filter** — Any / 3 / 4 / 5 / 6+ buttons
- **Search** — magnifier icon in header toggles an inline input; filters by composed chord name (root + suffix) with `b`→`♭` normalization
- **Inversion browser** — `‹ PLAY INVERSION ›` centered in footer; cycles inversions via `nextInversion` / `prevInversion`; clear button (RotateCcw) deselects without closing modal
- **Accidentals toggle** in footer — ♭ / # symbols only at 20px; active = amber, inactive = dim; writes back to store
- **Explorer key lighting** — separate `explorerKeys` / `explorerKeyColors` store layer merged into Keyboard.tsx; does not interfere with playback lighting
- **Logo click reset** — clicking the Orfeo logo resets all state (stops player, clears MIDI, closes panels)
- **Keyboard note labels in explorer mode** — white key labels grow 9→11px, black key labels 7→8px when Chord Explorer is open

### Changed
- Keyboard chord bar label: `CHORD LOCK` → `Locked Chord`
- Chord bar help text: `Shift+Click at least 3 keys to build & lock a chord`
- Chord tile note name row: `fontSize 8→9`, `color #606078→#8080a0`
- Play button in TopBar disabled while Chord Explorer is open
- Space / Escape keys guarded in App.tsx — no longer trigger playback when Chord Explorer is open

### Fixed
- Central European naming: pitch class 10 (A#/B♭) now always returns `'B'` in CE mode regardless of accidentals setting — `CENTRAL_EU_SHARP[10]` was incorrectly `'A#'`

---

## [0.5.0] — 2026-06 — UI Polish, Tempo Map Metronome, Piano Roll Range Fix

### Added
- **Tempo map metronome** — full rewrite using a persistent 25ms interval that reads all values fresh from the store each tick; no stale closures, no BPM tracking refs, no restarts needed
- **MIDI tempo map extraction** — `midiParser.ts` now extracts the complete tempo map (`_tempoMap`) so the metronome and BPM display track tempo changes mid-file
- **BPM long-press** — hold ▲/▼ chevrons on the BPM control to accelerate through values (400ms delay then ramp from 120ms → 40ms interval)
- **Warm theme** — functional warm background (`#12100e`) applied across all components including the PixiJS canvas; toggled via Settings panel
- **Zoom control** — now actually wires to the PianoRoll renderer (`VISIBLE_SECONDS / zoomLevel`); hint text shows real-time seconds visible
- **Piano roll key range** — grid and note positions now respect the selected keyboard size (61: MIDI 36–96, 73: 28–103, 88: 21–108); was previously hardcoded to 88 keys
- **User Manual link** — bottom of left drawer opens `HOW_TO_USE.md` on GitHub in the system browser via `shell.openExternal`
- **Floating keyboard resize** — width-only handles (650–1200px range); panel height is fully content-driven, no fixed empty space

### Changed
- Left drawer width 220px → 260px to match the right TrackPanel
- Library tab is now the default tab when the left drawer opens; drawer opens by default on launch
- Left drawer closed icon changed to `ListMusic` (was `Settings2`) for clarity
- Note naming buttons renamed: English → **UK / US**, C. Euro → **EU**, Hidden → **Hide**
- Metronome icon replaced with correct Lucide paths (inlined since the installed version lacks it)
- MIDI device label shows first word of device name when connected (e.g. "Roland")
- Piano roll grid — removed dense per-key vertical lines; replaced with subtle black-key column shading and C-note octave dividers
- Playhead thickness 1px → 2px, opacity 0.6 → 0.85
- Keyboard height is now proportional — `ResizeObserver` computes `whiteKeyWidth × 4.0`, clamped 80–140px
- Metronome accent volume 0.55 → 0.9, beat volume 0.3 → 0.6; accent pitch 1200Hz → 1400Hz, beat pitch 900Hz → 1000Hz; lookahead 100ms → 150ms
- Chord tooltip direction fixed — opens downward (was clipped at top)
- `package.json` version 0.2.1 → 0.5.0

### Fixed
- Library subfolder rendering silently crashed — `ChevronDown` was used but not imported; now imported correctly
- Subfolders now appear at the top of the library list, root files below; folders default to collapsed

---

## [0.3.2] — 2026-06 — Floating Keyboard, Chord Display During Playback, Metronome Alignment

### Added
- **Floating keyboard** — `FloatingKeyboard.tsx` is a draggable `position: fixed` overlay containing the full keyboard and controls; drag handle at top for repositioning; boundary-clamped so it cannot be dragged off-screen; pin and × buttons both re-dock it
- **Keyboard size button tooltips** — `title` attributes added to 61/73/88 selector buttons

### Changed
- Chord detection debounce during playback reduced 320ms → 60ms; chord clears immediately when active notes drop below 3 (no ghost chord lingering into next chord); manual (non-playback) behaviour unchanged (320ms debounce, 1600ms hold)
- `accidentals` added to the chord display effect dependency array (was missing — caused stale chord name when accidentals setting changed mid-playback)
- Metronome now aligns to playback position on start — computes which beat the current playback time falls on and fires the first click at the next grid-aligned beat rather than at an arbitrary offset

### Fixed
- Float button toggled the store but no floating panel existed — floating keyboard is now a real draggable panel

---

## [0.3.1] — 2026-06 — Library Subfolders, MIDI Editor Fixes, Settings Persistence

### Added
- Library subfolder support — `fs:scanMidiFolder` now recursively scans all subdirectories; files are grouped by subfolder with collapsible headers; Windows backslash paths normalised to forward slashes
- Complete GM instrument list — all 128 programs now covered across 16 families in the MIDI editor (Synth Lead 80–87, Synth Pad 88–95, Synth FX 96–103, Percussive 112–119, Sound FX 120–127 all added)
- Pencil icon in TrackPanel turns amber when the MIDI editor is open; resets to grey on editor window close via `editor:closed` IPC event

### Changed
- `noteNaming` and `accidentals` now persisted to `orfeo-prefs.json` on every change via debounced store subscriber; restored on startup alongside library prefs
- MIDI editor undo-merge now operates in-place (no longer closes and reopens the editor window)
- Output filename switches between `_ORFEO` and `_ORFEO_MERGED` dynamically as tracks are merged/unmerged; Save As path updates live
- Drums tracks in MIDI editor show a plain "Standard Drums" label instead of an instrument picker
- GM family icons in MIDI editor bumped from 12px → 15px; new icon assignments for Synth Pad, Synth FX, Percussive, Sound FX families
- Chord bar tooltip text lightened; inversion arrows and play button always amber

### Fixed
- Library file click silently failed via the `loadLibraryFile` store action — now calls IPC + parser directly
- Settings persistence: first store subscriber fire (app init) was overwriting saved prefs before restore had run; fixed with null sentinel guard

---

## [0.3.0] — 2026-06 — Left Drawer, Library, MIDI Editor, UI Polish, Build Pipeline

### Added
- **Left settings/library drawer** (`SettingsPanel.tsx`) — collapsible panel with Settings and Library tabs; keyboard size, zoom, note naming, accidentals, audio engine, and appearance controls
- **MIDI file library** — folder picker scans `.mid`/`.midi` files; starred files float to top; star toggle persists across sessions; click any file to load immediately; folder path and favourites saved to `orfeo-prefs.json`
- **Accidentals toggle** — ♭ Flats / ♯ Sharps; `convertAccidentals()` in `noteNames.ts` is the single source of truth; all display paths (keyboard, chord bar, topbar key, chord detection) route through it
- **MIDI Playback Editor** (`MidiEditor.tsx`) — separate Electron window for track include/exclude, GM instrument reassignment (searchable, per-family), track merge (combines notes from 2+ tracks into one), and Save & Reload (writes `_ORFEO.mid` copy, auto-reloads main window)
- **Build pipeline** — `electron-builder` with NSIS installer; `npm run dist` produces `dist/win-unpacked/Orfeo.exe` and a full installer `.exe`; real app icon integrated
- **SF2 audio engine scaffold** (`useSF2Engine.ts`) — soundfont-player based; gates on `audioEngine !== 'sf2'`; GM Synth remains default (soundfont-player not suitable for full GM multi-track)
- **Chord lock** — Shift+click to build and lock a chord; inversion arrows cycle through inversions; play button sounds the locked chord
- **Chord display** — requires 3+ simultaneous notes, 320ms debounce, 1600ms hold; clears on stop

### Changed
- Metronome fully rewritten using Web Audio API lookahead scheduler (25ms interval, 120ms lookahead); adapts immediately to BPM changes; downbeat accent 1200Hz, beat 900Hz
- Chord detection rewritten — root position vs inversion detection, slash notation (G/B · 1st inv), triad-first scoring, weird-chord penalty, fallback strip-melody logic
- TopBar redesigned — BPM and KEY side by side with ∧/∨ arrows; transport buttons colour-only (no borders/backgrounds); TIME / METRONOME / MIDI bottom-aligned in right section
- Track panel auto-opens when a MIDI file loads; auto-mutes non-keyboard groups (strings, ensemble, brass, reed, pipe, synth, ethnic, sfx) on file load
- Design token system established in `index.css` — `#707088` inactive, `#b0b0cc` active, `#404055` dim labels, `#e8a027` amber accent
- Window uses `titleBarStyle: 'hidden'` + `titleBarOverlay` (height: 100) for native amber Win controls with drag
- Default keyboard size 73 keys

### Fixed
- `showOnKeyboard` flag checked before scheduling key lighting — drums/guitars no longer light piano keys
- Mouse click on keyboard uses dedicated channel 14 with explicit Grand Piano program change

---

## [0.1.0] — 2026-06 — Initial Scaffold

### Added
- Complete project folder structure and file scaffold
- Electron + Vite + React + TypeScript setup
- PixiJS integration for piano roll rendering
- Zustand global state store (playback, tracks, keyboard, settings)
- MIDI file parsing via `@tonejs/midi`
- Chord detection via `tonal.js`
- Note naming systems: English, Central European (H), Solfège, Hidden
- Hardware MIDI keyboard input via Web MIDI API
- Virtual keyboard component (61/73/88 keys, docked/floating modes)
- Track panel with mute/solo/visible toggles and volume/pan controls
- Settings modal with note naming and display options
- Top bar with transport controls, tempo slider, chord display
- Amber gold (`#e8a027`) design theme on dark background (`#0f0f12`)
- Inter + JetBrains Mono typography
- Global CSS variables and Tailwind configuration
- README, CHANGELOG, ROADMAP, ARCHITECTURE documentation

### Technical decisions
- PixiJS chosen over plain Canvas for WebGL performance with large MIDI files
- Zustand over Redux for simpler boilerplate
- electron-vite for fast HMR in development
- Central European note naming (H = B natural) added for Slovenian/German/Croatian users

---
