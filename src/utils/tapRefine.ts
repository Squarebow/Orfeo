import type { ParsedMidi } from '../types'

// ── Tap refinement — snaps a tapped beat grid onto the song's own notes.
// The user's taps give a reliable tempo and a rough "1" (human taps wobble
// by tens of ms and lag the sound); the notes give the exact timing. Only a
// small search around the tapped values is allowed (±2% tempo, ±80 ms
// phase), so this can never pick a different beat, double/half tempo or a
// different "1" than the one tapped — the classic failures of fully
// automatic tempo detection. If the notes don't clearly line up with the
// grid (sparse or free-time passages), the taps are kept unchanged. ─────

const PHASE_RANGE = 0.08     // s, either side of the tapped 1
const PHASE_STEP = 0.002
const TEMPO_RANGE = 0.02     // ±2%
const TEMPO_STEP = 0.0003
const SIGMA = 0.015          // s — how close a note must be to "count" for a beat
const HIT_WINDOW = 0.03      // s — a beat counts as "played" if a note is this close
const MIN_HIT_SHARE = 0.5    // at least half the beats must have a note on them
const MIN_GAIN = 1.1         // refined grid must fit the notes clearly better
const MERGE = 0.015          // notes closer than this are one event (chords)

interface Onset { t: number; w: number }

// Kick/snare and bass carry the beat; hats and everything else count less
function noteWeight(isDrum: boolean, group: string, midi: number, velocity: number): number {
  let w: number
  if (isDrum) {
    if (midi === 35 || midi === 36) w = 1.0
    else if (midi >= 37 && midi <= 40) w = 0.9
    else if (midi === 42 || midi === 44 || midi === 46) w = 0.35
    else if (midi >= 49 && midi <= 59) w = 0.4
    else w = 0.5
  } else w = /bass/i.test(group) ? 0.7 : 0.35
  return w * (0.4 + 0.6 * Math.max(0, Math.min(1, velocity)))
}

export function collectOnsets(midi: ParsedMidi, from: number, to: number): Onset[] {
  const raw: Onset[] = []
  for (const tr of midi.tracks) {
    for (const n of tr.notes) {
      if (n.time < from - 0.1 || n.time > to + 0.1) continue
      raw.push({ t: n.time, w: noteWeight(tr.isDrum, tr.group ?? '', n.midi, n.velocity ?? 0.8) })
    }
  }
  raw.sort((a, b) => a.t - b.t)
  const out: Onset[] = []
  for (const o of raw) {
    const last = out[out.length - 1]
    if (last && o.t - last.t < MERGE) { last.w = Math.min(Math.max(last.w, o.w) + 0.05, Math.max(last.w, o.w) + 0.3); continue }
    out.push({ ...o })
  }
  return out
}

function score(onsets: Onset[], period: number, anchor: number): number {
  let s = 0
  for (const o of onsets) {
    const x = (o.t - anchor) / period
    const d = (x - Math.round(x)) * period
    s += o.w * Math.exp(-(d * d) / (2 * SIGMA * SIGMA))
  }
  return s
}

// Share of grid beats in [from, to] that have a reasonably strong note on them
function hitShare(onsets: Onset[], period: number, anchor: number, from: number, to: number): number {
  let beats = 0, hits = 0, i = 0
  const strong = onsets.filter(o => o.w >= 0.3)
  for (let k = Math.ceil((from - anchor) / period); anchor + k * period <= to; k++) {
    const b = anchor + k * period
    beats++
    while (i < strong.length && strong[i].t < b - HIT_WINDOW) i++
    if (i < strong.length && Math.abs(strong[i].t - b) <= HIT_WINDOW) hits++
  }
  return beats ? hits / beats : 0
}

export interface RefineResult { period: number; anchor: number; snapped: boolean }

export function refineToNotes(midi: ParsedMidi, fit: { period: number; anchor: number }, from: number, to: number): RefineResult {
  const keep: RefineResult = { period: fit.period, anchor: fit.anchor, snapped: false }
  const onsets = collectOnsets(midi, from, to)
  if (onsets.length < 8) return keep

  const base = score(onsets, fit.period, fit.anchor)
  let best = { s: -1, p: fit.period, a: fit.anchor }
  const search = (pLo: number, pHi: number, pStep: number, aLo: number, aHi: number, aStep: number) => {
    for (let p = pLo; p <= pHi + 1e-12; p += pStep) {
      for (let a = aLo; a <= aHi + 1e-12; a += aStep) {
        const s = score(onsets, p, a)
        if (s > best.s) best = { s, p, a }
      }
    }
  }
  const p0 = fit.period
  search(p0 * (1 - TEMPO_RANGE), p0 * (1 + TEMPO_RANGE), p0 * TEMPO_STEP, fit.anchor - PHASE_RANGE, fit.anchor + PHASE_RANGE, PHASE_STEP)
  const c = { ...best }
  search(c.p - p0 * TEMPO_STEP, c.p + p0 * TEMPO_STEP, p0 * TEMPO_STEP / 10, c.a - PHASE_STEP, c.a + PHASE_STEP, PHASE_STEP / 8)

  if (best.s < base * MIN_GAIN && base > 0) {
    // already as good as it gets — still require the notes to sit on the beat
    if (hitShare(onsets, fit.period, fit.anchor, from, to) < MIN_HIT_SHARE) return keep
  }
  if (hitShare(onsets, best.p, best.a, from, to) < MIN_HIT_SHARE) return keep
  return { period: best.p, anchor: best.a, snapped: true }
}

// Does the tapped beat sit exactly on the file's own beat grid at the same,
// half or double speed? (A file counted at double speed, for example, has
// the right bar lines but shows twice the tempo you hear.) Returns the ratio
// tapped-beat / file-beat (1, 2 or 0.5), or null.
const RATIO_TOL = 0.02
const PHASE_TOL = 0.1   // of the shorter of the two beats
export function matchFileBeat(fileBeats: number[], period: number, anchor: number, nCheck = 8): number | null {
  if (fileBeats.length < 3) return null
  let i = 0
  while (i < fileBeats.length - 1 && fileBeats[i + 1] <= anchor) i++
  const near = fileBeats.slice(Math.max(0, i - 4), i + 6)
  const gaps = near.slice(1).map((x, j) => x - near[j]).sort((a, b) => a - b)
  const b = gaps[Math.floor(gaps.length / 2)]
  if (!(b > 0)) return null
  const isFileBeat = (t: number, tol: number) => {
    let lo = 0, hi = fileBeats.length - 1
    while (lo < hi) { const m = (lo + hi) >> 1; if (fileBeats[m] < t) lo = m + 1; else hi = m }
    const d = Math.min(Math.abs(fileBeats[lo] - t), lo > 0 ? Math.abs(fileBeats[lo - 1] - t) : Infinity)
    return d <= tol
  }
  for (const r of [1, 2, 0.5]) {
    if (Math.abs(period / (b * r) - 1) > RATIO_TOL) continue
    const tol = PHASE_TOL * Math.min(period, b)
    const step = r < 1 ? Math.round(1 / r) : 1   // at double speed every 2nd tap is a file beat
    let ok = true
    for (let k = 0; k < nCheck && ok; k++) ok = isFileBeat(anchor + k * step * period, tol)
    if (ok) return r
  }
  return null
}
