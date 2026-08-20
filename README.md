# Orfeo

**A modern piano learning and MIDI visualization desktop app for Windows.**

[![Version](https://img.shields.io/badge/Version-1.0.0-blue)](https://github.com/Squarebow/Orfeo/releases)
[![License](https://img.shields.io/badge/License-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey?logo=windows)](https://github.com/Squarebow/Orfeo/releases)

Open any MIDI file, watch notes fall onto a virtual keyboard in real time, and learn piano at your own pace. Explore chords and scales interactively, build your own progressions, and hear it all through a high-quality sampled audio engine.

*From MIDI to mastery.*

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

---

## Features

### Piano Roll & Playback

- 🎵 **MIDI file import** — open any `.mid` or `.midi` file, plus MusicXML, Guitar Pro, and karaoke KAR files
- 🎹 **Falling note piano roll** — notes fall downward onto a 61 / 73 / 88 key virtual keyboard in real time, perfectly aligned to each key
- 🎚️ **Tempo control** — slow down or speed up without changing pitch; long-press the BPM arrows to accelerate
- 🔁 **Loop playback** — draw a loop region directly on the waterfall and repeat any section
- 🥁 **Metronome** — tempo-map aware; follows mid-file tempo changes automatically
- 🎼 **Track manager & Mixer Console** — mute, solo, recolor, and show/hide individual tracks; full per-channel volume, pan, chorus, and reverb

### Interactive Keyboard

- 🖱️ **Click or drag to play** — click any key to hear it; drag across keys for glissando
- 🎹 **Docked or floating** — keyboard docks at the bottom or floats freely as a draggable panel
- 💡 **Key highlighting** — keys light up in track color as notes play; chord names displayed above
- 🔤 **Note labels** — lit keys show note names in your chosen naming system
- 🎛️ **Hardware MIDI input** — connect a real keyboard and play along, with true sustain and multi-device support

### Chord & Scale Explorers

- 🎵 **Chord Explorer** — browse and audition any chord in any key; filter by hand span, note count, or search; cycle inversions; play progressions with seven voicing styles (Classic, Coltrane, Cinematic, Roadhouse, Ipanema, Carnival, Velvet)
- 🎵 **Scale Explorer** — interactive Circle of Fifths; select any key to see the scale, its diatonic chords, and play progressions
- 🎼 **Real-time chord detection** — the chord name above the keyboard follows what's actually playing, from a MIDI file or hardware keyboard input, with three tracking modes (Classic, General Harmony, Follow Instrument) to suit how you want it to read the music
- 🔤 **Two chord-naming styles** — traditional abbreviations (`Bb(b5)/D`) or symbol notation (`Bb(♭5)/D`, `+`/`°`/`ø`/`Δ`), applied consistently everywhere a chord name appears
- 🔒 **Lock-a-Chord** — Shift+click any 3+ keys to build and lock a chord, then cycle through its inversions

### MIDI Editing

- ✏️ **MIDI Playback Editor** — reassign instruments, rename/recolor/merge/split tracks; saves as `_ORFEO.mid` without touching the original
- 🎹 **Note Editor** — edit individual notes directly on the piano roll: move, resize, add, delete, with full undo/redo
- 📁 **File library** — browse a folder of MIDI files, star favourites, click to load

### Audio

- 🎛️ **Master volume** — SVG knob in the toolbar, persists across sessions
- 🎼 **Two audio engines** — GM Synth (instant, no download) or Samples (SpessaSynth + GeneralUser GS SF2, richer sound)

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

*Coming soon.*

---

## Getting Started

### Download

Download the latest build from the [Releases](https://github.com/Squarebow/Orfeo/releases) page:

- `Orfeo Setup 1.0.0.exe` — standard installer
- `Orfeo-1.0.0-portable.exe` — portable, no installation required

Not sure which one to grab, or want to know how they differ (auto-updates, where settings are stored, etc.)? See [docs/INSTALLATION.md](docs/INSTALLATION.md).

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
git clone https://github.com/Squarebow/Orfeo.git
cd Orfeo

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
| `npm run dist` | Package installer + portable to `release/` |
| `npm run dist:portable` | Package portable build only |

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

Please open an issue before submitting a PR.

---

## License

MIT © [SquareBow](https://github.com/Squarebow)

---

Full technical release history lives in [CHANGELOG.md](CHANGELOG.md).
