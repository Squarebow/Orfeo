# CLAUDE.md

Guidance for Claude Code when working in this repository.

---

## Commands

```bash
npm run dev        # Electron + Vite dev server with HMR
npm run build      # compile to out/
npm run dist       # package to release/ (.exe installer)
npm run typecheck  # tsc --noEmit — only automated check, no test suite
```

---

## What is Orfeo

A Windows desktop Electron app for learning piano via MIDI visualisation. Users load a MIDI file, watch notes fall onto a virtual keyboard, explore chords and scales, and hear playback through two audio engines.

Three Electron processes:
- **Main** (`electron/main.ts`) — file dialogs, prefs, IPC handlers, MIDI editor window
- **Preload** (`electron/preload.ts`) — exposes `window.electronAPI` to the renderer
- **Renderer** (`src/`) — the entire React UI

The **main window** and the **MIDI Playback Editor** both load the same renderer bundle. The editor is distinguished by the `#/editor` URL hash — `App.tsx` checks `window.location.hash === '#/editor'` and renders `<MidiEditor />` instead of the normal layout.

---

## Key Files

| File | What it does |
|---|---|
| `src/store/index.ts` | Single Zustand store — all app state lives here |
| `src/hooks/useAudioEngine.ts` | GM engine (JZZ); switches between backends |
| `src/hooks/useSamplesEngine.ts` | SpessaSynth + GeneralUser GS SF2 engine |
| `src/hooks/usePlayback.ts` | rAF loop syncing `currentTime` to player clock; handles loop region repeat |
| `src/hooks/useMidiInput.ts` | Web MIDI API hardware input — merges all devices, routes to active engine |
| `src/utils/noteNames.ts` | All note name display — always use `convertAccidentals()` |
| `src/utils/midiParser.ts` | `parseMidiBuffer()` — wraps @tonejs/midi, attaches private fields |
| `src/utils/chordDetection.ts` | Chord detection, inversion display, `formatInversionDisplay()` |
| `src/utils/handBoundaries.ts` | `detectHandBoundaries()` — two-track dominant-register + single-track split fallback |
| `src/components/Keyboard/Keyboard.tsx` | Virtual piano keyboard + chord bar |
| `src/components/Keyboard/KeyboardControls.tsx` | Footer bar: hand label lines, split-zone fill, key range controls |
| `src/components/LoopRegionStrip.tsx` | 24px canvas strip for drag-to-select loop bar range; bar-snapping |
| `src/components/PianoRoll/PianoRoll.tsx` | PixiJS WebGL waterfall |
| `src/components/ChordExplorer.tsx` | Chord Explorer modal |
| `src/components/ScaleExplorer.tsx` | Scale Explorer modal + Circle of Fifths SVG |
| `electron/preload.ts` | Any new IPC channel must be added here + `main.ts` + `src/types/index.ts` |

---

## Critical Rules — Never Break These

