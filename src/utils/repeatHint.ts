import type { ParsedMidi } from '../types'

// ── Tap Tempo's hint: with the beat known, does the music repeat over a length
// that doesn't fit the bars on screen? Golden Brown comes round every 13 beats,
// which no number of 4-beat bars can do. Only ever a suggestion: a riff can
// repeat across the bar lines, so the musician listens and decides. ───────────

const STRETCH_BEATS = 26   // how much music one comparison covers
const STEP_BEATS = 6
const SHORTEST = 3, LONGEST = 32
const REPEATS = 0.85       // how alike two passes must be
const CLEARER = 0.1        // how much better than the bars' own length
const SAME_AS_BEST = 0.02  // a shorter repeat this close to the best one wins
const MIN_STRETCHES = 3    // a few overlapping stretches, so one fill can't do it
const BASS_BELOW = 52
const KICKS = [35, 36], SNARES = [38, 40]
const SIZE = 14            // twelve note names, kick, snare
const LONGEST_BAR = 7
const MOST_HINTS = 2       // a song can differ between parts; more than this is noise
const BAR_PARTS = [3, 4]
const LONGEST_PATTERN = 16 // past this a mixed pattern is more likely a loose fit than a real one

export interface RepeatHint {
  beats: number        // the music comes round every this many beats
  pattern: number[]    // bar lengths that add up to it, the first on the tapped 1
}

function nearestBeat(beats: number[], t: number): number {
  let lo = 0, hi = beats.length - 1
  while (hi - lo > 1) { const c = (lo + hi) >> 1; if (beats[c] <= t) lo = c; else hi = c }
  return t - beats[lo] < beats[hi] - t ? lo : hi
}

// What sounds on each beat, the bass counting most
function beatContents(midi: ParsedMidi, beats: number[]): Float64Array[] {
  const out = beats.map(() => new Float64Array(SIZE))
  const first = beats[0] - 0.2, last = beats[beats.length - 1] + 1
  for (const track of midi.tracks) for (const n of track.notes) {
    if (n.time < first || n.time > last) continue
    const v = out[nearestBeat(beats, n.time)]
    if (track.isDrum) {
      if (KICKS.includes(n.midi)) v[12] += 1
      else if (SNARES.includes(n.midi)) v[13] += 1
    } else v[n.midi % 12] += n.midi < BASS_BELOW ? 3 : 1
  }
  return out
}

function alike(a: Float64Array, b: Float64Array): number {
  let dot = 0, x = 0, y = 0
  for (let i = 0; i < SIZE; i++) { dot += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i] }
  return x && y ? dot / Math.sqrt(x * y) : 0
}

// The repeat length of each stretch that clearly has one the bars on screen
// can't explain. A held chord or a steady groove sounds alike at any distance,
// so the bars' own length has to repeat clearly worse.
function stretchRepeats(content: Float64Array[], fits: (lag: number) => boolean): { from: number; lag: number }[] {
  const found: { from: number; lag: number }[] = []
  for (let from = 0; from + STRETCH_BEATS + LONGEST < content.length; from += STEP_BEATS) {
    const score = new Map<number, number>()
    for (let lag = SHORTEST; lag <= LONGEST; lag++) {
      let sum = 0
      for (let i = from; i < from + STRETCH_BEATS; i++) sum += alike(content[i], content[i + lag])
      score.set(lag, sum / STRETCH_BEATS)
    }
    const lags = [...score.keys()]
    const top = lags.reduce((a, b) => (score.get(b)! > score.get(a)! ? b : a))
    // twice round is also a repeat: take the shortest pass that does as well
    const lag = lags.find(l => top % l === 0 && score.get(l)! >= score.get(top)! - SAME_AS_BEST)!
    // 3-beat bars also line up every 12 beats, which proves nothing for bars of 4
    const barsBest = Math.max(0, ...lags.filter(l => fits(l) && l % lag !== 0).map(l => score.get(l)!))
    if (!fits(lag) && score.get(lag)! >= REPEATS && score.get(lag)! >= barsBest + CLEARER) found.push({ from, lag })
  }
  return found
}

// How much each place in the repeat sounds like the 1 of a bar: a change of
// harmony or a kick, not a snare. Place 0 is the tapped 1.
function placeStrengths(content: Float64Array[], from: number, to: number, first: number, length: number): number[] {
  const out = new Array<number>(length).fill(0)
  for (let i = Math.max(1, from); i < to; i++) {
    const place = (((i - first) % length) + length) % length
    out[place] += (1 - alike(content[i], content[i - 1])) * 2 + content[i][12] - content[i][13] * 0.5
  }
  const mean = out.reduce((a, b) => a + b, 0) / length
  return out.map(x => x - mean)
}

// Bars that add up to the repeat, each 1 on the strongest places
function splitIntoBars(strength: number[]): number[] {
  const length = strength.length
  const best: { score: number; bars: number[] }[] = Array.from({ length: length + 1 }, () => ({ score: -Infinity, bars: [] }))
  best[0] = { score: 0, bars: [] }
  for (let at = 0; at < length; at++) {
    if (best[at].score === -Infinity) continue
    for (const part of BAR_PARTS) {
      const to = at + part
      if (to > length) continue
      const score = best[at].score + strength[at]
      if (score > best[to].score) best[to] = { score, bars: [...best[at].bars, part] }
    }
  }
  return best[length].bars
}

// Bars for one repeat: equal when they fit, such as 14 as two bars of 7. Null if
// it's too long to be a bar pattern.
function barsFor(lag: number, strength: () => number[]): number[] | null {
  for (let bars = 1; bars <= lag / SHORTEST; bars++) {
    if (lag % bars === 0 && lag / bars <= LONGEST_BAR) return [lag / bars]
  }
  return lag > LONGEST_PATTERN ? null : splitIntoBars(strength())
}

// `beats` run from the tempo's start, `anchor` is a 1, `cycle` the beats the bars
// on screen take to come round. Most heard first; empty when nothing clear
// disagrees with the bars. A song's parts can differ, and each part can be set
// with Change bars from here.
export function findRepeats(midi: ParsedMidi, beats: number[], anchor: number, cycle: number): RepeatHint[] {
  if (beats.length < STRETCH_BEATS + LONGEST + 1) return []
  const content = beatContents(midi, beats)
  const found = stretchRepeats(content, l => l % cycle === 0 || cycle % l === 0)
  const count = (lag: number) => found.filter(x => x.lag === lag).length
  const lags = [...new Set(found.map(x => x.lag))].filter(lag => count(lag) >= MIN_STRETCHES).sort((a, b) => count(b) - count(a) || a - b)
  // twice round a shorter repeat says nothing new
  const distinct = lags.filter(lag => !lags.some(l => l < lag && lag % l === 0))
  const hints: RepeatHint[] = []
  for (const lag of distinct) {
    const part = found.filter(x => x.lag === lag)
    const to = Math.min(content.length, part[part.length - 1].from + STRETCH_BEATS + lag)
    const pattern = barsFor(lag, () => placeStrengths(content, part[0].from, to, nearestBeat(beats, anchor), lag))
    if (pattern) hints.push({ beats: lag, pattern })
  }
  return hints.slice(0, MOST_HINTS)
}
