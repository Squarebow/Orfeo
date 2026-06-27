# Magic Numbers Audit

**Scope:** All `.ts`, `.tsx`, and `.css` files under `src/` and `electron/`
**Generated:** 2026-06-27

This audit enumerates every hardcoded magic number found in the codebase, grouped into four categories: colors, spacing/sizing, font families, and z-indexes. It is a reference document — no code has been changed. Use it as a starting point for extracting values into shared design tokens.

---

## 1. Colors

Hex color strings found in inline styles (TS/TSX) and CSS rules. Sorted by total occurrence count descending.

| Hex Value | Occurrences | Files |
|-----------|-------------|-------|
| `#e8a027` | 130 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/Keyboard/Keyboard.tsx, src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/PianoRoll/PianoRoll.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/EmptyState.tsx, src/components/OrfeoLogo.tsx, src/components/ScaleExplorer.tsx, src/hooks/useAudioEngine.ts, src/hooks/useSF2Engine.ts, src/utils/midiParser.ts, src/index.css, electron/main.ts |
| `#505068` | 54 | src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `#2a2a3a` | 40 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `#404055` | 33 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/EmptyState.tsx, src/components/ScaleExplorer.tsx, src/index.css |
| `#707088` | 31 | src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/EmptyState.tsx, src/components/ScaleExplorer.tsx, src/index.css, electron/main.ts |
| `#9090a8` | 27 | src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `#1a1a26` | 23 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `#252535` | 19 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/index.css |
| `#1e1e2a` | 16 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `#0d0d12` | 9 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/Keyboard/Keyboard.tsx, src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `#0f0f12` | 9 | src/components/MidiEditor/MidiEditor.tsx, src/components/PianoRoll/PianoRoll.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/EmptyState.tsx, src/App.tsx, src/index.css, electron/main.ts |
| `#0e0e16` | 8 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/index.css |
| `#b0b0cc` | 8 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx, src/index.css |
| `#1e1e28` | 8 | src/components/Keyboard/Keyboard.tsx, src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/Transport/TopBar.tsx, src/index.css |
| `#111116` | 7 | src/components/Keyboard/Keyboard.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/Transport/TopBar.tsx, electron/main.ts |
| `#e8a02755` | 6 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx |
| `#1a1a24` | 5 | src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `#50506a` | 5 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `#1e1e2c` | 5 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `#c0c0d0` | 5 | src/components/Keyboard/KeyboardControls.tsx, src/components/ChordExplorer.tsx |
| `#e8a02714` | 5 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx |
| `#13131a` | 4 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/index.css |
| `#181822` | 4 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `#e8a02722` | 4 | src/components/ScaleExplorer.tsx |
| `#6080d0` | 4 | src/components/ScaleExplorer.tsx |
| `#c0392b` | 4 | src/components/ScaleExplorer.tsx |
| `#181820` | 4 | src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `#303045` | 4 | src/components/SettingsPanel/SettingsPanel.tsx |
| `#606080` | 4 | src/components/Keyboard/KeyboardControls.tsx |
| `#12100e` | 4 | src/components/SettingsPanel/SettingsPanel.tsx, src/App.tsx, src/index.css |
| `#0d0d16` | 4 | src/components/MidiEditor/MidiEditor.tsx |
| `#454560` | 3 | src/components/TrackPanel/TrackPanel.tsx |
| `#303040` | 3 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/ChordExplorer.tsx |
| `#e0e0e0` | 3 | src/components/ScaleExplorer.tsx |
| `#1a1a22` | 3 | src/components/Keyboard/Keyboard.tsx, src/components/Keyboard/KeyboardControls.tsx, src/index.css |
| `#353540` | 3 | src/components/MidiEditor/MidiEditor.tsx |
| `#e8a02799` | 3 | src/components/Keyboard/KeyboardControls.tsx, src/components/ScaleExplorer.tsx |
| `#606078` | 3 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx |
| `#3a3a4a` | 3 | src/components/Keyboard/KeyboardControls.tsx, src/components/ChordExplorer.tsx |
| `#303048` | 3 | src/components/ScaleExplorer.tsx |
| `#222230` | 3 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/ScaleExplorer.tsx |
| `#0f0f18` | 3 | src/components/ScaleExplorer.tsx |
| `#1a1a28` | 3 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/ScaleExplorer.tsx |
| `#131320` | 3 | src/components/SettingsPanel/SettingsPanel.tsx |
| `#606075` | 3 | src/components/Transport/TopBar.tsx |
| `#13131c` | 2 | src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `#13131e` | 2 | src/components/MidiEditor/MidiEditor.tsx |
| `#8080cc` | 2 | src/components/MidiEditor/MidiEditor.tsx |
| `#0a0a10` | 2 | src/components/MidiEditor/MidiEditor.tsx |
| `#35354a` | 2 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `#e8a02770` | 2 | src/components/Keyboard/KeyboardControls.tsx, src/components/SettingsPanel/SettingsPanel.tsx |
| `#404058` | 2 | src/components/TrackPanel/TrackPanel.tsx |
| `#e74c3c` | 2 | src/components/ScaleExplorer.tsx |
| `#8080a0` | 2 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/ChordExplorer.tsx |
| `#98c379` | 1 | src/utils/midiParser.ts |
| `#60c060` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#c0c0d8` | 1 | src/components/ScaleExplorer.tsx |
| `#c06060` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#252530` | 1 | src/index.css |
| `#0a0a0f` | 1 | src/components/Keyboard/Keyboard.tsx |
| `#3a7a3a` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#b0b0b0` | 1 | src/components/Keyboard/Keyboard.tsx |
| `#c678dd` | 1 | src/utils/midiParser.ts |
| `#5a2a2a` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#707060` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `#f0a500` | 1 | src/utils/midiParser.ts |
| `#d4a5a5` | 1 | src/utils/midiParser.ts |
| `#2a5a2a` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#fff` | 1 | src/components/Keyboard/Keyboard.tsx |
| `#0a0a0a` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#e5c07b` | 1 | src/utils/midiParser.ts |
| `#1e2a3a` | 1 | src/components/ScaleExplorer.tsx |
| `#40404e` | 1 | src/components/TrackPanel/TrackPanel.tsx |
| `#16120e` | 1 | src/index.css |
| `#3a3a5a` | 1 | src/components/ScaleExplorer.tsx |
| `#d04040` | 1 | src/components/TrackPanel/TrackPanel.tsx |
| `#4a90d9` | 1 | src/components/ScaleExplorer.tsx |
| `#ffffff` | 1 | src/components/ScaleExplorer.tsx |
| `#50c050` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#111120` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `#e8a02715` | 1 | src/components/Transport/TopBar.tsx |
| `#2a2a38` | 1 | src/components/EmptyState.tsx |
| `#20204a` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#7070888` | 1 | src/index.css *(likely typo — 7 hex digits; intended `#707088`)* |
| `#0d200d` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#12121c` | 1 | src/components/ChordExplorer.tsx |
| `#808098` | 1 | src/components/TrackPanel/TrackPanel.tsx |
| `#c0c0d4` | 1 | src/components/ChordExplorer.tsx |
| `#ffb84d` | 1 | src/components/Keyboard/KeyboardControls.tsx |
| `#c05050` | 1 | src/components/Keyboard/FloatingKeyboard.tsx |
| `#61afef` | 1 | src/utils/midiParser.ts |
| `#30303e` | 1 | src/components/TrackPanel/TrackPanel.tsx |
| `#4040a0` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#e8a02708` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#e8e8e8` | 1 | src/components/Keyboard/Keyboard.tsx |
| `#222235` | 1 | src/components/Keyboard/Keyboard.tsx |
| `#200a0a` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#30304a` | 1 | src/components/Transport/TopBar.tsx |
| `#e8a02730` | 1 | src/components/Transport/TopBar.tsx |
| `#101020` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#0a200a` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#6b7ab5` | 1 | src/utils/midiParser.ts |
| `#e8a02710` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#353548` | 1 | src/index.css |
| `#1f1a0e` | 1 | src/components/ChordExplorer.tsx |
| `#1a1a08` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `#7ec8e3` | 1 | src/utils/midiParser.ts |
| `#111118` | 1 | src/components/Keyboard/FloatingKeyboard.tsx |
| `#4ecdc4` | 1 | src/utils/midiParser.ts |
| `#a8d8a8` | 1 | src/utils/midiParser.ts |
| `#e06c75` | 1 | src/utils/midiParser.ts |
| `#888` | 1 | src/components/Keyboard/Keyboard.tsx |
| `#2a2a35` | 1 | src/components/Keyboard/Keyboard.tsx |
| `#6080c0` | 1 | src/components/TrackPanel/TrackPanel.tsx |
| `#10102a` | 1 | src/components/MidiEditor/MidiEditor.tsx |

