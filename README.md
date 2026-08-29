# Orfeo

**From MIDI to mastery.** Turn any MIDI file into an interactive piano-learning
experience.

[![Version](https://img.shields.io/badge/Version-1.0.0-blue)](https://github.com/Squarebow/Orfeo/releases) [![License](https://img.shields.io/badge/License-GPLv3-blue)](LICENSE.md) [![Platform](https://img.shields.io/badge/Platform-Windows-lightgrey?logo=windows)](https://github.com/Squarebow/Orfeo/releases)

---

Orfeo is a free, open-source desktop app that turns MIDI files into an
interactive piano lesson: notes fall onto a virtual keyboard in real time, keys
light up as they play, and you can slow down, loop, transpose, and explore any
passage at your own pace. Real-time chord detection, hand-coloured keys,
interactive chord and scale explorers, a full mixer, and per-note editing — with
a piano roll that looks like it was built this decade.

It's not a game — no scoring, no streaks, no subscription. No account, no
telemetry; MIDI files are processed entirely on your device.

> **Image ·** `readme/hero.png` · **1600×1000** · _Orfeo mid-playback: falling notes on the 88-key keyboard, keys lit in track colours, the live chord name above._

## Contents

- [Features](#features)
- [Download](#download)
- [Documentation](#documentation)
- [Building from source](#building-from-source)
- [FAQ](#faq)
- [Why Orfeo](#why-orfeo)
- [License](#license)

---

## Features

### Piano Roll & Playback

- **Import** `.mid` / `.midi`, plus MusicXML, Guitar Pro, Capella, and karaoke
  `.kar` (converted automatically)
- **Falling-note piano roll** onto a 61 / 73 / 88-key keyboard, colour-coded per
  track, pixel-aligned to each key
- **Tempo control** — slow down or speed up without changing pitch; long-press
  the BPM arrows to glide to a target
- **Change key** — transpose the whole piece by semitones
- **Loop region** — draw a loop directly on the waterfall and drill any section
- **Metronome** — follows the file's embedded tempo map through mid-song changes
- **Tracks panel & Console Mixer** — mute, solo, recolour, show/hide tracks;
  per-channel volume, pan, chorus, reverb with live VU meters (saved into the
  file on close); master Tone and Compressor
- **Focus Mode** — narrow instantly to keys, bass, and drums
- **Presentation Mode** (`F11`) — distraction-free view of just the roll and
  keyboard

### Interactive Keyboard

- **Click or drag** to play; drag across keys for glissando
- **Docked or floating** — a draggable, resizable panel for multi-window setups
- **Key highlighting** in track colour, with the chord name shown live above
- **Automated hand assignment** *(beta)* — notes colour-code by which hand plays
  them, in Practice (moving split line) or Performance (per-note tags) mode, with
  optional colourblind-friendly L/R badges
- **Hardware MIDI input** — play along on a real keyboard with true sustain and
  multi-device support

### Chord & Scale Explorers

- **Chord Explorer** — browse and audition any chord in any key; filter by hand
  span or note count; cycle inversions; play progressions in seven voicing
  styles
- **Scale Explorer** — interactive Circle of Fifths; ten scale types, each with
  its diatonic chords and Roman numerals
- **Real-time chord detection** with three tracking modes (Classic, Harmony,
  Follow Instrument)
- **Chord Prompter** — a lead-sheet-style past / current / next readout synced
  to playback
- **Chord Transcription** *(beta)* — generate a printable chord chart PDF for
  any file
- **Lock-a-Chord** — `Shift`+click any 3+ keys to build and lock a chord, then
  cycle inversions

### MIDI Editing

- **MIDI Playback Editor** — exclude, rename, recolour, reassign instrument,
  merge, and split-hands tracks; saves as a new `_ORFEO_vN.mid` without touching
  the original
- **Note Editor** — move, resize, add, delete, and re-velocity individual notes
  on the roll, with marquee / lasso / pen tools and full undo/redo
- **MIDI library** — browse a folder, star favourites, fuzzy-search, auto-refresh
- **Edit history embedded in the file** — travels with the `.mid` anywhere,
  survives reinstalls

### Visual Flourishes

- **Hit effects** — seven optional particle animations where notes strike the
  keyboard (glow bloom, ripple ring, particle burst, smoke plume, colour aura,
  starburst nova, comet trail), with custom colour and a real bloom filter

### Audio

- **Master volume** — a physical-feeling toolbar knob, persists across sessions
- **Two engines** — **General MIDI** (instant, no download) or **Samples**
  (SpessaSynth + downloadable SF2/SF3 soundfonts, GeneralUser GS by default) for
  far richer sound

Full walkthrough of every feature: **[docs/HOW_TO_USE.md](docs/HOW_TO_USE.md)**.

---

## Download

Grab the latest build from the [Releases](https://github.com/Squarebow/Orfeo/releases)
page:

| File | Use |
|---|---|
| `Orfeo Setup <version>.exe` | Standard Windows installer — Start Menu shortcut, automatic updates |
| `Orfeo-<version>-portable.exe` | Portable — no installation, runs from anywhere, manual updates |

Not sure which, or want to know how they differ (auto-updates, where settings
live)? See **[docs/INSTALLATION.md](docs/INSTALLATION.md)**.

---

## Documentation

| Document | What's in it |
|---|---|
| [How to Use](docs/HOW_TO_USE.md) | The complete guide — Play, Edit, Practice, Manage files, Extras |
| [Shortcuts](docs/SHORTCUTS.md) | Every keyboard and mouse gesture |
| [Installation](docs/INSTALLATION.md) | Installer vs. portable, updates, where data lives |
| [Architecture](docs/ARCHITECTURE.md) | How Orfeo is built and why |
| [Changelog](docs/CHANGELOG.md) | Technical release history |
| [Contributing](docs/CONTRIBUTING.md) | Build from source, cut a release |

---

## Building from source

```bash
git clone https://github.com/Squarebow/Orfeo.git
cd Orfeo
npm install
npm run dev
```

Requires [Node.js](https://nodejs.org) 20 LTS or newer. Full build and release
instructions, including macOS/Linux, are in
[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

---

## FAQ

<details>
<summary><b>Is Orfeo free?</b></summary>

Yes — completely free and open source. No subscription, no paywalled features,
no account.

</details>

<details>
<summary><b>Does it need an account or an internet connection?</b></summary>

No. No login, no telemetry. MIDI files are processed entirely on your device.
The one exception is the optional Samples audio engine's one-time ~31 MB
soundfont download.

</details>

<details>
<summary><b>What platforms does Orfeo run on?</b></summary>

Windows 10/11 today, with an installer and a portable build. Orfeo is built on
Electron, so macOS and Linux builds are possible and community-buildable — see
[CONTRIBUTING.md](docs/CONTRIBUTING.md) — there just aren't official builds for
those platforms yet.

</details>

<details>
<summary><b>Does Orfeo support Finale, Sibelius, or MuseScore files?</b></summary>

Not their native formats directly — but all three export MusicXML, which Orfeo
imports and converts to MIDI automatically. Guitar Pro, Capella, and karaoke
`.kar` files are supported natively too.

</details>

<details>
<summary><b>What MIDI files work best?</b></summary>

Real, human-performed files with natural rubato and mid-song tempo changes —
Orfeo tracks the tempo map properly instead of assuming a flat click. Cleanly
quantized files work great too. Messy downloads can be cleaned up with the
Playback and Note editors without touching the original.

</details>

---

## Why Orfeo

Before Synthesia there was [Rondo](https://macsim.app/rondo/) — a lovely,
Mac-only MIDI learning app with a scrolling piano roll, tempo slowdown, and
track filtering. Development stopped and it no longer runs on modern macOS. The
alternative that filled the gap became expensive and gamified, and hasn't
meaningfully modernized in years.

Orfeo picks up Rondo's idea, rebuilt from scratch as an actively maintained,
cross-platform-capable app with one goal: **make the music itself — not the app
around it — the focus.** Free forever, no gamification, real rubato support,
open source, and a modern interface.

*Inspired by [Rondo](https://macsim.app/rondo/) (RIP).*

---

## License

GPL-3.0-or-later © [SquareBow](https://github.com/Squarebow) — see
[LICENSE.md](LICENSE.md). Bundles GSAP under a separate additional-permission
grant; see the license file and [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).
