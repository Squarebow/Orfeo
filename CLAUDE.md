# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev        # start Electron + Vite dev server with HMR
npm run build      # compile renderer + main to out/
npm run dist       # build + package to release/ (.exe installer via electron-builder)
npm run typecheck  # tsc --noEmit (no test runner configured)
```

There is no test suite. Type-check is the only automated correctness check.

## Architecture

Orfeo is an **Electron desktop app** (Windows-first). The three Electron processes map directly to folders:

| Process | Entry point | Role |
|---|---|---|
| Main | `electron/main.ts` | File dialogs, prefs persistence, MIDI editor window, all IPC handlers |
| Preload | `electron/preload.ts` | Exposes `window.electronAPI` — the only bridge between renderer and Node |
| Renderer | `src/` | React app — everything the user sees |

`electron-vite` handles the build pipeline and HMR. Output goes to `out/`, packaged app goes to `release/`.

### Two windows, one renderer bundle

The **main window** and the **MIDI Playback Editor** both load the same renderer bundle. The editor is distinguished by the `#/editor` URL hash — `App.tsx` checks `window.location.hash === '#/editor'` and renders `<MidiEditor />` instead of the normal layout. In production the editor window is opened by `electron/main.ts` with `{ hash: 'editor' }`.

### State — Zustand store (`src/store/index.ts`)

Single store holding all UI state. Key slices:
- `midi: ParsedMidi | null` — the currently loaded file
- `tracks: TrackState[]` — per-track mute/solo/visible/showOnKeyboard/color
- `playbackState / currentTime / bpm / originalBpm` — transport
- `activeKeys: Set<number>` / `activeKeyColors: Map<number, string>` — which piano keys are lit
- `keyboardSize / keyboardMode` — 61 | 73 | 88 and docked | floating
- `noteNaming / accidentals / zoomLevel / appTheme` — display settings, persisted to prefs
- `libraryFolder / libraryFiles / libraryFavourites` — MIDI library, persisted to prefs

Settings persistence is done via two `useStore.subscribe` callbacks at the bottom of `store/index.ts` — they debounce writes to `window.electronAPI.setPrefs`. A `setTimeout(restoreLibraryPrefs, 500)` on startup restores saved values without blocking render.

### MIDI parsing (`src/utils/midiParser.ts`)

`parseMidiBuffer(buffer, fileName, filePath)` wraps `@tonejs/midi`. The returned `ParsedMidi` object has several private fields attached as `any` casts (not in the TypeScript type):
- `_raw: ArrayBuffer` — the original bytes, needed by the JZZ SMF player
- `_filePath: string` — used by the MIDI editor to read the source file
- `_rawMidiTracks` — raw `@tonejs/midi` track objects for the editor
- `_tempoMap: TempoEvent[]` — full tempo change map extracted from the MIDI header
- `_keySignature` — first key signature event if present

### Audio engine (`src/hooks/useAudioEngine.ts`)

Two backends, selected by `store.audioEngine`:
- **`'gm'` (default)** — JZZ + jzz-midi-smf + jzz-synth-tiny. The JZZ SMF player is stored on `window.__orfeoPlayer`. `buildPlayer(startSec)` creates a new player each time playback starts or BPM/transpose/tracks change. Key lighting is driven by a parallel `setTimeout` schedule (`_lightSchedule`), not by MIDI events.
- **`'sf2'`** — `useSF2Engine` (soundfont-player based, partially implemented). Self-gates when `audioEngine !== 'sf2'`.

Click-to-play on the keyboard goes through `window.__orfeoPlayNote`, which routes to the active backend.

### Playback clock (`src/hooks/usePlayback.ts`)

A `requestAnimationFrame` loop syncs `store.currentTime` to playback position. It prefers `window.__orfeoPlayer.positionMS()` (JZZ player clock); if that's unavailable it falls back to `performance.now()` arithmetic. The `bpm / originalBpm` ratio is applied in both paths for tempo scaling.

### Piano roll (`src/components/PianoRoll/PianoRoll.tsx`)

Rendered with PixiJS (WebGL). The visible MIDI range is determined by `keyboardSize` via a `RANGES` dict matching `Keyboard.tsx` exactly (61: 36–96, 73: 28–103, 88: 21–108). Zoom level controls `VISIBLE_SECONDS`. Subscribes to `store.currentTime` to advance the playhead.

### IPC boundary

All Electron APIs are accessed through `window.electronAPI` (defined in `src/types/index.ts`). The renderer never uses Node APIs directly. New IPC channels need to be added in three places: `electron/main.ts` (handler), `electron/preload.ts` (expose), and `src/types/index.ts` (type).

