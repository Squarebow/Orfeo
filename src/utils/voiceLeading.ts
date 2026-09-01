// ── voiceLeading ─────────────────────────────────────────────────────────────
// Shared progression-audition engine for the Chord Explorer and the Scale
// Explorer. Both used to voice each chord independently in a fixed octave
// (root leaps, octave resets, a mislabeled hidden "closest average pitch"
// pass) — this replaces all of that with one function both call.
//
// A "voicing" here is just an ascending MIDI-note array. `nextVoicing` takes
// the voicing that just played and returns the next chord's voicing under one
// of three strategies:
//
//   roots     every chord in root position, each one placed at or above the
//             previous root (wraps down an octave only when it hits the
//             ceiling) — the plain reference reading.
//   climbing  first chord low, then the inversion whose bottom note sits just
//             above the previous bottom — always steps upward, never snaps
//             back to the octave. What a player actually does running the
//             chords of a scale.
//   smooth    the candidate that moves the fewest notes the shortest total
//             distance from the previous voicing — stays under one hand.
//
// Pitch-class-agnostic: a chord is a root pitch class + a set of semitone
// offsets, so triads, 7ths, 9ths and genre re-voicings all go through the
// same path.

import { Interval } from 'tonal'

export type ProgressionVoicing = 'roots' | 'climbing' | 'smooth'

export const PROGRESSION_VOICINGS: ProgressionVoicing[] = ['roots', 'climbing', 'smooth']

export const PROGRESSION_VOICING_LABEL: Record<ProgressionVoicing, string> = {
  roots:    'Roots',
  climbing: 'Climbing',
  smooth:   'Smooth',
}

export const PROGRESSION_VOICING_HINT: Record<ProgressionVoicing, string> = {
  roots:    'Every chord in root position, each one higher than the last',
  climbing: 'First chord low, then inversions stepping upward — never resets to the octave',
  smooth:   'Nearest voicing each step — the fewest notes move, staying under one hand',
}

export interface VoicingRange { min: number; max: number }

// Default low anchor for the first chord of a run — C3.
const DEFAULT_LOW_ROOT = 48

// ── tonal interval strings → semitone offsets from the root ──────────────────
export function intervalsToSemis(intervals: string[]): number[] {
  const s = intervals
    .map(iv => Interval.semitones(iv))
    .filter((n): n is number => n !== null && Number.isFinite(n))
  return Array.from(new Set(s)).sort((a, b) => a - b)
}

// ── MIDI-note voicing → (rootPc, semitone offsets) ──────────────────────────
// For callers that already hold real MIDI notes (Scale Explorer's diatonic
// triads). Offsets are taken from the lowest note; rootPc is passed in
// separately because the lowest note isn't necessarily the root.
export function semisFromMidi(midiNotes: number[]): number[] {
  if (midiNotes.length === 0) return []
  const sorted = [...midiNotes].sort((a, b) => a - b)
  const base = sorted[0]
  return sorted.map(m => m - base)
}

const lowestNote  = (v: number[]) => v[0]
const highestNote = (v: number[]) => v[v.length - 1]
const avgPitch    = (v: number[]) => v.reduce((s, n) => s + n, 0) / v.length
const norm12      = (n: number) => ((n % 12) + 12) % 12

// ── Root-position stack of a chord rooted at a given MIDI note ───────────────
function stack(rootMidi: number, semis: number[]): number[] {
  return semis.map(s => rootMidi + s)
}

// ── Rotate the n lowest notes up an octave (n-th inversion) ─────────────────
function invert(base: number[], n: number): number[] {
  let v = [...base].sort((a, b) => a - b)
  for (let i = 0; i < n; i++) {
    const [lo, ...rest] = v
    v = [...rest, lo + 12]
  }
  return v
}

// ── Every root-position + inversion placement that fits the range ───────────
function candidates(rootPc: number, semis: number[], range: VoicingRange): number[][] {
  const pc = norm12(rootPc)
  const out: number[][] = []
  const seen = new Set<string>()
  for (let oct = 0; oct <= 8; oct++) {
    const rootMidi = pc + (oct + 1) * 12
    if (rootMidi < range.min - 12 || rootMidi > range.max) continue
    const base = stack(rootMidi, semis)
    for (let inv = 0; inv < semis.length; inv++) {
      const v = invert(base, inv)
      if (v[0] < range.min || v[v.length - 1] > range.max) continue
      const key = v.join(',')
      if (seen.has(key)) continue
      seen.add(key)
      out.push(v)
    }
  }
  return out
}

// ── Root-position voicing whose bottom note is nearest a target MIDI value ──
function rootPositionNear(rootPc: number, semis: number[], range: VoicingRange, target: number): number[] {
  const pc = norm12(rootPc)
  let best: number[] | null = null
  let bestDist = Infinity
  for (let oct = 0; oct <= 8; oct++) {
    const v = stack(pc + (oct + 1) * 12, semis)
    if (v[0] < range.min || v[v.length - 1] > range.max) continue
    const d = Math.abs(v[0] - target)
    if (d < bestDist) { bestDist = d; best = v }
  }
  return best ?? stack(pc + 48, semis)
}

