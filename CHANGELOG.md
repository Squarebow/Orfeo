# Changelog

## [Unreleased] — dev branch

---

### 3. 7. 2026 — Split breakpoint: Single Note vs Range mode

**`src/store/index.ts`**
- Replaced `globalSplitBreakpoint: number` / `setGlobalSplitBreakpoint` with four new fields:
  - `splitBreakpointType: 'single' | 'range'` (default `'single'`)
  - `splitBreakpointNote: number` (default 60, clamped 48–60)
  - `splitBreakpointRangeStart: number` (default 52/E3, clamped 48 to rangeEnd–1)
  - `splitBreakpointRangeEnd: number` (default 60/C4, clamped rangeStart+1 to 60)
- `setSplitBreakpointRangeStart` / `setSplitBreakpointRangeEnd` use `set(s => ...)` to read the opposing bound and enforce no-crossing invariant.
- Null-sentinel subscriber updated: 4 new `_prev*` vars replace old `_prevGlobalSplitBreakpoint`; all 4 fields included in change-detection condition and `setPrefs` payload.
- `restoreLibraryPrefs` restores all 4 new fields from prefs (old `globalSplitBreakpoint` key silently dropped; default 60 is valid for both old and new).

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- MIDI Editor section split into two `OptionRow`s:
  - Row 1 "Split mode": `[Single] [Range]` toggle buttons; hint explains the ≥15% register threshold.
  - Row 2 (conditional): Single → one `− note +` stepper (range 48–60); Range → two side-by-side steppers ("Lower" / "Upper") with UI-level disabled guards that prevent the bounds from crossing.
- All 8 new store fields wired to the UI.

**`src/components/MidiEditor/MidiEditor.tsx`**
- Replaced single `splitBreakpoint` local state with 4 local vars matching the store fields.
- `getPrefs()` on mount now reads all 4 new pref keys.
- `handleSplit` sends `{ trackIndex, breakpointType, breakpoint, rangeStart, rangeEnd }` to `splitMidiEditor` IPC.

**`src/types/index.ts`**
- Updated `Window.electronAPI.splitMidiEditor` payload type to include `breakpointType`, `rangeStart`, `rangeEnd`.

**`electron/main.ts`**
- `editor:split` handler payload type updated; note-assignment logic branches on `breakpointType`:
  - Single: unchanged (notes < breakpoint → LH, ≥ → RH).
  - Range: notes < rangeStart → LH; notes > rangeEnd → RH; notes in zone → assigned by proximity (`|note – rangeStart| ≤ |note – rangeEnd|` → LH, else RH; ties go to LH).
- ≥15% gate still applied after assignment in both modes.

---

### 3. 7. 2026 — Locked Chord modal: draggable float + hint text + visual polish

**`src/components/LockedChordModal.tsx`** (new)
- Draggable floating modal replaces inline locked chord display in the chord bar and the locked chord controls in `KeyboardControls.tsx`.
- All existing locked chord logic migrated verbatim: `nextInversion` / `prevInversion`, `applyInversion`, `playLockedChord`, `clearLockedKeys`, `formatInversionDisplay` / `ordinalSuffix` display. Behaviour is unchanged.
- Layout: amber drag-handle header ("LOCKED CHORD" in amber) with × close button; large amber chord name + inversion ordinal; ‹ / PLAY / › / RotateCcw control row.
- Control icons default to `#707088`; amber on hover. Play button border follows same pattern.
- Border: amber outer ring + diffuse glow via `boxShadow` (`0 0 0 1px rgba(232,160,39,0.25), 0 0 18px rgba(232,160,39,0.12)`).
- Default open position: centered on screen (resets on every fresh lock).
- Drag pattern matches `ChordExplorer` exactly.
- Auto-pause on open intentionally removed: it triggered `clearSchedule() → _synth.stopAll(true)` in the Samples engine, which can suspend the AudioContext and introduce noteOn latency. The old `KeyboardControls` locked chord controls never paused playback. Residual tiny delay observed under RDP — likely network overhead; flagged for local testing.

**`src/components/Keyboard/Keyboard.tsx`**
- Removed `lockedDisplay` useMemo and the `lockedDisplay ?` priority branch from the chord bar centre (simple mode) and `centreChord` in extended mode. Locked chord now displays exclusively in the modal.
- Part 1: Shift+Click hint text moved from `KeyboardControls` into the chord bar right group, immediately left of the SCALES label — present in both simple and extended modes.
- Fixed stale `<Maximize2>` reference in extended prompter mode (was left unreplaced in the previous session); replaced with the same inline SVG used in simple mode.

**`src/components/Keyboard/KeyboardControls.tsx`**
- Removed: `nextInversion`, `prevInversion`, `applyInversion`, `playLockedChord`, `isLocked`, the entire centre `position:absolute` group (hint text + locked chord controls), `Play` / `RotateCcw` lucide imports, `useCallback`, `lockedKeys` / `lockedColors` / `setLockedKeys` / `clearLockedKeys` store reads.
- File now contains only: key size selector, dock/float toggle, NoteCounter.

**`src/App.tsx`**
- Added `<LockedChordModal />` import and render alongside `<ChordExplorer />` / `<ScaleExplorer />`.

---

### 3. 7. 2026 — Library UX: transcript trigger on FileMusic icon, marquee filenames, fullscreen chord prompter icon

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- `TranscriptIcon` component updated: icon changed from `FileText` to `FileMusic`; idle color `#707088`, amber hover `#e8a027`, IDLE_TOOLTIP constant for tooltip text. Spin animation keyframe injection moved here from `Keyboard.tsx`.
- `MarqueeFilename` component added: `ResizeObserver` measures overflow between FileMusic icon and star button; on hover, CSS `transition: transform` scrolls the name left at 40 px/s with a 0.5 s delay; mouse-out smoothly snaps back. Duration computed as `max(1.5, scrollAmt / 40)` seconds.
- Both demo file rows and library grouped file rows updated: when `chordTranscriptionEnabled` is off, shows a plain dim `<FileMusic>` icon; when on, mounts `<TranscriptIcon>` in place of it — no separate right-side column. `<MarqueeFilename>` replaces the plain filename `<span>`.
- `FileText` removed from lucide-react imports; separate `TranscriptIcon` instances that were appended to the right of the row removed entirely.

**`src/components/Keyboard/Keyboard.tsx`**
- Chord prompter toggle icon: `Maximize2` (lucide-react) replaced by custom inline SVG (`lucide-fullscreen` path data, `width/height="13"`, `viewBox="0 0 24 24"`). `Maximize2` import removed.
- Applied to both simple-mode (34 px chord bar) and extended-mode (36 px chord bar) toggle buttons.

---

### 2. 7. 2026 — MIDI Editor polish: track sort + icon contrast + LH/RH split guard

**`src/components/MidiEditor/MidiEditor.tsx`**
- Track list now sorted on load: keyboard group (piano / chromatic / organ) at the top, drums at the bottom, original MIDI order preserved within each group. Within the keyboard group, "Left Hand" is pinned before "Right Hand" for split files.
- Merge icon and Split icon color when inactive: `#353540` / `#505068` → `#606078` — both icons are now distinctly visible against the dark row background.
- Split button is suppressed on tracks named "Left Hand" or "Right Hand" — a track that is already the result of a split does not need a split trigger.

---

### 2. 7. 2026 — Split Track + icon updates + portable build filename (v0.7.0)