### Prefs persistence

`orfeo-prefs.json` lives in Electron `userData` (`%APPDATA%\Orfeo`). The main process reads/writes it via `prefs:get` / `prefs:set` IPC. Currently persists: `libraryFolder`, `libraryFavourites`, `noteNaming`, `accidentals`.

## Conventions

- **Note naming**: `convertAccidentals()` in `src/utils/noteNames.ts` is the single converter — all display paths route through it. Never convert flat↔sharp inline.
- **GM instrument groups**: defined in `src/utils/gmInstruments.ts`. Groups drive auto-mute on file load and the `showOnKeyboard` flag.
- **Track colors**: assigned by index from `TRACK_COLORS` in `midiParser.ts` at parse time.
- **Design tokens**: `#e8a027` amber accent, `#707088` inactive UI, `#b0b0cc` active/value text, `#404055` dim labels. Defined in `src/index.css`.
- **Drag region**: `.app-drag-region` / `.app-no-drag` CSS classes defined in `index.css` — the topbar is the drag region; interactive elements must carry `app-no-drag`.

## Working conventions
- Always show a plan before writing any code
- One git branch per task: fix/description or feature/description
- Test visually on the running app before marking anything done
- Never touch JZZ.js playback engine or PixiJS waterfall unless explicitly asked
- Do not add co-author attribution to commit messages

## Note naming
- Central European (EU) naming uses H for B natural — this is intentional, never change it
- All note display routes through convertAccidentals() in noteNames.ts — never convert inline

## Current status (June 2026)
- v0.5.2 — Scale Explorer implemented: Circle of Fifths SVG, 10 scale types, diatonic chord grid, progressions, inversions, footer ‹ PLAY INVERSION ›, Chord Explorer ↔ Scale Explorer switching
- Next task: Visual testing of Scale Explorer (dev server was started but session ended before confirming render); then whatever the user specifies
- Known unresolved: TrackPanel SVG crash, Chord Explorer search unreliable

## Audio
- JZZ.js is the active MIDI playback engine (replaced Tone.js)
- player.play() must precede player.jumpMS() for correct seek behaviour
- Mute/solo via real-time filter callback — never rebuild the player
- SF2 soundfont engine exists but partially implemented
- window.__orfeoPlayNote routes click-to-play to active backend

## Scale Explorer architecture (src/components/ScaleExplorer.tsx)
- `scaleExplorerOpen` / `setScaleExplorerOpen` added to Zustand store (same pattern as `chordExplorerOpen`)
- Triggered by "Scales" amber label on RIGHT side of Keyboard.tsx chord bar; "Chords" stays on LEFT
- `cofPos: number | null` (0–11) + `cofRing: 'major' | 'minor' | null` — CoF selection state
- `selectedRoot = cofRing === 'major' ? COF_MAJOR_PC[cofPos] : COF_MINOR_PC[cofPos]` (pitch class)
- Clicking outer ring → root + Major scale; clicking inner ring → root + Natural Minor
- `SCALES` array (10 entries): Major, Natural Minor, Harmonic Minor, Melodic Minor, Maj/Min Pentatonic, Dorian, Phrygian, Lydian, Mixolydian — each has `intervals[]` and `romans[]`
- `buildDiatonicChord(root, intervals, degree, keyboardSize, naming, accidentals)` — stacks every-other scale degree (deg, deg+2, deg+4) for triad, uses `Chord.detect(Note.fromMidi[])` for chord quality
- `ROMAN_TO_DEGREE` mapping drives progression playback — each progression label maps to scale degree index, clamped with `% diatonicChords.length` for pentatonic
- `applyNthInversion` identical to ChordExplorer version
- Footer ‹ PLAY INVERSION ›: same pattern as ChordExplorer, uses `inversionStep` state + `currentBaseMidi` from selected degree
- ChordExplorer "Scale Explorer →" button: `setChordExplorerOpen(false); setScaleExplorerOpen(true)`; Scale Explorer "Chord Explorer →" does the reverse
- Both explorers force 61-key layout; font size conditions in Keyboard.tsx use `chordExplorerOpen || scaleExplorerOpen`
- Space/Escape in App.tsx is blocked when either explorer is open

## Known Issues
- Chord Explorer search needs logic rewrite — currently unreliable across naming systems
- TrackPanel SVG crash (pre-existing, unresolved)
- Scale Explorer visual testing not yet confirmed (session ended before visual check)

## Git rules
- Do not add co-author attribution to commit messages
- Commit messages should be plain, no Claude signature
- After every code edit, suggest a one-line git commit message summarising what was changed
- At the end of every session, update CHANGELOG.md with a brief summary of what was changed