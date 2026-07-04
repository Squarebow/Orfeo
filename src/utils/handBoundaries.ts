import { isBlackKey } from './midiParser'
import type { ParsedMidi, KeyboardSize } from '../types'

// ── Keyboard MIDI note ranges per size — must match Keyboard.tsx ──────────────
const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

const KEYBOARD_GROUPS = new Set(['piano', 'chromatic', 'organ'])
// ≥15% notes in each register to qualify as a split-eligible single track
const SPLIT_THRESHOLD = 0.15
// ≥85% notes in one register to qualify a track as predominantly bass or treble
const DOMINANT_THRESHOLD = 0.85
// Performance mode: single note has no measurable gap; 2+ notes always go through the gap check
const PERF_MIN_NOTES = 2

export type HandBoundaries =
  | { type: 'single'; note: number }
  | { type: 'range'; start: number; end: number }

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

// ── Detect left/right hand boundary from the loaded MIDI file ─────────────────
//
// Two-track case: if any pair of keyboard tracks is ≥85% bass / ≥85% treble
//   relative to splitBreakpointNote, derive the boundary from their note ranges:
//   - touching (gap of 0)  → single line at the first treble note
//   - gap (>0 notes apart)  → range line pair bracketing the gap
//   - overlap               → range line pair bracketing the overlap zone
//
// Single-track case: if the dominant track has ≥15% notes in each register,
//   use the global split breakpoint settings directly.
export function detectHandBoundaries(
  midi: ParsedMidi | null,
  splitBreakpointType: 'single' | 'range',
  splitBreakpointNote: number,
  splitBreakpointRangeStart: number,
  splitBreakpointRangeEnd: number,
): HandBoundaries | null {
  if (!midi) return null

  const kbTracks = midi.tracks.filter(
    t => KEYBOARD_GROUPS.has(t.group) && !t.isDrum && t.notes.length > 0,
  )
  if (kbTracks.length === 0) return null

  const bpNote = splitBreakpointNote

  // ── Two-or-more-track case ────────────────────────────────────────────────
  if (kbTracks.length >= 2) {
    for (let i = 0; i < kbTracks.length; i++) {
      const a = kbTracks[i]
      const aBassRatio = a.notes.filter(n => n.midi < bpNote).length / a.notes.length
      if (aBassRatio < DOMINANT_THRESHOLD) continue

      for (let j = 0; j < kbTracks.length; j++) {
        if (j === i) continue
        const b = kbTracks[j]
        const bTrebleRatio = b.notes.filter(n => n.midi >= bpNote).length / b.notes.length
        if (bTrebleRatio < DOMINANT_THRESHOLD) continue

        const bassMax   = Math.max(...a.notes.map(n => n.midi))
        const trebleMin = Math.min(...b.notes.map(n => n.midi))

        if (trebleMin === bassMax + 1) {
          // touching — clean single boundary
          return { type: 'single', note: trebleMin }
        }
        if (trebleMin > bassMax + 1) {
          // gap between the two hands
          return { type: 'range', start: bassMax + 1, end: trebleMin }
        }
        // overlap — treble min is below or equal to bass max
        return { type: 'range', start: trebleMin, end: bassMax + 1 }
      }
    }
  }

  // ── Single-track (or no qualifying pair found) ────────────────────────────
  const track = kbTracks.reduce((best, t) =>
    t.notes.length > best.notes.length ? t : best,
  )
  const total      = track.notes.length
  const bassCount  = track.notes.filter(n => n.midi < bpNote).length
  const trebleCount = total - bassCount
  if (bassCount < total * SPLIT_THRESHOLD || trebleCount < total * SPLIT_THRESHOLD) return null

  return splitBreakpointType === 'single'
    ? { type: 'single', note: splitBreakpointNote }
    : { type: 'range', start: splitBreakpointRangeStart, end: splitBreakpointRangeEnd }
}

// ── Shared boundary detection for Performance mode (file curve + live input) ─────
// Takes a SORTED, deduplicated pitch array and the current sensitivity threshold.
// Returns the MIDI note at the midpoint of the largest pitch gap when two-hand
// texture is plausible; returns null when notes are too few or the gap is below
// the threshold. minGapSt is read fresh from the store on every call — not cached.
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

// ── Slide a 2-second lookback window across the piece to produce a boundary curve ─
// Sampled every STEP_SEC, each sample finds the largest pitch gap among all
// notes from keyboard tracks that started within the window, and returns the
// midpoint of that gap as the boundary. Used by Performance mode for smooth
// real-time hand-split tracking during MIDI file playback.
const CURVE_WINDOW_SEC = 2.0
const CURVE_STEP_SEC   = 0.25

