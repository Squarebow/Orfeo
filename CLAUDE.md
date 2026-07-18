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
| `src/utils/genreVoicing.ts` | Genre voicing maps — `getGenreVoicing(genre, romanLabel, baseKey)` |
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

Currently persisted: `libraryFolder`, `libraryFavourites`, `hiddenLibraryFiles`, `noteNaming`, `accidentals`, `masterVolume`, `audioEngine`, `showBarNumbers`, `chordPrompterEnabled`, `chordTranscriptionEnabled`, `hideDemoFolder`, `splitBreakpointType`, `splitBreakpointNote`, `splitBreakpointRangeStart`, `splitBreakpointRangeEnd`, `showHandLabels`, `loopRegionEnabled`.

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

**Genre Voicing System** — `getGenreVoicing(genre, romanLabel, baseKey)` in `genreVoicing.ts`. `parseRomanLabel` strips b/#/° affixes and classifies Roman numeral quality by case (uppercase=major, lowercase=minor, °=diminished). Classic returns plain 'major'/'minor'/'dim' — it never consults `baseKey`. Other genres look up (degree, quality) in their `DegreeMap` and fall back to `baseKey` when no override exists. All chord type strings are verified against tonal 6.4.3 `ChordType.all()`.

**Chord Explorer progression playback** — `playProgStepAt` is a recursive `useCallback` that chains `setTimeout` calls. Its deps must include `setExplorerChordDisplay` and `rootLabels`, or those values go stale (classic React stale-closure bug). If the chord display above the keyboard stops updating during progression playback, check these deps first.

**Chord Explorer Power tier** — when `tier === 'power'`, a single `isPowerMode` boolean gates the grid render (12 power chord tiles) and applies `opacity: 0.35, pointerEvents: 'none'` to Hand filter, Notes filter, Search, Progressions section, and Play Inversion footer. Entering Power mode also clears `selectedKey`/`explorerKeys`/`explorerChordDisplay` so stale chord highlights don't linger.

**OrfeoStore interface gap** — library-related fields (`libraryFolder`, `libraryFiles`, `libraryFavourites`, `hiddenLibraryFiles`, `libraryFavourites`, etc.) exist in the store body but are NOT declared in the `OrfeoStore` TypeScript interface. Access them with `(s as any).field` in selectors and `useStore.getState() as any` in callbacks. Do not add them to the interface without also verifying every subscriber and selector that touches library state.

**`store.loadLibraryFile` is broken** — it references `parseMidiBuffer`, `parseKeySignature`, and `detectKeyFromTracks` which are never imported in `store/index.ts`. It throws a ReferenceError at runtime (caught silently). Never call it. Use `loadFileIntoPlayer` in `App.tsx` instead — it has those utilities imported and mirrors the same logic as the `onMidiReload` handler.

**Drag-and-drop file loading pattern** — main area drop (App.tsx) and library sidebar drop (SettingsPanel.tsx) both use `window.electronAPI.getPathForFile(file)` (via `webUtils.getPathForFile` in preload) to get the real OS path from the browser `File` object. Files dropped outside the library are copied in via `fs:copyMidiToLibrary` IPC (collision-safe naming: `Song.mid` → `Song (2).mid`). Only the main-area drop loads the file into the player; the sidebar drop is add-only. No auto-play on drop.

**`_filePath` → library amber highlight** — `(midi as any)._filePath` (set by `parseMidiBuffer`) is the source of truth for which library row is currently loaded. Row comparison normalises both paths with `.replace(/\\/g, '/').toLowerCase()` before equality check to handle Windows backslash/case variation. The amber highlight is a background on the row, not a border.

---

## Design Tokens

All tokens live in `src/index.css` `:root {}`. Use CSS variables in new code; fall back to hex only when inline React styles can't use `var()` (they can — inline style values accept CSS variable strings).

**Colour**
```
--text-amber / #e8a027   amber accent (active states, highlights)
--text-default / #c6c8c8  default UI text
--text-active  / #f2f3f4  active/value text
--text-muted   / #94979e  dim labels
--status-success / #4a9060  green — ready/ok states
--status-error   / #c0392b  red — stop/error states
--bg:    #121212   app floor
--panel: #1e1e1e   panel layer
--bg-panel2: #2d2d2d  nested surface (cards, tiles)
```
Legacy hard-coded colours still used in existing components (do not introduce new usages):
`#0f0f12` bg dark, `#12100e` bg warm, `#1a1a22` panel bg, `#707088` inactive text, `#b0b0cc` value text, `#404055` dim labels

**Spacing** (4 px increments)
```
--space-1: 0.25rem  (4px)
--space-2: 0.5rem   (8px)
--space-3: 0.75rem  (12px)
--space-4: 1rem     (16px)
--space-5: 1.25rem  (20px)
--space-6: 1.5rem   (24px)
```

**Typography**
```
--text-xs:   0.6875rem (11px) — tiny labels, hints
--text-sm:   0.75rem   (12px) — standard small UI text
--text-base: 0.8125rem (13px) — default body/label
--text-md:   0.875rem  (14px) — slightly emphasised
--text-lg:   1rem      (16px) — headings, chord names
```

**Border radius**
```
--radius-sm: 3px
--radius-md: 5px
--radius-lg: 8px
```

**Layout**
```
--row-height:    44px  — standard control row height (use for minHeight in explorer rows)
--button-height: 28px  — standard button height
```

**Utility classes** (apply via `className`, not inline style)
```
.orfeo-row     — flex row, height var(--row-height), padding 0 var(--space-4)
.orfeo-label   — dim uppercase label matching ROW_LABEL pattern
.orfeo-button  — standard ghost button with amber hover
.orfeo-value   — JetBrains Mono numeric display
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
- **`LoopRegionStrip` fully unmounts when `loopRegionEnabled` is off:** The strip is rendered as `{loopRegionEnabled && <LoopRegionStrip />}` in `TopBar.tsx` — toggling the setting destroys and recreates the component. The density `useStore.subscribe` callback only fires on future state changes, so on remount (midi unchanged) `densityRef` would stay empty and ticks wouldn't draw. Fix: call `computeDensity(useStore.getState())` immediately on mount before subscribing.
- **`store.loadLibraryFile` silently fails at runtime:** Never call it. `parseMidiBuffer`, `parseKeySignature`, and `detectKeyFromTracks` are not imported in `store/index.ts` — the call throws `ReferenceError` caught silently, so the file appears in the library but never loads. Always use the `loadFileIntoPlayer` callback defined in `App.tsx` instead.
- **Context menu clipped by `overflow: hidden`:** Use `position: fixed` (not `position: absolute`) for context menus inside panels with `overflow: hidden` — `fixed` escapes the clip entirely. Track `{path, x, y}` state and close on outside `mousedown`, `Escape`, and list scroll.
- **`dragleave` flickering:** `if (e.currentTarget.contains(e.relatedTarget as Node)) return` prevents clearing drag-over state when the pointer moves over a child element inside the drop zone.

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
