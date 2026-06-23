# Orfeo — Session 05 Changelog (Final)
> Date: June 2026 | Version: v0.3.0 | Branch: dev → main

---

## Overview
Session 05 delivered the left settings/library drawer, accidentals toggle, SF2 audio engine scaffold, and the full MIDI Playback Editor window (instrument reassignment, track include/exclude, track merge). Multiple iterative fixes were applied during testing.

---

## Stage 5a — Left Settings Drawer

**New files:**
- `src/components/SettingsPanel/SettingsPanel.tsx` — collapsible left drawer with Settings tab

**Updated files:**
- `src/store/index.ts` — added `settingsPanelOpen`, `setSettingsPanelOpen`
- `src/App.tsx` — SettingsPanel placed left of piano roll

**Settings tab contains:**
- Note naming selector (English / Central European / Solfège / Hidden) with live preview
- Accidentals toggle (♭ Flats / ♯ Sharps) — hidden when naming = Hidden
- Keyboard size selector (61 / 73 / 88)
- Zoom level control (6 stepped levels with dot-track slider)
- Audio section (GM Synth active, Samples stub)
- Appearance section (background color stub)
- About block with version + GitHub link

---

## Stage 5b — Accidentals Toggle

**Single source of truth:** `convertAccidentals()` in `noteNames.ts` handles all flat↔sharp conversion. Every display path routes through it.

**Updated files:**
- `src/types/index.ts` — added `Accidentals = 'flat' | 'sharp'`
- `src/store/index.ts` — added `accidentals: 'flat'`, `setAccidentals()`
- `src/utils/noteNames.ts` — full rewrite; sharp + flat arrays for all naming systems; `convertAccidentals()` as single converter
- `src/utils/keyDetection.ts` — `formatKey()` accepts `accidentals` param; separate sharp/flat root name arrays; **fixes key display not syncing on naming/accidental change**
- `src/utils/chordDetection.ts` — `localizeChord()` accepts `accidentals`, calls `convertAccidentals()`
- `src/components/Keyboard/Keyboard.tsx` — reads `accidentals` from store, passes to all note name functions
- `src/components/Transport/TopBar.tsx` — reads `accidentals`, passes to `formatKey()`

---

## Stage 5b — Library Tab

**New tab added to left drawer:** Settings ⚙ / Library ♪ switchable via tab icons at top.

**Library tab features:**
- Folder picker via native `openDirectory` dialog
- Scrollable `.mid` / `.midi` file list (sorted alphabetically)
- Starred files float to top
- Star (★) toggle per file — persists across sessions
- Refresh button to rescan folder
- All / ★ filter tabs
- Click any file → loads immediately into piano roll

**Updated files:**
- `src/components/SettingsPanel/SettingsPanel.tsx` — tabbed layout, LibraryPanel component
- `src/store/index.ts` — `libraryFolder`, `libraryFiles`, `libraryFavourites`, `setLibraryFolderAndFiles()` (atomic setter, fixes first-click empty list bug), `loadLibraryFile()`
- `electron/main.ts` — `dialog:openFolder`, `fs:scanMidiFolder`, `fs:loadMidiFromPath`, `prefs:get`, `prefs:set` IPC handlers
- `electron/preload.ts` — all new channels exposed
- `src/types/index.ts` — `LibraryFile` interface, updated `Window.electronAPI` type

**Persistence:** folder path + favourites saved to `orfeo-prefs.json` in Electron `userData` (`C:\Users\...\AppData\Roaming\Orfeo`). Restored 500ms after app start via `setTimeout(restoreLibraryPrefs, 500)` in store — runs in background, never blocks render.

**Fixes applied during testing:**
1. First-click empty list → fixed with `setLibraryFolderAndFiles()` atomic store setter
2. App slower + black Library screen → removed `useEffect` restore from component, moved to store background timer
3. Folder picker briefly replaced with file picker → reverted to `openDirectory`; `savePrefs` was undefined → rewrote complete `main.ts` with all prefs functions in correct order
4. File click not loading → `handleLoadFile` now calls IPC + parser directly instead of going through `loadLibraryFile` store action

---

## Stage 5c — SF2 Audio Engine (partial)

**New files:**
- `src/hooks/useSF2Engine.ts` — soundfont-player based engine; self-gates on `audioEngine !== 'sf2'`

**Updated files:**
- `src/hooks/useAudioEngine.ts` — mounts SF2 engine alongside GM; click note handler routes based on store
- `src/store/index.ts` — `audioEngine: 'gm' | 'sf2'`, `setAudioEngine()`
- `src/components/SettingsPanel/SettingsPanel.tsx` — Samples button now functional

**Known issue — deferred:** `soundfont-player` with MusyngKite soundfont plays all instruments including drums through the piano instrument. Not suitable for GM multi-track playback. Samples button left in UI but GM Synth remains default. Proper SF2 implementation deferred to a future stage using a dedicated SF2 renderer.

**New dependency:** `soundfont-player` (run `npm install soundfont-player`)

---

## Stages 5d/5e/5f — MIDI Playback Editor (delivered as single clean package)

All three stages were rebuilt from the actual current codebase after earlier packages caused conflicts. Delivered as `stage5d_clean.zip`.

### New files:
- `src/components/MidiEditor/MidiEditor.tsx` — full editor with all features

