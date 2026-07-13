# Orfeo — Roadmap

---

## ✅ Completed

### Core App & Playback
- [x] Electron + Vite + React + TypeScript scaffold
- [x] Design system — amber `#e8a027` theme, CSS variables, typography
- [x] App layout — topbar, piano roll, keyboard, track panel, drawers
- [x] Global state — Zustand store with full type definitions
- [x] MIDI file open via native dialog
- [x] Falling note piano roll — PixiJS WebGL, 60fps, color per track
- [x] Piano roll key range respects selected keyboard size (61/73/88)
- [x] Piano roll zoom — wired to renderer, real-time seconds display
- [x] Basic playback — play / pause / stop
- [x] Tempo control — BPM ▲/▼ arrows with long-press acceleration, pitch-independent via JZZ speed ratio
- [x] Metronome — full MIDI tempo-map support, phase-aligned to playback position
- [x] Track mute / solo / visible per track
- [x] Track panel — auto-opens on file load; auto-mutes non-keyboard groups
- [x] MIDI device indicator in top bar — shows device name when connected

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
- [x] **Hardware MIDI input (Web MIDI API)** — real hardware keyboards light on-screen keys and play sound with true sustain (press = starts, release = stops immediately); dedicated MIDI channel 15, isolated from file playback

### Chord & Scale Features
- [x] Real-time chord detection during playback and manual key presses
- [x] Chord display above keyboard — slash notation (C/E), inversion labels (1st inv)
- [x] Chord lock — Shift+click to build and lock a chord; now opens as a separate draggable mini modal (pauses MIDI playback on open, resumes from exact position on close)
- [x] Shift+Click hint text relocated to main chord display row (next to `SCALES`)
- [x] Chord Explorer — 20 chord types (Common/Extended tiers), root selector, hand/note filters, search, progressions, inversion cycling
- [x] Scale Explorer — Circle of Fifths SVG, 10 scale types, diatonic chord grid, Roman numeral labels, 20 named progressions, inversion cycling
- [x] Inversion display — slash notation everywhere; original chord identity preserved across all cycling; no re-detection on inverted sets
- [x] Major chord suffix `M` removed globally (CM → C)
- [x] Fixed: progression playback used wrong chord quality (ii-V-I now correctly plays Dm7-G7-Cmaj7 regardless of currently selected chord type — quality hardcoded per Roman numeral)
- [x] Fixed: chord name display froze during progression playback (both explorers) — now updates live per step
- [x] Fixed: Samples engine produced no audio during progression playback — routing bug resolved
- [x] Chord Explorer search rewritten with Fuse.js fuzzy matching (single character returns results immediately)
- [x] Power chord filter (`PWR`) in Chord Explorer Notes filter
- [x] Chord Prompter — integrated directly into the chord bar (not a separate modal); toggle in Settings + transport icon; shows past 4 chords / current / next 2 chords in one row; both simple and extended display now read from the same pre-computed chord sequence (fixed jitter in regular display too)
- [x] Chord Transcript PDF — generates a full chord chart (legend with keyboard-diagram thumbnails, bar/beat grid, subtle full-bleed lines) for any file; triggered via icon next to each file in the Library; gated by a Settings toggle (default off); fonts embedded (Inter/JetBrains Mono); legend collapses inversions into one entry per chord; respects active accidentals setting
  - Styling flagged for a future polish pass (noted, not urgent)

### Note Naming & Accidentals
- [x] Note naming systems — UK/US (English), EU (Central European H), Solfège, Hidden
- [x] Accidentals toggle — flats / sharps; single source of truth via `convertAccidentals()`
- [x] Central European: pitch class 10 always displays as `B`, never `A#`

