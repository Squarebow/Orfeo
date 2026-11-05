import type { ParsedMidi } from '../types'
import { fileGridOf, type GridMap, type TempoSegment } from './tempoCorrection'

// ── Copy bars from another version of a song ─────────────────────────────────
// Two files of one song can hold the same notes while only one knows where its
// bars are. The notes are lined up one by one, which gives a time map from one
// file to the other; the good file's beats, bars, tempo and time signatures
// are carried across that map. Only the beat layer moves: never the notes.

const MAX_CELLS = 64_000_000  // the search's memory ceiling: one byte per cell
const MAX_BAND = 2000
const KNOT_NOTES = 24         // notes per point of the time map, so loose timing averages out
const TIGHT_SEC = 0.15        // a lined-up note this close to the time map really is the same note
// Share of notes that must line up. Measured on a 427-song library: 389 unrelated
// pairs never passed 0.12; other arrangements of one song start around 0.4.
export const SAME_SONG = 0.4

interface Timed { t: number; p: number }
type Pair = [number, number]  // [source seconds, target seconds]

function notesOf(midi: ParsedMidi): Timed[] {
  const out: Timed[] = []
  for (const track of midi.tracks) {
    if (track.isDrum) continue
    for (const n of track.notes) out.push({ t: n.time, p: n.midi })
  }
  return out.sort((a, b) => a.t - b.t || a.p - b.p)
}

// Longest run of notes the two files share, in order. Versions of a song stay
// close to the same place in their note lists, so only a band around the
// diagonal is searched.
function matchNotes(a: Timed[], b: Timed[]): Pair[] {
  const n = a.length, m = b.length
  if (!n || !m) return []
  const band = Math.max(64, Math.min(MAX_BAND, Math.floor(MAX_CELLS / n / 2), Math.abs(n - m) + 400))
  const width = 2 * band + 1
  const centre = (i: number) => Math.round((i * m) / n)
  const from = new Uint8Array(n * width)  // 1 = matched, 2 = skipped a source note, 3 = skipped a target note
  let prev = new Int32Array(m + 2), cur = new Int32Array(m + 2)
  for (let i = 1; i <= n; i++) {
    const lo = Math.max(1, centre(i) - band), hi = Math.min(m, centre(i) + band)
    cur.fill(0, Math.max(0, lo - 1), Math.min(m + 2, hi + 2))
    const row = (i - 1) * width
    for (let j = lo; j <= hi; j++) {
      const hit = a[i - 1].p === b[j - 1].p ? prev[j - 1] + 1 : -1
      const up = prev[j], left = cur[j - 1]
      const col = row + j - centre(i) + band
      if (hit >= up && hit >= left) { cur[j] = hit; from[col] = 1 }
      else if (up >= left) { cur[j] = up; from[col] = 2 }
      else { cur[j] = left; from[col] = 3 }
    }
    if (hi + 1 <= m) cur[hi + 1] = cur[hi]
    const swap = prev; prev = cur; cur = swap
  }
  const pairs: Pair[] = []
  let i = n, j = Math.min(m, centre(n) + band)
  while (i > 0 && j > 0) {
    const off = j - centre(i) + band
    const step = off >= 0 && off < width ? from[(i - 1) * width + off] : 0
    if (step === 1) { pairs.push([a[i - 1].t, b[j - 1].t]); i--; j-- }
    else if (step === 3) j--
    else i--
  }
  return pairs.reverse()
}

const median = (xs: number[]) => [...xs].sort((x, y) => x - y)[xs.length >> 1]

// Points of the time map, always rising in both files
function knotsOf(pairs: Pair[]): Pair[] {
  const out: Pair[] = []
  for (let i = 0; i < pairs.length; i += KNOT_NOTES) {
    const part = pairs.slice(i, i + KNOT_NOTES)
    const k: Pair = [median(part.map(p => p[0])), median(part.map(p => p[1]))]
    const last = out[out.length - 1]
    if (!last || (k[0] > last[0] && k[1] > last[1])) out.push(k)
  }
  return out
}

