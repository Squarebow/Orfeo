// ── Shared default-position anchors for floating modals/panels ─────────────
// Every modal used to center itself against the whole window
// (window.innerWidth/innerHeight), independent of the other components in
// the layout. That meant a modal opened dead center of the screen even
// when one side drawer was open and the piano roll was visibly off-center.
//
// These read the DOM once (at modal-open time, via a lazy useState
// initializer in each caller) rather than being tracked live — opening or
// closing a side panel after a modal is already open must NOT move it,
// per the positioning spec. `data-piano-roll-area` and `data-keyboard-header`
// are plain marker attributes on persistent wrapper elements (App.tsx /
// Keyboard.tsx), not React refs, since callers here are unrelated siblings
// in the component tree.

// Matches PianoRoll.tsx's own PLAYHEAD_RATIO — kept in sync manually since
// pulling it from PianoRoll would import a component module for one constant.
const PLAYHEAD_RATIO = 0.80

export function getPianoRollAreaRect(): DOMRect | null {
  return document.querySelector('[data-piano-roll-area]')?.getBoundingClientRect() ?? null
}

// Top of the docked keyboard's chord/scale header bar — the modal-alignment
// anchor for ChordExplorer/ScaleExplorer/MixerConsole/MidiEditor/
// LockedChordModal. Falls back to the piano-roll area's bottom edge when the
// keyboard is undocked (floating) or not yet mounted, since that's where the
// header would sit if it were docked.
export function getKeyboardHeaderTop(): number {
  const header = document.querySelector('[data-keyboard-header]')?.getBoundingClientRect()
  if (header) return header.top
  const roll = getPianoRollAreaRect()
  return roll ? roll.bottom : window.innerHeight
}

// Fixed playbar-line Y within the piano roll area — always the same ratio
// regardless of whether the playbar is actually visible right now, per the
// FloatingKeyboard spec ("visible or invisible, it doesn't move").
export function getPlaybarY(): number {
  const roll = getPianoRollAreaRect()
  if (!roll) return window.innerHeight * PLAYHEAD_RATIO
  return roll.top + roll.height * PLAYHEAD_RATIO
}

// Vertical center of the piano roll area (falls back to window center).
export function getPianoRollCenterY(): number {
  const roll = getPianoRollAreaRect()
  if (!roll) return window.innerHeight / 2
  return roll.top + roll.height / 2
}

// Horizontal center of the piano roll area (falls back to window center) —
// used by modals that center themselves within the roll rather than the
// whole window.
export function getPianoRollCenterX(): number {
  const roll = getPianoRollAreaRect()
  if (!roll) return window.innerWidth / 2
  return roll.left + roll.width / 2
}
