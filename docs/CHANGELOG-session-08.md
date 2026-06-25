# Orfeo — Session 08 Changelog
> Date: June 2026 | Version: v0.5.0 | Branch: dev

---

## Overview
Major UI polish session covering the left/right drawers, settings panel, piano roll, floating keyboard, topbar, and a complete metronome rewrite with MIDI tempo-map support. Version bumped to 0.5.0 — the app is now visually and functionally stable enough to call it a real beta.

---

## Left Drawer (SettingsPanel)

- Width increased from 220px → 260px to match right TrackPanel exactly
- Library tab is now the **default tab** on open (was Settings)
- Drawer **opens by default** on first app launch
- Closed icon changed from `Settings2` → `ListMusic size={18}` — more descriptive
- Closed icon size matched to right drawer (`size={18}`)
- Tooltip changed from "Open panel" → "Open Library & Settings"
- Amber hover on toggle button (matches right drawer)
- **User Manual** link added at very bottom of drawer — opens `github.com/SquareBow/orfeo/.../HOW_TO_USE.md` in system browser via `shell.openExternal` IPC
- `BookOpen` Lucide icon + ↗ external link indicator

### Library panel fixes
- **Root cause fixed:** `ChevronDown` was used but not imported — entire folder rendering silently crashed. Now imported correctly
- Subfolders now appear **at the top**, root files below
- Folders default to **collapsed** state (click ▶ to expand)
- Folder hover background added so they feel clickable
- Note added to changelog: subfolders only appear when they contain at least one MIDI file — empty folders are intentionally hidden

---

## Right Drawer (TrackPanel)

- Closed icon: custom music SVG restored (was incorrectly replaced with SlidersHorizontal)
- Closed icon size bumped to `size={20}` to visually match left drawer
- Amber hover on toggle button added

---

## Settings Panel — Settings Tab

- Note naming buttons renamed: English → **UK / US**, C. Euro → **EU**, Hidden → **Hide**
- **Warm theme** made functional — clicking Warm now changes background from `#0f0f12` → `#12100e` across all components including PixiJS canvas
- `appTheme` added to Zustand store; `App.tsx` and `PianoRoll.tsx` both read it
- **Zoom** now actually works — `VISIBLE_SECONDS / zoomLevel` passed to PianoRoll renderer; hint text shows seconds visible in real time
- Audio engine: second button renamed from `Samples` → `SF2` (more precise); tooltip updated
- Version display updated: `v0.3.0` → `v0.5.0`

---

## TopBar

- **BPM long-press** — hold ▲/▼ chevrons to accelerate through values; 400ms delay then 120→40ms interval ramp. Uses `useStore.getState().bpm` to avoid stale closure
- `LongPressArrow` component added (replaces `ArrowBtn` for BPM)
- **BPM / TEMPO** label stack — both words left-aligned, same font size (8px)
- **KEY / TRANSPOSE** label stack — same treatment
- Metronome icon: hand-drawn SVG replaced with official Lucide metronome paths (inlined since `Metronome` not in installed lucide version)
- **SlidersHorizontal** (Lucide) replaces custom SVG on right-drawer closed toggle — correct placement confirmed
- MidiIcon (custom SVG) restored to MIDI slot in topbar right section
- MIDI device label shows first word of device name when connected (e.g. "Roland")
- Metronome and MIDI icons sized to `24px` to match BPM value visual weight

---

## Piano Roll

- **Key range now matches keyboard selection** — `RANGES` dict added matching `Keyboard.tsx` exactly (61: 36–96, 73: 28–103, 88: 21–108). Previously hardcoded to 88 keys regardless of selection
- `buildKeyLayout` now takes `midiMin/midiMax` parameters — grid and note positions are always correct for the selected keyboard size
- Grid redraws automatically when `keyboardSize` changes in store
- **Grid visual** — removed dense per-key vertical lines. Now shows:
  - Subtle dark shading behind black key columns (`#161620`) — shows piano structure
  - C-note octave dividers (`#2e2e48`, 1px) — one per octave, properly aligned
- **Playhead** — thickness 1px → 2px, opacity 0.6 → 0.85, drawn at `W+1` to guarantee full-width coverage

---

## Virtual Keyboard

- **Proportional height** — `ResizeObserver` computes `whiteKeyWidth × 4.0`, clamped 80–140px. Keys resize as window changes rather than fixed 130px
- **Chord display during playback** — debounce reduced 320ms → 60ms during playback; chord clears immediately when active notes drop below 3 (no ghost chord); manual (non-playback) behaviour unchanged
- **Chord tooltip** direction fixed — opens downward instead of being clipped at top of chord bar

---

## Floating Keyboard

