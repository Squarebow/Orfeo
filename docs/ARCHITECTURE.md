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
- [MIDI keyboard input](#midi-keyboard-input)
- [MIDI parsing and foreign formats](#midi-parsing-and-foreign-formats)
- [Music theory — tonal.js](#music-theory--tonaljs)
- [Chord and Scales Explorers — shared logic](#chord-and-scales-explorers--shared-logic)
- [Metadata embedded in the MIDI file](#metadata-embedded-in-the-midi-file)
- [Tap Tempo — beat-grid corrections](#tap-tempo--beat-grid-corrections)
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
  utils/            Pure functions, no React (chordDetection, chordVocabulary, chordSequenceBuilder, trackChordRole, beatGrid, handAssignment, midiParser, …)
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

## Audio — three engines

Orfeo ships **three independent playback engines**. The user picks one in
**Settings → Audio**; the choice and master volume persist across sessions.
The rest of the app reaches the active one only through `src/audio/engine.ts`
(output delay, mixer, master section), so no code ever assumes "not Samples
means General MIDI".

| Engine | Implementation | Sound | Setup | Best for |
|---|---|---|---|---|
| **GM Synth** | `useAudioEngine.ts` — lazy-loads `jzz`, `jzz-midi-smf`, `jzz-synth-tiny` | General-MIDI wavetable | Instant, nothing to download | Quick playback, low resource use |
| **Samples** | `useSamplesEngine.ts` — `spessasynth_lib` `WorkletSynthesizer` running `spessasynth_processor.min.js` as an AudioWorklet | SF2 / SF3 soundfonts | One-time download (~31 MB for GeneralUser GS) | Musical, expressive listening |
| **Native (beta)**, Windows | `src/audio/useNativeEngine.ts` → `electron/audioHost.ts` (utility process) → `native/orfeo-audio` (Rust: FluidSynth + WASAPI) | Same SF2 / SF3 sets | Built with the app (`npm run native:build`) | Playing a MIDI keyboard: ~10 ms key → speaker |

**GM Synth** plays through JZZ's built-in `Tiny` synth. It opens a hardware
MIDI-out port only when the user picks one in *Settings → MIDI Keyboard →
General MIDI sound* (`midiSettings.gmOutput`). It never picks the "first port
there is": Chromium hides Windows' GS Wavetable Synth, so with a USB keyboard
plugged in the first output is the keyboard's own port, and songs and live keys
would be sent back to a controller that has no speakers.

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

### Native engine

- **Where it runs:** a Rust engine (`native/orfeo-audio`) wrapped as a Node
  add-on (`native/orfeo-audio-node`, napi-rs), loaded only inside an Electron
  **utility process** (`electron/audioHost.ts`). A crash there restarts the
  sound (`nativeClient.ts` re-starts it and re-sends the song); Orfeo itself
  keeps running. Main only introduces the renderer and the host through a
  `MessageChannelMain`; commands and ~30 Hz status flow over that port.
- **Engine:** one audio thread owns WASAPI and FluidSynth (2.5.7 *glib* build —
  the glib-free builds crash with ≥ 8 audio groups). It plays the song from a
  flat time-sorted event list, splitting each period at event times, mixes the
  16 channels itself (song CC7 × fader ÷ the song's first CC7 — `src/audio/songVolume.ts`,
  shared with Samples, which plays the same CC7/CC11 moves; pan is CC10 to
  FluidSynth, which pans each voice — a stereo pair's sides separately — as
  spessasynth does; mute fades; meters). Reverb and chorus are not
  FluidSynth's (both off): each channel's send, level × (the preset's own send
  from the sound set + CC91/CC93) on the channel's L + R, corrected for mono vs
  stereo samples and pan (`sf2.rs` reads the presets' generators;
  REVERB_LEVEL / CHORUS_LEVEL measured against spessasynth), feeds
  `reverb.rs`: a sample-exact port of the plate Samples plays (spessasynth's
  Dattorro at its starting values — Orfeo never sends the GS reset that would
  load Hall 2), and its chorus at starting values (no depth or rate: the send,
  one sample late, at half level). Parity is measured,
  not assumed: render the same song through both synths and compare each
  part's level, reverb and chorus (local tool, docs/Tools/engine-parity).
  It runs auto-level → compressor → safety limiter (no look-ahead) → tone on the song bus only, then
  a look-ahead brickwall (`Brickwall`, -0.1 dBFS ceiling — where the Samples engine's safety limiter lets peaks reach — 2 ms, song + clicks only), adds live
  keys, metronome clicks (own bus, not on the master fader) and count-in clicks
  on its own clock, and soft-clips. Exclusive mode (~3–4 ms periods; *Low latency*, on only
  while a MIDI keyboard is connected, not saved) with automatic shared fallback. An exclusive stream skips Windows' software
  volume, so when the device has no hardware volume the engine applies the
  endpoint volume and mute itself (polled ~20×/s, before the soft clip); follows the default device, survives unplugs,
  steps its buffer up if the device signals late; MMCSS "Pro Audio" priority.
  Speed check: an exclusive stream counts the frames the device frees on
  on-time wake-ups over 2 s against the clock (`Stats.measured_rate`); more than
  3 % off the nominal rate (a pro interface clocked at another rate than
  Windows' format) and within 1 % of a standard rate, the device is reopened
  exclusive at that rate (`synced`, FluidSynth rebuilt) and checked again. A
  second miss, no standard rate, or still late at the largest buffer, and that
  device gets the shared stream for the rest of the session, with
  `fallback_reason` shown in Settings › Audio and in the MIDI keyboard log.
- **Renderer:** `useNativeEngine.ts` turns store changes into commands
  (song, transport, tempo, transpose, mute/solo, programs, mixer, metronome) and
  schedules only the visuals (key lights, hit effects) delayed by the engine's
  real output delay. Count-in arms the start on the engine clock
  (`armStart`), so the first note is exactly one beat after the last click.
- **Keyboard:** Windows MIDI ports are usually single-client, so the renderer
  keeps Web MIDI (all MIDI Keyboard settings apply) and forwards live keys.
- **Switching away** awaits `stopNative()` — an exclusive stream must be
  released before a Web Audio engine can open the device.
- **Tests:** `native/orfeo-audio` has `orfeo-selftest` (21 numeric checks on
  the real device) and `orfeo-engine` (plays a file, prints the device every
  2 s — the unplug test).

---

## MIDI keyboard input

`src/hooks/useMidiInput.ts` owns the one Web MIDI connection
(`navigator.requestMIDIAccess`). Settings and live device state live in their
own small store, `src/store/midiSettings.ts`, persisted under the
`midiSettings` key of `orfeo-prefs.json`. It's a separate store so that
activity lights and pedal detection don't wake every main-store subscriber on
each key press.

- **Devices.** Windows lists one keyboard as several ports (`MIDIIN2 (…)`,
  `… MIDI`). `utils/midiDeviceNames.ts` cleans each port name to the model name,
  and all ports with the same model name count as one device. The top bar shows
  the device last played; Settings lists them all, with *listen to all / only
  ticked*. The first time a device is ever seen, the Settings window opens on
  *MIDI Keyboard* (once per device, `seenDevices`).
- **Note path.** Sound first, display second: the handler calls the engine's
  `liveNoteOn` straight away, then updates `activeKeys` / `midiHeldKeys`. A
  store update runs every subscriber synchronously, and none of that should
  sit between the key and the synth. Touch response, the ignore-light-touches
  floor and the double-note filter run before the sound; a dropped note-on also
  swallows its matching note-off.
- **Pedals and controls.** CC 64/66/67/1/11/7, pitch bend and both aftertouch
  kinds are forwarded on the live channel (15) when enabled. Each one is marked
  *detected* the first time it arrives, because Web MIDI exposes no capability
  list. Unplugging a keyboard or hiding the window releases its keys and
  returns only the controls the keyboard actually moved to neutral, so a song
  track that also uses channel 15 isn't cut off.
- **Live path (Samples).** Every `DynamicsCompressorNode` delays its output by
  a fixed 6 ms look-ahead, measured even at a 1:1 ratio. The master chain has
  two (the user compressor and the safety limiter), so routing live notes
  through it costs 12 ms. The worklet has one output per channel (0 = effects,
  1–16 = channels 0–15). Output 16 (channel 15) goes to its own gain → tone →
  zero-delay soft-clip path, unless *Live playing response* is *Balanced* or
  the loaded song has a real track on channel 15 (`applyLiveRouting`). The
  AudioContext is created with `latencyHint: 'interactive'` explicitly;
  *Stable* uses `'playback'`, measured at +10 ms, from the next start.
- **What can't be lowered in the app.** Chromium on Windows uses shared-mode
  WASAPI with a 10 ms buffer. Asking for less (`latencyHint` numbers,
  `--audio-buffer-size`, low-latency feature flags) measured no change, and the
  rest of `outputLatency` is the Windows mixer and the driver. *Audio delay
  offset* adds to the measured output delay for alignment only (key lights,
  count-in, tap reading). It never claims to make sound earlier.
- **Diagnostics.** `utils/midiDiagnostics.ts` records, per note, the event's
  receive timestamp → handler start, and handler start → synth call. Settings
  combines these with the synth block (128 samples), the chain delay and the
  measured output into *Key → speaker*. *Save log…* downloads all of it as JSON
  for bug reports.

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

**Chord detection** — the live chord name above the keyboard.
`src/hooks/useChordSequence.ts` picks which track(s) feed the detector per the
tracking mode; `src/utils/chordSequenceBuilder.ts` does the detection
(beat-synchronous pitch-class analysis matched against a curated common-chord
set, in `src/utils/chordVocabulary.ts`); `src/utils/trackChordRole.ts` scores
tracks to find the chord instrument for Auto mode.

| Mode | What it follows |
|---|---|
| **Auto** | Detects from all non-drum tracks except the bass and any monophonic melody line — the full harmonic bed, so it never goes blind when one instrument rests. Default. |
| **Harmony** | All non-drum tracks pooled |
| **Follow Instrument** | Scoped to one GM group (persisted) or one track in the current file (per-file); falls back to Harmony |

The mode only chooses the track scope. A single persisted **chord sensitivity**
value (`store.chordSensitivity`, 0–1, default 0.4) is passed straight to
`buildChordSequence` as `sensitivity` and controls how finely the beat is split
into separate chords — same knob for every mode.

Detection is restricted to a curated set of common chord types
(`chordVocabulary.ts`); tonal.js's full dictionary is only consulted, via
`chordDetection.ts`, for the paused right-click / Chord Explorer paths and only
surfaces an exotic name when nothing common fits.

---

## Chord and Scales Explorers — shared logic

The two Explorers (`ChordExplorer.tsx`, `ScaleExplorer.tsx`) are separate
windows, but everything they have in common runs through the same code, so a
change to one rule lands in both:

| File | What it owns |
|---|---|
| `src/utils/explorerShared.ts` | Progression list + rotations (`ALL_PROGRESSIONS`), `resolveProgressionStep` (a step's chord = key + semitone offset, quality from the numeral as written, optionally re-voiced by a Style), playback speeds, the 61-key range, the starting register (`explorerLowRoot`, roots in C3–B3 moved by the octave control), inversion stepping, `ringChord` (clicked chords, pedal-like ring), `strikeStep` (rolled sequence steps), `inversionOf`, `explorerKeyColors` (amber + chord root in pink), `captureStruckShape` / `restoreStruckShape` (the inversion ↺: back to the shape before the first arrow press, octave-shifted), the voicing-mode icons |
| `src/utils/voiceLeading.ts` | `nextVoicing` / `voiceProgression` — the three voicing modes: **Roots** (root position, rising, wraps back to the anchor octave), **Climbing** (inversions stepping upward, restarts low past a ceiling), **Smooth** (least movement, pulled to a home position) |
| `src/utils/starmap.ts`, `src/components/Starmap/`, `src/hooks/useStarmapMorph.ts` | Scales Explorer's Starmap view — made available by Settings › Appearance (`store.starmapEnabled`), shown by the explorer's own STARMAP switch (session state, Circle of Fifths default). Glide: `pairVertices` (shared notes stay, rest least-arc matched), OKLab `mixColour`, ≤400 ms and ≤60 % of a progression step, reduced-motion snap. Held MIDI chords (`store.midiHeldKeys`, written only by useMidiInput) of 3–6 notes take over the star while held (40 ms settle), drawing only. 12-note chromatic ring drawn in the Circle of Fifths' slot, chord star from the explorer's lit chord (`litChord`, set beside each struck chord), scale outline, blue note (`ScaleDef.blueNote`), note colours `PITCH_CLASS_COLORS` (utils/colors.ts). Keys picked through the same `pickKey` as the wedges |
| `src/utils/genreVoicing.ts` | Chord Explorer Styles (9) — numeral × quality → richer chord type, Classic chord where a Style has none; `isTritoneSub` (Ipanema: a V resolving down a fifth → ♭II7♯11). Style chords missing from the curated tile list resolve from the full chord dictionary |
| `src/components/ExplorerOctaveControl.tsx` | Octave ˄ ˅ ↺, writes the shared `store.explorerOctave` (session-only) and moves lit keys with it |

Shared store fields: `progressionVoicing` (persisted), `colorRootNoteEnabled`
(persisted, the "Accent root note" switch), `explorerOctave` (session-only).

Scales Explorer specifics: each tile's voicing comes from running the whole row
(plus the octave tile) through `voiceProgression` under the current mode, so
tiles, the "Chords in the Scale" run and the keyboard always agree. Blues
scales define their tiles explicitly (`ScaleDef.chords`) as chords played over
the scale rather than stacked from it. Progressions play as written, so a step
can fall outside the selected scale; a step matching a tile lights that tile.
Layout: explorer area (circle, tiles, info row) on the left, a settings
column on the right (`SettingRow`: control left, title + description right).
The window opens centred with its bottom edge measured onto the keyboard's
chord header (`defaultPos` + a one-shot layout effect).

Every draggable floating window carries `app-no-drag` on its root: the top
bar is the window's drag region, and Electron gives that region the click
even when a modal is drawn on top of it.

Chord Explorer specifics: tiles are root position from the anchor octave,
except in Smooth, where a tile clicked while a chord is lit takes the nearest
voicing to it.

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

## Settings — Setup and the Settings window

Every setting is defined once and drawn in two places: **Setup** (the left
panel's second tab, the everyday shortlist) and the **Settings window** (a
portal modal with every setting). Both read and write the same store fields,
so nothing is duplicated.

```text
src/components/Settings/
  catalog.ts        Words only: the 9 groups (name, intro, manual URL, and
                    optional tabs: MIDI Keyboard splits its cards into three,
                    two columns across), every
                    setting's name, one-line summary (Setup) and description
                    (window), search keywords, and QUICK_LAYOUT — which
                    settings Setup shows, in what order
  defs/*.tsx        Controls only, one file per group: each setting's control
                    (switch / buttons), optional at-a-glance line (both places),
                    follow-up options (window only), rich description
  SettingCard.tsx   A window card       QuickRow.tsx       A Setup row
  SettingsWindow.tsx  The window        QuickSettings.tsx  The Setup tab body
  search.ts         searchSettings(), gridColumns() — pure, unit-tested
  controls.tsx      Shared pieces (Switch, OptionBtn, steppers, UpdateButton…)
```

- **Adding a setting:** a catalog entry (same `id`) + a def in its group file
  (+ an id in `QUICK_LAYOUT` if it belongs in Setup). `catalogTest.ts` checks
  every catalog entry has a def and vice versa.
- **Store:** `settingsWindowOpen` / `settingsWindowGroup` (session only),
  `openSettingsWindow(group?)` (`Ctrl` `,`, Setup's arrows, Open settings) and
  the saved `samplesIntroduced` flag (first Samples pick opens the window).
- **Shared hooks** for state both places show: `useSoundfonts` (sound sets,
  Samples loading), `useUpdateCheck`, `useAppZoom`. The update-status and
  sound-set-progress IPC channels allow only one listener each, so their
  services (`useUpdateService`, `useSoundfontService`) are mounted once, in
  `App.tsx`.

---

## Tap Tempo — beat-grid corrections

Some files carry wrong tempo metadata while their notes are timed correctly.
Tap Tempo replaces only the **beat layer** of the parsed file — `_beatTimes`,
`_barTimes`/`_barStarts`, `_tempoMap`, `_timeSigMap` — from a chosen point
onward. Every consumer (piano-roll bar lines, metronome, bar counter, BPM /
time-signature readout, chord detector) already reads those fields, so none of
them needed changes. Note times, audio, and `bpm`/`originalBpm` (the speed
control's ratio) are never touched.

| Piece | File | Role |
|---|---|---|
| Tap fit | `src/utils/tapTempoFit.ts` | Taps → one steady period + the time of beat 1; missed / doubled / stray taps rejected |
| Snap to notes | `src/utils/tapRefine.ts` | Searches ±2% tempo / ±80 ms phase around the fit for the grid that best matches weighted note onsets (kick, snare, bass heaviest); keeps the taps if the notes don't clearly line up. `matchFileBeat` detects taps sitting on the file's own beats at ×1 / ×2 / ×½ |
| Grid rewrite | `src/utils/tempoCorrection.ts` | `TempoSegment`s (start, anchor, period, beats per bar) → rewritten beat layer; a segment with `snap` passes the file's own bars / time signatures through and only rescales the tempo number (double-time files) |
| Session | `src/utils/tapTempoSession.ts`, `src/hooks/useTapTempo.ts` | Arm → tap (Space / MIDI note-on) → result → keep / adjust / cancel; taps stamped in *heard* time (output-latency compensated) |
| UI | `src/components/Transport/TapTempoPad.tsx` | TAP pad, result panel, right-click list of kept tempos |

Corrections are stored in the app prefs (`tempoCorrections`), keyed by a hash
of the file's bytes (`src/utils/songIdentity.ts`), so they follow a file
through renames and moves without modifying it; saving a new `_ORFEO_vN`
version carries the correction over (rescaled when a speed change is baked
in). `store.setMidi` applies a song's correction on load; `setBeatGrid` swaps
the grid live during a preview without restarting playback, and the
metronome re-maps its scheduling position by time when the beat array changes
(`src/utils/metronomeResume.ts`).

**Tempo warnings** (`src/utils/tempoTrust.ts`) reuse the same note-onset
weighting. Per 20 s window they compare the share of the file's beats that
land on a strong note against the best steady beat the notes suggest (inter-
onset histogram candidates, phase + ±2% tempo search). A song is flagged only
when the file's grid misses **and** a steady beat clearly fits through most of
the song, which keeps free-time music out. Library songs are checked in the
background (`src/utils/tempoTrustScan.ts`, `src/hooks/useTempoTrustScan.ts`)
from a lean parse (`src/utils/tempoTrustAnalyze.ts`) sharing the parser's grid
builder (`src/utils/beatGridBuild.ts`); results are cached by song key with a
path → size/mtime index so unchanged files are never re-read.

**Count-in** (`src/utils/countIn.ts`, `src/utils/countInRunner.ts`,
`src/hooks/useCountIn.ts`) plans N bars of clicks on the effective beat grid
extended backwards (empty lead-in skipped, pickups respected, mid-song starts
counted into the bar), schedules them on the metronome's shared AudioContext,
and has the sound engine prepare itself during the clicks (the GM engine
pre-builds its JZZ player via `__orfeoPrepareStart`). Playback is started
early by the engine's learned start-up time so the first note lands one beat
after the last click; the metronome is handed the same audio-clock anchor
(`setMetronomeAnchor`) so song clicks continue seamlessly. Only user-started
plays count in (`usePlayback.play`), never scrub blips or loop wraps.

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