### Updated files:
- `electron/main.ts` — editor window IPC, save/merge handler, all library + prefs handlers
- `electron/preload.ts` — all channels including editor
- `src/App.tsx` — `#/editor` hash routing, `onMidiReload` listener
- `src/store/index.ts` — all library state + persistence
- `src/types/index.ts` — full electronAPI type
- `src/utils/midiParser.ts` — stores `_filePath` and `_rawMidiTracks` on parsed result
- `src/hooks/useMidiFile.ts` — passes `filePath` to `parseMidiBuffer`
- `src/components/TrackPanel/TrackPanel.tsx` — Pencil (✎) button in header; pencil selector matched actual header structure (`Tracks` not `TRACKS`)
- `src/components/SettingsPanel/SettingsPanel.tsx` — library tab with persistence

### MIDI Editor features:
**Track Include/Exclude**
- Green ✓ / grey ✗ toggle per track
- Default state inherits current mute state
- Only included tracks written to output file

**Instrument Reassignment**
- Collapsible GM family picker (12 families: Piano, Chromatic Perc, Organ, Guitar, Bass, Strings, Ensemble, Brass, Reed, Pipe, Synth, Ethnic)
- Searchable — type to filter across all families
- Current instrument highlighted in amber
- "✎ reassigned" badge on changed tracks
- Drums channel always shows "🥁 Standard Drums", not reassignable

**Track Merge**
- MERGE column checkboxes
- Select 2+ tracks → "Merge (N)" button appears with explanation tooltip:
  *"Combines selected tracks into one — all their notes play together on the keyboard. Useful when a melody and chords are split across separate tracks. To undo: close and reopen the editor."*
- Merged row shows "⊞ merged N" badge with source track names listed
- ↺ button removes merge before saving
- On save: notes concatenated + sorted by time in `main.ts`

**Save & Reload**
- Output filename defaults to `originalname_ORFEO.mid`
- Browse button to pick custom output path
- Original file never modified
- On save: writes file, signals main window via `midi:reloadFile` IPC, main window auto-reloads
- Notice: "Original file is never modified. Saved as _ORFEO copy, auto-loads on save."

### UI polish applied after testing:
- Window: `titleBarStyle: 'hidden'` with native overlay buttons, styled `#111116` / `#707088` — matches main window style, no grey Windows chrome
- Window title: "Orfeo MIDI Playback Editor"
- Column headers: Include / Merge / Track / Assign Instrument (was INCL / MERGE / INSTRUMENT)
- Save & Reload button: `flex: 1` — same width as Cancel (was `flex: 2`, too wide)
- Merge toolbar expanded with description text when tracks selected

---

## Infrastructure Changes

### .gitignore additions:
```
node_modules/
release/
dist/
out/
```

### Git workflow established:
- `dev` branch for active development
- `main` branch = last stable tagged release
- Merge dev → main when session is fully tested
- Tag each stable release: `git tag v0.x.x && git push origin v0.x.x`

### Build commands confirmed working:
```
npm run dev      # development with hot reload
npm run build    # compiles to out/
npm run dist     # packages to release/ (.exe installer)
```

---

## Known Issues Carried into Stage 6

| # | Issue | Notes |
|---|---|---|
| 1 | Metronome clicks at its own tempo | Unrelated to loaded MIDI file BPM. Needs to derive tempo from JZZ playback clock |
| 2 | Chord display doesn't update during playback | Only updates on manual key clicks. Needs wiring to active note stream |
| 3 | Floating keyboard not draggable | Mode toggle works but window doesn't actually float/drag |
| 4 | SF2 samples engine | soundfont-player unsuitable for GM multi-track; needs dedicated SF2 renderer |
| 5 | Library doesn't scan subfolders | Only top-level `.mid` files shown |
| 6 | MIDI Editor: undo merge | Currently: close + reopen. Could be improved with in-session state stack |

---

## File Change Summary

| File | Change |
|---|---|
| `electron/main.ts` | Prefs, library, editor window, save/merge — complete rewrite |
| `electron/preload.ts` | All IPC channels — complete rewrite |
| `src/App.tsx` | Editor routing, reload listener |
| `src/store/index.ts` | accidentals, audioEngine, library state, persistence restore |
| `src/types/index.ts` | Accidentals, LibraryFile, full electronAPI type |
| `src/utils/noteNames.ts` | Full rewrite — convertAccidentals() as single source of truth |
| `src/utils/keyDetection.ts` | formatKey() with accidentals param |
| `src/utils/chordDetection.ts` | localizeChord() with accidentals param |
| `src/utils/midiParser.ts` | Stores _filePath and _rawMidiTracks |
| `src/hooks/useMidiFile.ts` | Passes filePath to parseMidiBuffer |
| `src/hooks/useAudioEngine.ts` | Routes to SF2 or GM |
| `src/hooks/useSF2Engine.ts` | New — soundfont-player engine (partial) |
| `src/components/SettingsPanel/SettingsPanel.tsx` | New — tabbed Settings + Library drawer |
| `src/components/MidiEditor/MidiEditor.tsx` | New — full MIDI editor window |
| `src/components/TrackPanel/TrackPanel.tsx` | Pencil edit button |
| `src/components/Keyboard/Keyboard.tsx` | Accidentals passed to note name functions |
| `src/components/Transport/TopBar.tsx` | Accidentals passed to formatKey |