**`electron/main.ts`**
- Added `editor:split` IPC handler: reads source MIDI via `_editorData.filePath`, finds the track by note-bearing index, splits notes into Left Hand (< breakpoint) and Right Hand (≥ breakpoint). Qualifies the split by requiring ≥15% notes in each register — returns a descriptive error if the track is too one-sided. Mutates the source track in-place (becomes LH), adds a new RH track via `midi.addTrack()`. Copies instrument program from source. Output path: `{baseName}_ORFEO_SPLIT.mid` in the Orfeo subfolder via `getOrfeoOutputDir()`. Strips `_(ORFEO_MERGED|ORFEO_SPLIT|ORFEO)` from basename before appending suffix. Sends `midi:reloadFile` to main window on success.
- `editor:split` basename stripping: regex `_(ORFEO_MERGED|ORFEO_SPLIT|ORFEO)` — order matters, ORFEO_SPLIT must come before ORFEO or the shorter suffix matches first.

**`electron/preload.ts`**
- Added `splitMidiEditor: (payload) => ipcRenderer.invoke('editor:split', payload)`.

**`src/types/index.ts`**
- Added `splitMidiEditor: (payload: { trackIndex: number; breakpoint: number }) => Promise<{ ok: boolean; message: string }>` to `window.electronAPI` type.

**`src/store/index.ts`**
- Added `globalSplitBreakpoint: number` (default 60 — C4, middle C) + `setGlobalSplitBreakpoint` to `OrfeoStore`.
- Setter clamps to 21–107 (A0–B7).
- Restored in `restoreLibraryPrefs` from `prefs.globalSplitBreakpoint`.
- Persisted in null-sentinel subscribe callback; `_prevGlobalSplitBreakpoint` added as sentinel variable.

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- Added `Scissors` to lucide-react import.
- Added `SPLIT_NOTE_NAMES` constant for MIDI-note-to-name conversion.
- Reads `globalSplitBreakpoint` / `setGlobalSplitBreakpoint` from store.
- New **MIDI Editor** section (between Playback and Appearance): shows current breakpoint note name (e.g. "C4") with − / + buttons to change by semitone. Hint explains the 15% detection threshold.
- Version bumped to v0.7.0.

**`src/components/MidiEditor/MidiEditor.tsx`**
- Added `Split` to lucide-react import.
- `TrackRow`: added `onSplit?: () => void` prop.
- Merge toggle button: replaced `'+'` / `'✓'` text with `<Merge size={11} />` icon (Part 2).
- Split button: appears inside the track name row for piano/chromatic/organ tracks (not merged rows). Amber hover, `<Split size={10} />` icon, tooltip "Split into Left Hand / Right Hand".
- `MidiEditor` component: added `splitBreakpoint` state (loaded from prefs in `useEffect`), `splitResult` state.
- Added `handleSplit(trackIndex)` — calls `window.electronAPI.splitMidiEditor`, sets result, closes editor on success after 1200ms.
- Track list: passes `onSplit` to qualifying tracks (`['piano','chromatic','organ'].includes(group) && !isMerged`).
- Footer: `splitResult` banner rendered above `saveResult` banner (same style).

**`package.json`**
- Added `"portable": { "artifactName": "${productName}-${version}-portable.${ext}" }` to `build` config. Portable exe will now be named `Orfeo-0.7.0-portable.exe` instead of the default `Orfeo 0.7.0.exe`.
- Version bumped to `0.7.0`.

---

### 2. 7. 2026 — Demo folder + Orfeo subfolder for generated files

**`electron/main.ts`**
- Added `ensureDemoFolder()`: on first launch, copies bundled demo MIDI files from `public/demo/` (dev) or `app.asar.unpacked/public/demo/` (packaged) into `libraryFolder/Demo/`. Writes `.demo-installed` flag to userData so the copy runs exactly once. Safe-copy: skips files that already exist. Falls back to `userData/Demo/` if no library folder is configured yet. Called from `app.whenReady()` before `createWindow()`, wrapped in try/catch so a missing demo dir never blocks launch.
- Added `getOrfeoOutputDir(sourceFilePath)` helper: resolves and auto-creates an `Orfeo/` subfolder next to the source file. If the source is already inside an `Orfeo/` subfolder, steps up to its parent — prevents `Orfeo/Orfeo/` nesting.
- `editor:save` IPC handler: output path now computed from `_editorData.filePath` via `getOrfeoOutputDir()` instead of using `payload.outputPath` from the renderer. `writeFileSync`, the `midi:reloadFile` notification, and the return message all use the new local `outputPath`. Fixes bug where the Orfeo/ folder was created (by `getOrfeoOutputDir`) but files were written next to the source (because `payload.outputPath` was still referenced). Re-saving an already-generated `_ORFEO.mid` strips the suffix before appending a new one — prevents `_ORFEO_ORFEO` doubling.
- `transcript:generate` IPC handler: output path moved into `Orfeo/` subfolder via `getOrfeoOutputDir()`. `songName` variable reused for the filename.
- Expanded `fs/promises` import: added `access`, `copyFile`, `readdir`, `writeFile` alongside existing `mkdir`.

**`package.json`**
- `files` array: added `public/demo/**/*` and `public/spessasynth_processor.min.js`; removed stale `package.json` entry.
- `asarUnpack`: added `public/demo/**/*` so demo files are accessible to `fs.copyFile` in packaged builds.

**`src/store/index.ts`**
- Added `hideDemoFolder: boolean` (default `false`) + `setHideDemoFolder` to `OrfeoStore`.
- Restored from prefs in `restoreLibraryPrefs`.
- Persisted in the null-sentinel subscribe callback alongside other display settings.

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- `LibraryPanel`: `Demo` folder (case-insensitive) is sorted to position 0 in the folder list, pinned above `Orfeo/` and all user subfolders. When `hideDemoFolder` is true, the Demo group is filtered from the render — files remain on disk.
- Settings tab: new **Library** section at the top with a Demo folder Show/Hide toggle.

**`public/demo/`**
- Bundled: Mozart - Rondo Alla Turca, Scott Joplin - Entertainer, Vivaldi 4 stagioni - Estate.

---

### 2. 7. 2026 — Portable build target

**`package.json`**
- Added `"portable"` to `build.win.target` alongside `"nsis"`. Running `npm run dist` now produces both `Orfeo Setup x.x.x.exe` (NSIS installer) and `Orfeo x.x.x.exe` (portable single-file exe) in `release/`.
- Added `dist:portable` script: same as `dist` but passes `--win portable` to electron-builder — builds the portable exe only, without the installer (faster iteration).

**`electron/main.ts`**
- Added portable userData redirect before `app.whenReady()`: when `PORTABLE_EXECUTABLE_DIR` is set (injected by electron-builder portable target at runtime), `app.setPath('userData', ...)` points to `Orfeo-Data/` next to the exe. This makes prefs (`orfeo-prefs.json`) and any cached files travel with the exe when copied to another machine. Has no effect on the NSIS installer build.

---

### 2. 7. 2026 — Build fixes — editor window, samples engine, keyboard alignment

**`electron/main.ts`**
- `editor:open` handler: `loadFile({ hash: 'editor' })` → `{ hash: '/editor' }`. `hash: 'editor'` produces `#editor` in the URL; `App.tsx` checks `window.location.hash === '#/editor'`, so the check always failed in packaged builds, causing the editor window to render the full main app instead of `<MidiEditor />`.

**`src/hooks/useSamplesEngine.ts`**
- Worklet URL: `new URL('/spessasynth_processor.min.js', location.href)` → `new URL('./spessasynth_processor.min.js', location.href)`. Leading `/` resolves to `file:///spessasynth_processor.min.js` (filesystem root) in packaged mode; `./` correctly resolves relative to `index.html` in the same directory.
- SF2 URL: `fetch('/GeneralUser-GS.sf2')` → `fetch(new URL('./GeneralUser-GS.sf2', location.href).href)` — same root cause and same fix.
- Added `console.log` of the resolved URL before each load and included the URL in the SF2 fetch error message for future debuggability.
- Tightened catch block type to `e: any` so `.message` access compiles cleanly.

