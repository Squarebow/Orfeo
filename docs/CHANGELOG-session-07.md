# Orfeo — Session 07 Changelog
> Date: June 2026 | Version: v0.3.2 | Branch: dev

---

## Overview
Session 07 tackled three of the four long-standing deferred issues: chord display during playback, the floating keyboard (now actually draggable), and metronome alignment to playback position. SF2 engine remains deferred (audio quality must not change until everything else works).

---

## Features & Fixes

### 1. Chord Display During Playback ✅
**File:** `src/components/Keyboard/Keyboard.tsx`

**Problem:** Chord bar only showed chords from manual key clicks (Shift+click). During MIDI playback, `activeKeys` was being updated correctly by `lightKey()` but the chord detection was too slow/held too long to be useful during playback.

**Fix:**
- During playback (`playbackState === 'playing'`), debounce reduced from 320ms → 60ms so chords appear nearly instantly as note clusters form.
- During playback, no hold-timeout is set — chord clears immediately when the active key set drops below 3 notes, rather than lingering 1600ms into the next chord.
- During playback, `setDisplayedChord(null)` fires immediately when key count drops below threshold (no ghost chord hanging over the next chord).
- `accidentals` added to the effect dependency array (was missing — caused stale display when accidentals setting changed mid-playback).
- Manual (non-playback) behaviour unchanged: 320ms debounce, 1600ms hold.

### 2. Floating Keyboard — Actual Draggable Panel ✅
**Files:** `src/components/Keyboard/FloatingKeyboard.tsx` (new), `src/App.tsx`

**Problem:** The Float button toggled `keyboardMode` in the store but the keyboard just disappeared from the docked position — no floating panel existed.

**Fix:** Created `FloatingKeyboard.tsx` — a `position: fixed` overlay panel containing the full `<Keyboard />` and `<KeyboardControls />`:

- **Drag handle** at top with grip dots — click-and-drag to reposition anywhere on screen.
- **Pin button** (dock icon) and **× button** both re-dock the keyboard by calling `setKeyboardMode('docked')`.
- Boundary clamping prevents the panel from being dragged off-screen.
- Default spawn position: lower-left of window, computed on first render from panel height.
- `data-no-drag` attribute prevents keyboard key clicks from initiating a drag.
- Panel styled with dark border, amber glow border, shadow — matches Orfeo aesthetic.

`App.tsx` updated:
- Reads `keyboardMode` from store.
- Renders `<Keyboard />` and `<KeyboardControls />` only when `keyboardMode === 'docked'`.
- Renders `<FloatingKeyboard />` as a sibling at the root level (not inside the scrollable layout column) when `keyboardMode === 'floating'`.

### 3. Metronome Beat Alignment ✅
**File:** `src/hooks/useMetronome.ts`

**Problem:** Metronome started from `audioCtx.currentTime + 0.08` regardless of playback position. If you started playback mid-file (e.g. at bar 32), the metronome would click from beat 1 of its own internal count, out of phase with the actual music.

**Fix:** On `startMetronome()`, the current playback position (`state.currentTime` in seconds) is used to compute which beat we're on:
```
elapsedBeats = currentTime / secondsPerBeat
beatCountRef = floor(elapsedBeats)          // which beat number we're on
fracBeat = elapsedBeats - beatCountRef      // how far into that beat
timeUntilNextBeat = (1 - fracBeat) * spb   // wait this long before first click
```
The first click fires at the next grid-aligned beat position, not at an arbitrary offset. Downbeat accent (beat 1 of bar) stays correct because `beatCountRef` tracks absolute beat number from position 0.

### 4. Keyboard Size Button Tooltips ✅
**File:** `src/components/Keyboard/KeyboardControls.tsx`

Added `title` attributes to the 61/73/88 size selector buttons: `"61-key keyboard layout"` etc.

---

## Files Changed

| File | Change |
|---|---|
| `src/App.tsx` | Added `FloatingKeyboard` import + conditional render logic |
| `src/components/Keyboard/FloatingKeyboard.tsx` | **New file** — draggable floating panel |
| `src/components/Keyboard/Keyboard.tsx` | Chord detection during playback — debounce/hold logic |
| `src/components/Keyboard/KeyboardControls.tsx` | Size button tooltips |
| `src/hooks/useMetronome.ts` | Beat alignment to playback position |

---

## Known Issues Carried into Stage 8

| # | Issue | Notes |
|---|---|------|
| 1 | SF2 samples engine | soundfont-player unsuitable; proper SF2 deferred — audio quality must not change |
| 2 | Editor window icon | Orfeo O mark SVG in editor title bar needs refinement |
| 3 | Responsive resize | Piano roll and keyboard don't fully respond to window resize |
| 4 | Chord display quality | May need further tuning for dense polyphonic MIDI (e.g. orchestral) |

---

## Install Instructions

Extract zip. Drop all files into your project preserving folder paths:

```
src/App.tsx
src/components/Keyboard/FloatingKeyboard.tsx   ← NEW FILE
src/components/Keyboard/Keyboard.tsx
src/components/Keyboard/KeyboardControls.tsx
src/hooks/useMetronome.ts
```

Then `npm run dev` to test.

---

## Git Push

```bash
git add .
git commit -m "v0.3.2 — Session 07: floating keyboard, chord display during playback, metronome alignment"
git push origin dev
```
