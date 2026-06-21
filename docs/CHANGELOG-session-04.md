# Orfeo — Session 04 Changelog
> Date: June 2026 | Version: 0.3.0

---

## Summary
Major UI polish pass, chord detection overhaul, audio fixes, build pipeline established.

---

## Build & Distribution
- Added `electron-builder` with NSIS installer config
- `npm run dist` → produces `dist/win-unpacked/Orfeo.exe` and `dist/orfeo Setup x.x.x.exe`
- Real app icon (`Orfeo_O_logo_icon-RK.ico`) integrated into build
- Confirmed: packaged `.exe` is draggable on Windows desktop (dev server is not)

---

## Window & Dragging
- `titleBarStyle: 'hidden'` + `titleBarOverlay` (height: 100) = native amber Win controls + drag
- CSS classes `.app-drag-region` / `.app-no-drag` applied via `index.css` for reliable drag
- Topbar height set to 96px, matching `titleBarOverlay height` exactly
- Note: Win –/□/× hover backgrounds are OS-native, cannot be suppressed via Electron API

---

## Design Token System (`src/index.css`)
Established global colour roles used consistently across all components:
- `#707088` — default UI text/icons (inactive state), matches "TRACKS" header colour
- `#b0b0cc` — active/value text (BPM number, 4/4, key value), matches "120" colour
- `#404055` — very dim labels and hints
- `#e8a027` — amber accent: active states, hover on interactive elements
- Removed all button `outline` / `focus-visible` rings

---

## TopBar (`src/components/Transport/TopBar.tsx`)
- **BPM and KEY**: horizontal side by side (not stacked), each with label + value + ∧/∨ arrow buttons
- **Arrows**: vertical chevrons right of value; hover → amber; disabled when no file
- **No slider** for BPM — arrows only (±1 BPM per click)
- **Transport buttons**: no borders, no backgrounds ever; colour-only state; hover → amber
- **Play/Pause**: filled icon, no border
- **Rewind/FastForward**: skip ±5 seconds
- **TIME / METRONOME / MIDI**: grouped in `alignItems: flex-end` container — all three bottom-aligned on same baseline
- TIME: 4/4 at 13px, label "TIME" below in `#707088`
- Metronome icon 18×22, label "ON/OFF" in `#707088`
- MIDI icon 20px, label "MIDI/NO MIDI" in `#707088`
- All three labels same font size (8px JetBrains Mono), same colour
- Separator line between topbar and content: removed (was causing amber ghost line)
- Right padding 174px to clear native Win overlay buttons

---

## Audio Engine (`src/hooks/useAudioEngine.ts`)
- Mouse click on keyboard uses dedicated channel 14 with explicit Grand Piano program change (prog 0)
- `showOnKeyboard` flag checked before scheduling key lighting — drums/guitars never light keys
- `_notePortReady` flag reset after playback ends so program change re-fires correctly

---

## Metronome (`src/hooks/useMetronome.ts`)
- Full rewrite using Web Audio API lookahead scheduler (25ms interval, 120ms lookahead)
- Adapts immediately when BPM changes — recalculates `nextBeatRef` on BPM change
- Downbeat accent (1200Hz) vs regular beat (900Hz)
- Starts only when `metronomeEnabled && playbackState === 'playing'`
- Note: metronome uses independent Web Audio clock; JZZ player uses its own clock — slight drift possible on very long files; root fix requires deriving beat from JZZ elapsed position (deferred)

---

## Chord Detection (`src/utils/chordDetection.ts`)
Complete rewrite implementing piano-learner guidelines:
- **Root position detection**: bass note === chord root → show clean name (G, Am, Cmaj7)
- **Inversion detection**: bass note ≠ root → show slash notation (G/B · 1st inv)
- **Strip major suffix**: CM → C, GM → G (trailing M removed)
- **Triad-first scoring**: shorter name = simpler = preferred
- **Weird chord penalty**: m#5, aug, No5 deprioritised
- **Fallback**: if 4+ notes and no match, strip highest note (likely melody) and retry
- **Pitch class fallback**: if named notes fail, retry with pitch classes only
- `detectChordWithInversion()`: returns `{ name, invLabel }` for locked chord display
- Inversion labels: '1st inv', '2nd inv', '3rd inv' (root position = no label)

---