**`package.json`**
- Added `"asarUnpack": ["out/renderer/spessasynth_processor.min.js"]`. `AudioWorklet.addModule()` bypasses Electron's asar protocol handler and requires the file on the real filesystem; `fetch()` goes through the handler so the SF2 does not need unpacking.

**`src/components/Keyboard/Keyboard.tsx`**
- Black key left-position constant: `0.65` → `0.70`. PianoRoll's formula places each black key at `(wi − 0.30) × ww` (center at the white-key boundary); Keyboard was placing it at `(whiteIdx + 0.65) × ww = (wi − 0.35) × ww` — a consistent `0.05 × ww` offset per black key. The fix aligns the keyboard DOM element with the PixiJS note columns.

---

### 2. 7. 2026 — Chord Transcript PDF — styling fixes (v4)

**`electron/main.ts`** (`transcript:generate` handler only)

- **Fix 1 — Outer grid borders removed:** replaced `doc.rect()` (which drew all 4 edges) with a conditional `moveTo/lineTo` separator drawn only *between* rows (not above bar 1, not below last bar). Separator is full-bleed (x=0 to pageW), 0.15pt, `#c8c8d8`.
- **Fix 2 — Chord name concatenation:** chords in each beat cell are now sorted by `xFrac` before placement. Added `prevDrawX`/`prevTW` tracking to detect x-overlap with the previous chord in the same cell. If `newX < prevX + prevTW + 3`: pushed right; if still overlapping after hard-clamp to `cellRight − tw − 2`: `forceStack = true` applies diagonal offset (`prevDrawX + 5`, `midY − ci*9`). Prevents `Dsus24CMadd9`-style visual concatenation.
- **Fix 3 — Legend inversion collapsing:** step 8 now normalises each chord key explicitly with `pdfStripMajor(gc.chordEn.split('/')[0])` before inserting into the dedup set, rather than relying on `gc.chordEn` already being stripped. Makes the normalization self-contained and guards against future changes to step 6.

---

### 1. 7. 2026 — Chord Transcript PDF — layout & detection fixes (v3)

**`public/fonts/`** — new directory; four font files added:
- `Inter-Regular.ttf`, `Inter-Bold.ttf`, `Inter-Italic.ttf` — Inter v4.0 (rsms/inter GitHub release)
- `JetBrainsMono-Regular.ttf` — JetBrains Mono v2.304 (JetBrains GitHub release)

**`package.json`**
- Added `extraResources: [{ from: "public/fonts", to: "fonts" }]` to electron-builder config so fonts are copied outside the asar in packaged builds and accessible via `process.resourcesPath`

**`electron/main.ts`**
- Added `pdfLegendKey(chord)` — `pdfStripMajor(chord.split('/')[0])`; single helper used in both legend dedup and consecutive-dedup in bar progression; collapses `C/E`, `GM/D` etc. to root
- Updated `drawKeyboardThumbnail`: white key fill `#efefef`, stroke `#c0c0c0` 0.2pt; black key fill `#2a2a2a`, width fixed 4.5pt, height fixed 11pt (no longer derived from thumb dimensions); black keys no longer stroked
- In `transcript:generate` IPC handler:
  - Font registration via `doc.registerFont()` for `Inter`, `Inter-Bold`, `Inter-Italic`, `Mono`; resolved from `app.isPackaged ? process.resourcesPath/fonts : appPath/public/fonts`
  - **Chord detection — consecutive dedup** now compares by `pdfLegendKey` (root+quality, ignoring inversion) instead of exact match; `C → C/E → C/G` collapses to one `C` entry
  - **Legend dedup** now uses `pdfLegendKey` as the set key; `chordEn` field on `GridChord` set to the key-normalised value so the legend only holds root-position chords; 50+ legend entries reduced to ~8–15 for typical pop/rock files
  - **`C_LINE`** changed `'#2a2a3a'` → `'#d0d0dc'`; added `C_INFO = '#909090'`; all grid `lineWidth` calls 0.3 → 0.2; header rule stays 0.3pt per spec
  - **Dynamic row height** — fixed pre-computed `rowH` removed; per-bar: `rowH = Math.max(20, barChords.length * 11)`; page-break check uses the current bar's own `rowH`
  - **Chord placement — contained within cell** — `doc.widthOfString()` to measure; font size tries 8 → 7 → 6pt until text fits `BEAT_COL_W - 4`; proportional x clamped to `[cellLeft+2, cellRight−tw−2]`; 3+ chords per cell use adaptive step `min(9, (rowH−14)/(n−1))` with hard ceiling/floor at `rowTop+3` / `rowBottom−3−fontSize`; rendered with `width: cellRight − drawX − 1` to prevent overflow
  - **Fonts applied throughout**: header title `Inter-Bold 13pt`; subtitle `Inter-Italic 8pt`; info line `Inter 7pt`; section label `Inter 7pt C_DIM`; legend chord names `Inter-Bold 7pt`; legend note names `Inter 6pt`; beat header `Inter 6pt`; bar numbers `Mono 7pt`; grid chord names `Mono` 8/7/6pt; footer `Inter 7pt`

---

### 30. 6. 2026 — Chord Transcript PDF generation

**New feature:** Clicking the `FileText` icon in the chord bar (extended mode) generates a PDF chord transcript of the loaded MIDI file and saves it next to the source file as `<filename>_CHORD_TRANSCRIPT.pdf`.

**`npm install pdfkit @types/pdfkit`** — PDF generation dependency, main process only.

**`src/types/index.ts`**
- Added `TranscriptEntry { midiPath, transcriptPath, date }` interface
- Added `transcriptGenerate(midiPath): Promise<{ success, path?, error? }>` to `Window.electronAPI` global declaration

**`electron/preload.ts`**
- Added `transcriptGenerate` IPC bridge for `transcript:generate`

**`src/store/index.ts`**
- Added `transcriptHistory: TranscriptEntry[]` and `addTranscriptEntry(entry)` — capped at 20 entries (newest first, oldest dropped); persists immediately to `orfeo-prefs.json` via direct `setPrefs` call inside the action
- Restored `transcriptHistory` from prefs in `restoreLibraryPrefs`

**`electron/main.ts`**
- Added imports: `basename`, `createWriteStream`, `Chord`/`Note` from tonal, `PDFDocument` from pdfkit
- Added `pdfStripMajor()`, `pdfPickBest()`, `pdfDetectChord()` — minimal chord detection duplicated from renderer-side `chordDetection.ts` (cannot import renderer code into main process); uses tonal.js `Chord.detect()` + shortest non-slash root-position name
- Added `drawKeyboardThumbnail(doc, x, y, chordName)` — draws a C4–B4 one-octave keyboard using pdfkit vector rects (8 white keys, 5 black keys); chord tones filled amber, others grey/off-white
- Added `formatTranscriptDate()` — date string in project format
- `transcript:generate` IPC handler:
  1. Parses MIDI with `@tonejs/midi`; collects notes from all non-percussion tracks
  2. 80ms cluster window → `pdfDetectChord()` per cluster → filter `< 2` notes
  3. Bar number from `Math.floor(time / secPerBar) + 1` using first tempo + time signature
  4. Dedup consecutive identical chords; group remaining by bar (stack with `→` prefix for multiple chords per bar)
  5. Collect unique chords in order of first appearance for legend
  6. PDF via pdfkit (A4 portrait, 20mm margins): header (filename 18pt, subtitle 12pt grey, tempo/key/bars 10pt dim, rule), chord legend (keyboard thumbnails 5/row, chord name + note names), bar grid (4/row, 52pt cell height, stacked chords), footer (rule + attribution)
  7. Writes to `midiFilePath.replace(/\.midi?$/i, '_CHORD_TRANSCRIPT.pdf')`
  8. Returns `{ success, path }` or `{ success: false, error }`

