# Orfeo

**A modern piano learning and MIDI visualization desktop app for Windows.**

[![Version](https://img.shields.io/badge/Version-0.7.0-blue)](https://github.com/SquareBow/orfeo/releases)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey?logo=windows)](https://github.com/SquareBow/orfeo/releases)
[![Status](https://img.shields.io/badge/Status-Beta-orange)](https://github.com/SquareBow/orfeo)

Upload any MIDI file, watch notes fall onto a virtual keyboard in real time, follow along at your own pace, and learn piano the visual way. Explore chords and scales interactively, build your own chord progressions, and hear everything through a high-quality sampled audio engine.

---

## Table of Contents

- [Features](#features)
- [Audio Engines](#audio-engines)
- [Note Naming Systems](#note-naming-systems)
- [Screenshots](#screenshots)
- [Getting Started](#getting-started)
- [Building from Source](#building-from-source)
- [Contributing](#contributing)
- [License](#license)
- [Changelog](#changelog)

---

## Features

### Piano Roll & Playback

- 🎵 **MIDI file import** — open any `.mid` or `.midi` file
- 🎹 **Falling note piano roll** — notes fall downward onto a 61 / 73 / 88 key virtual keyboard in real time, perfectly aligned to each key
- 🎚️ **Tempo control** — slow down or speed up without changing pitch; long-press the BPM arrows to accelerate
- 🔁 **Loop playback** — set a loop region and repeat any section
- 🥁 **Metronome** — tempo-map aware; follows mid-file tempo changes automatically
- 🎼 **Track manager** — mute, solo, recolor, and show/hide individual tracks

### Interactive Keyboard

- 🖱️ **Click or drag to play** — click any key to hear it; drag across keys for glissando
- 🎹 **Docked or floating** — keyboard docks at the bottom or floats freely as a draggable panel
- 💡 **Key highlighting** — keys light up in track color as notes play; chord names displayed above
- 🔤 **Note labels** — lit keys show note names in your chosen naming system

### Chord & Scale Explorers

- 🎵 **Chord Explorer** — browse and audition any chord in any key; filter by hand span, note count, or search; cycle inversions; play progressions
- 🎵 **Scale Explorer** — interactive Circle of Fifths; select any key to see the scale, its diatonic chords, and play progressions
- 🎼 **Real-time chord detection** — chord name displayed as notes play from a MIDI file or keyboard input
- 🔄 **Chord inversions** — displayed in slash notation (C/E, Dm7/F) everywhere in the app

### MIDI Editing

- ✏️ **MIDI Playback Editor** — reassign instruments, include/exclude tracks, merge tracks; saves as `_ORFEO.mid` without touching the original
- 📁 **File library** — browse a folder of MIDI files, star favourites, click to load

### Audio

- 🎛️ **Master volume** — SVG knob in the toolbar, persists across sessions
- 🎼 **Two audio engines** — GM Synth (instant, no download) or Samples (SpessaSynth + GeneralUser GS SF2, ~31MB, richer sound)

---

## Audio Engines

| Engine | Sound Quality | Setup | Best For |
|---|---|---|---|
| **GM Synth** | Good | Instant, no download | Quick playback, low resource use |
| **Samples** | Excellent | ~31MB download on first use | Musical, expressive listening |

Switch between engines in **Settings → Audio**. The Samples engine uses [SpessaSynth](https://github.com/spessasus/spessasynth_lib) with the [GeneralUser GS](http://www.schristiancollins.com/generaluser.php) soundfont. Settings and volume persist across sessions.

---

## Note Naming Systems

A global setting applies everywhere — keyboard labels, chord names, chord explorer, scale explorer:

| Setting | System | Example |
|---|---|---|
| **UK / US** | Standard English | C D E F G A **B** |
| **EU** | Central European | C D E F G A **H** (B = B♭) |
| **Solfège** | Latin | Do Re Mi Fa Sol La Si |
| **Hide** | No labels | Keys shown without names |

The accidentals toggle (♭ / ♯) applies separately and is remembered between sessions.

---

## Screenshots

*Coming soon — screenshots will be added before the first public release.*

---

## Getting Started

### Download

Download the latest installer from the [Releases](https://github.com/SquareBow/orfeo/releases) page:

- `Orfeo-Setup-x.x.x-Windows.exe` — standard installer
- `Orfeo-Portable-x.x.x-Windows.exe` — portable, no installation required

### Using Orfeo

1. **Open a MIDI file** — click the folder icon in the top left or press `Ctrl+O`
2. **Press Play** — notes fall onto the keyboard in sync with the music
3. **Adjust tempo** — use the BPM arrows to slow down while learning
4. **Explore chords** — click `CHORDS` above the keyboard to open the Chord Explorer
5. **Explore scales** — click `SCALES` above the keyboard to open the Scale Explorer

For a full guide see [docs/HOW_TO_USE.md](docs/HOW_TO_USE.md).

---

## Building from Source

### Prerequisites

- [Node.js 20 LTS](https://nodejs.org) or higher
- [Git](https://git-scm.com)

### Install & Run

```bash
# Clone the repo
git clone https://github.com/SquareBow/orfeo.git
cd orfeo

# Install dependencies
npm install

# Start development server (launches Electron app)
npm run dev
```

### Build Commands

| Command | Output |
|---|---|
| `npm run dev` | Development mode with hot reload |
| `npm run build` | Compile TypeScript to `out/` |
| `npm run dist` | Package to installer in `release/` |
| `npm run dist -- --dir` | Unpack build for inspection (no installer) |

### Tech Stack

| Layer | Technology |
|---|---|
| App framework | Electron + Vite + React + TypeScript |
| Piano roll rendering | PixiJS (WebGL) |
| MIDI parsing | @tonejs/midi |
| Audio engine | SpessaSynth + JZZ |
| Music theory | tonal.js |
| State management | Zustand |
| Styling | Tailwind CSS |
| Icons | Lucide React |

---

## Contributing

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for full setup and build instructions for all platforms (Windows, macOS, Linux).

Please open an issue before submitting a PR. Check [docs/ROADMAP.md](docs/ROADMAP.md) to see what is already planned.

---

## License

MIT © [SquareBow](https://github.com/SquareBow)

---

## Changelog

All user-visible changes listed here. For full technical detail see [CHANGELOG.md](CHANGELOG.md).

---

### 3. 7. 2026

**New**
- **Split breakpoint: Single vs Range mode** — the MIDI Editor split breakpoint setting in Settings now has two modes. Single mode works as before: one note divides LH and RH. Range mode lets you set a lower and upper bound; notes below the lower bound go to LH, above the upper bound go to RH, and notes in between are assigned to whichever hand's boundary they're closer to. All values are constrained to the C3–C4 octave where the real LH/RH split lives.

**New**
- **Locked Chord modal** — locking a chord (Shift+Click 3+ keys) now opens a small draggable floating modal instead of showing the chord inline in the bar below the keyboard. The modal shows the chord name and inversion, with the same play, inversion cycling, and clear controls as before. Drag it anywhere on screen.
- **Shift+Click hint** — the "Shift+Click at least 3 keys to build & lock a chord" hint has moved from the bottom control bar into the chord display bar, next to the SCALES label, where it's always visible.

**Improved**
- **Chord Transcript from file icon** — when Chord Transcription is turned on in Settings, the file icon next to each library entry becomes the transcript trigger (click to generate a PDF). No extra column is added to the library list.
- **Scrolling filenames** — long MIDI filenames in the library now slide left on hover to reveal the full name, then slide back when you move away.
- **Chord Prompter icon** — the expand button on the chord bar now uses a dedicated fullscreen icon.

---

### v0.7.0 — 2. 7. 2026

**New**
- **Split Track** — the MIDI Playback Editor now has a Split button on piano, organ, and chromatic percussion tracks. Clicking it detects left-hand vs. right-hand notes automatically (based on a configurable split point, default C4) and saves a new file with the two hands as separate tracks (`_ORFEO_SPLIT.mid`). Tracks that don't have enough notes in both registers don't show the button.
- **Split breakpoint setting** — a new Settings → MIDI Editor section lets you change the note where the hand split happens, from A0 to B7, one semitone at a time. Default is C4 (middle C).
- **Portable build filename** — the portable `.exe` is now named `Orfeo-0.7.0-portable.exe` for clarity.

**Improved**
- **MIDI Editor merge button** — the `+` / `✓` text on each track's merge toggle has been replaced with the Merge icon for visual consistency.
- **MIDI Editor track order** — keyboard and piano tracks now always appear at the top of the track list; drums sink to the bottom. Left Hand and Right Hand tracks are sorted to the top and in order when opening a split file.

**Fixed**
- **MIDI Editor icons** — the Merge and Split icons were too dark to see clearly; both are now lighter.
- **Split button on split tracks** — Left Hand and Right Hand tracks no longer show a Split button since they are already the result of a split.

### 2. 7. 2026

**New**
- **Demo folder** — three bundled MIDI files (Mozart Rondo Alla Turca, Joplin Entertainer, Vivaldi Summer) are copied into a `Demo/` folder inside your library on first launch. The Demo folder always appears at the top of the library list. You can hide it from Settings → Library if you don't need it.
- **Generated files stay tidy** — files created by Orfeo (`_ORFEO.mid`, `_ORFEO_MERGED.mid`, Chord Transcript PDFs) now save into an `Orfeo/` subfolder next to the source file instead of cluttering the same folder. The subfolder is created automatically on first save. Re-saving an already-generated file overwrites it cleanly in the same `Orfeo/` folder without doubling the suffix.

### v0.6.1 — 2. 7. 2026

**New**
- **Portable build** — Orfeo is now available as a portable single-file `.exe` with no installation required. Copy it to any Windows machine and run directly. Settings and preferences are stored in an `Orfeo-Data/` folder next to the exe, so they travel with it.

**Fixed**
- **MIDI Playback Editor** — the editor window now correctly loads the editor UI in packaged builds. Previously it would open a second copy of the main app instead.
- **Samples audio engine** — the engine now initialises correctly in packaged builds. The worklet and soundfont files were being fetched from the wrong path when running as an installed app.
- **Piano roll alignment** — black key note columns in the waterfall now line up exactly with the black keys on the keyboard for all three keyboard sizes.

### v0.6.1 — 2. 7. 2026 (continued)

**Fixed**
- **Chord Transcript PDF** — three visual fixes: (1) the outer border around the bar grid is removed — only the lines between rows remain, giving a cleaner open-grid look. (2) Chord names that fell very close together in the same beat now push apart instead of merging into one unreadable string (e.g. `Dsus24CMadd9` now renders as two separate names). (3) Legend deduplication is more robust — the same chord in root position and an inversion is now guaranteed to appear only once.

### v0.6.1 — 1. 7. 2026 (continued)

**Improved**
- **Chord Transcript PDF** — the chord transcript now embeds Inter and JetBrains Mono fonts. The chord legend collapses inversions so the same chord in different positions counts as one entry (was showing 50+ entries, now 8–15 for a typical song). Grid lines are lighter and less dominant. Each bar row grows taller based on how many chord changes it contains. Chord names are now prevented from overflowing their beat cells.

---

### v0.6.1 — 30. 6. 2026 (continued)

**New**
- **Chord Transcript PDF** — click the document icon in the chord bar (requires Chord Prompter to be open) to generate a PDF of the full chord sequence for the loaded MIDI file. The PDF is saved next to the MIDI file automatically. It includes: a one-octave keyboard thumbnail for each unique chord (chord tones highlighted in amber), a bar-by-bar chord grid showing what chord plays in every bar, and header info with tempo, key, and time signature. Works offline, no internet required.

**Changed**
- **Chord Prompter** is now embedded in the chord bar above the keyboard instead of a separate floating panel. Enable it in Settings → Playback, then click the scroll icon (now in the chord bar, next to the CHORDS label) to expand into prompter mode: 4 past chords on the left, the current chord large and amber in the centre, 2 upcoming chords on the right — all in a single compact row. The bar smoothly animates between compact and expanded views. During regular playback the chord display reads from a pre-computed chord sequence (no more jitter from live key detection).

### v0.6.1 — 29. 6. 2026 (continued)

**New**
- **Chord Prompter** — a small floating panel that shows the chord sequence during playback: past 3 chords fade out to the left, the current chord is large and amber in the centre, the next 3 chords fade out to the right. Enable it in Settings → Playback, then click the scroll icon in the transport bar. Each chord is held for at least 2 seconds so fast harmonic changes don't flash. The panel is draggable and freezes in place on pause.
- **Bar numbers & grid lines** — the piano roll now overlays bar numbers and horizontal bar lines that scroll with the notes. Current bar is highlighted in amber. Toggle Show/Hide in Settings → Piano Roll.
- **Bar counter in transport bar** — live `current|total` bar display next to the TIME indicator, always visible when a file is loaded.

**Fixed**
- Metronome accent now fires on beat 1 (the downbeat) of each bar instead of beat 2 or 3 — was off due to an alignment error in the beat scheduler.
- Metronome no longer causes the BPM display to stutter or jump on MIDI files that have embedded tempo changes (common in sequenced intro rubato). Previously the metronome was incorrectly overwriting the stored BPM with each MIDI tempo event it encountered.
- Metronome now stays in sync throughout MIDI files that have mid-song tempo changes (rubato intros, accelerandos, ritardandos). Previously the beat scheduler drifted badly after any tempo change, causing clicks to land on wrong beats and fall further out of sync the longer the file played.
- BPM display now updates live during playback to reflect the current tempo from the MIDI file — files with tempo changes show the correct BPM as they play rather than staying locked at the opening value.

---

### v0.6.1 — 29. 6. 2026

**Improved**
- Audio engine choice (GM Synth / Samples) is now remembered between sessions — Orfeo automatically loads the Samples soundfont on startup if it was active when you last closed the app.
- Chord Explorer search completely rewritten — single characters and short queries now work correctly; results are accurate across all note naming systems.
- New search scope filter in the Chord Explorer search bar: **Name** (find chord types by name — m7, maj7, sus4, regardless of selected root), **Notes** (find chords containing specific notes for the selected root), or **Both**.

---

### v0.6.0 — June 2026

**New**
- **Samples audio engine** — real instrument sounds via SpessaSynth and the GeneralUser GS soundfont (~31MB, downloads once on first use). Switch between GM Synth and Samples in Settings. Noticeably richer and more musical than the built-in GM synth.
- **Master volume knob** — interactive SVG dial in the toolbar between the key display and transport controls. Volume persists across sessions.
- **Glissando** — drag the mouse across the virtual keyboard while holding the button to play notes continuously as you slide.

**Improved**
- Chord inversion display now always uses slash notation everywhere in the app — `C/E` for 1st inversion, `C/G` for 2nd. No more confusing re-detected chord names like `Em#5` or `Gsus4` for inverted chords.
- Major chord suffix `M` removed globally — `C` instead of `CM`, `G` instead of `GM`.
- Inversion label shown next to chord name above keyboard when cycling inversions manually (e.g. `C/E  1st inv`).

---

### v0.5.2 — June 2026

**New**
- **Scale Explorer** — opens from the `SCALES` label above the keyboard. Interactive Circle of Fifths: click any key to explore its scale and diatonic chords. Supports 10 scale types (Major, Natural Minor, Harmonic Minor, Melodic Minor, Dorian, Phrygian, Lydian, Mixolydian, Major and Minor Pentatonic).
- Diatonic chord grid — 7 chord tiles per scale with Roman numeral labels; click any tile to hear and highlight it on the keyboard.
- 20 named chord progressions (Pop, Jazz Standard, Andalusian, Pachelbel, 12-bar Blues and more) with Slow / Medium / Fast speed control and Sequential / Random inversion modes.
- Switch directly between Chord Explorer and Scale Explorer without closing either.

**Improved**
- App now launches maximized.
- Both explorer modals open positioned just above the keyboard by default, not covering it.

---

### v0.5.1 — June 2026

**New**
- **Chord Explorer** — opens from the `CHORDS` label above the keyboard. Browse all chord types for any root note; filter by hand span (one hand / two hands) or note count (3–6+); search by chord name; cycle through inversions.
- 15 named chord progressions with Slow / Medium / Fast playback and Sequential / Random inversion modes.
- Clicking the Orfeo logo resets the app to its initial state without restarting.
- Accidentals toggle (♭ / ♯) in the Chord Explorer footer — changes apply everywhere instantly.

**Fixed**
- Central European note naming: B♭ (pitch class 10) now always displays as `B` in EU mode, never `A#`.
- Closing the Chord Explorer now correctly clears the chord name display above the keyboard.

---

### v0.5.0 — June 2026

**New**
- **Zoom control** — zoom the piano roll time axis to see more or fewer bars at once.
- **User Manual link** — bottom of the left drawer opens the guide in your browser.
- **Warm theme** — optional warmer background color in Settings.

**Improved**
- Piano roll grid now correctly aligns to the selected keyboard size (61 / 73 / 88 keys).
- Keyboard height is now proportional — resizes smoothly when the window changes size.
- Metronome now aligns to the current playback position when started mid-file, and correctly follows tempo changes embedded in the MIDI file.
- BPM arrows support long-press to accelerate through values quickly.
- Library drawer opens by default and shows the Library tab first.
- Left drawer widened to match the right track panel.

**Fixed**
- Library subfolder display was silently broken — now works correctly with collapsible folder headers.
- Chord name tooltip was clipped at the top of the screen — now opens downward.

---

### v0.3.2 — June 2026

**New**
- **Floating keyboard** — click Float to detach the keyboard into a draggable panel anywhere on screen. Pin it back with one click.

**Improved**
- Chord detection during playback is faster and clears cleanly between chords.
- Metronome now starts in phase with the current playback position.

---

### v0.3.1 — June 2026

**Improved**
- MIDI file library now scans subfolders recursively, with collapsible folder groups.
- MIDI Playback Editor covers all 128 GM instruments across 16 families.
- Track editor pencil icon turns amber while the editor is open.
- Settings (note naming, accidentals) are now remembered between sessions.

**Fixed**
- Clicking a file in the library sometimes failed to load it.
- Reopening the app could overwrite saved settings before they were restored.

---

### v0.3.0 — June 2026

**New**
- **Settings & Library drawer** — collapsible left panel with note naming, accidentals, zoom, keyboard size, and audio settings. Library tab for browsing and starring MIDI files.
- **MIDI Playback Editor** — separate window to reassign instruments, include/exclude tracks, and merge tracks. Saves as `_ORFEO.mid` — originals are never modified.
- **Chord lock** — Shift+click keys on the keyboard to build and lock a chord. Cycle inversions with the arrow buttons.
- **Accidentals toggle** — switch between ♭ flats and ♯ sharps globally.
- **Windows installer** — `npm run dist` produces a proper `.exe` installer.

**Improved**
- Toolbar redesigned with BPM and key display side by side.
- Track panel opens automatically when a MIDI file loads.

---

### v0.2.0 — June 2026

**New**
- Open MIDI files via a native file dialog.
- Falling note piano roll — notes animate downward onto the keyboard in sync with playback.
- Audio playback with instrument sounds per track.
- Keys light up as notes play; chord name shown above the keyboard.

---

### v0.1.0 — June 2026

Initial release. Project scaffold, basic Electron app window, design system established.