**Total unique color values: 103**

### Notes on the color palette

The design token spec in `src/index.css` defines CSS variables for the core palette (`--bg`, `--border`, `--text-amber`, etc.) and shorthand aliases (`--c-default`, `--c-active`, `--c-muted`, `--c-amber`), but these variables are used only in CSS selectors — all inline JSX styles bypass them, repeating the hex literals directly.

Key semantic groups that recur widely as raw literals:

| Semantic role | Hex | Occurrences |
|---|---|---|
| Amber accent | `#e8a027` | 130 |
| Dim interactive | `#505068` | 54 |
| Hover/selected surface | `#2a2a3a` | 40 |
| Muted label | `#404055` | 33 |
| Default text | `#707088` | 31 |
| Bright text | `#9090a8` | 27 |
| Row/tab surface | `#1a1a26` | 23 |
| Border/divider | `#252535` | 19 |
| Subtle border | `#1e1e2a` | 16 |
| Active text | `#b0b0cc` | 8 |

---

## 2. Spacing / Sizing

### 2a. `fontSize` — inline styles

| Value | Occurrences | Files |
|-------|-------------|-------|
| `fontSize: 8` | 14 | src/components/Keyboard/KeyboardControls.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `fontSize: 9` | 36 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/Keyboard/Keyboard.tsx, src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `fontSize: 10` | 40 | src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `fontSize: 11` | 23 | src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/EmptyState.tsx, src/components/ScaleExplorer.tsx |
| `fontSize: 12` | 12 | src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/ChordExplorer.tsx, src/components/EmptyState.tsx, src/components/ScaleExplorer.tsx |
| `fontSize: 13` | 5 | src/components/Transport/TopBar.tsx, src/components/EmptyState.tsx, src/components/ScaleExplorer.tsx |
| `fontSize: 14` | 4 | src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `fontSize: 15` | 1 | src/components/EmptyState.tsx |
| `fontSize: 16` | 5 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `fontSize: 18` | 2 | src/components/ChordExplorer.tsx |
| `fontSize: 20` | 2 | src/components/Transport/TopBar.tsx |

