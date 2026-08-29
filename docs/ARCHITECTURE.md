# Orfeo — Architecture

*Why Orfeo is built the way it is — the decisions, trade-offs, and reasoning a
new contributor needs before changing anything structural.*

This document explains **how the pieces fit together and why**. For build and
release mechanics see [CONTRIBUTING.md](CONTRIBUTING.md); for the user-facing
feature list see the [README](../README.md).

---

## Contents

- [Stack at a glance](#stack-at-a-glance)
- [Process model](#process-model)
- [Directory layout](#directory-layout)
- [Rendering — PixiJS / WebGL](#rendering--pixijs--webgl)
- [State — Zustand](#state--zustand)
- [Audio — two engines](#audio--two-engines)
- [MIDI parsing and foreign formats](#midi-parsing-and-foreign-formats)
- [Music theory — tonal.js](#music-theory--tonaljs)
- [Metadata embedded in the MIDI file](#metadata-embedded-in-the-midi-file)
- [Hand-assignment engine](#hand-assignment-engine)
- [Piano-roll hit effects](#piano-roll-hit-effects)
- [Auto-update](#auto-update)
- [Note-naming systems](#note-naming-systems)
- [Build and packaging](#build-and-packaging)

---

## Stack at a glance

| Layer | Choice | One-line reason |
|---|---|---|
| App framework | Electron + Vite + React 19 + TypeScript | One language end to end; the JS ecosystem has the richest MIDI / audio / music-theory libraries |
| Bundler | `electron-vite` | Clean main / preload / renderer split; 10–100× faster HMR than Webpack |
| Piano-roll rendering | PixiJS 8 (WebGL) + `pixi-filters` | Thousands of simultaneous notes at 60 fps |
| Animation | GSAP | Hit-effect particle systems (bundled under a GPLv3 §7 linking exception) |
| State | Zustand 5 | One global store, minimal boilerplate, first-class TypeScript |
| MIDI parsing | `@tonejs/midi` | Most mature parser in JS; handles format 0 / 1 / 2 |
| MIDI writing / meta events | `midi-file` | Low-level control for editor saves and custom meta events |
| Foreign-format import | `@coderline/alphatab` | MusicXML, Guitar Pro, Capella, and KAR → MIDI |
| GM Synth engine | `jzz` + `jzz-midi-smf` + `jzz-synth-tiny` | Instant playback, zero download; also drives hardware MIDI I/O |
| Samples engine | `spessasynth_lib` (SpessaSynth, AudioWorklet) | SF2 / SF3 soundfont playback for expressive sound |
| Music theory | `tonal` | Chord detection, scales, intervals, inversions |
| Chord-chart export | `pdfkit` | Client-side PDF generation, no native deps |
| Fuzzy search | `fuse.js` | Library search and Chord Explorer filtering |
| Auto-update | `electron-updater` | Windows only, by design (see below) |
| Styling | Tailwind CSS + CSS custom properties | Utility classes for layout; tokens for theming |
| Icons | `lucide-react` | Consistent single-weight icon set |

> [!NOTE]
> `tone`, `soundfont-player`, and `webaudiofont` still appear in
> `package.json` but are no longer used by `src/` — leftovers from earlier
> audio experiments, slated for removal.

---

## Process model

Electron splits the app into three contexts. Orfeo keeps a strict boundary
between them:

```text
┌─────────────────────────────┐     ┌──────────────────────┐     ┌────────────────────────────┐
│  Renderer  (src/)           │     │  Preload             │     │  Main  (electron/)         │
│  React, all UI, PixiJS,     │ ◄──►│  preload.ts          │ ◄──►│  main.ts                   │
│  Web Audio, Web MIDI        │     │  contextBridge only  │     │  Node.js, fs, dialogs,     │
│                             │     │                      │     │  auto-update, prefs I/O    │
└─────────────────────────────┘     └──────────────────────┘     └────────────────────────────┘
```

| Rule | Why |
|---|---|
| Renderer has **no** direct Node.js access (`contextIsolation` on, `nodeIntegration` off) | Standard Electron security posture — a malicious MIDI file can never reach the filesystem through the UI |
| `preload.ts` exposes a **fixed, explicit** API surface via `contextBridge` | The renderer can only call what was deliberately handed to it |
| File dialogs, reading/writing `.mid`, preferences, soundfont downloads, and update checks all live in **main** | Keeps privileged operations in one auditable place |

<details>
<summary><b>Why Electron and not .NET / C++?</b></summary>

- Web MIDI and Web Audio are built into Chromium — no platform audio drivers to
  ship or maintain.
- WebGL (PixiJS) is available in the renderer with no extra tooling.
- The MIDI, soundfont, and music-theory libraries Orfeo depends on are all
  JavaScript, and the mature ones have no C++/.NET equivalent.
- One language (TypeScript) across the whole codebase lowers the barrier for
  contributors.

</details>

---

## Directory layout

```text
electron/          Main process only — Node.js APIs, filesystem, dialogs, auto-update
  main.ts          App lifecycle, IPC handlers, prefs, demo-folder seeding
  preload.ts       contextBridge surface

src/               Renderer process — everything the user sees
  components/       UI, organised by feature area (Keyboard/, PianoRoll/, Mixer/, MidiEditor/, …)
  hooks/            React hooks that own the runtime logic (useAudioEngine, useSamplesEngine, useChordSequence, …)
  store/            Zustand global store (index.ts) — one OrfeoStore interface
  utils/            Pure functions, no React (chordDetection, handAssignment, midiParser, midiMetadata, …)
  types/            Shared TypeScript interfaces

public/            Bundled at build time — worklet, demo files, fonts, app icon
scripts/           Build helpers (license generation, hand-engine version check)
docs/              This documentation
build/             NSIS installer assets and script
```

| Folder | Contains React? | Contains Node? |
|---|:---:|:---:|
| `electron/` | No | Yes |
| `src/components/` | Yes | No |
| `src/hooks/` | Yes | No |
| `src/utils/` | No | No |
| `src/store/`, `src/types/` | No | No |

> [!TIP]
> The dependency direction is one-way: `components → hooks → store/utils → types`.
> Anything in `utils/` must stay a pure function so it can be unit-tested and
> reused from any layer.

---

## Rendering — PixiJS / WebGL

The falling-note piano roll is drawn on a single WebGL canvas managed by PixiJS,
not by React or the DOM.

<details>
<summary><b>Why not HTML Canvas 2D or SVG?</b></summary>

- Large scores (orchestral MIDI, 30+ tracks) put **thousands of note rectangles**
  on screen at once, all moving every frame.
- PixiJS batches these into a handful of WebGL draw calls — no frame drops even
  at that scale.
- SVG would create thousands of DOM nodes and repaint constantly; it collapses
  well before that note count.
- Canvas 2D is fine for small files but does not scale to full arrangements.

</details>

React still owns everything **around** the roll (toolbars, panels, modals);
PixiJS owns only the roll surface itself. The two communicate through the
Zustand store and a small set of refs, never by React re-rendering the canvas.

---

## State — Zustand

A single store (`src/store/index.ts`, one `OrfeoStore` interface) holds all
app state: loaded MIDI, playback position, per-track settings, keyboard config,
chord-tracking mode, every panel's open/closed flag, note-editor state, and so
on. Feature areas read and write it independently — they are otherwise
decoupled from each other.

<details>
<summary><b>Why not Redux?</b></summary>

- Near-zero boilerplate — a slice is just an object with functions.
- Built-in persistence middleware for user settings.
- Excellent TypeScript inference with no extra typing ceremony.
- Splitting into logical slices needs no reducers, actions, or middleware setup.

</details>

---

## Audio — two engines

Orfeo ships **two independent playback engines**. The user picks one in
**Settings → Audio**; the choice and master volume persist across sessions.

| Engine | Implementation | Sound | Setup | Best for |
|---|---|---|---|---|
| **GM Synth** | `useAudioEngine.ts` — lazy-loads `jzz`, `jzz-midi-smf`, `jzz-synth-tiny` | General-MIDI wavetable | Instant, nothing to download | Quick playback, low resource use |
| **Samples** | `useSamplesEngine.ts` — `spessasynth_lib` `WorkletSynthesizer` running `spessasynth_processor.min.js` as an AudioWorklet | SF2 / SF3 soundfonts | One-time download (~31 MB for GeneralUser GS) | Musical, expressive listening |

**GM Synth** first tries to open a real hardware MIDI-out port; if there is none
it falls back to JZZ's built-in `Tiny` synth. The same JZZ layer also handles
**hardware MIDI input** (play-along), with true sustain and multi-device
support.

**Samples** downloads soundfonts on demand into the app-data folder and caches
them. The catalog (GeneralUser GS, FluidR3 GM, MuseScore General) is data-driven
— adding an entry to the list is enough.

Both engines apply the same per-channel mixer state (volume, pan, chorus,
reverb, mute/solo) and feed the same [hit-effect queue](#piano-roll-hit-effects).

<details>
<summary><b>Design note — why a dedicated preview channel</b></summary>

Chord/scale previews (Lock-a-Chord, the Explorers) play on a reserved MIDI
channel — 14 for GM, 15 for Samples. Its program change is re-asserted before
every preview note, because a real track in the loaded file can legitimately use
that channel during normal playback and would otherwise leave the preview
channel set to the wrong instrument for the rest of the session.

</details>

---

## MIDI parsing and foreign formats

| Task | Library | Notes |
|---|---|---|
| Read a `.mid` / `.midi` file into a note model | `@tonejs/midi` | Handles all format types; wrapped by `src/utils/midiParser.ts` |
| Write edited files, inject custom meta events | `midi-file` | Byte-level control the high-level parser does not give |
| Import MusicXML / Guitar Pro / Capella / KAR | `@coderline/alphatab` | `src/utils/foreignFormatImport.ts` converts to MIDI, cached next to the source as `<name>_ORFEO_IMPORTED.mid` |

`midiParser.ts` also reads Orfeo's own meta events (see next section) so a file
re-opened in Orfeo restores its key, track names, colours, and edit history.

---

## Music theory — tonal.js

`tonal` powers chord detection, note spelling, scales, intervals, and
inversions. It is used live (the chord name above the keyboard) and throughout
the Chord and Scale Explorers.

**Chord detection** (`src/utils/chordDetection.ts`) has three tracking modes:

| Mode | What it follows |
|---|---|
| **Classic** | Onset clustering across all tracks — what attacks together |
| **General Harmony** | Sustain-aware — what is actually *ringing* at each instant, so a held chord under a moving melody stays named correctly |
| **Follow Instrument** | General Harmony scoped to one GM group (persisted) or one track in the current file (per-file), with fallback to General Harmony |

Candidate names are ranked by musical complexity, not string length, with a
fallback that tries inserting a hypothetical 3rd and accepts it only when tonal
agrees on the resulting root — this avoids obscure or wrong-root names for
common voicings that omit a note.

---

## Metadata embedded in the MIDI file

Orfeo writes its own state **into the `.mid` file** as MIDI text meta events,
rather than into a sidecar file in app-data.

| Meta event | Holds |
|---|---|
| `ORFEO_KEY:` | Detected / user-set key signature |
| `ORFEO_TRACK_NAME:N:` | Per-track rename from the Playback Editor |
| `ORFEO_TRACK_COLOR:N:#hex` | Per-track colour |
| `ORFEO_HISTORY` | Full edit history — every editor / mixer / tempo-key save |

<details>
<summary><b>Why embed instead of a sidecar file</b></summary>

An app-data sidecar was silently orphaned whenever the user switched between the
installed and portable builds, or did a clean uninstall. Embedding the data as
meta events makes it **part of the file** — it travels with the file to any
machine and survives any install change. The technique round-trips cleanly
because unknown text meta events are preserved by every conformant MIDI parser.

</details>

Edited files are saved as **`<name>_ORFEO_v{N}.mid`** (first edit is `v1`) inside
the library folder's `Orfeo/` subfolder — the original is never modified.

---

## Hand-assignment engine

`src/utils/handAssignment.ts` decides which hand plays each note. It is a
cost-minimisation model: notes are clustered by onset, harmonic links are
detected, and the assignment that minimises the total of movement cost, hand-
switch cost, collision rate, and inversion cost is chosen, then isolated
one-note flips are cleaned up.

Two presentation modes: **Practice** (a smoothly moving split line) and
**Performance** (per-note hand tags). Live hardware input has an adjustable
split sensitivity.

> [!IMPORTANT]
> The engine has a version constant, `HAND_ENGINE_VERSION`.
> `scripts/check-hand-engine-version.mjs` runs on every `dev` / `build` and
> fails the build if the constant was not bumped after the algorithm changed —
> so files carrying stale hand tags can be detected and re-analysed.

---

## Piano-roll hit effects

`src/components/PianoRoll/HitEffects.ts` — a `HitEffectsRenderer` class that
spawns PixiJS particle systems (glow bloom, ripple ring, particle burst, smoke
plume, colour aura, starburst nova, comet trail) where a note strikes the
keyboard, animated with GSAP. Both audio engines push strike events into a
shared queue (`src/utils/hitEffectQueue.ts`) that the renderer drains each
frame. Scope (which tracks spawn effects) and colour are user settings.

---

## Auto-update

`electron-updater`, wired in `electron/main.ts`, gated on
`process.platform === 'win32'` (`supportsAutoUpdate`).

<details>
<summary><b>Why Windows only</b></summary>

`electron-updater` assumes the running app was built and published through the
**same** pipeline as the update feed it checks. Community-built macOS/Linux
binaries are not — pointing their updater at Orfeo's official GitHub release
feed would either offer an "update" that does not match how the binary was
built, or silently never fire. On those platforms the Settings "Check for
updates" button opens the Releases page instead. Full detail in
[CONTRIBUTING.md → Releases and auto-update](CONTRIBUTING.md#releases-and-auto-update).

</details>

---

## Note-naming systems

A single global setting (`NoteNaming` in `src/types/index.ts`) applies
everywhere note names appear — keyboard labels, live chord display, both
Explorers:

| Setting | System | Example |
|---|---|---|
| `english` | Standard UK / US | C D E F G A **B** |
| `central-european` | Central European (Slovenia, Germany, Croatia, Czechia, …) | C D E F G A **H** — and **B** means B♭ |
| `solfege` | Latin syllables | Do Re Mi Fa Sol La Si |
| `hidden` | No labels | Keys shown without names |

The accidentals toggle (♭ / ♯) is a separate setting, also remembered between
sessions. All name formatting goes through `src/utils/noteNames.ts` — no
component hardcodes English names.

---

## Build and packaging

| Stage | Tool | Output |
|---|---|---|
| Compile main + preload + renderer | `electron-vite` (esbuild + Rollup) | `out/` |
| Package into an installer / portable exe | `electron-builder` (+ NSIS on Windows) | `release/` |

The renderer build is explicitly minified (`esbuild`), with
`legalComments: 'inline'` so every bundled dependency's license banner survives
into the output. Full command reference and the release procedure are in
[CONTRIBUTING.md](CONTRIBUTING.md).

---

### Related documents

- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, build commands, release process
- [INSTALLATION.md](INSTALLATION.md) — installer vs. portable, where data lives
- [SHORTCUTS.md](SHORTCUTS.md) — every keyboard and mouse gesture
- [CHANGELOG.md](CHANGELOG.md) — technical release history
