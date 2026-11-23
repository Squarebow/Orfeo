// ── Hand model: what it sees of each note ────────────────────────────────────
//
// The hand model (handModel.ts) reads a piano part note by note, in playing
// order, and for every note gets this row of numbers: where the note sits on
// the keyboard, how long after the last one it comes, its place in its chord,
// the range of the notes around it, what is still held under and over it, and
// what today's engine (assignHands) thinks of it. The same function builds
// the training material on the dev machine (scripts/hand-model/, gitignored)
// and the model's input in the app, so the two can never drift apart.
// Change a feature here → the model must be trained again (FEATURE_VERSION).

export const FEATURE_VERSION = 1
export const FEATURES = 22

export interface FeatureNote { midi: number; time: number; duration?: number }
export interface EngineRead { hand: 'L' | 'R'; confidence: number }

const CHORD_SEC = 0.02     // same as assignHands' clusterToleranceSec
const AROUND_SEC = 1.5     // same as assignHands' WINDOW_SEC
const HELD_SEC = 0.03      // a note still sounding this long after another's start is held under it
const HELD_LOOKBACK = 4    // seconds back to look for held notes

const logTime = (s: number) => Math.log(Math.max(0, s) + 0.01) / 4.6   // 0.01 s → −1, 1 s → 0, ~100 s → 1

/** Playing order: by start, low to high within a chord. */
export function playingOrder(notes: FeatureNote[]): number[] {
  return notes.map((_, i) => i).sort((a, b) => notes[a].time - notes[b].time || notes[a].midi - notes[b].midi)
}

/**
 * One row of FEATURES numbers per note, in playing order (`order`).
 * `engine[i]` is today's engine's read of notes[i].
 */
export function noteFeatures(notes: FeatureNote[], engine: EngineRead[], order = playingOrder(notes)): Float32Array {
  const N = order.length
  const out = new Float32Array(N * FEATURES)
  const ms = order.map(i => notes[i].midi)
  const ts = order.map(i => notes[i].time)
  const ds = order.map(i => notes[i].duration ?? 0)

  // chords: runs of notes starting within CHORD_SEC of the run's first
  const chordStart = new Int32Array(N), chordEnd = new Int32Array(N)
  for (let i = 0; i < N;) {
    let j = i
    while (j < N && ts[j] - ts[i] <= CHORD_SEC) j++
    for (let k = i; k < j; k++) { chordStart[k] = i; chordEnd[k] = j }
    i = j
  }

  let a = 0, b = 0
  const win: number[] = []
  for (let k = 0; k < N; k++) {
    const m = ms[k], t = ts[k], f = k * FEATURES
    const cs = chordStart[k], ce = chordEnd[k]
    const prevOnset = cs > 0 ? ts[cs - 1] : t - 10
    const nextOnset = ce < N ? ts[ce] : t + 10

    // the notes around it
    while (a < N && ts[a] < t - AROUND_SEC) a++
    while (b < N && ts[b] <= t + AROUND_SEC) b++
    win.length = 0
    for (let q = a; q < b; q++) win.push(ms[q])
    win.sort((x, y) => x - y)
    const pick = (p: number) => win[Math.min(win.length - 1, Math.floor(p * win.length))]
    let sum = 0; for (const v of win) sum += v

    // held under and over it
    let below = 0, above = 0
    for (let q = cs - 1; q >= 0 && t - ts[q] <= HELD_LOOKBACK; q--) {
      if (ts[q] + ds[q] > t + HELD_SEC) { if (ms[q] < m) below++; else if (ms[q] > m) above++ }
    }

    const e = engine[order[k]]
    const side = e.hand === 'R' ? 1 : -1
    const lower = k > cs ? m - ms[k - 1] : 0
    const upper = k + 1 < ce ? ms[k + 1] - m : 0

    out[f + 0] = (m - 60) / 24
    out[f + 1] = logTime(t - prevOnset)
    out[f + 2] = logTime(nextOnset - t)
    out[f + 3] = logTime(ds[k])
    out[f + 4] = Math.min(ce - cs, 8) / 4
    out[f + 5] = Math.min(k - cs, 6) / 4
    out[f + 6] = Math.min(ce - 1 - k, 6) / 4
    out[f + 7] = Math.min(lower, 24) / 12
    out[f + 8] = Math.min(upper, 24) / 12
    out[f + 9] = k > cs ? 1 : 0
    out[f + 10] = k + 1 < ce ? 1 : 0
    out[f + 11] = (win[0] - m) / 24
    out[f + 12] = (win[win.length - 1] - m) / 24
    out[f + 13] = (sum / win.length - m) / 24
    out[f + 14] = (pick(0.25) - m) / 24
    out[f + 15] = (pick(0.75) - m) / 24
    out[f + 16] = Math.min(below, 8) / 4
    out[f + 17] = Math.min(above, 8) / 4
    out[f + 18] = side
    out[f + 19] = e.confidence
    out[f + 20] = side * e.confidence
    out[f + 21] = Math.min(win.length, 60) / 30
  }
  return out
}