### 2b. `height` — numeric pixel values

| Value | Occurrences | Files |
|-------|-------------|-------|
| `height: 1` | 1 | src/components/Transport/TopBar.tsx |
| `height: 3` | 1 | src/index.css |
| `height: 4` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `height: 5` | 1 | src/index.css |
| `height: 10` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `height: 12` | 1 | src/index.css |
| `height: 13` | 2 | src/components/Transport/TopBar.tsx |
| `height: 14` | 3 | src/components/Keyboard/KeyboardControls.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/ScaleExplorer.tsx |
| `height: 16` | 4 | src/components/ChordExplorer.tsx |
| `height: 18` | 2 | src/components/Keyboard/FloatingKeyboard.tsx |
| `height: 22` | 3 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/ChordExplorer.tsx |
| `height: 24` | 3 | src/components/MidiEditor/MidiEditor.tsx |
| `height: 26` | 1 | src/components/Keyboard/FloatingKeyboard.tsx |
| `height: 28` | 3 | src/components/Transport/TopBar.tsx |
| `height: 30` | 2 | src/components/Keyboard/Keyboard.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `height: 32` | 3 | src/components/MidiEditor/MidiEditor.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `height: 34` | 1 | src/components/Keyboard/KeyboardControls.tsx |
| `height: 40` | 3 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/ChordExplorer.tsx |
| `height: 44` | 1 | src/components/Transport/TopBar.tsx |
| `height: 48` | 2 | src/components/MidiEditor/MidiEditor.tsx, electron/main.ts |
| `height: 96` | 1 | src/components/Transport/TopBar.tsx |
| `height: 100` | 1 | electron/main.ts *(titleBarOverlay height)* |
| `height: 600` | 1 | electron/main.ts |
| `height: 900` | 1 | electron/main.ts |

