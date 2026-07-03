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