function warpWith(knots: Pair[], slope: number): (t: number) => number {
  return (t) => {
    const first = knots[0], last = knots[knots.length - 1]
    if (t <= first[0]) return first[1] + (t - first[0]) * slope
    if (t >= last[0]) return last[1] + (t - last[0]) * slope
    let lo = 0, hi = knots.length - 1
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (knots[mid][0] <= t) lo = mid; else hi = mid }
    const [s0, t0] = knots[lo], [s1, t1] = knots[hi]
    return t0 + ((t - s0) / (s1 - s0)) * (t1 - t0)
  }
}

export interface SongMatch { share: number; warp: (t: number) => number; slope: number }

// How much of two files is the same music, and the time map between them.
// `share` counts only notes that land where the time map says, so two songs
// that merely use the same notes score low.
export function matchSongs(source: ParsedMidi, target: ParsedMidi): SongMatch | null {
  const a = notesOf(source), b = notesOf(target)
  const pairs = matchNotes(a, b)
  if (pairs.length < 2 * KNOT_NOTES) return null
  const knots = knotsOf(pairs)
  if (knots.length < 2) return null
  const first = knots[0], last = knots[knots.length - 1]
  const slope = (last[1] - first[1]) / (last[0] - first[0])
  if (!(slope > 0)) return null
  const warp = warpWith(knots, slope)
  const tight = pairs.filter(([s, t]) => Math.abs(warp(s) - t) <= TIGHT_SEC).length
  return { share: tight / Math.max(a.length, b.length), warp, slope }
}

const ms = (t: number) => Math.round(t * 1000) / 1000

// The source's beat layer, moved onto the target's time. Takes over from the
// very start of the song, replacing every kept tempo.
export function copiedSegment(source: ParsedMidi, target: ParsedMidi, match: SongMatch): TempoSegment | null {
  const grid = fileGridOf(source)
  const { warp, slope } = match
  const place = (ts: number[]) => ts.map(t => ms(warp(t))).filter(t => t >= 0)
  const beats = place((source as any)._beatTimes ?? grid.beats)
  const bars = place((source as any)._barTimes ?? grid.bars)
  if (beats.length < 2 || bars.length < 1) return null

  const tempoSrc = ((source as any)._tempoMap ?? grid.tempoMap) as GridMap['tempo']
  const sigSrc = ((source as any)._timeSigMap ?? grid.timeSigMap) as GridMap['sigs']
  // what's in force where the target's song begins stays, moved to the start
  const carry = <T extends { time: number }>(events: T[]): T[] => {
    const moved = events.map(e => ({ ...e, time: ms(warp(e.time)) }))
    const before = moved.filter(e => e.time <= 0).at(-1)
    const after = moved.filter(e => e.time > 0)
    if (before) return [{ ...before, time: 0 }, ...after]
    // an empty start: the first event covers it too
    return after.length ? [{ ...after[0], time: 0 }, ...after.slice(1)] : after
  }
  const map: GridMap = {
    beats, bars,
    tempo: carry(tempoSrc).map(e => ({ ...e, bpm: e.bpm / slope })),
    sigs: carry(sigSrc),
  }
  const gaps = beats.slice(1).map((t, i) => t - beats[i])
  const sig = map.sigs[0] ?? { num: 4, den: 4 }
  return { start: 0, anchor: beats[0], period: median(gaps), beatsPerBar: sig.num, den: sig.den, map }
}

// ── Which Library files might be the same song, from their names ────────────
// Only narrows down what to compare: the notes decide. Track numbers, years and
// tags like "(2)" or "[k]" say nothing about the song.
const NOISE = new Set(['the', 'and', 'mid', 'midi', 'kar', 'orfeo', 'imported', 'split', 'version', 'remix', 'piano', 'solo'])

export function nameWords(name: string): Set<string> {
  const stem = name.replace(/\.[a-z0-9]+$/i, '').replace(/\[[^\]]*\]|\([^)]*\)/g, ' ').toLowerCase()
  return new Set(stem.split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 3 && !NOISE.has(w) && !/^\d+$/.test(w)))
}

export function likelySameSong(a: string, b: string): boolean {
  const wa = nameWords(a), wb = nameWords(b)
  if (wa.size === 0 || wb.size === 0) return false
  let shared = 0
  for (const w of wa) if (wb.has(w)) shared++
  return shared >= Math.min(2, wa.size, wb.size) && shared / Math.min(wa.size, wb.size) >= 0.6
}