### 2c. `width` — numeric pixel values

| Value | Occurrences | Files |
|-------|-------------|-------|
| `width: 1` | 9 | src/components/Keyboard/KeyboardControls.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `width: 3` | 1 | src/components/TrackPanel/TrackPanel.tsx |
| `width: 4` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `width: 5` | 1 | src/index.css |
| `width: 10` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `width: 12` | 1 | src/index.css |
| `width: 14` | 1 | src/components/Transport/TopBar.tsx |
| `width: 16` | 2 | src/components/Transport/TopBar.tsx |
| `width: 18` | 2 | src/components/Keyboard/FloatingKeyboard.tsx |
| `width: 22` | 2 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `width: 24` | 3 | src/components/MidiEditor/MidiEditor.tsx |
| `width: 28` | 2 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/Transport/TopBar.tsx |
| `width: 120` | 1 | src/components/ChordExplorer.tsx |
| `width: 220` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `width: 600` | 1 | src/components/ChordExplorer.tsx |
| `width: 720` | 1 | src/components/ScaleExplorer.tsx |
| `width: 760` | 1 | electron/main.ts |
| `width: 1400` | 1 | electron/main.ts |

### 2d. `gap` — numeric pixel values

| Value | Occurrences | Files |
|-------|-------------|-------|
| `gap: 0` | 2 | src/components/Transport/TopBar.tsx |
| `gap: 1` | 11 | src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `gap: 2` | 3 | src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx |
| `gap: 3` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `gap: 4` | 19 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `gap: 5` | 6 | src/components/Keyboard/Keyboard.tsx, src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/Transport/TopBar.tsx |
| `gap: 6` | 27 | src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/EmptyState.tsx, src/components/ScaleExplorer.tsx |
| `gap: 7` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `gap: 8` | 11 | src/components/Keyboard/Keyboard.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/ChordExplorer.tsx, src/components/EmptyState.tsx, src/components/ScaleExplorer.tsx |
| `gap: 10` | 3 | src/components/MidiEditor/MidiEditor.tsx, src/components/Transport/TopBar.tsx |
| `gap: 12` | 1 | src/components/Keyboard/KeyboardControls.tsx |
| `gap: 20` | 1 | src/components/EmptyState.tsx |

### 2e. `borderRadius` — numeric pixel values

| Value | Occurrences | Files |
|-------|-------------|-------|
| `borderRadius: 2` | 4 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `borderRadius: 3` | 14 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx |
| `borderRadius: 4` | 33 | src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `borderRadius: 5` | 6 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/EmptyState.tsx |
| `borderRadius: 6` | 7 | src/components/MidiEditor/MidiEditor.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `borderRadius: 10` | 3 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |

### 2f. `padding` — quoted string values

