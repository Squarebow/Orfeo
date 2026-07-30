import { isBlackKey } from './midiParser'

export interface KeyLayout { x: number; width: number }

// ── RANGES ────────────────────────────────────────────────────────────────────
// Single source of truth — Keyboard.tsx imports from here so they can't drift.
export const PIANO_RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

// ── buildKeyLayoutRatios ──────────────────────────────────────────────────────
// THE canonical key-layout formula — extracted verbatim from Keyboard.tsx.
// Returns { x, width } as fractions of total container width (0–1 range).
//
// Keyboard.tsx renders:
//   white keys  → flex-1 children, each exactly 1/n of the container width
//   black keys  → position: absolute
//                 left  = ((whiteIdx + 0.70) / n) * 100%   (whiteIdx = whites before this key)
//                 width = (0.60 / n) * 100%
//
// This function encodes that same arithmetic in one place so all three consumers
// (Keyboard.tsx, PianoRoll.tsx, NoteEditorCanvas.tsx) run identical code.
// Never duplicate or hand-re-derive this formula elsewhere.
export function buildKeyLayoutRatios(midiMin: number, midiMax: number): KeyLayout[] {
  const whites: number[] = []
  for (let m = midiMin; m <= midiMax; m++) if (!isBlackKey(m)) whites.push(m)
  const n   = whites.length
  const len = midiMax - midiMin + 1
  const out = new Array<KeyLayout>(len)
  let wi = 0
  for (let m = midiMin; m <= midiMax; m++) {
    const i = m - midiMin
    if (!isBlackKey(m)) {
      // White key: same as flex-1 → index wi occupies [wi/n, (wi+1)/n]
      out[i] = { x: wi / n, width: 1 / n }
      wi++
    } else {
      // Black key: mirrors Keyboard.tsx's formula exactly.
      // whiteIdx (Keyboard.tsx) = wi - 1 at this point in the loop.
      // left  = (whiteIdx + 0.70) / n  =  (wi - 1 + 0.70) / n  =  (wi - 0.30) / n
      // width = 0.60 / n
      out[i] = { x: (wi - 0.30) / n, width: 0.60 / n }
    }
  }
  return out
}

// ── buildKeyLayout ────────────────────────────────────────────────────────────
// Pixel version: multiplies buildKeyLayoutRatios output by the canvas width W.
// PianoRoll.tsx and NoteEditorCanvas.tsx call this; Keyboard.tsx calls
// buildKeyLayoutRatios directly and multiplies by 100 for CSS percentages.
export function buildKeyLayout(W: number, midiMin: number, midiMax: number): KeyLayout[] {
  return buildKeyLayoutRatios(midiMin, midiMax).map(k => ({ x: k.x * W, width: k.width * W }))
}