## Keyboard (`src/components/Keyboard/Keyboard.tsx`)
- **Smart playback chord display**: requires 3+ simultaneous notes, 320ms debounce, 1600ms hold after notes release
- **Chord clears on stop**: playbackState === 'stopped' → displayedChord = null
- **CHORDS label**: fixed left, `#707088` colour
- **ⓘ icon**: amber, immediately right of CHORDS label, fixed position
- **Tooltip**: explains playback chord + Shift+click lock + inversions
- **Chord Lock**: Shift+click to build/lock chord; shows chord name + inversion label
- **Play button**: plays locked chord (all notes simultaneously)
- **Inversion arrows**: ‹ prev / › next cycle inversions, auto-play on click
- **Clear button**: releases lock
- Info icon: amber border + amber colour

---

## Track Panel (`src/components/TrackPanel/TrackPanel.tsx`)
- Default state: **closed** on app open
- **Auto-opens** when MIDI file is loaded (via `setMidi()` in store)
- Closed state icon: custom playlist SVG in `#707088`
- Open state icon: ChevronRight (unchanged)
- Header: Music2 icon + "TRACKS" label + count + soundfont placeholder icon
- Track rows: instrument name `#9090a8`, track/ch/prog sub-labels `#505068`/`#454560`
- **M button** (red `#d04040`) replaces speaker icon for individual mute
- **Group mute**: Volume2/VolumeX speaker icon (replaces MUTE/UNMUTE text)
- Solo button: amber when active
- Eye/EyeOff for visibility
- Mini piano icon for showOnKeyboard toggle
- No borders/backgrounds on any icon button — colour only

---

## Store (`src/store/index.ts`)
- Default `keyboardSize: 73`
- Default `trackPanelOpen: false`
- `setMidi()`: auto-mutes non-keyboard groups on file load (strings, ensemble, brass, reed, pipe, synth, ethnic, sfx)
- `setMidi()`: sets `showOnKeyboard: true` only for piano/chromatic/organ groups
- `setMidi()`: sets `trackPanelOpen: true` when file loads

---

## Empty State (`src/components/EmptyState.tsx`)
- Music2 icon replaced with actual Orfeo O logo SVG (amber, 72px)
- "Open MIDI file" button: `borderRadius: 5px`, proper padding
- Button hover: opacity 0.85 (no background change)

---

## Keyboard Controls (`src/components/Keyboard/KeyboardControls.tsx`)
- Inactive size buttons: `#707088`
- Dock/Float: pin icon for docked, move icon for floating
- Label colours unified

---

## App Icon
- `public/icon.ico` replaced with real Orfeo O mark icon (`Orfeo_O_logo_icon-RK.ico`)
- `package.json` build config updated to reference it

---

## Known Issues / Deferred
1. **Metronome drift**: Web Audio clock and JZZ player clock are independent; fix = derive beat timing from JZZ player's elapsed position (Stage 5)
2. **Chord detection edge cases**: some complex voicings still show unexpected names; needs more real-world testing
3. **Floating keyboard**: mode toggle exists but floating/draggable window not yet implemented
4. **Mouse click sound**: Grand Piano on ch14 works but timbre depends on jzz-synth-tiny quality (samples = end-stage feature)
5. **Win titlebar hover**: –/□/× OS hover backgrounds cannot be suppressed via Electron API without going fully frameless

---

## Files Changed This Session
| File | Change |
|---|---|
| `electron/main.ts` | titleBarStyle hidden, titleBarOverlay height 100, amber symbols |
| `electron/preload.ts` | window control IPC (unused with overlay approach) |
| `src/index.css` | Design token CSS vars, drag region classes, button focus reset |
| `src/App.tsx` | Removed amber separator line |
| `src/store/index.ts` | Default 73 keys, panel closed, auto-mute groups, showOnKeyboard |
| `src/hooks/useAudioEngine.ts` | Click channel fix, showOnKeyboard filter, program change |
| `src/hooks/useMetronome.ts` | Web Audio lookahead scheduler, BPM-reactive |
| `src/utils/chordDetection.ts` | Full rewrite: root/inversion logic, strip M, triad-first |
| `src/components/Transport/TopBar.tsx` | Full rewrite: layout, tokens, BPM/KEY arrows, bottom-aligned right section |
| `src/components/EmptyState.tsx` | O logo, fixed button |
| `src/components/Keyboard/Keyboard.tsx` | Smart chord display, lock+play+inversions, CHORDS label, info icon |
| `src/components/Keyboard/KeyboardControls.tsx` | Colour tokens, pin/float icons |
| `src/components/TrackPanel/TrackPanel.tsx` | Playlist icon, auto-open, M button, speaker group mute, colour tokens |
| `src/components/OrfeoLogo.tsx` | Wider viewBox (80px) |
| `src/components/MidiIcon.tsx` | JSX comments fixed (HTML → JSX syntax) |
| `public/icon.ico` | Real Orfeo O icon |
| `package.json` | electron-builder config, dist script, icon path |
