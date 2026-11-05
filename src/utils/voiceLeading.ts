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
import { t } from './i18n'

export type ProgressionVoicing = 'roots' | 'climbing' | 'smooth'

export const PROGRESSION_VOICINGS: ProgressionVoicing[] = ['roots', 'climbing', 'smooth']

export const PROGRESSION_VOICING_LABEL: Record<ProgressionVoicing, string> = {
  roots:    'Roots',
  climbing: 'Climbing',
  smooth:   'Smooth',
}

export const PROGRESSION_VOICING_HINT: Record<ProgressionVoicing, string> = {
  roots:    t`Every chord in root position, each one higher than the last`,
  climbing: t`First chord low, then inversions stepping upward — starts again low after about two octaves`,
  smooth:   t`Nearest voicing each step — the fewest notes move, staying under one hand`,
}

export interface VoicingRange { min: number; max: number }

// Default low anchor for the first chord of a run — C3.
const DEFAULT_LOW_ROOT = 48

// ── Smooth mode's home position: the average pitch it gravitates to, above
// the low anchor, and how far it may wander before being pulled back. ────
const HOME_OFFSET = 9
const HOME_SLACK = 4

// ── How high Roots / Climbing may take the bass above the low anchor before
// starting again from the bottom (semitones): Roots' root up to the B two
// octaves up, Climbing's bass a little further since inversions sit higher. ─
const ROOTS_CEILING = 23
const CLIMB_CEILING = 28

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

// ── Root-position voicing with its root in the octave starting at lowRoot
// (C3–B3 for the default anchor) — every key starts in the same register
// instead of G and up snapping down to the octave below. Drops an octave at
// a time only if the chord would run past the top of the range. ───────────
export function rootPositionFrom(rootPc: number, semis: number[], range: VoicingRange, lowRoot: number = DEFAULT_LOW_ROOT): number[] {
  let rootMidi = lowRoot + norm12(rootPc - lowRoot)
  while (rootMidi + (semis[semis.length - 1] ?? 0) > range.max && rootMidi - 12 >= range.min) rootMidi -= 12
  return stack(rootMidi, semis)
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

// ── Summed voice movement between two voicings ─────────────────────────────
// Same-size chords up to 5 notes: the best one-to-one pairing of voices
// (tries every pairing). Otherwise a greedy nearest-voice match.
function permutations(n: number): number[][] {
  if (n <= 1) return [[0]]
  const out: number[][] = []
  for (const p of permutations(n - 1)) {
    for (let i = 0; i <= p.length; i++) out.push([...p.slice(0, i), n - 1, ...p.slice(i)])
  }
  return out
}
const PERMS = [1, 2, 3, 4, 5].map(permutations)

function motion(a: number[], b: number[]): number {
  if (a.length === 0) return 0
  if (a.length === b.length && a.length <= 5) {
    let best = Infinity
    for (const p of PERMS[a.length - 1]) {
      let total = 0
      for (let i = 0; i < a.length; i++) total += Math.abs(a[i] - b[p[i]])
      if (total < best) best = total
    }
    return best
  }
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

  // First chord of the run: root position, root in the lowRoot octave.
  if (prev === null || prev.length === 0) {
    return rootPositionFrom(pc, semis, range, lowRoot)
  }

  const prevLow = lowestNote(prev)

  if (strategy === 'roots') {
    // First root-position placement at or above the previous bottom note,
    // with its root at most two octaves above the low anchor (room for a
    // whole scale run plus its octave in any key); past that, wrap back down
    // to the anchor octave rather than climbing a looping progression off
    // the top of the keyboard.
    for (let oct = 0; oct <= 8; oct++) {
      const v = stack(pc + (oct + 1) * 12, semis)
      if (v[0] < range.min || v[v.length - 1] > range.max) continue
      if (v[0] > lowRoot + ROOTS_CEILING) break
      if (v[0] >= prevLow - 1) return v
    }
    return rootPositionFrom(pc, semis, range, lowRoot)
  }

  const cands = candidates(pc, semis, range)
  if (cands.length === 0) return rootPositionNear(pc, semis, range, avgPitch(prev))

  if (strategy === 'climbing') {
    // Each chord should sit a little ABOVE the last — a gentle staircase, not
    // a flat line and never a step down. Target roughly a third per chord;
    // common tones and small inner motion are only tie-breakers.
    // Root position is charged extra so the climb really moves through
    // inversions — otherwise a stepwise run (the chords of a scale) comes out
    // identical to Roots, since parallel root-position triads are already the
    // closest fit when every chord is one step above the last.
    const TARGET_STEP = 3
    const ROOT_POSITION_COST = 4
    const ascending = cands.filter(v => lowestNote(v) >= prevLow && lowestNote(v) <= lowRoot + CLIMB_CEILING)
    // Out of headroom → start the climb again from the bottom
    if (ascending.length === 0) return rootPositionFrom(pc, semis, range, lowRoot)
    const pool = ascending
    let best = pool[0]
    let bestScore = Infinity
    for (const v of pool) {
      const jump = lowestNote(v) - prevLow
      const stepCost = jump < 0 ? 60 - jump * 5 : Math.abs(jump - TARGET_STEP)
      const rootPosition = norm12(lowestNote(v)) === pc ? ROOT_POSITION_COST : 0
      const score = stepCost * 2 + rootPosition + motion(prev, v) * 0.15 - commonTones(prev, v) * 0.4
      if (score < bestScore) { bestScore = score; best = v }
    }
    return best
  }

  // smooth — least total movement, hold common tones, and stay in one hand
  // position around the starting register (the low anchor's octave) instead
  // of creeping upward chord after chord through a long run.
  let best = cands[0]
  let bestScore = Infinity
  const home = lowRoot + HOME_OFFSET
  for (const v of cands) {
    const away = Math.abs(avgPitch(v) - home)
    const score = motion(prev, v) - commonTones(prev, v) * 1.2 + (away > HOME_SLACK ? (away - HOME_SLACK) * 2 : 0)
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