**`src/components/Keyboard/Keyboard.tsx`**
- Injected `@keyframes orfeo-transcript-spin` style element at module level (guarded by `id` check)
- Added `addTranscriptEntry` subscription
- Added `transcriptState` (`'idle'|'loading'|'success'|'error'`) and `transcriptTooltip` local state; `transcriptRevertRef` for 3-second auto-revert
- Replaced `FileText` no-op placeholder with active icon:
  - Active only when `midi._filePath` is present; otherwise `opacity:0.35, cursor:not-allowed`
  - Loading: spin animation, tooltip "Generating…"
  - Success: green color, tooltip "✓ Saved — filename.pdf" for 3s, calls `addTranscriptEntry`
  - Error: red color, tooltip shows error string for 3s
  - Auto-reverts to idle state and default tooltip after 3s

---

### 30. 6. 2026 — Chord Prompter embedded in chord bar

**`src/components/ChordPrompter.tsx`** — deleted; all display is now handled inline in `Keyboard.tsx`

**`src/App.tsx`**
- Removed `ChordPrompter` import and render

**`src/components/Keyboard/Keyboard.tsx`**
- Added `resolveCurrentIndex()` — binary search for `lastEvent.time <= currentTime`; same algorithm that was in the old floating panel
- Added `frozenIndexRef` — freezes at last known chord index on pause/stop; resets to `-1` on file change via `useEffect([midi])`
- Added store subscriptions: `midi`, `chordSequence`, `chordPrompterOpen`, `currentTime`
- Removed playback chord detection from the live `activeKeys` effect; that effect now returns early when `playbackState === 'playing'` — playback chord display is now sourced entirely from the pre-computed `chordSequence`
- Manual chord detection (Shift+click lock mode, mouse play when not playing) is unchanged
- Chord bar is now dual-mode with a fluid `height: 0.2s ease` transition:
  - **Simple** (`chordPrompterOpen === false`, 30 px): unchanged layout; chord name priority chain updated to `locked → explorer → sequenceChord → displayedChord → empty`; `sequenceChord` is used instead of the old live-detected `displayedChord` during playback
  - **Extended** (`chordPrompterOpen === true`, 56 px): three-column teleprompter — 4 past chords (Inter 11px `#9090a8`) | `‹` | current chord (JetBrains Mono 20px bold amber) | `›` | 2 next chords; bottom 14px sub-row holds CHORDS / SCALES triggers; empty states: "Open a MIDI file" / "No chords detected" / "Press play"

**`src/components/Transport/TopBar.tsx`**
- Added `FileText` to Lucide imports
- Added `FileText` placeholder icon immediately after the `ScrollText` button; only visible when `chordPrompterOpen === true`; `cursor:not-allowed`, `opacity:0.4`, `color:#505068`, tooltip "Transcribe & Save PDF"; no-op on click

---

### 30. 6. 2026 — Chord bar layout polish

**`src/components/Keyboard/Keyboard.tsx`**
- Extended mode collapsed from two stacked rows (56px total: 42px sequence + 14px CHORDS/SCALES sub-row separated by a border) into a single flat flex row (36px)
- Single-row extended layout: `[CHORDS] [ScrollText toggle] [FileText placeholder]` left-anchored flex group | chord sequence (past `‹` current `›` next) centred flex-1 | `[SCALES]` right-anchored flex item — no separator, no sub-row
- `ScrollText` prompter toggle icon moved from `TopBar` into the chord bar left group (size 13, `strokeWidth 1.5`): amber when `chordPrompterOpen === true`, `#707088` when false; shown only when `chordPrompterEnabled && midi`
- Same toggle icon appears in extended mode left group (always amber, since open)
- Simple mode height increased 30px → 34px for visual consistency with extended 36px
- Added `chordPrompterEnabled`, `setChordPrompterOpen` store subscriptions; added `ScrollText` to Lucide imports

**`src/components/Transport/TopBar.tsx`**
- Removed `ScrollText` from Lucide imports
- Removed `chordPrompterEnabled`, `chordPrompterOpen`, `setChordPrompterOpen` store subscriptions (all moved to `Keyboard.tsx`)
- Removed `ScrollText` transport button entirely — toggle now lives in the chord bar

---

### 29. 6. 2026 — Chord Prompter

**`src/types/index.ts`**
- Added `ChordEvent` interface: `{ time: number; name: string; notes: string[] }` — represents one chord in the pre-computed sequence

**`src/store/index.ts`**
- Added `chordPrompterEnabled: boolean` (default `false`, persisted to `orfeo-prefs.json`)
- Added `chordPrompterOpen: boolean` (default `false`, not persisted) + setter
- Added `chordSequence: ChordEvent[]` (default `[]`, not persisted) + setter
- `setMidi(null)` and `resetAll` now clear `chordSequence` and `chordPrompterOpen`
- `restoreLibraryPrefs` restores `chordPrompterEnabled` from saved prefs

**`src/hooks/useChordSequence.ts`** (new)
- `useChordSequence()` — effect on `[midi, noteNaming, accidentals]`; deferred with `setTimeout(0)` so it doesn't block the render thread
- `computeChordSequence()`: collects non-drum note events, groups by 80ms cluster threshold, detects chord via `detectChord()`, localizes via `localizeChord()` (with `'hidden'` → `'english'` fallback), deduplicates consecutive identical names, builds `notes[]` from unique PCs via `getNoteName()`
- Clears sequence when no MIDI loaded

**`src/components/ChordPrompter.tsx`** (new)
- Floating 500×110px panel; `position:fixed`, `zIndex:402`, default top-right above keyboard
- Draggable via header (same mouse-event pattern as ChordExplorer)
- Three-column layout: past 3 chords (fading left, opacity 0.5/0.3/0.15) | current chord (JetBrains Mono 22px bold amber, notes row below) | next 3 chords (fading right)
- `resolveCurrentIndex()`: binary-search for last event where `event.time <= currentTime`, then enforces 2-second minimum hold by walking back
- Freezes display on pause/stop via `frozenIndexRef` — never clears current chord
- Three empty states: no file, no chords detected, not yet playing
- Footer: disabled placeholder "Transcribe & Save PDF" button (`cursor:not-allowed`, `opacity:0.4`)

**`src/components/Transport/TopBar.tsx`**
- Added `ScrollText` (lucide-react) to imports
- `ScrollText` icon button appears after the Loop button, only when `chordPrompterEnabled && midi !== null`
- Toggles `chordPrompterOpen`; amber when open, `#707088` when closed; tooltip "Chord Prompter"

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- Added new **Playback** section (between Audio and Appearance)
- `OptionRow` "Chord Prompter" with On/Off toggle — enables/disables the transport icon and the prompter window

**`src/App.tsx`**
- Calls `useChordSequence()` alongside other lifecycle hooks
- Renders `<ChordPrompter />` after `<ScaleExplorer />`

**Refinements (same session):**
- `resolveCurrentIndex` simplified to a plain binary search — removed 2-second minimum hold so the centre chord advances immediately in sync with the above-keyboard chord display; past chords persist naturally in the history column
- Opacity ramp lifted from `[0.5, 0.3, 0.15]` to `[0.85, 0.55, 0.28]`; font size 11px Inter → 14px JetBrains Mono on side chords
- Dot `·` separators between each chord in both past and next columns
- "CHORD PROMPTER" header label coloured amber

---

