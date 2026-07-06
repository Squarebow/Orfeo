# Changelog

## [Unreleased] — dev branch

---

### 6. 7. 2026 — CSS Variable Rollout: Batch 6 — SettingsPanel + TrackPanel

**`src/components/SettingsPanel/SettingsPanel.tsx`** — ~60 substitutions across BetaBadge, SectionHeader, OptionRow, OptionBtn, LibraryPanel, SettingsPanel, ZoomStepBtn, AppBgBtn

- **Color tokens (replace_all):** `'#0e0e16'` → `var(--bg-row)`, `'#1a1a26'` → `var(--bg-tile)`, `'#13131c'` → `var(--bg-modal)`, `'#2a2a3a'` → `var(--state-hover-bg)`, `'#303048'` → `var(--state-disabled)`, `'#505068'` → `var(--text-inactive)`, `'#707088'` → `var(--text-dimmest)`, `'#b0b0cc'` → `var(--text-dim)`, `'#e8a027'` → `var(--text-amber)`, `'#e8a02755'` → `var(--accent-amber-strong)`, `'#e8a02722'` → `var(--accent-amber-medium)`, `'#c0392b'` → `var(--status-error)`
- **Border strings (embedded):** `'1px solid #1e1e28'` → `var(--border)`, `'1px solid #252530'` → `var(--border2)`, `'1px solid #1a1a26'` → `var(--bg-tile)`, `'1px dashed #303048'` → `var(--state-disabled)`, `'1px solid #e8a02755'` → `var(--accent-amber-strong)`, `'2px solid #e8a027'` → `var(--text-amber)`
- **Typography:** `fontSize: 11` → `var(--text-xs)`, `fontSize: 12` → `var(--text-sm)`, `fontSize: 13` → `var(--text-base)` (split note display), `fontSize: 16` → `var(--text-lg)` (ZoomStepBtn ±)
- **Spacing:** `gap: 4` → `var(--space-1)` (all 16 occurrences), `gap: 8` → `var(--space-2)` (2 occurrences), `paddingLeft: 12` → `var(--space-3)` (tab bar)
- **Border radius:** `borderRadius: 5` → `var(--radius-md)` (pick folder button), `borderRadius: 3` → `var(--radius-sm)` (AppBgBtn color swatch)
- **Code comments:** `// ──` header comments added to SectionHeader, OptionRow, OptionBtn, handlePickFolder, handleRefresh, handleLoadFile, grouped useMemo, init useEffect, auto-init useEffect, ZoomStepBtn, AppBgBtn
- **Confirmed:** BetaBadge already uses `var(--status-error)` for color and border — no change needed
- **Kept as literals (Group C):** `#9090a8` (file/folder text, mid-grey); `#606078` (pick folder button); `#8080a0` (subfolder names); `#111120` (folder header hover); `#707060` (un-starred hover); `#35354a` (about legal text); `#4caf50`/`#f44336` (TranscriptIcon status — different from `--status-success/error`); font sizes 9/10 (below token minimum); `borderRadius: 4` (between token values); gap: 5/6 (between token values); SVG presentation attributes (`stroke="#e8a027"`)

**`src/components/TrackPanel/TrackPanel.tsx`** — ~25 substitutions across TrackPanel, TrackRow, IBtn

- **Color tokens (replace_all):** `'#0e0e16'` → `var(--bg-row)`, `'#1a1a26'` → `var(--bg-tile)`, `'#13131c'` → `var(--bg-modal)`, `'#252530'` → `var(--border2)`, `'#1e1e28'` → `var(--border)`, `'#505068'` → `var(--text-inactive)`, `'#707088'` → `var(--text-dimmest)`, `'#e8a027'` → `var(--text-amber)`, `'#303048'` → `var(--state-disabled)`
- **Typography:** `fontSize: 11` → `var(--text-xs)`, `fontSize: 12` → `var(--text-sm)`
- **Spacing:** `gap: 4` → `var(--space-1)`, `gap: 8` → `var(--space-2)` (both header and TrackRow outer div)
- **Targeted:** `activeColor="#d04040"` (Mute button) → `activeColor="var(--status-error)"`; Solo button `activeColor="#e8a027"` (already as literal — already replaced by color pass)
- **Code comments:** `// ──` header comments added to TrackPanel, handleOpenEditor, grouped useMemo, toggleGroupCollapse, isGroupMuted, editor-closed useEffect, TrackRow, IBtn
- **Kept as literals (Group C):** `#35354a` (empty state text); `#40404e` (group track count); `#9090a8` (instrument name); `#454560` (channel/prog labels); `#404058` / `#808098` (IBtn inactive/hover); font sizes 9/10; gap 6; `borderRadius: 4`; per-track color swatches (`track.color`) — intentionally excluded

---

### 6. 7. 2026 — CSS Variable Rollout: Batch 5 — MidiEditor + new token groups