| Value | Occurrences | Files |
|-------|-------------|-------|
| `padding: '0 2px'` | 12 | src/components/MidiEditor/MidiEditor.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `padding: '0 12px'` | 8 | src/components/Keyboard/Keyboard.tsx, src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `padding: '5px 10px'` | 5 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `padding: '2px 3px'` | 4 | src/components/Keyboard/KeyboardControls.tsx, src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '2px 6px'` | 4 | src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `padding: '4px 0'` | 4 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `padding: '5px 8px'` | 4 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '4px 8px'` | 4 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '2px 8px'` | 3 | src/components/Keyboard/KeyboardControls.tsx, src/components/ScaleExplorer.tsx |
| `padding: '1px 5px'` | 3 | src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/Transport/TopBar.tsx |
| `padding: '8px 14px'` | 3 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '3px 6px'` | 3 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/ScaleExplorer.tsx |
| `padding: '0 14px'` | 3 | src/components/Transport/TopBar.tsx |
| `padding: '7px 0'` | 2 | src/components/MidiEditor/MidiEditor.tsx |
| `padding: '2px 10px'` | 2 | src/components/ChordExplorer.tsx |
| `padding: '6px 14px'` | 2 | src/components/MidiEditor/MidiEditor.tsx |
| `padding: '5px 12px'` | 2 | src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `padding: '6px 8px'` | 2 | src/components/MidiEditor/MidiEditor.tsx, src/components/ChordExplorer.tsx |
| `padding: '4px 5px'` | 2 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `padding: '2px 4px'` | 2 | src/components/TrackPanel/TrackPanel.tsx |
| `padding: '3px 0'` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '8px 0'` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '12px 14px'` | 1 | src/components/TrackPanel/TrackPanel.tsx |
| `padding: '7px 12px'` | 1 | src/components/ChordExplorer.tsx |
| `padding: '20px 0'` | 1 | src/components/ChordExplorer.tsx |
| `padding: '0 16px 0 16px'` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `padding: '0 10px'` | 1 | src/components/Keyboard/FloatingKeyboard.tsx |
| `padding: '10px 14px'` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '8px 12px'` | 1 | src/components/ChordExplorer.tsx |
| `padding: '0 16px'` | 1 | src/components/Keyboard/KeyboardControls.tsx |
| `padding: '5px 10px 5px 28px'` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `padding: '0 4px'` | 1 | src/components/ChordExplorer.tsx |
| `padding: '14px 14px 10px'` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '6px 10px 6px 14px'` | 1 | src/components/TrackPanel/TrackPanel.tsx |
| `padding: '4px 10px'` | 1 | src/components/ScaleExplorer.tsx |
| `padding: '10px 14px 12px'` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `padding: '0 3px'` | 1 | src/components/ScaleExplorer.tsx |
| `padding: '1px 4px'` | 1 | src/components/ScaleExplorer.tsx |
| `padding: '10px 12px'` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '6px 10px'` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '0 14px 0 36px'` | 1 | src/components/TrackPanel/TrackPanel.tsx |
| `padding: '5px 10px 5px 10px'` | 1 | src/components/TrackPanel/TrackPanel.tsx |
| `padding: '0 7px'` | 1 | src/components/ChordExplorer.tsx |
| `padding: '4px 12px'` | 1 | src/components/ScaleExplorer.tsx |
| `padding: '8px 20px'` | 1 | src/components/EmptyState.tsx |
| `padding: '4px 14px'` | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `padding: '6px 4px'` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '16px 16px 46px 12px'` | 1 | src/components/ScaleExplorer.tsx |
| `padding: '2px 7px'` | 1 | src/components/ChordExplorer.tsx |
| `padding: '16px 14px'` | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `padding: '3px 7px'` | 1 | src/components/ChordExplorer.tsx |
| `padding: '0 174px 0 20px'` | 1 | src/components/Transport/TopBar.tsx |

### 2g. `margin` — quoted string values

| Value | Occurrences | Files |
|-------|-------------|-------|
| `margin: '0 2px'` | 3 | src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `margin: '0 4px'` | 1 | src/components/ScaleExplorer.tsx |
| `margin: '0 auto'` | 1 | src/components/ScaleExplorer.tsx |
| `margin: '2px 0'` | 1 | src/components/Transport/TopBar.tsx |

### 2h. `margin*` / `padding*` — named directional properties

| Property | Value | Occurrences | Files |
|----------|-------|-------------|-------|
| `marginTop` | 1 | 2 | src/components/MidiEditor/MidiEditor.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `marginTop` | 2 | 3 | src/components/MidiEditor/MidiEditor.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `marginTop` | 4 | 2 | src/components/SettingsPanel/SettingsPanel.tsx |
| `marginTop` | 5 | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `marginTop` | 6 | 4 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/Transport/TopBar.tsx |
| `marginTop` | 20 | 1 | src/components/ScaleExplorer.tsx |
| `marginBottom` | 2 | 1 | src/components/TrackPanel/TrackPanel.tsx |
| `marginBottom` | 3 | 1 | src/components/ScaleExplorer.tsx |
| `marginBottom` | 4 | 1 | src/components/SettingsPanel/SettingsPanel.tsx |
| `marginBottom` | 6 | 3 | src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx |
| `marginBottom` | 8 | 3 | src/components/MidiEditor/MidiEditor.tsx |
| `marginBottom` | 12 | 2 | src/components/Transport/TopBar.tsx |
| `paddingRight` | 6 | 1 | src/components/ScaleExplorer.tsx |
| `paddingRight` | 12 | 1 | src/components/Transport/TopBar.tsx |
| `paddingRight` | 160 | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `paddingTop` | 6 | 1 | src/App.tsx |
| `paddingTop` | 8 | 1 | src/components/ScaleExplorer.tsx |

### 2i. Position offsets (`top`, `left`, `right`, `bottom`)

| Property | Value | Occurrences | Files |
|----------|-------|-------------|-------|
| `top` | 0 | 4 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/ScaleExplorer.tsx |
| `top` | 10 | 2 | src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `top` | 16 | 1 | src/components/ScaleExplorer.tsx |
| `left` | 0 | 3 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx |
| `left` | 10 | 1 | src/components/Keyboard/Keyboard.tsx |
| `left` | 12 | 2 | src/components/ScaleExplorer.tsx |
| `right` | 0 | 2 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/SettingsPanel/SettingsPanel.tsx |
| `right` | 10 | 1 | src/components/Keyboard/Keyboard.tsx |
| `right` | 12 | 1 | src/components/ScaleExplorer.tsx |
| `bottom` | 0 | 2 | src/components/Keyboard/FloatingKeyboard.tsx |
| `bottom` | 3 | 1 | src/components/Keyboard/Keyboard.tsx |
| `bottom` | 6 | 1 | src/components/ScaleExplorer.tsx |

### 2j. `minHeight`, `maxHeight`, `minWidth`, `maxWidth`

| Property | Value | Occurrences | Files |
|----------|-------|-------------|-------|
| `minHeight` | 32 | 1 | src/components/ScaleExplorer.tsx |
| `minHeight` | 44 | 4 | src/components/ScaleExplorer.tsx |
| `minHeight` | 480 | 1 | electron/main.ts |
| `minHeight` | 600 | 1 | electron/main.ts |
| `maxHeight` | 220 | 1 | src/components/ChordExplorer.tsx |
| `maxHeight` | 260 | 1 | src/components/ScaleExplorer.tsx |
| `maxHeight` | 320 | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `minWidth` | 22 | 1 | src/components/ChordExplorer.tsx |
| `minWidth` | 28 | 1 | src/components/ScaleExplorer.tsx |
| `minWidth` | 30 | 1 | src/components/ChordExplorer.tsx |
| `minWidth` | 32 | 2 | src/components/Transport/TopBar.tsx, src/components/ChordExplorer.tsx |
| `minWidth` | 34 | 2 | src/components/Transport/TopBar.tsx |
| `minWidth` | 36 | 1 | src/components/Transport/TopBar.tsx |
| `minWidth` | 40 | 1 | src/components/ScaleExplorer.tsx |
| `minWidth` | 60 | 1 | src/components/ScaleExplorer.tsx |
| `minWidth` | 80 | 1 | src/components/Keyboard/Keyboard.tsx |
| `minWidth` | 116 | 1 | src/components/ScaleExplorer.tsx |
| `minWidth` | 130 | 1 | src/components/ScaleExplorer.tsx |
| `minWidth` | 160 | 2 | src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `minWidth` | 180 | 1 | src/components/ScaleExplorer.tsx |
| `minWidth` | 640 | 1 | electron/main.ts |
| `minWidth` | 900 | 1 | electron/main.ts |
| `maxWidth` | 320 | 1 | src/components/Transport/TopBar.tsx |
| `maxWidth` | 340 | 1 | src/components/Transport/TopBar.tsx |

---

## 3. Font Families

| Font Family | Occurrences | Files |
|-------------|-------------|-------|
| `'Inter'` (inline, single-quoted) | ~80 | src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx, src/components/Keyboard/Keyboard.tsx, src/components/Keyboard/KeyboardControls.tsx, src/components/Keyboard/FloatingKeyboard.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/Transport/TopBar.tsx, src/components/EmptyState.tsx, src/App.tsx |
| `'JetBrains Mono'` (inline, single-quoted) | ~40 | src/components/Keyboard/Keyboard.tsx, src/components/Keyboard/KeyboardControls.tsx, src/components/MidiEditor/MidiEditor.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/Transport/TopBar.tsx, src/components/ScaleExplorer.tsx |
| `'Inter', system-ui, sans-serif` (full stack) | 3 | src/App.tsx, src/components/MidiEditor/MidiEditor.tsx |
| `'Inter', system-ui` (partial stack) | 1 | src/components/MidiEditor/MidiEditor.tsx |
| `'Inter', system-ui, sans-serif` (CSS `font-family`) | 1 | src/index.css |
| `Inter` (unquoted in SVG `fontFamily` attr) | 3 | src/components/ScaleExplorer.tsx |

**Notes:**
- Both `Inter` and `JetBrains Mono` are loaded via Google Fonts in `src/index.css`.
- The same fonts appear in multiple forms: single-quoted string `'Inter'`, unquoted SVG attribute `Inter`, and as part of fallback stacks. There is no single shared constant for these values.

---

## 4. Z-Indexes

| Value | Occurrences | Files |
|-------|-------------|-------|
| `zIndex: 2` | 2 | src/components/Keyboard/Keyboard.tsx |
| `zIndex: 5` | 1 | src/components/ScaleExplorer.tsx |
| `zIndex: 10` | 4 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/SettingsPanel/SettingsPanel.tsx, src/components/TrackPanel/TrackPanel.tsx, src/components/ScaleExplorer.tsx |
| `zIndex: 200` | 2 | src/components/Keyboard/FloatingKeyboard.tsx, src/components/ScaleExplorer.tsx |
| `zIndex: 401` | 1 | src/components/ChordExplorer.tsx |
| `zIndex: 1000` | 2 | src/components/ChordExplorer.tsx, src/components/ScaleExplorer.tsx |
| `zIndex: 9999` | 1 | src/components/MidiEditor/MidiEditor.tsx |

**Notes:**
- No `z-index` entries were found in CSS files.
- The gap between `10` / `200` / `401` / `1000` / `9999` suggests an informal stacking tier that was never formally documented. A stacking context table would reduce the risk of accidental overlay conflicts.

---

## Summary

| Category | Unique Values |
|---|---|
| Colors (hex literals) | 103 |
| Spacing/Sizing values | ~120 (fontSize: 11, height: 22+, gap: 10+, borderRadius: 6 tiers, 50+ padding strings) |
| Font families | 2 core families (`Inter`, `JetBrains Mono`), used in 3–4 syntactic forms each |
| Z-indexes | 7 unique values |

### Key findings

1. **`#e8a027` (amber accent) appears 130 times across 17 files.** It is defined as a CSS variable (`--c-amber`) but that variable is never referenced in any inline style — all uses are raw literals.

2. **103 unique hex values** are in use. About 25–30 are near-duplicates differing by only a digit (e.g. `#13131a`, `#13131c`, `#13131e`; `#1a1a22`, `#1a1a24`, `#1a1a26`, `#1a1a28`). These are shadow/tint variants that were never rationalized into a token scale.

3. **`#7070888` in `src/index.css` line 25** is a 7-digit hex value (invalid CSS). This is a typo; the intended value is almost certainly `#707088`.

4. **`fontSize: 10` appears 40 times; `fontSize: 9` appears 36 times.** Both values are scattered across every component. A typography scale constant object (e.g. `FS = { label: 9, caption: 10, body: 11, ... }`) would eliminate the majority of these repetitions.

5. **`borderRadius: 4` dominates with 33 uses** across 7 files — this is the de facto standard radius, but it also coexists with `3`, `5`, `6`, and `10` with no documented rule for when to use each.

6. **`padding: '0 2px'` (12 uses) and `padding: '0 12px'` (8 uses)** are the most common padding string values.

7. **All font families are inline strings.** Neither `'Inter'` nor `'JetBrains Mono'` is exported from a constants module; updating a font requires a full grep-and-replace.