### 29. 6. 2026 — Bar numbers, bar counter, metronome fixes

**`src/utils/midiParser.ts`**
- `parseMidiBuffer` now precomputes `_barStarts: number[]` — array of bar start times in seconds, built by walking `_tempoMap` with the time signature numerator; handles mid-song tempo changes correctly
- Single source of truth: PianoRoll and TopBar both read this array, eliminating bar-count drift

**`src/store/index.ts`**
- Added `barStarts: number[]` field (default `[]`, not persisted) — set from `_barStarts` in `setMidi`, cleared in `resetMidi`/`resetAll`
- Added `showBarNumbers: boolean` (default `true`) + `setShowBarNumbers` — persisted alongside other display prefs
- `restoreLibraryPrefs` restores `showBarNumbers` from saved prefs

**`src/components/PianoRoll/PianoRoll.tsx`**
- Full rewrite of bar overlay layer: PixiJS `Text` pool replaced with a Canvas2D overlay (`position:absolute`, `pointer-events:none`) drawn every frame via `clearRect` + `fillRect`/`fillText` — reliable text rendering, no PixiJS texture sizing issues
- Bar start times now read from `storeRef.current.barStarts` (no local recomputation)
- `currentBarIdx` scan fixed: removed `else break` that caused early exit before scanning all events
- Horizontal bar lines drawn in Canvas2D (`rgba(30,30,56,0.5)`) before pills; pills use `ctx.roundRect` with `ctx.rect` fallback
- Container div gets `position: 'relative'` for overlay positioning; overlay resized in `ResizeObserver` callback

**`src/components/Transport/TopBar.tsx`**
- Added `barStarts` from store; replaced simple `Math.floor(currentTime/barDuration)+1` with binary search into `barStarts` — exact sync with PianoRoll
- BAR counter moved inside the `alignItems:'flex-end'` right group div so its bottom aligns with TIME/METRONOME/MIDI labels

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- "Bar numbers & grid lines" Show/Hide toggle added under Piano Roll section

**`src/hooks/useMetronome.ts`** *(complete rewrite — full tempo-map awareness)*
- **Bug fix:** Removed `useStore.setState({ bpm: rawBpm, originalBpm: rawBpm })` — the metronome was overwriting `originalBpm` on every tempo-change event in the MIDI, corrupting the user's tempo ratio and causing visible BPM stutter
- **Bug fix:** Accent beat alignment — changed `Math.floor(elapsedBeats)` to `Math.ceil(elapsedBeats)` for initial `beatNumRef`; `timeToNextBeat` now uses `(ceil - elapsed) * spb` instead of `(1 - frac) * spb`; the old code scheduled beat 0's click one full beat late, causing the accent to land on beat 2 instead of beat 1 of each bar
- **Root fix for rubato files:** `elapsedBeats = currentTime / localSpb` was wrong for files with tempo changes — it divided only by the current-segment BPM without integrating prior tempo events, causing `beatNumRef` to start at the wrong position; replaced with `getElapsedBeats()` which walks the full `_tempoMap`
- Added `getElapsedBeats(tempoMap, time)`: integrates beats across all tempo segments up to `time` seconds (exported for TopBar)
- Added `getSongTimeForBeat(tempoMap, targetBeat)`: inverse function, maps absolute beat number → file seconds; handles mid-file tempo changes exactly
- Scheduler redesign — per-tick beat audio times computed via `audioOffsetRef + getSongTimeForBeat(tempoMap, bt) / ratio` (exact, tempo-aware) instead of accumulating `nextBeat += spb` (drifts across tempo changes); `lastScheduled` ref prevents double-firing; `audioOffsetRef = ctx.currentTime - currentTime/ratio` is a true invariant during uninterrupted playback
- Removed `nextBeatRef`, replaced with per-beat exact computation; removed `beatNumRef` accumulation loop

**`src/components/Transport/TopBar.tsx`** *(additional change)*
- BPM display now shows live tempo from `_tempoMap` at `currentTime` instead of the static `bpm` store value; computed via `reduce` over `rawTempoMap`, scaled by user ratio (`bpm / originalBpm`); updates every frame as the song plays through tempo changes
- `isTempoChanged` flag continues to reflect user tempo adjustment (ratio ≠ 1), not the file's internal tempo changes

---

### 29. 6. 2026 — Audio engine persistence + Chord Explorer search rewrite (v0.6.1)

**`src/store/index.ts`**
- `audioEngine` added to the display-settings prefs subscriber — saved alongside `noteNaming`/`accidentals`/`masterVolume` on every change
- `restoreLibraryPrefs` now restores `audioEngine: 'samples'` from prefs on startup

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- New `useEffect` on `[audioEngine]` — when prefs restore sets engine to `'samples'` and `samplesStatus` is still `'idle'`, auto-calls `initSamplesEngine`; SF2 loads in background on cold start, progress bar visible if Settings tab is open

**`src/components/ChordExplorer.tsx`**
- Replaced broken inline `includes()` filter with Fuse.js fuzzy search (`fuse.js` v7)
- `searchableChords` useMemo builds one record per chord: `display` (root+suffix e.g. `Cm7`), `typeName` (suffix only, root-independent e.g. `m7`), `aliases` (tonal.js), `notes` (note names for selected root), `numerics` (digit substrings e.g. `7 11`)
- `fuseInstance` useMemo — keys vary by `searchScope`: `name` → `['typeName','numerics']`; `notes` → `['notes']`; `both` → `['display','typeName','notes','numerics']`; `threshold: 0.2`, `minMatchCharLength: 1`, `ignoreLocation: true`
- `aliases` excluded from all Fuse keys — tonal.js aliases contain long English words (`'minor'`, `'dominant'`) that caused spurious matches on single letters (n, o, i, u)
- Search scope toggle `[Name | Notes | Both]` added inline to header search bar; `searchScope` state persists for the session, default `'both'`
- `useEffect` on `[tier]` clears search when switching Common ↔ Extended
- Bug: `searchableChords` useMemo initially referenced `rootLabel()` which is declared later in the component — caused ReferenceError (black screen) on first render; fixed by inlining `rootLabels.find()` directly

**`electron.vite.config.ts`**
- `optimizeDeps.include: ['fuse.js']` — pre-bundles fuse.js at dev server start, preventing mid-session dep-optimisation reload (black screen) when ChordExplorer mounts for the first time

**`package.json`**
- `fuse.js` added as dependency; version bumped `0.5.0` → `0.6.1`

**`CLAUDE.md`**
- Full redesign: concise structure, Key Files table, Note Naming section, Non-Obvious Architecture section (ParsedMidi private fields, RANGES sync rule, `#/editor` hash routing, Fuse aliases gotcha), Versioning section with MAJOR/MINOR/PATCH rules; removed resolved Known Issue (Chord Explorer search)

---

### 2026-06-28 — Samples audio engine (spessasynth_lib + GeneralUser GS SF2)

**New hook: `src/hooks/useSamplesEngine.ts`**
- `initSamplesEngine(onProgress)` — creates AudioContext, loads AudioWorklet processor, dynamically imports `WorkletSynthesizer`, fetches `GeneralUser-GS.sf2` (30.8 MB) with streaming progress, adds soundbank, wires GainNode
- `buildSamplesPlayer(startSec)` — schedules noteOn/noteOff for all unmuted tracks via setTimeout; respects mute/solo/transpose/BPM ratio; key lighting for `showOnKeyboard` tracks
- `useSamplesEngine()` hook — three subscribers: playback state (play/pause/stop), engine switching (clears schedule when leaving 'samples'), master volume (updates GainNode gain)
- **Volume normalisation**: `SAMPLES_BOOST = 3.0` constant applied to GainNode (`masterVolume × 3`) plus CC7=127 sent to all 16 channels at init and playback start, matching perceived loudness of the GM Synth
- **Engine switching**: detects `audioEngine` transitions — leaving 'samples' calls `clearSchedule()` + `clearAllKeys()`; arriving at 'samples' while playing calls `buildSamplesPlayer(currentTime)`
- **Recursive crash fix**: all `prev*` closure variables updated *before* the if-condition chain — prevents Zustand's synchronous subscriber re-entry from calling `buildSamplesPlayer` recursively when `clearAllKeys()` triggers `setState`
- WorkletSynthesizer imported dynamically (not at module level) to prevent Vite from triggering a mid-session dep-optimisation page reload on first use

