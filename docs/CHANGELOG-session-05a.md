# Orfeo — Session 06 Changelog
> Date: June 2026 | Version: v0.3.1 | Branch: dev

---

## Overview
Session 06 was a polish and fix pass on Stage 5 deliverables. No new major features — focused on library UX, MIDI editor fixes, settings persistence, and visual refinements.

---

## Fixes Applied

### Library Panel

**Subfolder support**
- `electron/main.ts` — `fs:scanMidiFolder` now recursively scans all subdirectories. Files anywhere in the folder tree are included.
- `src/components/SettingsPanel/SettingsPanel.tsx` — files grouped by subfolder with collapsible folder headers (chevron toggle). Root-level files appear at top, subfolders below sorted alphabetically. Files inside subfolders indented. File count badge per folder header.
- Fixed Windows backslash path issue — normalized both file path and library root to forward slashes before extracting relative subfolder name (`normFile`/`normRoot` approach).

**Library file click**
- `handleLoadFile` in `SettingsPanel.tsx` now calls IPC + parser directly instead of routing through `loadLibraryFile` store action, eliminating a silent failure path.

**First-click empty list** (carry-forward fix)
- `setLibraryFolderAndFiles()` atomic store setter confirmed in place.

---

### Settings Persistence

- `src/store/index.ts` — `noteNaming` and `accidentals` now saved to `orfeo-prefs.json` on every change via a debounced `useStore.subscribe` callback.
- Restore function (`restoreLibraryPrefs`) now also calls `store.setNoteNaming()` and `store.setAccidentals()` on startup.
- **Critical fix:** subscriber used a null sentinel (`_prevNoteNaming = null`) so the very first fire (app init with default values) is skipped — previously the first fire was overwriting saved prefs before restore had run.

---

### MIDI Playback Editor

**Undo merge — in-place reload**
- `handleUnmerge` no longer closes and reopens the editor window.
- Now calls `getMidiEditorData()` to fetch original track list, rebuilds all rows from scratch with `isMerged: false`, and calls `setState` in-place.
- Output filename reverts to `_ORFEO` suffix on undo.

**_ORFEO_MERGED suffix**
- `orfeoName(path, hasMerge)` function updated — returns `_ORFEO_MERGED` when any merge groups are present, `_ORFEO` otherwise.
- Output path in the Save As field updates live as soon as tracks are merged or unmerged.
- `handleSave` uses `finalOutput` calculated from merge state, not just `state.outputPath`.

**Drums row**
- Drums tracks no longer show an instrument picker (there is nothing to assign — GM channel 10 is always drums).
- Shows plain "Standard Drums" label with tooltip "Not assignable — GM channel 10 is always drums" on hover.

**Complete GM instrument list — all 128 programs**
- Synth family split into three: Synth Lead (80–87), Synth Pad (88–95), Synth FX (96–103)
- Added Percussive family (112–119): Tinkle Bell, Agogo, Steel Drums, Woodblock, Taiko, Melodic Tom, Synth Drum, Reverse Cymbal
- Added Sound FX family (120–127): Guitar Fret Noise, Breath Noise, Seashore, Bird Tweet, Telephone Ring, Helicopter, Applause, Gunshot
- All 128 GM programs now covered across 16 families

**GM family icons — Lucide, 15px**
- All family headers now use Lucide icons at 15px (was 12px — too small, looked grainy)
- New icon assignments: `Waves` for Synth Pad, `Sparkles` for Synth FX, `Drum` for Percussive, `Radio` for Sound FX

**Pencil icon state**
- `src/components/TrackPanel/TrackPanel.tsx` — pencil icon turns amber when editor is open, resets to grey when editor window is closed
- `electron/main.ts` — sends `editor:closed` IPC event on editor window close
- `electron/preload.ts` — exposes `onEditorClosed` listener
- `src/components/TrackPanel/TrackPanel.tsx` — `useEffect` listens for `editor:closed` and resets `editorOpen` state

---

### Chords Bar

- `src/components/Keyboard/Keyboard.tsx` — tooltip text color lightened: main text `#b0b0cc`, secondary `#8888aa`
- ‹ › inversion arrows now amber (`#e8a027`) in tooltip text
- ▶ play button now amber always (was grey `#606080`)
- Chevron inversion buttons lightened to `#707088`

---

### Bottom Bar (KeyboardControls)

- `src/components/Keyboard/KeyboardControls.tsx` — size buttons default color dimmed to `#404055`, lighten to `#c0c0d0` on hover
- Dock/Float button default `#404055`, turns amber on hover
- Note counter slightly lighter `#505068`

---

## Files Changed This Session

| File | Change |
|---|---|
| `electron/main.ts` | Recursive subfolder scan, `editor:closed` IPC event, prefs handlers |
| `electron/preload.ts` | `onEditorClosed` listener exposed |
| `src/store/index.ts` | noteNaming/accidentals persistence with null sentinel fix |
| `src/components/SettingsPanel/SettingsPanel.tsx` | Subfolder grouping, Windows path fix, direct IPC file load, useMemo import |
| `src/components/MidiEditor/MidiEditor.tsx` | Undo in-place, _ORFEO_MERGED suffix, full GM list, drums row, icon sizes, Lucide icons |
| `src/components/TrackPanel/TrackPanel.tsx` | Amber pencil + useEffect reset on editor close |
| `src/components/Keyboard/Keyboard.tsx` | Chord tooltip lighter text, amber icons |
| `src/components/Keyboard/KeyboardControls.tsx` | Bottom bar hover colors |

---

## Known Issues Carried into Stage 7

| # | Issue | Notes |
|---|---|---|
| 1 | Metronome clicks at its own tempo | Unrelated to MIDI file BPM |
| 2 | Chord display doesn't update during playback | Only works on manual key clicks |
| 3 | Floating keyboard not draggable | Mode toggle works, window doesn't float |
| 4 | SF2 samples engine | soundfont-player unsuitable; proper SF2 deferred |
| 5 | Editor window icon/logo | Orfeo O mark SVG needs refinement |
| 6 | MIDI editor: reassigned badge | ✎ reassigned text + ↺ reset icon in track row |

---

## Git Push Instructions

```bash
# Commit all changes on dev branch
git add .
git commit -m "v0.3.1 — Session 06: library subfolders, editor fixes, settings persistence"
git push origin dev

# When ready to merge to main:
git checkout main
git merge dev
git push origin main
git tag v0.3.1
git push origin v0.3.1
git checkout dev
```

---

## Stage 7 Plan (next session)

1. **Metronome sync** — derive tick from JZZ playback position
2. **Chord display during playback** — wire active note stream to chord detector
3. **Floating keyboard** — actual draggable panel
4. **General polish** — tooltips on all controls, responsive resize
5. **Full UI styling pass** — editor icon, topbar refinements, font sizes