// ── Summed nearest-voice movement between two voicings (greedy match) ───────
function motion(a: number[], b: number[]): number {
  if (a.length === 0) return 0
  const pool = [...b]
  let total = 0
  for (const n of a) {
    let bi = -1
    let bd = Infinity
    for (let i = 0; i < pool.length; i++) {
      const d = Math.abs(pool[i] - n)
      if (d < bd) { bd = d; bi = i }
    }
    if (bi >= 0) { total += bd; pool.splice(bi, 1) }
  }
  // any unmatched notes in b: charge their distance from a's centre
  const centre = avgPitch(a)
  for (const n of pool) total += Math.abs(n - centre)
  return total
}

// ── Count shared pitch classes ─────────────────────────────────────────────
function commonTones(a: number[], b: number[]): number {
  const pcs = new Set(a.map(norm12))
  return b.filter(n => pcs.has(norm12(n))).length
}

// ── The next chord's voicing, given what just played ────────────────────────
export function nextVoicing(
  prev: number[] | null,
  rootPc: number,
  semis: number[],
  strategy: ProgressionVoicing,
  range: VoicingRange,
  lowRoot: number = DEFAULT_LOW_ROOT,
): number[] {
  if (semis.length === 0) return []
  const pc = norm12(rootPc)

  // First chord of the run: root position, low.
  if (prev === null || prev.length === 0) {
    return rootPositionNear(pc, semis, range, lowRoot)
  }

  const prevLow = lowestNote(prev)

  if (strategy === 'roots') {
    // First root-position placement at or above the previous bottom note;
    // if none fits under the ceiling, wrap back down near the low anchor.
    for (let oct = 0; oct <= 8; oct++) {
      const v = stack(pc + (oct + 1) * 12, semis)
      if (v[0] < range.min || v[v.length - 1] > range.max) continue
      if (v[0] >= prevLow - 1) return v
    }
    return rootPositionNear(pc, semis, range, lowRoot)
  }

  const cands = candidates(pc, semis, range)
  if (cands.length === 0) return rootPositionNear(pc, semis, range, avgPitch(prev))

  if (strategy === 'climbing') {
    // Each chord should sit a little ABOVE the last — a gentle staircase, not
    // a flat line and never a step down. Target roughly a third per chord;
    // common tones and small inner motion are only tie-breakers.
    const TARGET_STEP = 3
    const ascending = cands.filter(v => lowestNote(v) >= prevLow)
    const pool = ascending.length > 0 ? ascending : cands // out of headroom → allow a drop
    let best = pool[0]
    let bestScore = Infinity
    for (const v of pool) {
      const jump = lowestNote(v) - prevLow
      const stepCost = jump < 0 ? 60 - jump * 5 : Math.abs(jump - TARGET_STEP)
      const score = stepCost * 2 + motion(prev, v) * 0.15 - commonTones(prev, v) * 0.4
      if (score < bestScore) { bestScore = score; best = v }
    }
    return best
  }

  // smooth — least total movement, hold common tones, don't drift register
  let best = cands[0]
  let bestScore = Infinity
  const prevAvg = avgPitch(prev)
  for (const v of cands) {
    const drift = Math.abs(avgPitch(v) - prevAvg)
    const score = motion(prev, v) - commonTones(prev, v) * 1.2 + (drift > 9 ? (drift - 9) * 2 : 0)
    if (score < bestScore) { bestScore = score; best = v }
  }
  return best
}

// ── Fold nextVoicing over a whole progression (for callers that schedule the
// run up front rather than recursively). ────────────────────────────────────
export function voiceProgression(
  chords: { rootPc: number; semis: number[] }[],
  strategy: ProgressionVoicing,
  range: VoicingRange,
  lowRoot: number = DEFAULT_LOW_ROOT,
): number[][] {
  const out: number[][] = []
  let prev: number[] | null = null
  for (const c of chords) {
    const v = nextVoicing(prev, c.rootPc, c.semis, strategy, range, lowRoot)
    out.push(v)
    prev = v
  }
  return out
}

// ── Humanise a block chord: bottom-up roll offsets (ms) + per-note velocity ─
// Keeps the audition from sounding like a dead stab. `baseVel` is 0..1.
export function humanizeChord(
  voicing: number[],
  baseVel: number = 0.72,
): { midi: number; delayMs: number; vel: number }[] {
  const sorted = [...voicing].sort((a, b) => a - b)
  return sorted.map((midi, i) => ({
    midi,
    delayMs: i * (14 + Math.random() * 8),           // ~14–22 ms per note, low → high
    vel: Math.min(1, Math.max(0.4,
      baseVel + (i === 0 ? 0.06 : 0) + (Math.random() - 0.5) * 0.09)),
  }))
}