**`src/hooks/useAudioEngine.ts`**
- Engine switching: `prevAudioEngineRef` tracks the previous engine; when leaving 'gm' → `stopAudio()`; when arriving at 'gm' while playing → `buildPlayer(currentTime)`
- Replaces `useSF2Engine` import with `useSamplesEngine`; click dispatcher routes to `__orfeoPlayNoteSamples` when `audioEngine === 'samples'`

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- Audio section: functional GM Synth / Samples buttons; Samples click calls `initSamplesEngine` with inline progress bar and status line ("Loading soundfont… X%" → "GeneralUser-GS.sf2 · 30.8 MB · loaded")
- `samplesStatus` / `samplesProgress` local state; switches engine automatically when loading completes

**`src/store/index.ts`**
- `audioEngine: 'gm' | 'samples'` and `setAudioEngine` added to `OrfeoStore` interface (implementation was already present)

**`electron.vite.config.ts`**
- `optimizeDeps.exclude: ['spessasynth_lib', 'spessasynth_core']` — prevents Vite from pre-bundling these large ESM packages, which was causing a mid-session page reload (black screen) on first engine activation

**`package.json`**
- `copyworklet` script copies `spessasynth_processor.min.js` from node_modules to `public/` before dev/build
- `spessasynth_lib: ^4.3.8` added to dependencies

**Deleted: `src/hooks/useSF2Engine.ts`** — replaced by useSamplesEngine

---

### 2026-06-28 — Volume knob + TopBar reset fixes

**New component: `src/components/VolumeKnob.tsx`**
- Interactive SVG dial: central amber circle with rotating dark notch indicator
- 7 fixed dots in a 270° arc (7:30 → 4:30 clockwise); dots at or below the current level render in amber (`#e8a027`), headroom dots in dim tint (`#e8a02738`)
- Drag-to-rotate: `mousedown` starts, document `mousemove` maps angle to 0–1 volume, `mouseup` ends; snaps immediately on click too
- Label column mirrors BPM/KEY structure (8px spacer + VOLUME text) so the label baseline aligns with TEMPO/TRANSPOSE to its left
- Positioned between KEY/TRANSPOSE and the centre transport section; no separator on the right

**`src/store/index.ts`**
- `masterVolume: number` (default `0.8`) + `setMasterVolume` — clamped to 0–1
- Persisted to `orfeo-prefs.json` via the existing display-settings subscriber; restored on startup alongside `noteNaming`/`accidentals`
- `resetAll` now also resets `bpm: 120`, `originalBpm: 120`, `detectedKey: null`

**`src/hooks/useAudioEngine.ts`**
- `applyMasterVolume(v)` — sends MIDI CC 7 (Main Volume) on all 16 channels via `_port`
- Called in `buildPlayer` before `player.play()` so every new playback session inherits the knob position
- New `useEffect` subscriber fires on every `masterVolume` change during live playback or key-click — no player rebuild needed

**`src/components/Transport/TopBar.tsx`**
- BPM value displays `—` when no MIDI file is loaded (matches KEY behaviour); `isTempoChanged` is always false without a file
- VolumeKnob imported and placed after KEY section with `alignItems: center` parent so it sits on the header's horizontal centreline

---

### 2026-06-28 — Inversion display architecture rework + locked chord seed fix

**`src/store/index.ts`** — new fields:
- `explorerChordDisplay: { name, invCount, noteCount } | null` + setters — single source of truth for chord above keyboard when an explorer is open; replaces the previous pattern where explorers called `setDisplayedChord` on an inverted note set
- `lockedChordNoteCount: number` + setter — enables correct modulo wrapping for locked chord inversion labels; `clearLockedKeys` and `resetAll` reset it

**`src/utils/chordDetection.ts`**:
- `formatInversionDisplay` — added `noteCount` parameter; applies `((invCount % noteCount) + noteCount) % noteCount` so labels loop correctly for all chord sizes (3-note: root→1st→2nd→root…; 4-note: adds 3rd; 5/6+: same logic)
- `stripMajorSuffix` — exported; applied at the end of `localizeChord` as a global safety net so `CM`/`GM` can never reach the UI
- `stripMajorSuffix` now also applied inside the solfege branch of `localizeChord`

**`src/components/Keyboard/Keyboard.tsx`**:
- `handleKeyClick` Shift branch — seeds `lockedInversionCount` from `detectChordWithInversion().ordinal` instead of always 0; locking C-F-A (an F 2nd inv) now immediately shows "F/C 2nd inv" and cycles correctly from that position
- Added `explorerDisplay` useMemo — reads `explorerChordDisplay` from store, calls `formatInversionDisplay` with stored noteCount; renders in chord bar with correct modulo label
- Chord bar priority: locked → explorer → MIDI playback → empty; `Nth inv` ordinal label colour changed from `#c0c0d0` to `#707088` globally
- Detection effect guarded: skips `activeKeys` re-detection while any explorer is open, preventing the active-keys path from overriding `explorerChordDisplay` with a wrong re-detected chord name (e.g. `G6` instead of `Em7/G`)

**`src/components/ChordExplorer.tsx`**:
- Removed local `originalChordName`/`inversionCount` state — replaced by `explorerChordDisplay` in store
- `playChordAt` — calls `setExplorerChordDisplay({ name, invCount: 0, noteCount })` instead of local state
- `handleInversion` — updates `explorerChordDisplay.invCount` in store via `useStore.getState()`
- Footer centre restored to plain grey `PLAY INVERSION` text between two `<Play>` Lucide icons (matching ScaleExplorer); chord display removed from footer entirely

**`src/components/ScaleExplorer.tsx`**:
- Same store migration as ChordExplorer — local `originalChordName`/`inversionCount` removed
- `playDegree`, `handlePrevInversion`, `handleNextInversion`, CoF onClick, RotateCcw, close — all wired to `setExplorerChordDisplay`/`clearExplorerChordDisplay`
- Footer centre restored to same plain grey `PLAY INVERSION` text; added hover states to inversion play buttons

---

### 2026-06-27 — Chord inversion display fix (complete)

Core principle: `Chord.detect()` called once on the root-position note set; original chord identity is preserved across all inversion cycling. Never re-detect on an already-inverted set. `stripMajorSuffix()` applied at every return point — no bare `CM`/`GM` in UI.

**`src/utils/chordDetection.ts`** — rewrote inversion detection and added formatting helpers:
- `detectChordWithInversion(midiNotes)` — always returns root-position name (never slash); inversion number derived from bass pitch class position in `Chord.get().notes` list; returns `{ name, invLabel, ordinal }`
- `formatInversionDisplay(originalChordName, inversionNumber, bassNoteMidi, noteNaming, accidentals, showLabel)` — computes `{ chordLabel, invLabel, ordinal }` from stored original name + count; root position returns empty strings; inverted returns `C/E` slash notation + ordinal number
- `ordinalSuffix(n)` — exported helper returning `'st'`/`'nd'`/`'rd'`/`'th'` for superscript rendering
- `stripMajorSuffix()` applied at every return point in both functions