- **Never touch JZZ playback engine or PixiJS piano roll** unless explicitly asked
- **Never convert note names inline** — always route through `convertAccidentals()` in `noteNames.ts`
- **Never call `Chord.detect()` on an already-inverted note set** — detect once on root position, store the name, cycle inversions from there
- **PC 10 (Bb/A#) is always `Bb`** — `A#` does not exist in any naming system in Orfeo
- **Central European (EU) naming uses `H` for B natural** — intentional, never change it
- **New IPC channels need three edits**: `electron/main.ts` + `electron/preload.ts` + `src/types/index.ts`
- **PianoRoll RANGES must stay in sync with Keyboard.tsx** — both use `{ 61: 36–96, 73: 28–103, 88: 21–108 }`; if one changes, update both

---

## Note Naming

All display routes through `convertAccidentals()` in `src/utils/noteNames.ts`. Never convert inline.

- `noteNaming` values: `'english'` | `'central-european'` | `'solfege'` | `'hidden'`
- EU naming: H = B natural, B = Bb — intentional, never change
- PC 10 is always spelled `Bb` — `ENGLISH_SHARP[10]` is `'Bb'`; `convertAccidentals` sharp mode normalises `A#` → `Bb`
- When `noteNaming === 'hidden'`, components fall back to `'english'` for internal logic

---

## Audio Engines

| Engine | Key | How it works |
|---|---|---|
| GM Synth | `'gm'` | JZZ + jzz-synth-tiny; player on `window.__orfeoPlayer`; `buildPlayer(startSec)` creates a new player each playback start |
| Samples | `'samples'` | SpessaSynth + GeneralUser GS SF2; wired via `useSamplesEngine.ts`; singleton synth, note schedule via `setTimeout` |

- `window.__orfeoPlayNote` — click-to-play; routes to whichever backend is active
- `window.__orfeoPlayNoteSamples` — registered by `useSamplesEngine` for direct sample playback
- `window.__orfeoNoteOn` / `window.__orfeoNoteOff` — registered by `useAudioEngine`; sustained note-on/off for hardware MIDI (JZZ ch 15)
- `window.__orfeoNoteOnSamples` / `window.__orfeoNoteOffSamples` — registered by `useSamplesEngine`; sustained note-on/off for hardware MIDI (SpessaSynth ch 15)
- Key lighting: driven by a parallel `setTimeout` schedule (`_lightSchedule`), not by MIDI events
- Hardware MIDI: `useMidiInput.ts` uses Web MIDI API (no package needed in Electron); all devices merged; writes directly to `activeKeys`/`activeKeyColors`, routes audio via the `__orfeoNoteOn/Off` globals
- `player.play()` **must** precede `player.jumpMS()` — reversing breaks seek

---

## State & Persistence

Single Zustand store at `src/store/index.ts`. Persisted to `orfeo-prefs.json` in Electron `userData` (`%APPDATA%\Orfeo`) via `prefs:get` / `prefs:set` IPC.

Currently persisted: `libraryFolder`, `libraryFavourites`, `noteNaming`, `accidentals`, `masterVolume`, `audioEngine`, `showBarNumbers`, `chordPrompterEnabled`, `chordTranscriptionEnabled`, `hideDemoFolder`, `splitBreakpointType`, `splitBreakpointNote`, `splitBreakpointRangeStart`, `splitBreakpointRangeEnd`, `showHandLabels`, `loopRegionEnabled`.

Two `useStore.subscribe` callbacks at the bottom of `store/index.ts` write prefs on change. A **null sentinel** skips the very first fire (app init) to avoid overwriting values before `restoreLibraryPrefs` runs — do not remove it.

`setTimeout(restoreLibraryPrefs, 500)` restores saved prefs after render — do not move this into a component.

---

## Non-Obvious Architecture

**ParsedMidi private fields** — `parseMidiBuffer` attaches these as `any` casts (not in the TypeScript type):
- `_raw: ArrayBuffer` — original bytes, needed by JZZ SMF player
- `_filePath: string` — used by MIDI editor to read source file
- `_rawMidiTracks` — raw @tonejs/midi track objects for the editor
- `_tempoMap: TempoEvent[]` — full tempo change map from MIDI header
- `_keySignature` — first key signature event, if present

**Mute/solo** — handled via real-time JZZ filter callback; never rebuild the player for this.

**BPM scaling** — `bpm / originalBpm` ratio applied in both the rAF clock and the samples schedule.

**Chord Explorer search (Fuse.js)** — tonal.js `aliases` are excluded from Fuse keys because they contain long English words ("minor", "dominant") that produce spurious single-letter matches. Search keys: `typeName`, `notes`, `numerics` (and `display` in `both` scope).

**Loop Region** — `loopStart` / `loopEnd` / `loopRegionActive` reset to null/false on every file load and app reset. `loopRegionEnabled` (whether the strip is active) is persisted. JZZ looping uses in-place seek; samples engine loops via pause → play state transition. `LoopRegionStrip.tsx` is a canvas element — set `draggable=false` and `onDragStart` preventDefault or native HTML5 drag reaches Electron's file-drop handler.

**Hand Labels** — `detectHandBoundaries()` in `handBoundaries.ts` takes track data; tries two-track dominant-register detection first, falls back to single-track split at `splitBreakpointNote`. Result rendered as amber lines in `KeyboardControls.tsx`, not inside `Keyboard.tsx`.

**Zustand + useSyncExternalStore** — never use an object selector (e.g. `useStore(s => ({ a: s.a, b: s.b }))`) as it creates a new object every render and breaks the snapshot invariant, crashing the renderer. Use separate primitive selectors and derive the combined value in the render body.

---

## Design Tokens

```
#e8a027  amber accent (active states, highlights)
#707088  inactive UI text/icons
#b0b0cc  active/value text
#404055  dim labels
#0f0f12  background (dark theme)
#12100e  background (warm theme)
#1a1a22  panel background
```

Fonts: Inter (UI), JetBrains Mono (values, chord names, note names)

---

## Code Style

- Add `// ── Description ────────────────────────` above every function, hook, useEffect, useMemo, and major JSX block
- Add missing comments to any uncommented blocks encountered during edits
- Always show a plan before writing any code and wait for approval

---

## Working Rules

- Show plan, wait for approval, then code
- Never add co-author attribution or Claude signature to commit messages
- Test visually on the running app before marking anything done
- Do not rebuild the JZZ player for mute/solo — use real-time filter callbacks

---

## Changelog & README

**After every session or significant commit, update both files without being asked:**

**`CHANGELOG.md` (developer log — technical detail):**
- Add a dated entry at the top under `## [Unreleased]`
- Include: files changed, functions added/modified, store fields, architectural decisions, bug root causes and fixes
- Technical language is fine

**`README.md` (public-facing):**
- Update the `## Changelog` section at the bottom
- Plain language only — no file names, no hook names, no architecture detail
- Include: new features users can see, UI changes, bug fixes users would notice
- Do NOT include: refactors, store changes, IPC changes, dependency updates

**Split decision:** If a user opening the app would notice it → README. If it only matters to someone reading the code → CHANGELOG only. When in doubt, CHANGELOG only.

Both updates happen together. One commit message covers the code change — no separate commit needed for docs unless the session is long.

---

## Known Issues

- TrackPanel SVG — intermittent renderer crash, root cause unknown

---

## Gotchas — Hard-Won Lessons

- **Settings persistence:** null sentinel in the subscribe callback — do not remove it (see State & Persistence above)
- **Prefs restore:** `setTimeout(restoreLibraryPrefs, 500)` — runs after render, never blocks. Do not move it to a component.
- **JZZ seek:** `player.play()` must be called before `player.jumpMS()` — reversing the order breaks seek behaviour
- **Black screens** are almost always a missing import, not a logic error — check imports first
- **Vite dep optimisation:** `spessasynth_lib` and `spessasynth_core` are excluded from `optimizeDeps`; `fuse.js` is included. Adding a new heavy dependency requires adding it to `optimizeDeps.include` in `electron.vite.config.ts` or it will trigger a mid-session reload and black screen
- **Samples engine auto-init:** on startup, if `audioEngine === 'samples'` is restored from prefs, `SettingsPanel` auto-calls `initSamplesEngine`. The SF2 must be re-read from disk on every cold start — no persistent audio buffer cache
- **Zustand object selectors crash the renderer:** `useStore(s => ({ a: s.a, b: s.b }))` breaks the `useSyncExternalStore` snapshot invariant (new object every render). Always use primitive selectors and derive combined values in the render body.
- **Canvas + Electron drag:** HTML canvas elements inside Electron receive native drag events — setting `draggable=false` and calling `onDragStart={e => e.preventDefault()}` is required or drag gestures reach Electron's file handler instead of the canvas `onMouseMove`.

---

## Versioning

Format: `MAJOR.MINOR.PATCH` — updated in `package.json` and `src/components/SettingsPanel/SettingsPanel.tsx`

| Bump | When |
|---|---|
| PATCH | Bug fix, UI polish, refactor — no new user-visible feature |
| MINOR | New user-visible feature (new modal, new engine, new control) |
| MAJOR | Major milestone — first public release, VST3, breaking change |

**Rules:**
- Only bump version when something meaningful changed — not every session
- After bumping, suggest the git tag command: `git tag v0.x.x && git push origin v0.x.x`
- Dates in changelog entries use format: `29. 6. 2026`
- Current pre-release series is `0.x.x` — `1.0.0` = first public release

**What counts as MINOR (new feature):**
- New modal or explorer
- New audio engine
- New playback feature users can interact with
- New persistent setting

**What counts as PATCH (fix/polish):**
- Bug fix
- Layout or styling change
- Performance improvement
- Refactor with no UI change
- Dependency update
