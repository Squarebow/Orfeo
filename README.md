# Orfeo
**From MIDI to mastery.**
Turn any MIDI file into an interactive piano learning experience.

  

[![Version](https://img.shields.io/badge/Version-1.0.0-blue)](https://github.com/Squarebow/Orfeo/releases) [![License](https://img.shields.io/badge/License-GPLv3-blue)](LICENSE.md) [![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey?logo=windows)](https://github.com/Squarebow/Orfeo/releases)

  ---
*See every note. Understand every chord. Play it your way, at your own tempo — with real-time chord detection, hand-colored keys, and a piano roll that actually looks like something built this decade.*

Orfeo is a free, open-source desktop app that turns MIDI files into an interactive piano-learning experience: notes fall onto a virtual keyboard in real time, keys light up as they play, and you can slow down, loop, and explore any passage at your own pace. It's not a game — there's no scoring, no streaks, no subscription. And it's not a DAW, though it borrows a few DAW-adjacent tools (a full mixer console, per-track editing) where they genuinely help you practice.  



Explore chords and scales interactively, build your own progressions, and hear everything through a high-quality sampled audio engine.

  

---

  

## Table of Contents

  

- [Why Orfeo](#why-orfeo)

- [Features](#features)

- [Audio Engines](#audio-engines)

- [Note Naming Systems](#note-naming-systems)

- [Screenshots](#screenshots)

- [FAQ](#faq)

- [Getting Started](#getting-started)

- [Building from Source](#building-from-source)

- [Contributing](#contributing)

- [License](#license)

  

---

  

## Why Orfeo
Before Synthesia was a thing, there was [Rondo](https://macsim.app/rondo/), a lovely little Mac-only MIDI learning app with scrolling piano roll, tempo slowdown, and track filtering. I loved it, it got it right in spirit, but for learning piano from MIDI files I had to run Logic Pro in parallel to see the chords displayed. Development stopped, and it no longer runs on modern macOS. 

Along came the expensive, gamified app that hasn't added a meaningfull feature or modernized its interface in years. Orfeo exists because the alternatives don't feel right. It picks up that Rondo idea, rebuilt from scratch as an actively maintained, cross-platform-capable app, with one goal: make the music itself, not the app around it, the focus.

-  **Free forever** — no subscription, no paywalled features, no account

-  **No gamification** — a serious tool for serious learners, not a rhythm game with a piano skin

-  **Real rubato support** — Orfeo tracks tempo changes properly through a human-recorded MIDI file, not just a flat click track. Most visualizers get this wrong

-  **Open source** — inspect it, build it yourself, contribute to it

-  **A modern interface** — not stuck looking like it shipped in 1998

  

---
## Features

  

### Piano Roll & Playback

  

-  **MIDI file import** — open any `.mid` or `.midi` file, plus MusicXML, Guitar Pro, Capella, and karaoke KAR files

-  **Falling note piano roll** — notes fall downward onto a 61 / 73 / 88 key virtual keyboard in real time, perfectly aligned to each key

-  **Tempo control** — slow down or speed up without changing pitch; long-press the BPM arrows to accelerate

-  **Loop playback** — draw a loop region directly on the waterfall and repeat any section

-  **Metronome** — tempo-map aware; follows mid-file tempo changes automatically

-  **Track manager & Mixer Console** — mute, solo, recolor, and show/hide individual tracks; full per-channel volume, pan, chorus, and reverb, with live VU meters on every strip

-  **Focus mode** — instantly narrow playback and view down to just Keys, Bass & Drums when you don't need the whole arrangement

-  **Presentation mode** — press `F11` for a distraction-free, chrome-free view of just the roll and keyboard

  

### Interactive Keyboard

  

-  **Click or drag to play** — click any key to hear it; drag across keys for glissando

-  **Docked or floating** — keyboard docks at the bottom or floats freely as a draggable panel

-  **Key highlighting** — keys light up in track color as notes play; chord names displayed above

-  **Automated Hand Assignment**  *(beta)* — notes and keys color-code by which hand plays them, in Practice mode (a smoothly moving split line) or Performance mode (per-note hand tags); optional colorblind-friendly L/R badges, and adjustable split sensitivity for live hardware input

-  **Note labels** — lit keys show note names in your chosen naming system

-  **Hardware MIDI input** — connect a real keyboard and play along, with true sustain and multi-device support

  

### Chord & Scale Explorers

  

-  **Chord Explorer** — browse and audition any chord in any key; filter by hand span, note count, or search; cycle inversions; play progressions with seven voicing styles (Classic, Coltrane, Cinematic, Roadhouse, Ipanema, Carnival, Velvet)

-  **Scale Explorer** — interactive Circle of Fifths; select any key to see the scale, its diatonic chords, and play progressions

-  **Real-time chord detection** — the chord name above the keyboard follows what's actually playing, from a MIDI file or hardware keyboard input, with three tracking modes (Classic, General Harmony, Follow Instrument) to suit how you want it to read the music

-  **Chord Prompter** — a lead-sheet-style readout showing the previous, current, and upcoming chords as the song plays, so you're never caught off guard by what's next

-  **Chord Transcription**  *(beta)* — generate a full chord chart for any loaded file and export it as a PDF

-  **Two chord-naming styles** — traditional abbreviations (`Bb(b5)/D`) or symbol notation (`Bb(♭5)/D`, `+`/`°`/`ø`/`Δ`), applied consistently everywhere a chord name appears

-  **Lock-a-Chord** — Shift+click any 3+ keys to build and lock a chord, then cycle through its inversions

  

### MIDI Editing

  

-  **MIDI Playback Editor** — reassign instruments, rename/recolor/merge/split tracks; saves as `_ORFEO.mid` without touching the original

-  **Note Editor** — edit individual notes directly on the piano roll: move, resize, add, delete, and edit velocity, with marquee/lasso/pen selection tools and full undo/redo

-  **File library** — browse a folder of MIDI files, star favourites, click to load

  

### Visual Flourishes

  

-  **Hit effects** — seven optional particle-style animations play where notes strike the keyboard (glow bloom, ripple ring, particle burst, smoke plume, color aura, starburst nova, comet trail), with a custom color picker and adjustable scope

  

### Audio

  

-  **Master volume** — SVG knob in the toolbar, persists across sessions

-  **Two audio engines** — GM Synth (instant, no download) or Samples (SpessaSynth + a choice of downloadable SF2/SF3 soundfont libraries, including GeneralUser GS, for richer sound)

  

---

  

## Audio Engines

  

| Engine | Sound Quality | Setup | Best For |

|---|---|---|---|

| **GM Synth** | Good | Instant, no download | Quick playback, low resource use |

| **Samples** | Excellent | ~31MB download on first use | Musical, expressive listening |

  

Switch between engines in **Settings → Audio**. The Samples engine uses [SpessaSynth](https://github.com/spessasus/spessasynth_lib) with a choice of downloadable soundfonts, including [GeneralUser GS](http://www.schristiancollins.com/generaluser.php) by default. Settings and volume persist across sessions.

  

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

  

## FAQ

  

<details  name="faq"  open>

<summary><b>Is Orfeo free?</b></summary>

Yes — completely free, open source, no subscription, no paywalled features.

</details>

  

<details  name="faq">

<summary><b>Does it need an account or internet connection?</b></summary>

No. No login, no account, no telemetry. Orfeo doesn't collect, store, or transmit any user data — MIDI files are processed entirely on your device. The one exception is the optional Samples audio engine's one-time ~31MB soundfont download.

</details>

  

<details  name="faq">

<summary><b>What platforms does Orfeo run on?</b></summary>

Windows 10/11 today, with a signed installer and a portable build. Orfeo is built on Electron, so macOS and Linux builds are possible and community-buildable via <a  href="docs/CONTRIBUTING.md">CONTRIBUTING.md</a> — there just aren't official signed builds for those platforms yet.

</details>

  

<details  name="faq">

<summary><b>Does Orfeo support Finale, Sibelius, or MuseScore files?</b></summary>

Not directly — but all three can export MusicXML, and Orfeo imports that. Export your score as MusicXML from within the program, then open that file in Orfeo like any other. Guitar Pro, Capella, and karaoke KAR files are also supported natively, converted automatically on import.

</details>

  

<details  name="faq">

<summary><b>What MIDI files work best?</b></summary>

Real, human-performed MIDI files — the kind with natural rubato and mid-song tempo changes — are where Orfeo actually stands out, since it tracks tempo changes properly instead of assuming a flat click track. Cleanly sequenced/quantized files work great too. If a downloaded file is messy (extra tracks, wrong instrument assignments), the Playback Editor and Note Editor let you clean it up without touching the original.

</details>

  

---

  

## Getting Started

  

### Download

  

Download the latest build from the [Releases](https://github.com/Squarebow/Orfeo/releases) page:

  

-  `Orfeo Setup 1.0.0.exe` — standard installer

-  `Orfeo-1.0.0-portable.exe` — portable, no installation required

  

Not sure which one to grab, or want to know how they differ (auto-updates, where settings are stored, etc.)? See [docs/INSTALLATION.md](docs/INSTALLATION.md).

  

### Using Orfeo

  

1.  **Open a MIDI file** — click the folder icon in the top left or press `Ctrl+O`

2.  **Press Play** — notes fall onto the keyboard in sync with the music

3.  **Adjust tempo** — use the BPM arrows to slow down while learning

4.  **Explore chords** — click `CHORDS` above the keyboard to open the Chord Explorer

5.  **Explore scales** — click `SCALES` above the keyboard to open the Scale Explorer

  

For a full guide see [docs/HOW_TO_USE.md](docs/HOW_TO_USE.md), and for every keyboard shortcut and mouse gesture see [docs/SHORTCUTS.md](docs/SHORTCUTS.md).

  

---

  

## Building from Source

  

### Prerequisites

  

- [Node.js 20 LTS](https://nodejs.org) or higher

- [Git](https://git-scm.com)

  

### Install & Run

  

```bash

# Clone the repo

git  clone  https://github.com/Squarebow/Orfeo.git

cd  Orfeo

  

# Install dependencies

npm  install

  

# Start development server (launches Electron app)

npm  run  dev

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

  

Contributions welcome — see [CONTRIBUTING.md](docs/CONTRIBUTING.md) for full setup and build instructions for all platforms (Windows, macOS, Linux).

  

Please open an issue before submitting a PR.

  

---

  

## License

  

GPL-3.0-or-later © [SquareBow](https://github.com/Squarebow) — see [LICENSE.md](LICENSE.md). Bundles GSAP under a separate additional-permission grant; see the license file and [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md) for details.

  

---

  

Full technical release history lives in [CHANGELOG.md](docs/CHANGELOG.md).