**`src/index.css`** — 3 new token groups added to `:root`
- **Modal surfaces:** `--bg-modal`, `--bg-modal-header`, `--bg-tile`
- **Interaction states:** `--state-hover-bg`, `--state-hover-border`, `--state-active-bg`, `--state-selected-bg`, `--state-disabled`, `--accent-amber-hover`, `--text-inactive`
- **Amber alpha tiers:** `--accent-amber-strong` (#e8a02755), `--accent-amber-medium` (#e8a02722), `--accent-amber-subtle` (#e8a02708)
- **Status banners:** `--status-success-bg/border/text`, `--status-error-banner-bg/border/text` (6 vars)

**`src/components/MidiEditor/MidiEditor.tsx`** — ~80 substitutions across InstrumentPicker, TrackRow, and main render

- **Text/color (replace_all):** `'#e8a027'` → `var(--text-amber)`, `'#505068'` → `var(--text-inactive)`, `'#404055'` → `var(--text-muted)`, `'#707088'` → `var(--text-dimmest)`, `'#b0b0cc'` → `var(--text-dim)`
- **Borders (embedded string replace):** `'1px solid #252535'` → `var(--border2)`, `'1px solid #1e1e28/1e1e2c'` → `var(--border)`, `'1px solid #1a1a26'` → `var(--bg-tile)`, `'1px solid #2a2a3a'` → `var(--state-hover-bg)`, `'1px solid #e8a02755'` → `var(--accent-amber-strong)`, `'2px solid #e8a027'` → `var(--text-amber)`
- **Amber alpha (standalone):** `'#e8a02755'` → `var(--accent-amber-strong)`, `'#e8a02714'` → `var(--accent-amber-medium)`, `'#e8a02710/08'` → `var(--accent-amber-subtle)`
- **Backgrounds:** `'#0f0f12'/'#111116'/'#0d0d12'/'#0d0d16'` → `var(--bg-modal-header)`, `'#13131e'` → `var(--bg-modal)`, `'#0e0e16'` → `var(--bg-row)`, `'#1a1a24'/'#1a1a26'` → `var(--bg-tile)`
- **Status banners:** all 6 banner bg/border/text values replaced with new tokens
- **Typography:** `fontSize: 11/12` → `var(--text-xs/sm)`
- **Border radius:** `borderRadius: 3/5` → `var(--radius-sm/md)`
- **Spacing:** `gap: 4/8` → `var(--space-1/2)`, title bar `padding: '0 16px 0 16px'` → `'0 var(--space-4)'`
- **Group B near-match alignments applied:** `#0f0f12` → bg-modal-header, `#111116` → bg-modal-header, `#13131e` → bg-modal, `#0d0d16` → bg-modal-header, `#1a1a24` → bg-tile, `#252535` → border2, `#1e1e2c` → border

**Kept as literals (Group C):** `#9090a8` (cool-blue grey, between tokens); `#606078` (between text-inactive and text-dimmest); `#0a0a0a` (near-black on amber save button); `#0a0a10` (very dark search/output bg); `#181822` (track row border — intentionally darker than `--border`); `#3a7a3a`/`#0d200d`/`#50c050`/`#353540` (include checkbox green/grey states); `#4040a0`/`#10102a`/`#8080cc`/`#20204a` (unmerge button + merged badge, custom blue-purple); `#101020`/`#1a1a08` (merged row bg variants); `#606078` (cancel text, split btn color); font sizes 9/10 (below token minimum); `borderRadius: 4/6/2` (between token values); padding/gap values with no token equivalents

---

### 6. 7. 2026 — CSS Variable Rollout: Batch 4 — ScaleExplorer

**`src/components/ScaleExplorer.tsx`** — ~55 substitutions

- **Global replace_alls (9 passes):** `'#505068'` → `var(--text-inactive)`, `'#707088'` → `var(--text-dimmest)`, `'#303048'` → `var(--state-disabled)`, `'#ffb84d'` → `var(--accent-amber-hover)`, `'#b0b0cc'` → `var(--text-dim)`, `'#0d0d12'` → `var(--bg-modal-header)`, `padding: '0 12px'` → `'0 var(--space-3)'`, `'1px solid #1e1e2a'` → `'1px solid var(--border)'`, `.style.color = '#e8a027'` → `var(--text-amber)`
- **Modal container** (prior session): `background: var(--bg-modal)`, `border: 1px solid var(--state-hover-bg)`
- **Header:** `background: '#0f0f18'` → `var(--bg-modal-header)`, title `color: '#e8a027'` → `var(--text-amber)`
- **CoF section:** `background: '#0f0f18'` → `var(--bg-modal-header)`, `gap: 8` → `var(--space-2)`
- **Scale type buttons:** selected `color` and border template `'#e8a027'` → `var(--text-amber)`
- **CoF info overlay:** root name `color: '#e8a027'` → `var(--text-amber)`
- **Chord tile area:** outer `padding: '4px 12px'` → `var(--space-1) var(--space-3)`, empty-state `'#404055'` → `var(--text-muted)`, container `gap: 4` → `var(--space-1)`
- **Chord tiles (regular + octave, both):** tile bg `'#1a1a28'` → `var(--bg-tile)`, border template `'#2a2a3a'` → `var(--state-hover-bg)`, `paddingTop/Bottom: 8` → `var(--space-2)`, tile gap `4` → `var(--space-1)`, leave borderColor `'#2a2a3a'` → `var(--state-hover-bg)`, chord name `fontSize: 13` → `var(--text-base)` (replace_all hits both tiles)
- **Info row:** active step `'#e8a027'` → `var(--text-amber)`, note names `fontSize: 16` → `var(--text-lg)`, key name `color: '#e8a027'` + `fontSize: 12` → `var(--text-sm)`, left/right group `gap: 4` → `var(--space-1)`
- **Progressions row:** prog trigger bg `'#1a1a28'` → `var(--bg-tile)`, border `'#2a2a3a'` → `var(--state-hover-bg)`, selected color `'#e8a027'` → `var(--text-amber)`; all 3 inversion mode buttons (off/sequential/random): active color + leave ternary `'#e8a027'` → `var(--text-amber)`
- **Footer:** accidentals `fontSize: 16` → `var(--text-lg)`, selected color `'#e8a027'` → `var(--text-amber)`, `gap: 4` → `var(--space-1)`; inversion prev/next initial + leave `'#e8a027'` → `var(--text-amber)` (both buttons, replace_all)
- **Dropdown:** bg `'#1a1a26'` → `var(--bg-tile)`, border `'#2a2a3a'` → `var(--state-hover-bg)`, selected/hover bg `'#2a2a3a'` → `var(--state-hover-bg)`, color `'#e8a027'` → `var(--text-amber)` (enter + leave ternary)

**Kept as literals:** SVG `fill` attributes (CoF wedge colours, ring labels, key-sig symbols, centre labels); `colors.set(m, '#e8a027')` key-lighting calls (×6, functional state not UI chrome); semi-transparent variants `#e8a02722`/`#e8a02799` (alpha channel, no CSS var equivalent); selected tile bg `#1e2a3a` + note accent `#6080d0` (musical selection colours, no token); hover border `#3a3a5a` (blue-shifted variant, no exact token); `#9090a8` / `#c0c0d8` (no token); SVG `setAttribute('fill', ...)` calls for CoF ring hover (presentation attributes can't use CSS variables).

---

### 6. 7. 2026 — CSS Variable Rollout: Batch 3 — ChordExplorer + SpeedControl

**`src/components/ChordExplorer.tsx`**
- `ROW_LABEL.color`: `#707088` → `var(--text-dimmest)` — consistent with TopBar batch; comment updated to `// ──` style
- `ROW.borderBottom`: `#1e1e2a` → `var(--border)` — same semantic token applied to all 4 section borders (`borderBottom` on ROW, header bottom, progressions outer div, footer `borderTop`; `borderTop` on genre sub-row)
- `btnBase`: `borderRadius: 3` → `var(--radius-sm)` + `color: active ? '#e8a027'` → `var(--text-amber)`; added `// ──` comment
- All `minHeight: 44` (4 occurrences across root row, filter row, sub-row 1, footer) → `var(--row-height)`
- Header `padding: '0 12px'` → `'0 var(--space-3)'`; footer same
- "Chord Explorer" title `color: '#e8a027'` → `var(--text-amber)`
- Search scope active pill text `'#e8a027'` → `var(--text-amber)`; button `borderRadius: 3` → `var(--radius-sm)`
- Search input: `color: '#b0b0cc'` → `var(--text-dim)`, `caretColor: '#e8a027'` → `var(--text-amber)`
- Search icon: `'#707088'` → `var(--text-dimmest)`, `'#e8a027'` hover → `var(--text-amber)` (both enter/leave)
- Close button (×): `fontSize: 16` → `var(--text-lg)`, amber hover → `var(--text-amber)`
- Root row: `gap: 4` → `var(--space-1)`; root btn selected `background: '#e8a027'` → `var(--text-amber)`, text `'#12121c'` → `var(--bg)`, `fontSize: 11` → `var(--text-xs)`
- Filter row: `gap: 8` → `var(--space-2)`; tier container `borderRadius: 5` → `var(--radius-md)`
- Results grid: `padding: '8px 12px'` → `'var(--space-2) var(--space-3)'`
- Progressions dropdown trigger + clear-prog button: amber hovers → `var(--text-amber)`
- Inversion mode buttons (CircleOff/ListOrdered/Shuffle): active/hover `'#e8a027'` → `var(--text-amber)` (6 occurrences)
- Chord and power chord tiles: `border` template literal amber → `var(--text-amber)` (replace_all, 2 tiles); chord name `fontSize: 12` → `var(--text-sm)`, selected color `'#e8a027'` → `var(--text-amber)`, unselected `'#b0b0cc'` → `var(--text-dim)` (both tile types)
- Chord tile roman numeral label: `color: '#e8a027'` → `var(--text-amber)`
- Footer "Show as" label: `'#707088'` → `var(--text-dimmest)`
- Accidentals button: selected `'#e8a027'` → `var(--text-amber)`, `fontSize: 16` → `var(--text-lg)`
- Inversion prev/next buttons: active `'#e8a027'` → `var(--text-amber)` (4 occurrences across both buttons)
- Clear selection button: hover `'#e8a027'` → `var(--text-amber)`
- Scale Explorer → button: hover `'#e8a027'` → `var(--text-amber)`
- Progression dropdown: `baseColor` selected branch `'#e8a027'` → `var(--text-amber)`; mouseEnter `'#e8a027'` → `var(--text-amber)`

**Kept as literals (no matching token):** `#13131c` (modal bg), `#0d0d12` (header/footer deep bg), `#1a1a26` (pill/tile/dropdown surface), `#2a2a3a` (active pill bg, borders), `#505068` (inactive icons), `#404055` (sub-labels), `#9090a8` / `#c0c0d4` / `#8080a0` / `#3a3a4a` / `#303048` / `#ffb84d` / `#606078` / `#1f1a0e` (no token equivalents). Font sizes 8/9/10 and border-radius 4/6/10 also left as literals (below or between token values). `AMBER`/`DIM` JS constants in SpeedControl left as hex — SVG `fill`/`stroke`/`floodColor` attributes, not CSS properties.

**`src/components/SpeedControl.tsx`**
- "Speed" label `color: '#707088'` → `var(--text-dimmest)`

---

### 6. 7. 2026 — Types: electronAPI interface completed

**`src/types/index.ts`**
- Added 8 missing method signatures to the `electronAPI` interface in `declare global { interface Window }`:
  - `openMidiEditor(data: any): Promise<void>` — opens the MIDI editor window with source data
  - `getMidiEditorData(): Promise<any>` — returns `_editorData` set by `editor:open` handler
  - `closeMidiEditor(): Promise<void>` — destroys the editor BrowserWindow
  - `saveFileDialog(opts): Promise<string | null>` — `dialog.showSaveDialog` wrapper; opts: `{ defaultPath, filters }`
  - `saveMidiEditor(payload): Promise<{ ok: boolean; message: string }>` — writes the edited MIDI to disk; payload: `{ outputPath, includedTracks: { index, newProgram }[], mergeGroups: number[][] }`
  - `onMidiReload(cb): void` — `ipcRenderer.on('midi:reloadFile', ...)` listener; cb receives `MidiFileResult`
  - `onEditorClosed(cb): void` — `ipcRenderer.on('editor:closed', ...)` listener
  - `openExternal(url): Promise<void>` — `shell.openExternal` wrapper
- All 8 methods were present in `electron/preload.ts` and had corresponding handlers in `electron/main.ts`; only the TypeScript declaration was missing.
- Fixes three reported TS2339 errors (`onMidiReload`, `getMidiEditorData`, `saveMidiEditor`); five additional methods discovered during full audit.

---

### 5. 7. 2026 — Piano Roll: Defensive size-sync fix

**Root cause:** Two perpetual `requestAnimationFrame` loops added in `KeyboardControls` (v0.9.0 performance ribbon) fire `setState` at 60 fps, causing sibling-component re-renders. Under certain timing conditions these re-renders produce transient DOM layout changes that diverge `app.screen.width/height` from `el.clientWidth/height` between `ResizeObserver` callbacks — resulting in the PixiJS renderer drawing to a canvas smaller than its CSS container. Visible symptoms: missing grid on the right portion, playhead not spanning full width, notes fragmenting near the playhead.

**`src/components/PianoRoll/PianoRoll.tsx`**
- Added defensive size-sync block at the top of `drawFrame`: reads `el.clientWidth/clientHeight` each tick and compares against `app.screen.width/height`. If they diverge and both container dimensions are > 0, calls `app.renderer.resize`, `drawGrid`, and updates the overlay canvas width/height, then returns early so the next frame renders at the correct size. The check costs two property reads + two comparisons per frame when dimensions are already correct (the common case).

---

### 5. 7. 2026 — Settings: BETA badges on Chord Transcription + Hand Labels (v0.10.1 continued)

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- Added `BetaBadge` function component: small outlined red pill (`var(--status-error)` border + text, `var(--radius-sm)`, 8px Inter uppercase, 0.85 opacity). Placed in the shared sub-components block.
- Extended `OptionRow` with an optional `badge?: React.ReactNode` prop. Label div changed to `display: flex; align-items: center; gap: 6` so the badge sits inline after the label text without disrupting existing rows (no badge = no visual change).
- Applied `badge={<BetaBadge />}` to exactly two settings: **Chord Transcription** (Library section) and **Left/Right Hand Labels** (Keyboard section). No other settings receive the badge.

---

### 5. 7. 2026 — CSS Variable Rollout: Stage 1 + Stage 2 (v0.10.1 continued)

Replaced hardcoded hex colors and raw pixel values with design-system CSS variables across four components. Functional colors (piano key lighting, note highlight state, hand boundary visuals) are intentionally left as literals.

**`src/components/Transport/TopBar.tsx`**
- `C` constant object updated: all four values (`default`, `active`, `muted`, `amber`) now reference `var(--text-*)` tokens instead of old hex values. `C.default` / `C.active` / `C.muted` are semantically brighter as part of the design system upgrade.
- `paddingRight: 12` → `var(--space-3)` on logo section; `padding: '0 12px'` → `'0 var(--space-3)'` on BPM, KEY, and BAR sections (3 places).
- Open-file button: `width: 28, height: 28` → `var(--button-height)`; `borderRadius: 5` → `var(--radius-md)`.
- `VSep` height: `44` → `var(--row-height)`; background `#1e1e28` → `var(--border)`.
- Three inline column dividers (bar counter, time sig, metronome): `height: 28` → `var(--button-height)`; background `#1e1e28` → `var(--border)`.
- Bar counter font sizes: `fontSize: 12` → `var(--text-sm)` ×2.
- Time signature font sizes: `fontSize: 13` → `var(--text-base)` ×2.
- Filename label: `fontSize: 11` → `var(--text-xs)`.
- Nudge span: inline `#e8a027` → `C.amber`.
- `LongPressArrow`, `ArrowBtn`: `borderRadius: 3` → `var(--radius-sm)`; `onMouseEnter` amber → `var(--text-amber)`.
- `TBtn`: idle/active color `#e8a027`/`#707088` → `var(--text-amber)`/`var(--text-default)` in all three color references.

**`src/components/Keyboard/Keyboard.tsx`** (chord bar chrome only — piano key rendering untouched)
- Chord bar `borderTop: '#1e1e28'` → `var(--border)`.
- Center container: `gap: 8` → `var(--space-2)`; `padding: '0 12px'` → `'0 var(--space-3)'`.
- CHORDS/SCALES labels (×4, replace_all): color `#e8a027` → `var(--text-amber)`.
- Prompter toggle (simple mode): conditional color `#e8a027`/`#707088` → `var(--text-amber)`/`var(--text-default)`.
- Prompter toggle (extended mode): `#e8a027` → `var(--text-amber)`.
- Explorer chord display and sequence chord names (×3): `fontSize: 14` → `var(--text-md)`; color `#e8a027` → `var(--text-amber)`.
- `‹›` separators (×2): `fontSize: 14` → `var(--text-md)`.
- Ordinal inv label: `#707088` → `var(--text-default)`.
- Slash bass note span: `fontSize: 11` → `var(--text-xs)`; `#b0b0cc` → `var(--text-active)`.
- Hint text (×2, replace_all): `#707088` → `var(--text-default)`.
- Extended mode status text: `fontSize: 11` → `var(--text-xs)`; `#404055` → `var(--text-muted)`.
- Past/next chord name spans (×2, replace_all): `fontSize: 11` → `var(--text-xs)`.
- Right groups: `gap: 8` → `var(--space-2)` ×2.

**`src/components/Keyboard/KeyboardControls.tsx`**
- Container: `padding: '0 16px'` → `'0 var(--space-4)'`; `gap: 12` → `var(--space-3)`.
- Key size button group: `gap: 4` → `var(--space-1)`.
- Key size buttons: `padding: '2px 8px'` → `'2px var(--space-2)'`; `fontSize: 12` → `var(--text-sm)`; active `#e8a027` → `var(--text-amber)`; idle `#404055` → `var(--text-muted)` (including mouseLeave handler).
- Column divider: `#1e1e28` → `var(--border)`.
- Dock/float toggle: `fontSize: 11` → `var(--text-xs)`; colors `#404055`/`#e8a027` → `var(--text-muted)`/`var(--text-amber)` (including hover handlers).
- Practice mode labels: `paddingLeft: 8` → `var(--space-2)` ×2 (replace_all).

**`src/components/Keyboard/FloatingKeyboard.tsx`**
- All `'#404055'` → `'var(--text-muted)'` (×5, replace_all): title label, pin/close button initial colors, and both mouseLeave handlers.
- `'#e8a027'` → `'var(--text-amber)'` on pin button mouseEnter.
- Both button `borderRadius: 3` → `'var(--radius-sm)'` (replace_all).
- Button container `gap: 4` → `'var(--space-1)'`.

---

### 5. 7. 2026 — Design System Tokens + Explorer UI Polish (v0.10.1 continued)

**`src/index.css`**
- Added spacing scale: `--space-1` through `--space-6` (rem-based, 4 px increments).
- Added typography scale: `--text-xs` (11 px) through `--text-lg` (16 px).
- Added border-radius scale: `--radius-sm` (3 px), `--radius-md` (5 px), `--radius-lg` (8 px).
- Added layout tokens: `--row-height: 44px`, `--button-height: 28px`.
- Added utility classes: `.orfeo-row`, `.orfeo-label`, `.orfeo-button`, `.orfeo-value` — scoped inside `:root {}` so they resolve as `:root .orfeo-*` via CSS nesting (effective for all descendants).

**`src/components/ChordExplorer.tsx`**
- Progression Play/Stop button: ready state changed from amber (`#e8a027`) to green (`var(--status-success)`); stop state now uses `var(--status-error)` instead of hardcoded `#c0392b` — both states fully token-driven.
- Row height consistency pass: Root row, Filter row, Progressions sub-row 1, Style sub-row 2, and Footer all given explicit `minHeight` values (`44` / `32`) matching Scale Explorer's established pattern. Root row unified to `{ ...ROW, minHeight: 44 }` (was `padding: '7px 12px'`, no height). Footer fixed from `height: 40` to `minHeight: 44`.

**`src/components/ScaleExplorer.tsx`**
- Progression Play/Stop button: same token swap as ChordExplorer — green ready, red stop, fully token-driven.

**`CLAUDE.md`**
- Design Tokens section expanded: added CSS variable names alongside hex values, full spacing/typography/radius/layout token tables, utility class reference, guidance to prefer `var()` in new code.

---

### 5. 7. 2026 — UI Polish: Logo Mark, EmptyState, Separator, MidiIcon (v0.10.1)

**`src/components/OrfeoMark.tsx`** (new)
- Extracted the Orfeo logo mark SVG into a shared reusable component (`height` + `style` props); aspect ratio 133.39/150 maintained via `Math.round(height * 133.39 / 150)`.

**`src/components/EmptyState.tsx`**
- Replaced inline `OrfeoMark` function definition with import from shared `OrfeoMark.tsx`.
- Centering rewritten: outer div uses `position: absolute; inset: 0`; content wrapper uses `position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%)` — pins to true viewport centre regardless of drawer state.
- Watermark size increased to 320px height; gap between watermark and text block set to 64px.

**`src/components/ChordExplorer.tsx`**
- Header title area now renders `<OrfeoMark height={14} />` + "Chord Explorer" label in a flex row (gap 7px), replacing the bare span.

**`src/components/ScaleExplorer.tsx`**
- Same pattern: `<OrfeoMark height={14} />` + "Scale Explorer" label in header flex row.

**`src/components/MidiEditor/MidiEditor.tsx`**
- Removed hand-drawn circle+lines icon SVG from title bar; replaced with `<OrfeoMark height={18} />`. Existing `gap: 10` on the title bar div provides spacing to the label.

**`src/components/MidiIcon.tsx`**
- viewBox trimmed from `0 0 1000 455` to `137 0 712 455` (glyph bounds) to eliminate ~13.7% empty whitespace on the left, making the SVG element's left edge flush with the M glyph's visual left edge for correct alignment with labels.

**`src/components/Transport/TopBar.tsx`**
- MIDI section `alignItems` changed to `flex-start`; padding adjusted to `0 14px`.
- `borderBottom` removed from TopBar (separator moved to App.tsx sibling div).

**`src/App.tsx`**
- Added full-width 1px separator div as sibling of `<TopBar />` so it spans all columns (SettingsPanel, content, TrackPanel) reliably.

**`electron/main.ts`**
- `titleBarOverlay.height` reduced from 100 to 40 — the 100px tray background was painting over the separator line at y=96px (bottom of TopBar) in the top-right corner of the window.

---

### 5. 7. 2026 — Chord Explorer: Power Chord Tier (v0.10.0)

**`src/components/ChordExplorer.tsx`**
- Tier state type extended: `'common' | 'extended'` → `'common' | 'extended' | 'power'`.
- New state: `selectedPowerRoot: number | null` — tracks which of the 12 tiles is active.
- New derived: `isPowerMode = tier === 'power'`.
- New `playPowerChord(pitchClass)` callback — computes root MIDI at oct 4, builds `[rootMidi, rootMidi+7]` (P5), calls `setExplorerKeys`/`setExplorerChordDisplay`/`__orfeoPlayNote`. Chord display shows e.g. `C5`.
- Tier toggle now renders `['common', 'power', 'extended']` with Power positioned between the two existing options.
- When `isPowerMode`:
  - Results grid switches to 12 power chord tiles in a `repeat(4, 1fr)` layout; each tile shows root name + "5" heading and root+fifth note names; selected tile gets amber border.
  - Hand filter, Notes filter, and Search button greyed out (`opacity: 0.35, pointerEvents: 'none'`).
  - Entire Progressions section (both sub-rows, covering Progressions + Play + Inversions + Style) greyed out the same way.
  - Play Inversion centre div in footer also greyed out.
- Tier-change effect: on entry to Power mode, additionally clears `selectedKey`, `explorerKeys`, and `explorerChordDisplay` so previously selected chord tiles don't leave stale highlights.
- Open-modal reset: `setSelectedPowerRoot(null)` added to the chordExplorerOpen reset block.

---

### 5. 7. 2026 — Scale Explorer: Octave-Completion Chord Tile

**`src/components/ScaleExplorer.tsx`**
- New state: `octaveTileSelected: boolean` — tracks whether the 8th tile is active.
- New `playOctaveDegree` callback — takes the tonic chord from `diatonicChords[0]`, shifts all MIDI notes `+12`, plays them, lights the keyboard in the same colour scheme as regular degree tiles (root amber, others blue), displays chord name with no suffix change.
- Info row label shows `{tonic.roman}⁸` (Unicode superscript 8, U+2078).
- The 8th tile renders after the `diatonicChords.map` block, guarded by `diatonicChords[0]`. Roman numeral shown as `{tonic.roman}⁸`; note names computed at `+12` using existing `getNoteName` calls.
- `currentBaseMidi` useMemo extended: when `octaveTileSelected && diatonicChords[0]`, returns tonic MIDI notes shifted `+12`. This keeps the inversion buttons enabled and pointing at the correct octave when the 8th tile is active.
- Selecting any other degree tile sets `octaveTileSelected` to false via each tile's existing `setSelectedDegree` → the 8th tile deselects automatically.

---

### 5. 7. 2026 — Chord Explorer: Genre/Style Voicing System

**`src/utils/genreVoicing.ts`** (new file)
- `Genre` union type: `'classic' | 'coltrane' | 'cinematic' | 'roadhouse' | 'ipanema' | 'carnival' | 'velvet'`.
- `GENRE_LABELS` record for display names.
- `parseRomanLabel(label)` — strips `b`/`#` prefix and `°` suffix; classifies by case: uppercase=major, lowercase=minor, `°`=diminished.
- `getGenreVoicing(genre, romanLabel, baseKey)` — Classic resolves to plain 'major'/'minor'/'dim' from Roman case (no chord type extension). All other genres look up `(degree, quality)` in their DegreeMap and fall back to `baseKey` when no override exists.
- Style maps and their design intent:
  - `COLTRANE_MAP` — maj9/m9/m7b5 on I; dom13 on V; maj7/m7/m7b5 elsewhere.
  - `CINEMATIC_MAP` — Madd9/madd9 on I; Madd9/m7 on II–IV; 9sus4/m7 on V; Madd9/madd9 on VI. VII/dim fall through to Classic.
  - `ROADHOUSE_MAP` — dom7 on I/IV/V for all qualities (intentional blues override).
  - `IPANEMA_MAP` — maj9/m9 on I; m11 on minor II/IV; maj7#11 on major IV (Lydian lift); dom13 on V; VII gets maj7/m7b5.
  - `CARNIVAL_MAP` — maj7/m7 on I–IV/VI; dom7/m7 on V; maj7/m7b5 on VII.
  - `VELVET_MAP` — maj13/m13 on I/VI; maj9/m11 on II/III; maj9#11/m11 on IV; 7b9b13/m11 on V (altered dominant); maj7/m9b5 on VII.
- All chord type strings verified against tonal 6.4.3 `ChordType.all()`.

**`src/components/ChordExplorer.tsx`**
- Imports `getGenreVoicing`, `GENRE_LABELS`, `Genre` from `genreVoicing.ts`.
- `progGenre: Genre` state (default `'classic'`).
- `playProgStepAt` applies `getGenreVoicing(genre, prog.labels[step], chordKey)` to derive `effectiveKey` before looking up the chord info. Falls back to the user's selected chord type when no genre override exists for that degree/quality.
- `playProgStepAt` also calls `setExplorerChordDisplay` after MIDI notes are determined — previously the chord display above the keyboard stayed frozen on "C" during progression playback. Deps array updated to include `setExplorerChordDisplay` and `rootLabels` to fix the stale closure.
- Standalone Genre row removed; replaced with two-sub-row Progressions container:
  - Sub-row 1: three-column layout (Progressions dropdown + Play/Stop + SpeedControl + Inversions).
  - Sub-row 2: Style buttons, dimmed (`opacity: 0.35, pointerEvents: 'none'`) when no progression is selected.
- Style tooltips: each button has a `title` attribute describing the voicing character.
- `PROGRESSIONS` array reordered into four family groups: Pop cluster → Rock/Blues cluster → Jazz cluster → Exotic/named progressions.
- Rotation deduplication: `buildAllProgressions()` uses a Set of offset-sequence strings to deduplicate cyclic equivalents across different base progressions (e.g. Pop/Rock Inv. is a rotation of Pop — emitted zero extra rotations).
- Bug fix — Classic style regression: previously `if (genre === 'classic') return baseKey` bypassed `parseRomanLabel` entirely, causing `vi` to play as a major chord. Fixed to return `'minor'`/`'dim'`/`'major'` based on Roman numeral case.

---

### 4. 7. 2026 — Performance mode: ribbon rest state — full hide + midline + dimmed labels

**`src/components/Keyboard/KeyboardControls.tsx`**
- Added `isSilent` derived boolean: `activeKeys.size === 0`.
- Added four refs for frozen last-known positions, mutated during render (no hook):
  `hadBoundaryRef` (bool), `lastRibbonPctRef` (default 50%), `lastClusterLeftPctRef`, `lastClusterRightPctRef`. Updated whenever their source values are non-null.
- Performance mode guard changed: `if (ribbonPct === null) return null` → `if (!isSilent && ribbonPct === null) return null`. Silent state now proceeds to render; only single-hand/no-boundary-while-active hides everything.
- Gradient fill: switched from fixed `opacity: e6` to `opacity: isSilent ? 0 : 1` with `transition: 'opacity 0.25s ease'`. Position computed from `ribbonPct ?? lastRibbonPctRef.current` so it does not jump on silence entry.
- Added resting midline: 1px `#404055` vertical line at `activePct`, `zIndex: 2`, rendered only when `isSilent`.
- Labels now rendered from `clusterLeftPct ?? lastClusterLeftPctRef.current` and equivalent right — holds frozen cluster position during silence. `opacity: isSilent ? 0.55 : 1` with `transition: 'opacity 0.25s ease'`. Labels remain hidden if cluster position is null and no frozen position exists yet.

---

### 4. 7. 2026 — Performance mode: ribbon contrast fix + cluster-anchored stable labels

**`src/utils/handBoundaries.ts`**
- Added internal helper `computeClusterCenters(pitches, boundary)` — computes mean MIDI pitch of notes strictly below (left) and at/above (right) the boundary; returns null when either side is empty.
- Added exported `computeClusterCenterCurve(midi, minGapSt)` — same sliding 2-second window scan as `computeHandBoundaryCurve`; at each sample stores `{ leftCenter, rightCenter }` instead of a midpoint; returns null entries when boundary is absent.
- Added exported `lookupClusterAtTime(curve, t)` — binary-search nearest-past entry (not interpolated); returns `{ leftCenter: null, rightCenter: null }` when curve is empty.

**`src/components/Keyboard/KeyboardControls.tsx`**
- `useSmoothedBoundary` simplified: removed Tier 2 entirely (committed value, `committedRef`, `candidateRef`, `COMMIT_DELTA_ST`, `COMMIT_DELAY_MS`). Now returns `number | null` directly instead of `{ ribbonPct, committed }`.
- Added constant `CLUSTER_SMOOTHING = 0.04`; removed `COMMIT_DELTA_ST` and `COMMIT_DELAY_MS`.
- Added local hook `useSmoothedClusterCenters(rawLeftPct, rawRightPct)` — two independent long-lived rAF expo-smoothers at `CLUSTER_SMOOTHING`; snap-to-null on null input; snap-immediate on first non-null. Returns `{ clusterLeftPct, clusterRightPct }`.
- Added `clusterCurve` local state (`useState`).
- Extended `useEffect([midi, performanceSplitSensitivity])` to also call `computeClusterCenterCurve` and store result; sets `clusterCurve` to `[]` on null midi.
- Raw cluster centers computed inline — hardware path: split `activeKeys` at `performanceBoundary` and take means; file path: `lookupClusterAtTime(clusterCurve, currentTime)`.
- Cluster centers converted to pct via `noteToLeftPct(Math.round(center), whiteKeys)` then passed to `useSmoothedClusterCenters`.
- Ribbon gradient opacity: `28` (15.7%) → `e6` (90.2%). Both SLATE and AMBER sides.
- Dock/Float button: added `position: 'relative', zIndex: 3` so it renders above the absolute-positioned gradient ribbon (zIndex 1).
- Performance mode labels: replaced centered-in-region model with `left: ${clusterPct}%; transform: translateX(-50%)` anchored at cluster mean; color changed from per-hand tint to `#ffffff` white; each label conditionally rendered — hidden when its cluster pct is null (e.g. single-hand texture or sparse region).

---

### 4. 7. 2026 — Performance mode: sensitivity range fix + two-tier jitter smoothing

**`src/store/index.ts`**
- `performanceSplitSensitivity` default lowered: `14` → `8`; clamp changed from `[8, 24]` to `[2, 16]`. The previous range was calibrated for 12-tone chromatic gaps; the tighter range better reflects real piano inter-hand spacings (perfect 2nd at 2 st through a minor 10th at 16 st).

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- Slider `min`/`max` updated to `2`/`16`; end labels updated accordingly.

**`src/components/Keyboard/KeyboardControls.tsx`**
- Added constants `SMOOTHING_FACTOR = 0.18`, `COMMIT_DELTA_ST = 3`, `COMMIT_DELAY_MS = 400`.
- Added local hook `useSmoothedBoundary(rawBoundary, whiteKeys)` — applied once to the merged `performanceBoundary` (both file-curve and live-hardware paths converge there; no per-source duplication).
  - **Tier 1 ribbon pct** — exponential smoothing in pct space (not MIDI space, to keep motion visually uniform across black/white key geometry). `SMOOTHING_FACTOR = 0.18` reaches ~90% of a new target in ~175ms at 60fps. Null raw snaps to null immediately — no phantom ease-out.
  - **Tier 2 committed** — hysteresis in MIDI-note space. Tracks a pending `candidate { value, since }`. Commits only when `|raw − committed| > 3 st` AND candidate has held for ≥ 400ms without itself jumping > 3 st. Null raw immediately clears committed and cancels any pending candidate.
  - Single long-lived rAF loop; all reactive values accessed via refs so raw changes never restart the loop.
- Performance mode render updated: line uses `ribbonPct`, labels use `noteToLeftPct(committed, whiteKeys)` with a `ribbonPct` fallback for the first ~400ms before first commit.

---

### 4. 7. 2026 — Performance mode: adjustable split sensitivity (v0.9.0)

**`src/utils/handBoundaries.ts`**
- `PERF_MIN_NOTES` lowered from 4 to 2. A single note has no measurable gap; 2+ notes always go through the gap check. The gap threshold alone handles false positives for small chords.
- Removed module-level constant `PERF_MIN_GAP_ST`; threshold is now a live parameter on both functions.
- `detectPerformanceBoundary(pitches, minGapSt)` — added `minGapSt: number` parameter; read fresh from the store on every call.
- `computeHandBoundaryCurve(midi, minGapSt)` — added `minGapSt: number` parameter; passes it through to each `detectPerformanceBoundary` call inside the window loop.

**`src/store/index.ts`**
- `performanceSplitSensitivity: number` — new field; default 14 semitones; setter clamps to [8, 24]; persisted via the standard 5-point sentinel pattern (interface, store body with clamp, `_prevPerformanceSplitSensitivity` sentinel variable, subscriber comparison+update, `setPrefs` payload, `restoreLibraryPrefs`).

**`src/components/Keyboard/KeyboardControls.tsx`**
- Reads `performanceSplitSensitivity` from store via primitive selector.
- Curve `useEffect` deps extended to `[midi, performanceSplitSensitivity]`; passes sensitivity to `computeHandBoundaryCurve`.
- Live boundary `useEffect` deps extended to `[activeKeys, handLabelMode, performanceSplitSensitivity]`; passes sensitivity to `detectPerformanceBoundary`.

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- Reads `performanceSplitSensitivity` / `setPerformanceSplitSensitivity` from store.
- Performance mode section: description-only div replaced with a slider `OptionRow` (`Split Sensitivity — N semitones`, range 8–24, `accentColor: #e8a027`) plus a description div below it.

---

### 4. 7. 2026 — Performance mode: correct gap threshold (7 st, was 14)

**`src/utils/handBoundaries.ts`**
- `PERF_MIN_GAP_ST` lowered from 14 to 7. The 14-semitone (major 9th) threshold was too conservative: in a 2-second window with both hands present, the largest consecutive gap between the highest bass note and lowest treble note is typically 5–12 semitones, causing the entire curve to be null and the line to never appear. The original 3-note false-positive (C–E–G) is already blocked by `PERF_MIN_NOTES = 4`; common 4-note single-hand chords top out at 5-semitone consecutive gaps, so 7 (perfect 5th) is the correct threshold.

---

### 4. 7. 2026 — Performance mode: fix false hand-split on single-hand chords

**`src/utils/handBoundaries.ts`**
- Added constants `PERF_MIN_NOTES = 4` and `PERF_MIN_GAP_ST = 14` (major 9th).
- Added `detectPerformanceBoundary(pitches: number[]): number | null` — shared function used by both the file-curve precomputation and the live hardware-input path. Returns null when fewer than 4 unique pitches are present, or when the largest consecutive pitch gap is < 14 semitones; returns the gap midpoint otherwise. Fixes the root cause: previously both call sites always emitted a split even for tight single-hand clusters (C–E–G = 4 st gap → false split).
- `computeHandBoundaryCurve` return type changed to `{ time: number; boundary: number | null }[]`. Removed the `lastBoundary` carry-forward logic (each sample is now self-contained). Replaced 8-line inline gap loop with a single call to `detectPerformanceBoundary`. Empty or thin windows now produce null entries rather than carrying stale data.
- `interpolateCurve` input type updated to match; added null-neighbor guard — returns null immediately if either surrounding curve point is null, preventing a phantom line from interpolating across a no-boundary segment.

**`src/store/index.ts`**
- `handBoundaryCurve` interface and setter type updated to `{ time: number; boundary: number | null }[]`.

**`src/components/Keyboard/KeyboardControls.tsx`**
- Imported `detectPerformanceBoundary`.
- Live hardware `useEffect`: replaced inline 8-line gap loop with `detectPerformanceBoundary(pitches)`; removed early-return on thin pitch list — state is always updated (null or number) so tight single-hand clusters actively hide the line rather than holding a stale boundary.
- `performanceBoundary` derivation simplified to `hasHardwareKeys ? lastLiveBoundary : curveBoundary` — removed `?? lastLiveBoundary` fallback so hardware-present null (tight cluster) correctly hides the line instead of falling back to the file curve.

---

### 4. 7. 2026 — Hand Labels: Performance mode (dynamic boundary)

**`src/utils/handBoundaries.ts`**
- `computeHandBoundaryCurve(midi)` — new export; slides a 2-second lookback window across the piece's keyboard-track notes, sampled every 250 ms; finds the largest pitch gap per window and returns the midpoint as a `{ time, boundary }[]` array. Used by Performance mode for file playback.
- `interpolateCurve(curve, t)` — new export; binary-searches the curve for surrounding points and linearly interpolates. Returns `null` when the curve is empty.

**`src/store/index.ts`**
- `handLabelMode: 'practice' | 'performance'` — new store field; default `'practice'`; persisted via the existing 5-point sentinel pattern (sentinel var, subscriber init, comparison, update, setPrefs payload, restoreLibraryPrefs).
- `handBoundaryCurve: { time, boundary }[]` — new store field; not persisted; reset to `[]` by the `useEffect` in `KeyboardControls` on every file change.

**`src/components/Keyboard/KeyboardControls.tsx`**
- Complete rewrite to add Performance mode rendering alongside Practice mode.
- `useEffect([midi])` — computes and stores `handBoundaryCurve` via `computeHandBoundaryCurve` whenever the loaded file changes; clears to `[]` on null.
- `useState(lastLiveBoundary)` + `useEffect([activeKeys, handLabelMode])` — tracks live boundary from currently held notes using the same largest-gap midpoint algorithm; holds last computed value when no notes are held.
- Hardware key detection: `[...activeKeyColors.values()].some(c => c === '#e8a027')` — identifies hardware MIDI notes by their fixed amber color, taking priority over curve boundary when present.
- Performance mode renders a single moving amber line; Practice mode is byte-for-byte unchanged.
- `performanceHideControls` flag: when Performance is active and playing or hardware notes present, hides key-size selector and NoteCounter; dock/float button moves to far right via `marginLeft: 'auto'`.

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- Reads `handLabelMode` / `setHandLabelMode` from store.
- Adds "Mode" row (Practice / Performance toggle) below the Hand Labels on/off toggle, visible only when labels are on.
- Practice: existing split zone controls shown unchanged.
- Performance: split zone hidden; short description shown in its place.

---

### 4. 7. 2026 — Loop nudge blink, MIDI wordmark icon, label polish

**`src/components/Transport/TopBar.tsx`**
- `nudgeLoop` derived: `loopRegionEnabled && !!midi && loopStart !== null && loopEnd !== null && !loopRegionActive` — true when a region is selected but the user hasn't activated looping yet
- Repeat (↺) button passes `blink={nudgeLoop}` to `TBtn`; when blinking, colour is forced amber and `loop-nudge-blink` CSS class applied; `transition: 'color 0.1s'` suppressed so the animation runs uncontested
- "click to loop" span (9px Inter, 0.04em spacing, 85% opacity) rendered in the transport flex row to the right of the Repeat button when `nudgeLoop`; disappears on activation or region clear
- `TBtn` extended with `blink?: boolean` prop; `isAmber = active || accent || blink`; `onMouseLeave` also uses `isAmber` so hover-out restores amber when blinking
- MIDI icon: replaced stroke-based circle-dot SVG in `MidiIcon.tsx` with official MIDI wordmark (MIDI_LOGO.svg, viewBox `0 0 1000 455`); `height={size}`, `width={Math.round(size * (1000/455))}` (~53px at size 24) so height exactly matches the metronome SVG; `fill={color}` — all existing connection/colour logic in TopBar unchanged
- MIDI label: `'NO MIDI'` → `'CONNECT A KEYBOARD'`; font-size drops to 7 (from 8) when not connected; letter-spacing tightens to `0.05em` (from `0.08em`); `whiteSpace: 'nowrap'` added; container padding reduced `'0 14px'` → `'0 8px'`

**`src/index.css`**
- `@keyframes orfeo-loop-blink`: `filter: brightness(1)` at 0%/100%, `filter: brightness(0.3)` at 50%; 1.4s ease-in-out infinite
- `.loop-nudge-blink` applies the animation
- `filter` chosen over `opacity`/`color` so inline React styles cannot override the keyframe

**`src/components/MidiIcon.tsx`**
- Full rewrite: four `<path>`/`<rect>` elements from MIDI_LOGO.svg; `fill={color}`, no stroke; props (`size`, `color`) unchanged

---

### 3. 7. 2026 — Loop Region Strip (v0.8.0)

**`src/components/LoopRegionStrip.tsx`** (NEW)
- Canvas-based 24px interactive strip rendered between the scrub bar and the filename in TopBar when `loopRegionEnabled` is true
- Note density visualisation: note times bucketed into 2px columns, normalised height 4–12px, colour `#404058`
- Drag-to-create: `handleMouseDown` classifies as `'new'` | `'left'` | `'right'` handle drag; `previewRef` holds live drag state separate from committed store state
- Bar snapping: `snapToBar()` picks nearest bar boundary from `barStarts + duration` on mouseup; `displayEndBar()` subtracts 1 from raw bar index when `loopEnd` lands exactly on a bar start (avoids "bars 8–13" when user selected 8–12)
- Handle geometry: `HANDLE_VIS_W = 4` (drawn), `HANDLE_HIT_W = 8` (mouse hit target)
- Playhead: white 2px rect + amber downward triangle tracking `currentTime`
- Global `mousemove`/`mouseup` in single `useEffect([], [])` — never re-registered on re-render; state via refs only
- Icon button (ArrowUp01 SVG): amber when selection exists or popup open; tooltip "Select bar range manually"
- Popup: "BAR RANGE" header; From/To rows with 48px `type="text"` inputs + amber `ChevronUp`/`ChevronDown` steppers (no background); amber Apply button; closes on click-outside
- `applyBarRange()`: `startTime = barStarts[from-1]`, `endTime = to < totalBars ? barStarts[to] : midi.duration`
- Bars DOM label: `bars {startBar}–{endBar}` in amber, right of the icon, only when selection exists; derived in render body from primitive selectors — not a `useStore` object selector (which breaks `useSyncExternalStore` snapshot invariant → renderer crash)
- `draggable={false}` + `onDragStart={e => e.preventDefault()}` on canvas — blocks native HTML5 drag reaching Electron's file handler
- Fragment return: canvas fills the shared 400px TopBar wrapper; icon+popup are `position: absolute, left: calc(100% + 8px)` anchored outside the wrapper's right edge

**`src/components/Transport/TopBar.tsx`**
- Scrub bar and strip share a `width: min(100%, 400px), position: relative` flex column wrapper — both have identical visual width (34+6+320+6+34 = 400px); `position: relative` is the containing block for the strip's absolutely-placed icon
- TopBar height: `loopRegionEnabled ? 120 : 96`
- Loop button now toggles `loopRegionActive`; tooltip is context-aware (shows bar range when region set, generic hint otherwise)

**`src/hooks/usePlayback.ts`**
- JZZ path: `loopRegionActive && secs >= loopEnd` → `player.play(); player.jumpMS(Math.floor(loopStart * 1000))` — in-place seek, no player rebuild
- JZZ path: `loopRegionActive` + no region → seeks to 0 on end-of-file instead of stopping
- Fallback/samples path: same logic via `playbackState: 'paused'` → `Promise.resolve().then(() => 'playing')` to trigger samples engine rebuild at new `currentTime`

**`src/store/index.ts`**
- New fields: `loopStart: number | null`, `loopEnd: number | null`, `loopRegionEnabled: boolean`, `loopRegionActive: boolean`
- New actions: `setLoopRegionEnabled` (clears region when disabling), `setLoopRegionActive`, `setLoopRegion`, `clearLoopRegion`
- `setMidi` (both branches) and `resetAll` reset loop state to null/false
- `loopRegionEnabled` persisted via `_prevLoopRegionEnabled` sentinel; `loopStart`/`loopEnd`/`loopRegionActive` intentionally NOT persisted

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- "Loop Region strip" On/Off toggle under Playback section

**Bug fixed — native drag opens file dialog:** `draggable={false}` + `onDragStart` on the canvas stops the OS drag-and-drop event from surfacing to Electron's file handler mid-selection.

**Bug fixed — renderer crash on selection commit:** `loopBarRange` selector was returning `{ startBar, endBar }` — a new object reference on every call. Zustand v4 / `useSyncExternalStore` calls `getSnapshot` multiple times and requires referential stability; always-new object → snapshot inconsistency → immediate renderer crash. Fixed: use three primitive selectors (`loopStartLabel`, `loopEndLabel`, `barStartsLabel`) and compute derived values in render body.

---

### 3. 7. 2026 — Web MIDI hardware input capture (verified)

**`src/hooks/useMidiInput.ts`** (NEW)
- `useMidiInput()` — requests `navigator.requestMIDIAccess()` on mount (skipped gracefully if API unavailable in the Electron context); attaches `midimessage` listener to every connected input port (all devices merged into one stream)
- `pressNote(midiNum, vel)` — writes directly to `activeKeys` / `activeKeyColors` (amber `#e8a027`, no timer), then routes audio to `__orfeoNoteOnSamples` or `__orfeoNoteOn` based on current engine
- `releaseNote(midiNum)` — removes from `activeKeys` / `activeKeyColors`, routes to `__orfeoNoteOffSamples` or `__orfeoNoteOff`
- `syncInputs()` — re-enumerates on `onstatechange`; updates `setMidiDevice(connected, name)` — the topbar MIDI indicator is now live
- Cleanup removes all per-port listeners and nulls `onstatechange` on unmount
- Verified: key lighting, true sustain (note-off stops sound immediately), polyphony all confirmed via console test helper (helper removed before commit)

**`src/hooks/useAudioEngine.ts`**
- Added `_hwChannelReady` flag + `ensureHardwareChannel()` — sends program 0 on channel 15 (`[0xCF, 0]`) once; same sentinel pattern as `ensureClickChannel`
- Added `window.__orfeoNoteOn(midiNum, vel)` — async, awaits `initJZZ()`, calls `ensureHardwareChannel()`, sends `[0x9F, midiNum, vel]` (ch 15); no timer
- Added `window.__orfeoNoteOff(midiNum)` — sync, sends `[0x8F, midiNum, 0]`; immediate
- Both registered/unregistered alongside `__orfeoPlayNote` in the same `useEffect`
- Comment: channel 15 collision risk with MIDI files using channel 16 — accepted tradeoff

**`src/hooks/useSamplesEngine.ts`**
- Added `_hwChannelReady` flag + `ensureHwChannel()` — sends `programChange(15, 0)` + `controllerChange(15, 7, 127)` once on first hardware note-on
- `__orfeoPlayNoteSamples` now calls `ensureHwChannel()` instead of inline `programChange`/`controllerChange` on every invocation
- Added `window.__orfeoNoteOnSamples(midiNum, vel)` — calls `ensureHwChannel()`, then `_synth.noteOn(15, midiNum, vel)`; no timer
- Added `window.__orfeoNoteOffSamples(midiNum)` — calls `_synth.noteOff(15, midiNum)` immediately
- Same comment re channel 15 collision risk

**`src/App.tsx`**
- `useMidiInput()` mounted alongside `useAudioEngine()`

---

### 3. 7. 2026 — Left/Right Hand Labels: settings reorder + split zone conditional visibility

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- Moved "Left/Right Hand Labels" On/Off toggle to appear directly below "Key range", before the Split zone controls
- Wrapped the entire Split zone section (mode selector + note/range steppers) in `{showHandLabels && (...)}` — collapses from view when Labels is OFF
- Updated Labels hint to: "Shows amber hand boundary lines and labels in the keyboard footer."

---

### 3. 7. 2026 — Left/Right Hand Labels: footer redesign + settings relocation

**`src/components/Keyboard/Keyboard.tsx`**
- Removed the vertical separator line overlays from the piano key area entirely; visual layer now belongs exclusively to the footer bar

**`src/components/Keyboard/KeyboardControls.tsx`**
- Replaced dim centered labels with a full amber visual layer:
  - Range mode: two 2px amber lines (`box-shadow: 0 0 7px 2px #e8a02788` glow), shaded mixed-zone fill (`#e8a02718`) between them, "LEFT HAND" right-aligned to the left line with 6px padding, "RIGHT HAND" left-aligned from the right line with 8px padding
  - Single mode: one amber glowing line, same label placement, no zone fill
  - All overlays: `zIndex: 2`, `pointerEvents: none` so controls remain clickable

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- Moved the Split zone / Split note controls from the MIDI Editor section into the Keyboard section, positioned between "Key range" and "Left/Right Hand Labels"
- Removed the now-empty MIDI Editor section header and `Scissors` import
- Updated "Split mode" label to "Split zone" and rewrote hint text to reflect its role as a visual keyboard boundary rather than an editor operation hint
- Updated range hint: "Notes inside the shaded zone may come from either hand."
- Updated "Left/Right Hand Labels" hint: "Displays LEFT HAND / RIGHT HAND labels on the keyboard using the split zone above."

---

### 3. 7. 2026 — Left/Right Hand Labels on keyboard

**`src/utils/handBoundaries.ts`** (NEW)
- `getWhiteKeys(keyboardSize)` — derives white-key list from RANGES, matching Keyboard.tsx constants exactly
- `noteToLeftPct(note, whiteKeys)` — converts a MIDI note to a left-edge % position; white keys use their index directly, black keys use the `(lowerWhiteIdx + 0.40) / len` formula matching the existing black-key geometry in Keyboard.tsx
- `detectHandBoundaries(midi, bpType, bpNote, bpStart, bpEnd)` — returns `null | { type:'single', note } | { type:'range', start, end }`:
  - Two-track case: finds a ≥85%-bass / ≥85%-treble keyboard track pair; derives boundary from their note ranges (touching → single, gap or overlap → range)
  - Single-track case (or no qualifying pair): checks ≥15% notes in each register (split-eligible threshold); if yes, uses the global split breakpoint settings to produce a single or range result

**`src/store/index.ts`**
- Added `showHandLabels: boolean` (default `false`) and `setShowHandLabels` to `OrfeoStore`
- Wired into null-sentinel subscriber: `_prevShowHandLabels` sentinel, change-detection condition, `setPrefs` payload
- Wired into `restoreLibraryPrefs`: `if (typeof prefs.showHandLabels === 'boolean') store.setShowHandLabels(...)`

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- Added `showHandLabels` / `setShowHandLabels` selectors
- Added `OptionRow` "Left/Right Hand Labels" with On/Off buttons under the Keyboard section (below Key range)

**`src/components/Keyboard/Keyboard.tsx`**
- Added imports: `detectHandBoundaries`, `noteToLeftPct` from `handBoundaries.ts`
- Added store selectors: `showHandLabels`, `splitBreakpointType`, `splitBreakpointNote`, `splitBreakpointRangeStart`, `splitBreakpointRangeEnd`
- Added `handBoundaries` useMemo (depends on `midi` + breakpoint settings)
- Inside the piano key container div: renders 1 or 2 `position: absolute, zIndex: 3` thin vertical lines at the computed `left: N%` positions when `showHandLabels && handBoundaries`

**`src/components/Keyboard/KeyboardControls.tsx`**
- Added imports: `React`, `useMemo`, `getWhiteKeys`, `noteToLeftPct`, `detectHandBoundaries`
- Added store selectors: `showHandLabels`, `midi`, all four breakpoint fields
- Added `whiteKeys` and `handBoundaries` useMemos
- Renders LEFT HAND and RIGHT HAND labels as `position: absolute, zIndex: 0` overlays centered in their respective keyboard half-regions; `pointer-events: none`; dim `#404055` color
- Works for both docked and floating keyboard modes (FloatingKeyboard renders the same two components)

---

### 3. 7. 2026 — Drawer icons, layout & styling unification

**`src/components/SettingsPanel/SettingsPanel.tsx`**
- Removed single `ListMusic` toggle button; replaced with a conditional:
  - Closed: full-height flex column — `Library` (→ library tab), `Settings` (→ settings tab), flex spacer, `Info` pinned at bottom ("Coming soon" tooltip, `opacity: 0.5`, `cursor: default`). All functional buttons: `#707088` default / `#e8a027` hover.
  - Open: `ChevronLeft` only (no more dual-icon toggle); tooltip is now dynamic — `'Close Library'` or `'Close Settings'` based on `activeTab`.
- Tab bar: icons swapped `Music → Library`, `Settings2 → Settings`; `justifyContent: 'center'` → `justifyContent: 'flex-start'` + `paddingLeft: 12` to left-align icon+label flush with panel content below (folder bar / filter buttons at 12px).
- Imports: removed `Settings2`, `ListMusic`, `Music` (latter was the tab icon, not the Playback section header — `Music` is kept for that). Added `Library`, `Settings`, `Info`.

**`src/components/TrackPanel/TrackPanel.tsx`**
- Removed single `SlidersHorizontal` toggle button; replaced with conditional:
  - Closed: full-height flex column — `AudioLines size={18}` (opens panel), `SlidersVertical size={18}` (coming soon, `opacity: 0.5`), `PencilSparkles size={18}` (MIDI editor; dim `#303042` when no midi, amber when editor open).
  - Open: outer div restructured from flex-column to flex-row:
    - Left icon strip (32px, `borderRight: '1px solid #1a1a26'`, `paddingTop: 10`): `ChevronRight` close button (styled with `background: '#1a1a24'`, `border: '1px solid #252535'`, `borderRight: 'none'`, `borderRadius: '0 4px 4px 0'`) + `SlidersVertical size={16}` coming soon + `PencilSparkles size={16}` MIDI editor.
    - Content div (`flex: 1`, `flexDirection: 'column'`): header (`padding: '0 14px'`, previously `'0 14px 0 36px'`) + track list — both unchanged in content.
- Soundfont placeholder button (SVG, color `#30303e`) removed from open header.
- Header icon `Music2 size={14}` → `AudioLines size={14}`.
- `PencilLine` → `PencilSparkles` throughout (both states, closed column and open strip). `PencilSparkles` is defined as an inline SVG component at file top (not yet shipped in the installed `lucide-react` version); uses the path data from the official Lucide `pencil-sparkles` icon.
- Imports: removed `ChevronLeft` (was unused), `Pencil`, `SlidersHorizontal`, `Music2`, `PencilLine`. Added `AudioLines`, `SlidersVertical`. `PencilSparkles` is a local SVG component.

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