### MIDI Editing & Library
- [x] MIDI Playback Editor — separate window; track include/exclude, instrument reassignment (all 128 GM programs), track merge; saves as `_ORFEO.mid`/`_ORFEO_MERGED.mid`, never modifies originals
- [x] Split Track — auto-detects single piano tracks spanning both bass/treble registers, splits into Left Hand / Right Hand tracks, saves as `_ORFEO_SPLIT.mid`
- [x] Split breakpoint — Single Note mode (adjustable C3–C4) AND Range mode (lower/upper bound, mixed zone), both persistent and user-selectable in Settings
- [x] Split / Merge Lucide icons in MIDI Editor
- [x] MIDI file library — folder picker, subfolder scanning, star favourites, one-click load
- [x] Auto-created `Orfeo/` subfolder — all app-generated files save here automatically, keeping the source library tidy; library displays `.mid` files from it, hides PDFs
- [x] Bundled `Demo/` folder — 5 MIDI files auto-copied on first launch, always sorted to top of library, hideable via Settings toggle
- [x] Settings persistence — note naming, accidentals, library folder, favourites, master volume, audio engine, all new toggles saved to `orfeo-prefs.json`

### UI & Infrastructure
- [x] Logo click — resets app to initial state, preserves user preferences
- [x] App launches maximized
- [x] Explorer modals open positioned above keyboard by default
- [x] Warm/dark theme toggle
- [x] Windows installer — `electron-builder` + NSIS, `npm run dist`
- [x] Portable build — single `.exe`, no installation required; filename auto-matches `package.json` version + `-portable` suffix; `Orfeo-Data/` folder redirect keeps prefs/samples cache with the exe
- [x] Fixed: Samples engine failing to load in packaged/portable builds
- [x] Fixed: MIDI Playback Editor opening main app/Library instead of the editor in packaged builds
- [x] Fixed: Floating keyboard waterfall/piano-roll misalignment
- [x] User Manual link in left drawer

### Documentation & Tooling
- [x] `CLAUDE.md` — trimmed to essentials, Gotchas section, Versioning rules, automatic changelog/README-split rule on every commit
- [x] Master `CHANGELOG.md` — merged chronologically, newest-first
- [x] `README.md` — badges, feature tables, audio engine comparison, public-facing plain-language changelog
- [x] `CONTRIBUTING.md` — build instructions for Windows/macOS/Linux contributors
- [x] dotclaude skills — `ship`, `catchup`, `claude-md`, `debug-fix`
- [x] `ccstatusline` — live token/session/quota tracking in Claude Code terminal

---

## Designed — Not Yet Built

- [ ] Mixer Console — full implementation pending. Design fully finalized: 1120x552px modal, 8 channel strips @ 108x480px + 1 master strip @ 160x480px, 8px gaps, 16px padding, 40px header; complete color palette with swatch reference file; master strip mono-meter/spectrogram toggle designed; knob reuse plan (VolumeKnob component for Chorus/Reverb/Pan, scaled up for Master Volume); all VU meters to be MIDI-event-driven (velocity-based), not audio-FFT-based
- [ ] Loop Region Strip — full prompt written and ready to run. 24px strip between scrub bar and song title; note-density ticks; drag-to-select with bar-snapping; reuses existing loop icon with context-aware tooltip/behaviour; tempo/transpose unaffected by looping; resets on close
- [ ] Drawer restyle — detailed icon/layout spec written (Library/Settings icons + Onboarding placeholder on left drawer; Tracks/Console-placeholder/MIDI-Editor icons on right drawer; alignment fixes to match content columns below)

---

## Known Issues

| # | Issue | Priority |
|---|---|---|
| 1 | Left/Right Hand Labels not rendering visually — full detection + data model built (single note or range breakpoint, persistent settings), but on-screen keyboard shows no lines/labels on first test. Debugging in progress. | High |
| 8 | Performance mode ribbon rest state — needs polish. Current behavior: colored fills fade out on silence, dim midline appears, labels dim to 55% opacity at last known cluster positions. Needs visual review (actual opacity levels, midline weight/color, transition timing) — cannot be fully validated without video capture of the live app. Flag for a dedicated polish pass once testable on hardware. | Low |
| 2 | TrackPanel SVG — intermittent renderer crash on certain MIDI files; root cause unknown | High |
| 3 | Chord name inconsistency between Chord Explorer tiles and live chord bar display in some edge cases | Medium |
| 4 | Loop region (full file) — store state exists, no dedicated UI yet (superseded by Loop Region Strip above) | Medium |
| 5 | Per-track volume and pan — store fields exist, not yet wired to audio (pending Mixer Console) | Medium |
| 6 | CSS magic numbers — hardcoded colors/spacing/z-indexes need extracting into CSS variables; full migration plan written, deferred until all functionality/layout work is complete | Low |
| 7 | CSS Grid migration — replace flexbox in multi-row components (explorers, topbar, mixer, settings, track panel) | Low |