**`src/store/index.ts`** — added locked-chord identity state:
- `originalLockedChordName: string | null` + `setOriginalLockedChordName`
- `lockedInversionCount: number` + `setLockedInversionCount`
- `clearLockedKeys` resets both; `resetAll` resets both

**`src/components/Keyboard/Keyboard.tsx`** — chord bar inversion display:
- `lockedDisplay` useMemo calls `formatInversionDisplay` with `originalLockedChordName` + `lockedInversionCount` + live bass MIDI
- Chord bar renders: amber `chordLabel` (slash notation when inverted) + ordinal superscript + `inv` label
- `handleKeyClick` Shift branch stores `localizeChord(info.name)` as `originalLockedChordName` and resets `lockedInversionCount` to 0
- Playback `displayedChord` (no inversion count known): root amber 14px + `/bass` lighter 11px, no ordinal

**`src/components/Keyboard/KeyboardControls.tsx`** — inversion count tracking:
- `applyInversion` callback updates `lockedInversionCount` in store (`+1` for next, `-1` for prev) after each voicing rotation

**`src/components/ChordExplorer.tsx`** — inversion display in footer:
- Local `originalChordName` + `inversionCount` state; set when a chord tile is clicked (`playChordAt`), reset on close/RotateCcw
- `handleInversion` increments/decrements `inversionCount` by direction
- Footer centre: `formatInversionDisplay` renders chord/bass label + ordinal superscript + `inv`; falls back to "Play Inversion" text when no chord is active

**`src/components/ScaleExplorer.tsx`** — same inversion display pattern as ChordExplorer:
- Local `originalChordName` + `inversionCount` state
- `playDegree` stores `chord.chordName` as `originalChordName` and resets count to 0
- CoF outer and inner ring onClick handlers reset both on key change
- `handlePrevInversion` decrements count; `handleNextInversion` increments count
- RotateCcw handler resets both alongside all other state
- Footer "PLAY INVERSION" static span replaced with `formatInversionDisplay` dynamic rendering — shows slash notation + ordinal superscript when inverted, falls back to static label otherwise

---

### 2026-06-27 — Manual chord lock mode redesign

**`src/components/Keyboard/Keyboard.tsx`**
- Chord bar now shows the locked chord name + inversion label when a manual lock is active — computed via `detectChordWithInversion` + `useMemo` directly in the component; takes priority over `displayedChord` from playback

**`src/components/Keyboard/KeyboardControls.tsx`**
- Removed chord name / inversion display from the bottom row (moved to chord bar above)
- Bottom row locked state restructured: `LOCKED CHORD` dim label left, then `[◂ Play] [PLAY outlined amber] [Play ▸]` inversion player, then `RotateCcw` clear — styled to match ScaleExplorer footer
- Removed `detectChordWithInversion`, `localizeChord`, `ChevronLeft`, `ChevronRight` imports; added `RotateCcw`

**`src/components/ChordExplorer.tsx`**
- Removed `setKeyboardSize(61)` and prevSizeRef restore — ChordExplorer no longer forces 61-key (61-key is ScaleExplorer-only; default stays at 73)
- RotateCcw reset button now also calls `clearLockedKeys()` when a chord is locked

**`src/components/ScaleExplorer.tsx`**
- RotateCcw reset button now also calls `clearLockedKeys()` when a chord is locked

---

### 2026-06-27 — ScaleExplorer bug fixes

**`src/components/ScaleExplorer.tsx`**

