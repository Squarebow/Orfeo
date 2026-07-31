import { isBlackKey } from './midiParser'
import type { ParsedMidi, KeyboardSize, Hand } from '../types'
import { KEYBOARD_GROUPS } from './keyboardGroups'

// ── Keyboard MIDI note ranges per size — must match Keyboard.tsx ──────────────
const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}
// Performance mode hardware fallback: single note has no measurable gap.
const PERF_MIN_NOTES = 2

// ── Returns only the white keys visible for a given keyboard size ─────────────
export function getWhiteKeys(keyboardSize: KeyboardSize): { midi: number }[] {
  const { min, max } = RANGES[keyboardSize]
  const result: { midi: number }[] = []
  for (let m = min; m <= max; m++) {
    if (!isBlackKey(m)) result.push({ midi: m })
  }
  return result
}

// ── Converts a MIDI note to a left-edge percentage on the keyboard ────────────
// White key: aligns to its left edge.
// Black key: aligns to its left edge (centre − half-width, using the same
// geometry constants as Keyboard.tsx black-key rendering).
export function noteToLeftPct(noteNum: number, whiteKeys: { midi: number }[]): number {
  if (!isBlackKey(noteNum)) {
    const idx = whiteKeys.findIndex(w => w.midi === noteNum)
    if (idx < 0) return 0
    return (idx / whiteKeys.length) * 100
  }
  // Black key: find the white key immediately to its left
  const aboveIdx = whiteKeys.findIndex(w => w.midi > noteNum)
  const lowerWhiteIdx = aboveIdx < 0 ? whiteKeys.length - 1 : aboveIdx - 1
  if (lowerWhiteIdx < 0) return 0
  // 0.70 is the black-key centre offset; 0.30 is half the 0.6-wide black key
  return ((lowerWhiteIdx + 0.40) / whiteKeys.length) * 100
}

// ── Practice mode: moving boundary from real hand tags ────────────────────────
// A single whole-file average collapses into one static, mostly-useless line
// (a piece that's 80% RH melody and 20% real two-hand passages still shows a
// line sitting wherever the average landed, moving for nothing). Instead,
// slide a lookback window across the piece and average whichever L/R tags
// fall inside it at each sample point — same windowed-curve shape as the old
// live pitch-gap version, except every sample now comes from the engine's
// real per-note tags instead of a guess, and moves with the actual texture.
const CURVE_WINDOW_SEC = 3.0
const CURVE_STEP_SEC = 0.25

export interface TaggedBoundarySample { time: number; boundary: number | null }

export function computeTaggedBoundaryCurve(midi: ParsedMidi | null): TaggedBoundarySample[] {
  if (!midi) return []
  const kbTracks = midi.tracks.filter(t => KEYBOARD_GROUPS.has(t.group) && !t.isDrum && t.notes.length > 0)
  if (kbTracks.length === 0) return []

  const allNotes = kbTracks
    .flatMap(t => t.notes)
    .filter(n => n.hand !== undefined)
    .sort((a, b) => a.time - b.time)
  if (allNotes.length === 0) return []

  const duration = midi.duration
  const curve: TaggedBoundarySample[] = []
  let windowStartIdx = 0

  for (let t = 0; t <= duration + CURVE_STEP_SEC; t += CURVE_STEP_SEC) {
    const windowStart = t - CURVE_WINDOW_SEC
    while (windowStartIdx < allNotes.length && allNotes[windowStartIdx].time < windowStart) windowStartIdx++

    let lSum = 0, lCount = 0, rSum = 0, rCount = 0
    for (let i = windowStartIdx; i < allNotes.length && allNotes[i].time <= t; i++) {
      const n = allNotes[i]
      if (n.hand === 'L') { lSum += n.midi; lCount++ }
      else if (n.hand === 'R') { rSum += n.midi; rCount++ }
    }
    curve.push({
      time: t,
      boundary: (lCount === 0 || rCount === 0) ? null : Math.round((lSum / lCount + rSum / rCount) / 2),
    })
  }
  return curve
}