---

## Planned Features

### Near Term
- [ ] Settings panel rework — full redesign using CSS Grid, icon-based compact controls. New settings: light/dark theme toggle, UI density (compact/comfortable), show/hide bar numbers, default keyboard size/mode on launch, key highlight color picker, count-in bars (1/2/4), auto-scroll on/off, loop-on-by-default, MIDI output device selector, note release time, default accidentals exposed in UI, default scale type / chord tier for explorers, remember-last-selection toggle, welcome screen on/off, reopen-last-file-on-launch, window position memory
- [ ] Finger numbers on keyboard — display suggested fingering on lit keys during chord/inversion display: 1-3-5 (major/minor/diminished triads), 1-2-3-5 / 1-2-4-5 (seventh-chord inversions); inversion-aware
- [ ] Onboarding / Welcome screen — placeholder icon designed in drawer spec; actual screen content not yet built; shown on first launch only, toggleable from Settings

### Larger Features
- [ ] Play-Along "Wait Mode" — now unblocked since Hardware MIDI Input is complete. Pauses playback at each note/chord group; compares live hardware input against required notes; advances only when matched. Needs: matching strictness rules (exact vs subset), per-hand independent gating (using existing hand-detection infrastructure), timing tolerance window for near-simultaneous notes. Realistically multiple sessions.
  - [ ] Prerequisite fix — file playback vs hardware input color conflict: `activeKeys`/`activeKeyColors` currently receives writes from both MIDI file playback and live hardware input simultaneously with no coordination, causing key-color overwrites when both are active at once. Must be resolved (clean source separation or explicit priority rule) before Play-Along Wait Mode can reliably distinguish "notes from the file" vs "notes the user just played" on the keyboard. Flagged during Hand Labels Performance Mode work.
- [ ] Arpeggiator — rhythmic preset patterns (Alberti bass, ascending/descending, octave jump, syncopated) as step sequences with note duration and rest slots; BPM-configurable; lights keys in real time
- [ ] Help window — separate Electron BrowserWindow loading public/help/index.html; triggered by info icon; full HTML/CSS layout with images/video; content editable without touching React code

### Infrastructure
- [ ] GitHub Actions — automated multi-platform builds (Windows/macOS/Linux) on release tag push, auto-attached to GitHub Releases
- [ ] macOS .dmg build (contributor or CI)
- [ ] Linux .AppImage build (contributor or CI)
- [ ] Global CSS variable migration (see Known Issues #6)
- [ ] CSS Grid migration (see Known Issues #7)
- [ ] Beta label on Chord Transcript feature (low priority)

---

## Future / Phase 3

- [ ] VST3 plugin — separate JUCE/C++ project; same visual engine; DAW integration (Reaper, Cubase, Studio One)
- [ ] Playlist — save and recall collections of MIDI files with settings
- [ ] Key signature display — treble clef with sharps/flats in topbar
- [ ] In-app music notation rendering (VexFlow) or MusicXML export — under consideration, no implementation decision made

---

## Explicitly Parked (do not revisit without a strong reason)

- Web app / PWA version — desktop-only focus confirmed
- Full MIDI step sequencer / grid-based pattern editor with import-export
- Commercial licensing system (Keygen.sh/WooCommerce) and free/paid feature gating — Orfeo is fully open source, no licensing layer planned