- **Chord keyboard range** — `buildDiatonicChord` octave preference order changed from `[4,3,5,2]` to `[3,4,2,5]`; chord roots now land in C3–B3 (MIDI 48–59) by default, keeping full triads within the C3–C5 range instead of starting at C4 and climbing higher
- **Inversion player** — removed `inversionStep` state and `playInversion` callback; `handlePrevInversion` / `handleNextInversion` now read live `explorerKeys` from the Zustand store and rotate in-place using `prevInversionSet` / `nextInversionSet` module helpers (identical pattern to ChordExplorer's `handleInversion`); voicings now traverse the full keyboard range in both directions indefinitely instead of wrapping after N chord tones

---

### 2026-06-27 — Progressions row redesign + SpeedControl

**New component: `src/components/SpeedControl.tsx`**
- SVG speed selector with three fixed nodes (slow / med / fast)
- Active node: amber fill + drop-shadow glow filter; inactive: stroke-only with `fill="transparent"` for full-disc click area
- Two track segments (slow→med, med→fast) so no line crosses the middle node
- `mix-blend-mode: lighten` on all elements prevents alpha seam at node/track junctions
- "Speed" label right-aligned above the fast node

**ScaleExplorer + ChordExplorer — progressions row (`src/components/ScaleExplorer.tsx`, `src/components/ChordExplorer.tsx`)**
- Three-column layout: left (PROGRESSIONS label + dropdown), centre absolute (PLAY/STOP + SpeedControl), right (INVERSIONS label + icon buttons)
- PLAY/STOP button: outlined style — amber border + glow at rest, red border + glow during playback; `<Play>`/`<Square>` Lucide icons; tooltip "Pick a pattern to play a progression" when disabled
- Inversion mode buttons: `<CircleOff>` / `<ListOrdered>` / `<Shuffle>` icons replace Off/Sequential/Random text buttons
- Chord Quality info row (ScaleExplorer): all progression steps shown as roman numerals on one line; active step amber/bold 12px, inactive dim 11px
- Progressions dropdown: two-column layout — name (minWidth 90px) + roman numerals (JetBrains Mono 9px, opacity 0.65); container minWidth 260px

**ScaleExplorer footer**
- `‹` / `›` chevrons replaced with `<Play size={14}>` / `<Play size={14} scaleX(-1)>` Lucide icons
- RotateCcw reset button: `title="Clear & reset"` tooltip added
- "Chord Explorer" link: uppercased + `<ArrowUpRight>` icon replaces `→`

---

### 2026-06-26 — Scale Explorer layout polish (round 3–4)

All changes in `src/components/ScaleExplorer.tsx`:

- **Guideline text always visible** — removed `selectedRoot === null` condition; the hint text ("Click a key on the circle…") now shows at all times, including when a key is selected alongside the info box
- **CoF section height +30px** — increased bottom padding from 16px to 46px; the "CHORDS IN THE SCALE" label and bottom-circle accidentals are no longer cramped; all four bottom rows shift down
- **Scale column vertical alignment** — added `marginTop: 20` to correct a systematic 20px offset between the scale buttons midpoint and the CoF circle centre (caused by SVG geometry: CY + viewBox offset = 230px vs `alignSelf:center` = 210px in a 420px flex line)
- **Accidental gap uniformity** — replaced uniform-multiplier sigR with a font-size-scaling formula: font shrinks for longer strings (1–3 chars → fs 11, 4–5 → fs 9, 6–7 → fs 8) with matching char-half-width so the inner text edge stays ~8–9px from the ring for all 12 positions; sigR range narrows from 185–215 to 187–201

---

### 2026-06-25 — Scale Explorer layout polish (rounds 1–2)

All changes in `src/components/ScaleExplorer.tsx`:

- Info box moved to absolute overlay (top: 0, centered on CoF axis) — no longer a flex sibling that compressed the SVG wrapper
- Guideline text repositioned to absolute top-left of CoF section
- CoF section changed to `position: relative` to anchor both overlays
- Scale buttons column set to `alignSelf: center`
- "CHORDS IN THE SCALE" label moved to absolute bottom of CoF section
- Chord button padding increased to 8px top/bottom
- Bottom 4 rows reordered: chord tiles → chord/inversion info → progressions/inversions → SHOW AS footer
- All 4 bottom rows: `minHeight: 44`
- Play/Stop button: always red (`#c0392b` bg, `#e74c3c` hover)
- SVG viewBox extended to `"0 -40 380 420"` so top accidentals render fully

---

### 2026-06-24 — Scale Explorer (initial implementation)

- New modal: `src/components/ScaleExplorer.tsx` (~970 lines)
- Zustand store: `scaleExplorerOpen` / `setScaleExplorerOpen`
- Circle of Fifths SVG (12 wedges, outer = major, inner = minor)
- 10 scale types with diatonic chord grid, Roman numeral progressions, inversion cycling
- Footer ‹ PLAY INVERSION › pattern (same as ChordExplorer)
- ChordExplorer ↔ ScaleExplorer switching buttons
- Both explorers force 61-key layout; Keyboard.tsx font conditions updated

---

### 2026-06-23 — Chord Explorer enhancements

- Progressions, inversion modes, layout polish
- `displayedChord` added to Zustand store
- ChordExplorer search (known issue: unreliable across naming systems)

## [0.5.2] — 2026-06 — Scale Explorer
> Session 10 | Branch: dev

### Added
- Scale Explorer modal (`ScaleExplorer.tsx`) — 720px draggable; opens from "Scales" trigger right side of chord bar
- Circle of Fifths SVG — 380×380; outer (major) + inner (relative minor) rings; amber selection; ♯/♭ symbols staggered at alternating radii
- 10 scale types; notes play ascending including octave root note
- Diatonic chord grid — 7 tiles; Roman numeral labels; click to light keyboard and play
- Info row, chord/inversion display row, progressions (20 named), SpeedControl, modal switching
- App launches maximized; both modals default-position above keyboard on open

### Changed
- "Scales" trigger added right side of keyboard chord bar
- Key label font sizes enlarge when either explorer is open
- App.tsx Space/Escape guards check `scaleExplorerOpen`

### Fixed
- Scale replays on every COF click (playTrigger counter)
- Clear button resets all local Scale Explorer state
- Explorers always open fresh via useEffect reset

---

## [0.5.1] — 2026-06 — Chord Explorer
> Session 09 | Branch: dev

### Added
- Chord Explorer modal (`ChordExplorer.tsx`) — 600px draggable; pauses playback on open
- Root selector, Common/Extended chord grid, Hand filter, Note count filter, Search
- Inversion browser — `‹ PLAY INVERSION ›` centred footer; RotateCcw clears
- Accidentals toggle in footer; Chord Progressions (15 named); Logo click reset

### Changed
- All rows: label-left / controls-right; modal width 540px → 600px
- `displayedChord` moved to Zustand store; chord bar label → `Locked Chord`
- PROGRESSIONS + INVERSIONS merged into one row

### Fixed
- CE naming: pitch class 10 always `'B'` (was `'A#'`)
- RotateCcw clears chord bar display; explorer keys excluded from persistence

---

## [0.5.0] — 2026-06 — UI Polish, Tempo Map Metronome, Piano Roll Range Fix
> Session 08 | Branch: dev → main

### Added
- Tempo map metronome — persistent 25ms interval; handles mid-file tempo changes
- MIDI tempo map extraction (`_tempoMap`); BPM display tracks changes
- BPM long-press — hold ▲/▼ to accelerate; `LongPressArrow` component
- Warm theme functional; Zoom wired to PianoRoll renderer
- Piano roll key range respects selected keyboard size (was hardcoded 88)
- User Manual link; Floating keyboard width-only resize

### Changed
- Left drawer width 220px → 260px; Library tab default; opens on launch
- Note naming buttons: UK/US, EU, Hide
- Piano roll grid — black-key shading + C-note dividers; playhead 1px → 2px
- Keyboard height proportional via ResizeObserver; metronome levels/pitch/lookahead tuned
- `package.json` version 0.2.1 → 0.5.0

### Fixed
- Library subfolder `ChevronDown` missing import; chord tooltip direction

---

## [0.3.2] — 2026-06 — Floating Keyboard, Chord Display During Playback, Metronome Alignment
> Session 07 | Branch: dev

### Added
- Floating keyboard (`FloatingKeyboard.tsx`) — draggable; boundary-clamped; pin and × re-dock
- Keyboard size button tooltips

### Changed
- Chord debounce during playback 320ms → 60ms; clears immediately below 3 notes
- `accidentals` added to chord display effect dependency array
- Metronome aligns first click to next grid-aligned beat at current playback position

### Fixed
- Float button toggled store but no floating panel existed — now real

---

## [0.3.1] — 2026-06 — Library Subfolders, MIDI Editor Fixes, Settings Persistence
> Sessions 05/06 | Branch: dev

### Added
- Library subfolder support — recursive scan; collapsible headers; Windows paths normalised
- Full GM instrument list — all 128 programs across 16 families
- Pencil icon turns amber when MIDI editor open; resets via `editor:closed` IPC

### Changed
- `noteNaming` + `accidentals` persisted with null sentinel fix; MIDI editor undo-merge in-place
- Output filename dynamically switches `_ORFEO` / `_ORFEO_MERGED`
- Drums show plain "Standard Drums"; GM family icons 12px → 15px

### Fixed
- Library file click silently failed; first subscriber fire overwrote saved prefs

---

## [0.3.0] — 2026-06 — Left Drawer, Library, MIDI Editor, UI Polish, Build Pipeline
> Session 04 | Branch: dev → main

### Added
- Left settings/library drawer (`SettingsPanel.tsx`) — Settings + Library tabs
- MIDI file library — folder picker, star toggle, persistent, click to load
- Accidentals toggle — `convertAccidentals()` single source of truth
- MIDI Playback Editor (`MidiEditor.tsx`) — separate Electron window; track include/exclude; GM reassignment; track merge; Save & Reload (`_ORFEO.mid`)
- Build pipeline — `electron-builder` + NSIS; real app icon
- SF2 audio engine scaffold; design token system; chord detection rewrite; chord lock

### Changed
- TopBar redesigned; track panel auto-opens on MIDI load; `titleBarStyle: 'hidden'`
- Default keyboard size 73 keys; metronome rewritten (Web Audio API lookahead)

### Fixed
- `showOnKeyboard` flag before key lighting; mouse click uses channel 14 + Grand Piano

---

## [0.2.0] — 2026-06 — MIDI Playback, Audio Engine, Visual Polish
> Sessions 02/03 | Branch: dev

### Added
- MIDI file open dialog; MIDI parser; PixiJS piano roll (falling notes, 60fps)
- Visual clock (rAF + `performance.now()`); Tone.js audio engine (`Tone.Part` + `Tone.Transport`)
- Key lighting — `activeKeys` / `activeKeyColors`; piano-family tracks only

### Fixed
- App freeze on startup (JZZ lazy init); infinite loop in Zustand subscriber
- Transpose not affecting audio; topbar padding cramped by Windows titlebar overlay

---

## [0.1.0] — 2026-06 — Initial Scaffold
> Session 01 | Branch: main

### Added
- Electron + Vite + React + TypeScript scaffold via electron-vite
- PixiJS piano roll (WebGL); Zustand store; `@tonejs/midi` parser; `tonal.js` chord detection
- Note naming: English, Central European (H), Solfège, Hidden
- Virtual keyboard (61/73/88); track panel; amber `#e8a027` theme on `#0f0f12`
- Inter + JetBrains Mono typography; CSS variables; Tailwind
- README, CHANGELOG, ROADMAP, ARCHITECTURE

### Technical Decisions
- PixiJS over Canvas — WebGL for large MIDI files
- Zustand over Redux — simpler boilerplate
- Central European note naming (H = B natural) for Slovenian/German/Croatian users