// No imports on purpose: the store builds its first key view from this file
// at startup, so it must not pull the store back in (midiParser does).
const isBlackKey = (m: number) => [1, 3, 6, 8, 10].includes(((m % 12) + 12) % 12)

export interface KeyLayout { x: number; width: number }

// ── RANGES ────────────────────────────────────────────────────────────────────
// Single source of truth — Keyboard.tsx imports from here so they can't drift.
// 25, 37 and 49 are the portable sizes (Settings › Keyboard › Portable
// keyboards), modelled on the standard studio controllers at their factory
// octave: 25 = C3–C5 (Akai MPK Mini, Launchkey Mini, MiniLab), 37 = C3–C6
// (Launchkey 37, KeyStep 37), 49 = C2–C6 (Keystation 49, Launchkey 49, KeyLab
// Essential 49). Every size sits inside the next, like real keyboards do.
export const PIANO_RANGES: Record<number, { min: number; max: number }> = {
  25: { min: 48, max: 72 },
  37: { min: 48, max: 84 },
  49: { min: 36, max: 84 },
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

export const STANDARD_SIZES = [61, 73, 88] as const
export const PORTABLE_SIZES = [25, 37, 49] as const
export const isPortableSize = (n: number) => n === 25 || n === 37 || n === 49

// ── Portable octave buttons ───────────────────────────────────────────────────
// A portable keyboard's range shifts a whole octave at a time, like the octave
// buttons on the real thing, and stays on the 88-key piano (A0–C8).
const PIANO_LOW = 21, PIANO_HIGH = 108

export function octaveLimits(size: number): { down: number; up: number } {
  const r = PIANO_RANGES[size]
  if (!r || !isPortableSize(size)) return { down: 0, up: 0 }
  return {
    down: -Math.floor((r.min - PIANO_LOW) / 12),
    up: Math.floor((PIANO_HIGH - r.max) / 12),
  }
}

export function clampOctave(size: number, octave: number): number {
  const { down, up } = octaveLimits(size)
  return Math.max(down, Math.min(up, Math.round(octave)))
}

// The keys a keyboard shows: its range, moved by its octave (portable only)
export function rangeOf(size: number, octave = 0): { min: number; max: number } {
  const r = PIANO_RANGES[size] ?? PIANO_RANGES[88]
  const o = clampOctave(size, octave) * 12
  return { min: r.min + o, max: r.max + o }
}

// ── Notes beyond a portable keyboard's edges ──────────────────────────────────
// Moved by whole octaves onto the nearest key with the same name, so the music
// still shows (drawn fainter: see Keyboard.tsx and PianoRoll.tsx).
export function foldIntoRange(midi: number, min: number, max: number): number {
  let m = midi
  while (m < min) m += 12
  while (m > max) m -= 12
  return m >= min ? m : midi
}

// ── Key positions ─────────────────────────────────────────────────────────────
// Every key's place is counted in white keys from the bottom of MIDI (note 0),
// so the keyboard and the piano roll can both look at any stretch of it — and
// glide from one keyboard size to another — through one "view": the white-key
// position its left edge sits at (v0) and how many white keys it spans (vw).
export interface KeyView { v0: number; vw: number }

// white keys below this note (note 0 counted from)
export function whitesBelow(midi: number): number {
  const oct = Math.floor(midi / 12)
  const pc = midi - oct * 12
  // whites below each pitch class inside one octave: C C# D D# E F F# G G# A A# B
  const WB = [0, 1, 1, 2, 2, 3, 4, 4, 5, 5, 6, 6]
  return oct * 7 + WB[pc]
}

export function viewOfRange(min: number, max: number): KeyView {
  const v0 = whitesBelow(min)
  return { v0, vw: whitesBelow(max + 1) - v0 }
}

// ── buildKeyLayoutView ────────────────────────────────────────────────────────
// THE canonical key-layout formula. Returns { x, width } as fractions of the
// container width for every key lo..hi (index = midi − lo), seen through `view`.
// Keys outside the view simply land below 0 or past 1 (clipped by the caller).
//
// Keyboard.tsx renders:
//   white keys → left = (whitesBelow − v0) / vw,       width = 1 / vw
//   black keys → left = (whitesBelow − 0.30 − v0) / vw, width = 0.60 / vw
// (a black key sits 0.70 of the way across the white key to its left)
//
// All consumers (Keyboard.tsx, PianoRoll.tsx, the Note Editor) run this same
// code. Never duplicate or hand-re-derive this formula elsewhere.
export function buildKeyLayoutView(view: KeyView, lo: number, hi: number): KeyLayout[] {
  const out = new Array<KeyLayout>(Math.max(0, hi - lo + 1))
  for (let m = lo; m <= hi; m++) {
    const wb = whitesBelow(m)
    out[m - lo] = isBlackKey(m)
      ? { x: (wb - 0.30 - view.v0) / view.vw, width: 0.60 / view.vw }
      : { x: (wb - view.v0) / view.vw, width: 1 / view.vw }
  }
  return out
}

// ── buildKeyLayoutRatios ──────────────────────────────────────────────────────
// One whole keyboard, edge to edge (the view is exactly its range).
export function buildKeyLayoutRatios(midiMin: number, midiMax: number): KeyLayout[] {
  return buildKeyLayoutView(viewOfRange(midiMin, midiMax), midiMin, midiMax)
}

// ── buildKeyLayout ────────────────────────────────────────────────────────────
// Pixel version: multiplies the ratios by the canvas width W.
export function buildKeyLayout(W: number, midiMin: number, midiMax: number): KeyLayout[] {
  return buildKeyLayoutRatios(midiMin, midiMax).map(k => ({ x: k.x * W, width: k.width * W }))
}

export function buildKeyLayoutViewPx(W: number, view: KeyView, lo: number, hi: number): KeyLayout[] {
  return buildKeyLayoutView(view, lo, hi).map(k => ({ x: k.x * W, width: k.width * W }))
}