export function computeHandBoundaryCurve(
  midi: ParsedMidi,
  minGapSt: number,
): { time: number; boundary: number | null }[] {
  const kbTracks = midi.tracks.filter(
    t => KEYBOARD_GROUPS.has(t.group) && !t.isDrum && t.notes.length > 0,
  )
  if (kbTracks.length === 0) return []

  // ── Flatten all keyboard notes sorted by start time ───────────────────────
  const allNotes = kbTracks
    .flatMap(t => t.notes.map(n => ({ time: n.time, midi: n.midi })))
    .sort((a, b) => a.time - b.time)

  if (allNotes.length === 0) return []

  const duration = midi.duration
  const curve: { time: number; boundary: number | null }[] = []

  for (let t = 0; t <= duration + CURVE_STEP_SEC; t += CURVE_STEP_SEC) {
    const windowStart = t - CURVE_WINDOW_SEC
    const pitches = [...new Set(
      allNotes
        .filter(n => n.time >= windowStart && n.time <= t)
        .map(n => n.midi),
    )].sort((a, b) => a - b)

    // ── Each sample is self-contained — null when texture is too thin or tight ─
    curve.push({ time: t, boundary: detectPerformanceBoundary(pitches, minGapSt) })
  }

  return curve
}

// ── Linear interpolation lookup into a boundary curve ────────────────────────
// Binary-searches for the surrounding segment and interpolates.
// Returns null when the curve is empty, the queried point is null, or either
// neighbor is null — no phantom line should appear across a null-boundary gap.
export function interpolateCurve(
  curve: { time: number; boundary: number | null }[],
  t: number,
): number | null {
  if (curve.length === 0) return null
  if (t <= curve[0].time) return curve[0].boundary
  if (t >= curve[curve.length - 1].time) return curve[curve.length - 1].boundary
  let lo = 0, hi = curve.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (curve[mid].time <= t) lo = mid
    else hi = mid
  }
  const a = curve[lo]
  const b = curve[hi]
  // ── Do not interpolate across a null boundary — would produce a phantom line ─
  if (a.boundary === null || b.boundary === null) return null
  const frac = (t - a.time) / (b.time - a.time)
  return Math.round(a.boundary + frac * (b.boundary - a.boundary))
}

// ── Mean pitch of notes strictly below / at-or-above a boundary ──────────────
function computeClusterCenters(
  pitches: number[],
  boundary: number,
): { leftCenter: number; rightCenter: number } | null {
  const left  = pitches.filter(p => p < boundary)
  const right = pitches.filter(p => p >= boundary)
  if (left.length === 0 || right.length === 0) return null
  const leftCenter  = left.reduce((s, p) => s + p, 0) / left.length
  const rightCenter = right.reduce((s, p) => s + p, 0) / right.length
  return { leftCenter, rightCenter }
}

// ── Slide the same lookback window as the boundary curve to pre-compute ───────
// cluster centers at each sample point. Each entry stores the mean MIDI pitch
// of notes below (left) and at/above (right) the detected boundary, or null
// when no clear two-hand split exists. Used by Performance mode to anchor hand
// labels at the register center of each hand rather than the split midpoint.
export function computeClusterCenterCurve(
  midi: ParsedMidi,
  minGapSt: number,
): { time: number; leftCenter: number | null; rightCenter: number | null }[] {
  const kbTracks = midi.tracks.filter(
    t => KEYBOARD_GROUPS.has(t.group) && !t.isDrum && t.notes.length > 0,
  )
  if (kbTracks.length === 0) return []

  const allNotes = kbTracks
    .flatMap(t => t.notes.map(n => ({ time: n.time, midi: n.midi })))
    .sort((a, b) => a.time - b.time)

  if (allNotes.length === 0) return []

  const duration = midi.duration
  const curve: { time: number; leftCenter: number | null; rightCenter: number | null }[] = []

  for (let t = 0; t <= duration + CURVE_STEP_SEC; t += CURVE_STEP_SEC) {
    const windowStart = t - CURVE_WINDOW_SEC
    const pitches = [...new Set(
      allNotes
        .filter(n => n.time >= windowStart && n.time <= t)
        .map(n => n.midi),
    )].sort((a, b) => a - b)

    const boundary = detectPerformanceBoundary(pitches, minGapSt)
    if (boundary === null) {
      curve.push({ time: t, leftCenter: null, rightCenter: null })
    } else {
      const centers = computeClusterCenters(pitches, boundary)
      curve.push({
        time: t,
        leftCenter:  centers?.leftCenter  ?? null,
        rightCenter: centers?.rightCenter ?? null,
      })
    }
  }

  return curve
}

// ── Binary-search for nearest past cluster center in the precomputed curve ────
// Returns the most recent sample at or before t; falls back to the first sample
// when t is before the curve start. Returns null centers when the curve is empty.
export function lookupClusterAtTime(
  curve: { time: number; leftCenter: number | null; rightCenter: number | null }[],
  t: number,
): { leftCenter: number | null; rightCenter: number | null } {
  if (curve.length === 0) return { leftCenter: null, rightCenter: null }
  if (t <= curve[0].time) return { leftCenter: curve[0].leftCenter, rightCenter: curve[0].rightCenter }
  if (t >= curve[curve.length - 1].time) {
    const last = curve[curve.length - 1]
    return { leftCenter: last.leftCenter, rightCenter: last.rightCenter }
  }
  let lo = 0, hi = curve.length - 1
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1
    if (curve[mid].time <= t) lo = mid
    else hi = mid
  }
  return { leftCenter: curve[lo].leftCenter, rightCenter: curve[lo].rightCenter }
}