// ── Linear interpolation lookup into a tagged boundary curve ─────────────────
// Binary-searches for the surrounding segment and interpolates. Never
// interpolates across a null sample — that would draw a phantom line across
// a stretch with no two-hand texture at all.
export function interpolateTaggedCurve(curve: TaggedBoundarySample[], t: number): number | null {
  if (curve.length === 0) return null
  if (t <= curve[0].time) return curve[0].boundary
  if (t >= curve[curve.length - 1].time) return curve[curve.length - 1].boundary
  let lo = 0, hi = curve.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (curve[mid].time <= t) lo = mid
    else hi = mid
  }
  const a = curve[lo], b = curve[hi]
  if (a.boundary === null || b.boundary === null) return null
  const frac = (t - a.time) / (b.time - a.time)
  return Math.round(a.boundary + frac * (b.boundary - a.boundary))
}

// ── Performance mode, per-note path: index every keyboard-track note by pitch,
// sorted by onset, so a currently-active pitch's hand tag can be resolved with
// a binary search instead of a per-frame file scan. ──────────────────────────
export interface PitchHandEntry { time: number; duration: number; hand?: Hand }
export type PitchHandIndex = Map<number, PitchHandEntry[]>

export function buildPitchHandIndex(midi: ParsedMidi): PitchHandIndex {
  const index: PitchHandIndex = new Map()
  for (const t of midi.tracks) {
    if (!KEYBOARD_GROUPS.has(t.group) || t.isDrum) continue
    for (const n of t.notes) {
      const arr = index.get(n.midi)
      const entry = { time: n.time, duration: n.duration, hand: n.hand }
      if (arr) arr.push(entry)
      else index.set(n.midi, [entry])
    }
  }
  for (const arr of index.values()) arr.sort((a, b) => a.time - b.time)
  return index
}

// Small tolerance past a note's nominal end — note-off scheduling/decay can
// lag the raw duration slightly; without this a query at the very end of a
// note's window can miss it and wrongly fall through to "no tag".
const NOTE_WINDOW_SLACK_SEC = 0.05

// ── Resolve which hand the currently-sounding instance of `pitch` belongs to,
// by finding the most recent note at that pitch whose [time, time+duration]
// window contains currentTime. Returns null when no file note backs this
// pitch right now (e.g. a hardware key with no corresponding file note) —
// the caller falls back to live inference only in that case. ────────────────
export function lookupNoteHandAtTime(
  index: PitchHandIndex,
  pitch: number,
  currentTime: number,
): Hand | null {
  const arr = index.get(pitch)
  if (!arr || arr.length === 0) return null
  let lo = 0, hi = arr.length - 1, idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid].time <= currentTime) { idx = mid; lo = mid + 1 }
    else hi = mid - 1
  }
  if (idx === -1) return null
  const entry = arr[idx]
  if (currentTime > entry.time + entry.duration + NOTE_WINDOW_SLACK_SEC) return null
  return entry.hand ?? null
}

// ── Performance mode, hardware-input fallback ─────────────────────────────────
// A hardware MIDI keyboard key press has no backing file note, so there is no
// tag to read — this is the one place live pitch-gap inference is still
// legitimate (there's nothing to look up). Takes a SORTED, deduplicated pitch
// array of currently-held hardware keys and the sensitivity setting; returns
// the note at the midpoint of the largest gap, or null below the threshold.
export function detectPerformanceBoundary(pitches: number[], minGapSt: number): number | null {
  if (pitches.length < PERF_MIN_NOTES) return null
  let maxGap = 0
  let splitIdx = 1
  for (let i = 1; i < pitches.length; i++) {
    const gap = pitches[i] - pitches[i - 1]
    if (gap > maxGap) { maxGap = gap; splitIdx = i }
  }
  if (maxGap < minGapSt) return null
  return Math.round((pitches[splitIdx - 1] + pitches[splitIdx]) / 2)
}