- Complete rewrite — width-only resize with left/right edge handles (650–1200px)
- **No fixed height** — panel height is driven entirely by content; no black empty space below keyboard
- Default width 860px (approximately the right size for most screens)
- Drag handle in title bar for repositioning; Y position tracked correctly
- Pin (dock) and × buttons both dock the keyboard back
- Grip dots removed from title bar

---

## Metronome — Complete Rewrite

### Architecture change
Old: `startMetronome()` captured BPM in a closure; BPM-change detection was broken; `activeRef` guard prevented restarts; BPM updates only on start.

New: Single persistent `setInterval(25ms)` reads **all values fresh from store every tick** — no stale closures, no BPM tracking refs, no restarts needed.

### Tempo map support
- `midiParser.ts` now extracts the full tempo map (`_tempoMap: [{bpm, time}]`) from `midi.header.tempos`
- `getBpmAtTime(tempoMap, currentTime)` looks up the correct BPM for the current playback position
- Metronome correctly handles songs that change tempo mid-file
- User tempo ratio (`bpm / originalBpm`) applied on top — so 50% speed = metronome at 50%
- `TempoEvent` interface and `_tempoMap` field added to `ParsedMidi` type

### BPM display update
- Displayed BPM in topbar updates as playback moves through tempo changes
- `setState` moved out of audio loop into debounced `setTimeout(80ms)` — pure AudioContext operations in the hot path only
- Guard: only overwrites store BPM if user hasn't manually adjusted tempo ratio

### Metronome stop debounce
- Stop is debounced 80ms so transient pauses (e.g. wheel scrub pause/resume cycle) don't restart the scheduler
- Prevents metronome clicks from stacking or misfiring during scroll seek

### Sound
- Accent volume: 0.55 → 0.9, beat volume: 0.3 → 0.6
- Accent pitch: 1200Hz → 1400Hz, beat pitch: 900Hz → 1000Hz
- Lookahead: 100ms → 150ms for smoother scheduling

---

## Infrastructure

- `shell.openExternal` added to `electron/preload.ts` and `electron/main.ts` for opening URLs in system browser
- `package.json` version bumped: `0.2.1` → `0.5.0`

---

## Known Issues / Deferred

| # | Issue | Notes |
|---|---|---|
| 1 | Metronome BPM detection inaccuracy | Some MIDI files have incorrect/missing tempo metadata (e.g. "Live and Let Die" shows 110 BPM instead of ~60). Better-quality MIDI files have better tempo maps. No fix possible without manual BPM tap or override |
| 2 | HOW_TO_USE.md rewrite | Entire manual is outdated — full rewrite deferred to dedicated session |
| 3 | SF2 soundfont engine | GeneralUser GS planned; audio quality must not change until everything else works |
| 4 | Metronome fine-tuning | Timing is functional but may need further lookahead/interval tweaking |

---

## Files Changed This Session

| File | Change |
|---|---|
| `package.json` | Version 0.2.1 → 0.5.0 |
| `electron/main.ts` | `shell.openExternal` IPC handler |
| `electron/preload.ts` | `openExternal` exposed to renderer |
| `src/store/index.ts` | `appTheme` state + `setAppTheme` action |
| `src/index.css` | Warm theme CSS vars |
| `src/App.tsx` | Theme class + `keyboardMode` conditional render + `FloatingKeyboard` |
| `src/types/index.ts` | `TempoEvent` interface + `_tempoMap` on `ParsedMidi` |
| `src/utils/midiParser.ts` | Full tempo map extraction |
| `src/hooks/useMetronome.ts` | Complete rewrite — tempo map, fresh reads, debounced stop |
| `src/hooks/useAudioEngine.ts` | Reverted broken seek detection |
| `src/components/Transport/TopBar.tsx` | LongPressArrow, label stacks, icon fixes |
| `src/components/SettingsPanel/SettingsPanel.tsx` | All settings fixes, User Manual link, v0.5.0 |
| `src/components/TrackPanel/TrackPanel.tsx` | Restored closed icon, amber hover, SlidersHorizontal import |
| `src/components/PianoRoll/PianoRoll.tsx` | Range-aware grid, theme, zoom, playhead |
| `src/components/Keyboard/Keyboard.tsx` | Proportional height, playback chord display, tooltip fix |
| `src/components/Keyboard/KeyboardControls.tsx` | Size button tooltips |
| `src/components/Keyboard/FloatingKeyboard.tsx` | Width-only resize, no fixed height |

---

## Git Instructions

```bash
# On dev branch
git add .
git commit -m "v0.5.0 — Session 08: UI polish, tempo map metronome, piano roll range fix, floating keyboard"
git push origin dev

# Merge to main and tag
git checkout main
git merge dev
git push origin main
git tag v0.5.0
git push origin v0.5.0
git checkout dev
```
