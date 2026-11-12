import type { KeyboardSize, NoteNaming, Accidentals } from '../types'
import { PIANO_RANGES } from './keyLayout'
import { getNoteLabel } from './noteNames'

// ── A USB keyboard's own range of keys ──────────────────────────────────────
// MIDI never says how many keys a keyboard has, so Orfeo asks once: press the
// lowest key, then the highest (components/KeyboardRangePrompt.tsx). The
// range is kept per keyboard (store/midiSettings.ts keyRanges) and the
// on-screen keyboard picks the smallest of its sizes that holds it.
// Outside practice mode only: practice mode keeps 88 keys.

export interface KeyRange { low: number; high: number }

export const keyCount = (r: KeyRange) => r.high - r.low + 1

export function isKeyRange(v: unknown): v is KeyRange {
  if (!v || typeof v !== 'object') return false
  const { low, high } = v as KeyRange
  return Number.isInteger(low) && Number.isInteger(high) && low >= 0 && high <= 127 && low < high
}

const SIZES: KeyboardSize[] = [61, 73, 88]

// The smallest on-screen keyboard that shows every key of this one (a 61-key
// keyboard with its octave buttons pressed, for example, may need 73 or 88)
export function fitKeyboardSize(r: KeyRange): KeyboardSize {
  return SIZES.find(n => PIANO_RANGES[n].min <= r.low && PIANO_RANGES[n].max >= r.high) ?? 88
}

// "C2–C7" in the player's note names (letters when names are switched off)
export function rangeLabel(r: KeyRange, naming: NoteNaming, acc: Accidentals): string {
  const n = naming === 'hidden' ? 'english' : naming
  return `${getNoteLabel(r.low, n, acc)}–${getNoteLabel(r.high, n, acc)}`
}

// ── The two presses ──────────────────────────────────────────────────────────
// First press = lowest, second = highest. Pressed the other way round, the two
// are simply swapped; the same key twice waits for a different one.
export type RangeStep =
  | { step: 'low' }
  | { step: 'high'; low: number }
  | { step: 'done'; range: KeyRange }

export function pressKey(s: RangeStep, note: number): RangeStep {
  if (s.step === 'low') return { step: 'high', low: note }
  if (s.step === 'high') {
    if (note === s.low) return s
    return { step: 'done', range: { low: Math.min(s.low, note), high: Math.max(s.low, note) } }
  }
  return s
}
