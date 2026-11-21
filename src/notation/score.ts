// ── From MIDI to a readable score (practice stage 8) ─────────────────────────
// A MIDI file says when each key goes down and up, in seconds; a score says
// which note values, on which staff, in which bar. This turns one into the
// other:
// - every note's place is read in beats (so tempo changes don't matter);
// - a swung song (off-beats late, two to one) is written in straight eighths
//   with a swing mark, the way it's printed;
// - a beat whose notes fall in three is written as a triplet, the rest are
//   rounded to sixteenths (or eighths, for a file played in by hand);
// - notes starting together in one hand become one chord; a note held on
//   under moving notes above it gets a voice of its own (stems down), the
//   rest is one voice;
// - lengths are written as note values that keep the beats visible, tied
//   over beats and bar lines;
// - the right hand on the upper staff, the left on the lower; the sustain
//   pedal under it.
// Or, as a lead sheet: the melody (the top line of the right hand) with the
// chord names above. Positions are in 48ths of a whole note, so sixteenths
// (3) and triplet eighths (4) both fit. Pure: no store, no drawing (draw.ts).

export interface ScoreNote { midi: number; time: number; dur: number; hand: 'L' | 'R' }
export interface ScoreInput {
  notes: ScoreNote[]           // as they should be played (the key change already added)
  beatTimes: number[]          // every beat of the song, seconds
  barStarts: number[]          // every bar's start, seconds
  timeSigs: { num: number; den: number; time: number }[]
  duration: number
  keyFifths: number            // the key signature: sharps (+) or flats (−)
  grid?: 1 | 2                 // the finest straight value: 1 sixteenths, 2 eighths
  pedal?: { down: number; up: number }[]   // sustain pedal, seconds
}

export const TPW = 48          // ticks in a whole note
export interface ScoreEvent {
  pos: number                  // in the bar, 48ths of a whole note
  len: number                  // 48ths: 48 whole, 24 half, 12 quarter, 6 eighth, 3 sixteenth (36, 18, 9 dotted); in a triplet 8 or 4
  keys: number[] | null        // the notes (MIDI), or null for a rest
  tie: boolean                 // tied over to the next event
  time: number                 // where in the song it starts, seconds
  triplet?: number             // the triplet it belongs to (same number = same bracket)
  ghost?: boolean              // a gap in the second voice: takes time, draws nothing
}
export interface ScoreBar {
  n: number                    // 1-based
  num: number; den: number     // time signature
  units: number                // its length in 48ths
  start: number; end: number   // seconds
  R: ScoreEvent[]; L: ScoreEvent[]
  R2?: ScoreEvent[]; L2?: ScoreEvent[]   // a second voice (held notes under moving ones)
  pedal?: { time: number; down: boolean }[]
  chords?: { pos: number; name: string; time: number }[]   // lead sheet
}
export interface Score { bars: ScoreBar[]; keyFifths: number; grid: 1 | 2; swing: boolean; lead: boolean }

// ── Reading seconds as beats ─────────────────────────────────────────────────
function beatAt(beats: number[], t: number): number {
  if (beats.length < 2) return 0
  let lo = 0, hi = beats.length - 1
  if (t <= beats[0]) return (t - beats[0]) / (beats[1] - beats[0])
  if (t >= beats[hi]) return hi + (t - beats[hi]) / (beats[hi] - beats[hi - 1])
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (beats[m] <= t) lo = m; else hi = m }
  return lo + (t - beats[lo]) / (beats[lo + 1] - beats[lo])
}
function timeAt(beats: number[], b: number): number {
  if (beats.length < 2) return 0
  const i = Math.max(0, Math.min(beats.length - 2, Math.floor(b)))
  return beats[i] + (b - i) * (beats[i + 1] - beats[i])
}
const frac = (b: number) => b - Math.floor(b)

/** How many of the notes start right on a sixteenth or a triplet eighth (in
 *  beats, so any tempo): close to 1 for a file written in a program */
export function onTheGrid(notes: ScoreNote[], beatTimes: number[], den = 4): number {
  if (!notes.length) return 1
  const per = 16 / den
  let on = 0
  for (const n of notes) {
    const b = beatAt(beatTimes, n.time), u = b * per, f = frac(b)
    if (Math.abs(u - Math.round(u)) <= 0.12 || (den === 4 && Math.min(Math.abs(f - 1 / 3), Math.abs(f - 2 / 3)) <= 0.04)) on++
  }
  return on / notes.length
}

/** Swung: most off-beats land two thirds into the beat, not half way, and
 *  there aren't many notes on the first third (that would be triplets) */
export function isSwung(notes: ScoreNote[], beatTimes: number[]): boolean {
  let half = 0, twoThirds = 0, third = 0
  for (const n of notes) {
    const f = frac(beatAt(beatTimes, n.time))
    if (Math.abs(f - 0.5) < 0.06) half++
    else if (Math.abs(f - 2 / 3) < 0.07) twoThirds++
    else if (Math.abs(f - 1 / 3) < 0.06) third++
  }
  return twoThirds >= 8 && twoThirds >= 2 * half && third < twoThirds * 0.35
}

// ── Writing a length as note values ──────────────────────────────────────────
// Biggest value first that starts where such a value may start, so the beats
// stay visible: a half note on beat 1 or 3, a quarter on a beat, and so on.
// (In sixteenths, like the rest of the score's straight values.)
const VALUES = [16, 12, 8, 6, 4, 3, 2, 1]
const ALIGN: Record<number, number> = { 16: 16, 8: 8, 4: 4, 2: 2, 1: 1 }
function fits(v: number, pos: number, barUnits: number, compound: boolean): boolean {
  if (pos + v > barUnits) return false
  if (ALIGN[v]) return pos % ALIGN[v] === 0
  if (v === 12) return pos === 0 && barUnits === 12
  if (compound) return pos % v === 0
  return pos % ((v / 3) * 4) === 0
}
export function splitLength(pos: number, len: number, barUnits: number, compound = false): number[] {
  const out: number[] = []
  while (len > 0) {
    const v = VALUES.find(v => v <= len && fits(v, pos, barUnits, compound)) ?? 1
    out.push(v); pos += v; len -= v
  }
  return out
}

export function keySpecOf(fifths: number): string {
  return ['Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'][Math.max(-7, Math.min(7, fifths)) + 7]
}
/** The key signature of a key: tonic 0–11 and minor or not */
export function fifthsOf(tonic: number, minor: boolean): number {
  const major = ((minor ? tonic + 3 : tonic) % 12 + 12) % 12
  return [0, -5, 2, -3, 4, -1, -6, 1, -4, 3, -2, 5][major]
}
const SHARP = ['c', 'c#', 'd', 'd#', 'e', 'f', 'f#', 'g', 'g#', 'a', 'a#', 'b']
const FLAT = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b']
/** A key as the score writes it ("f#/4"), sharps or flats by the key */
export function spell(midi: number, fifths: number): string {
  const name = (fifths < 0 ? FLAT : SHARP)[midi % 12]
  return `${name}/${Math.floor(midi / 12) - 1}`
}

/** The melody: the top note of the right hand at each moment, each lasting
 *  until the next one (notes starting within 30 ms are one moment) */
export function melodyOf(notes: ScoreNote[]): ScoreNote[] {
  const rh = notes.filter(n => n.hand === 'R').sort((a, b) => a.time - b.time || b.midi - a.midi)
  const out: ScoreNote[] = []
  for (const n of rh) {
    const last = out[out.length - 1]
    if (last && n.time - last.time < 0.03) { if (n.midi > last.midi) out[out.length - 1] = { ...n, time: last.time }; continue }
    out.push({ ...n })
  }
  for (let i = 0; i < out.length - 1; i++) out[i].dur = Math.min(out[i].dur, out[i + 1].time - out[i].time)
  return out
}

// ── The score ────────────────────────────────────────────────────────────────
interface Q { s: number; e: number; midi: number }
type VoiceKey = 'R' | 'L' | 'R2' | 'L2'

export function buildScore(inp: ScoreInput, opts: { lead?: { chords: { time: number; name: string }[] } } = {}): Score {
  const grid = inp.grid ?? 1
  const beats = inp.beatTimes
  const lead = !!opts.lead
  const sigAt = (t: number) => { let s = inp.timeSigs[0] ?? { num: 4, den: 4, time: 0 }; for (const x of inp.timeSigs) if (x.time <= t + 1e-6) s = x; return s }
  const bars: ScoreBar[] = inp.barStarts.map((start, i) => {
    const sig = sigAt(start)
    return { n: i + 1, num: sig.num, den: sig.den, units: Math.max(1, Math.round(sig.num * TPW / sig.den)), start, end: inp.barStarts[i + 1] ?? inp.duration, R: [], L: [] }
  })
  const notes = lead ? melodyOf(inp.notes) : inp.notes
  const swing = isSwung(notes, beats)
  if (!bars.length) return { bars, keyFifths: inp.keyFifths, grid, swing, lead }

  const barBeat = bars.map(b => beatAt(beats, b.start))
  const offsets: number[] = []
  bars.reduce((acc, b, i) => { offsets[i] = acc; return acc + b.units }, 0)
  const total = offsets[bars.length - 1] + bars[bars.length - 1].units
  const barOf = (u: number) => { let lo = 0, hi = bars.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (offsets[m] <= u) lo = m; else hi = m - 1 } return lo }
  const barOfBeat = (b: number) => { let lo = 0, hi = bars.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (barBeat[m] <= b + 1e-6) lo = m; else hi = m - 1 } return lo }
  const beatTicks = (bi: number) => TPW / bars[bi].den
  const tickTime = (u: number) => { const bi = barOf(u); return timeAt(beats, barBeat[bi] + (u - offsets[bi]) / beatTicks(bi)) }
  const beatKey = (u: number) => { const bi = barOf(u); return `${bi}:${Math.floor((u - offsets[bi]) / beatTicks(bi))}` }

  // a swung off-beat (two thirds in) is read as the half
  const unswing = (b: number) => {
    if (!swing) return b
    const f = frac(b)
    return f > 0.56 && f < 0.78 ? Math.floor(b) + 0.5 : b
  }

  for (const hand of ['R', 'L'] as const) {
    const mine = notes.filter(n => n.hand === hand)
    // which beats are in three: their notes sit on thirds much better than on the grid
    const tripletBeats = new Set<string>()
    const byBeat = new Map<string, number[]>()
    for (const n of mine) {
      const b = unswing(beatAt(beats, n.time)), bi = barOfBeat(b)
      if (bars[bi].den !== 4) continue
      const inBar = b - barBeat[bi] + 1e-6
      const k = `${bi}:${Math.floor(inBar)}`
      byBeat.set(k, [...(byBeat.get(k) ?? []), frac(inBar)])
    }
    const step = grid === 1 ? 0.25 : 0.5
    for (const [k, fs] of byBeat) {
      const onThird = fs.some(f => Math.min(Math.abs(f - 1 / 3), Math.abs(f - 2 / 3)) < 0.06)
      if (!onThird || new Set(fs.map(f => Math.round(f * 3) % 3)).size < 2) continue
      const err = (g: number) => fs.reduce((a, f) => a + Math.abs(f - Math.round(f / g) * g), 0)
      if (err(1 / 3) < err(step) * 0.6) tripletBeats.add(k)
    }
    // a place in the song, in ticks from bar 1, rounded to its beat's grid
    const place = (t: number): number => {
      const b = unswing(beatAt(beats, t)), bi = barOfBeat(b)
      const inBar = (b - barBeat[bi]) * beatTicks(bi)
      const g = tripletBeats.has(`${bi}:${Math.floor(b - barBeat[bi] + 1e-6)}`) ? beatTicks(bi) / 3 : 3 * grid
      return offsets[bi] + Math.max(0, Math.round(inBar / g) * g)
    }
    const minLen = 3 * grid
    const qs: Q[] = mine.map(n => {
      const s = Math.min(place(n.time), total - minLen)
      return { s, e: Math.max(s + (tripletBeats.has(beatKey(s)) ? 4 : minLen), Math.min(place(n.time + n.dur), total)), midi: n.midi }
    })

    // the second voice: a note held on under at least two later notes, all above it
    const lower = new Set<Q>()
    if (!lead) for (const q of qs) {
      if (q.e - q.s < 12) continue
      const inside = qs.filter(o => o !== q && o.s > q.s && o.s < q.e)
      if (new Set(inside.map(o => o.s)).size >= 2 && inside.every(o => o.midi > q.midi)) lower.add(q)
    }
    const upper = qs.filter(q => !lower.has(q))

    const write = (voice: Q[], key: VoiceKey, ghostRests: boolean) => {
      const chords = new Map<number, { keys: Set<number>; end: number }>()
      for (const q of voice) { const c = chords.get(q.s) ?? { keys: new Set<number>(), end: q.s }; c.keys.add(q.midi); c.end = Math.max(c.end, q.e); chords.set(q.s, c) }
      const starts = [...chords.keys()].sort((a, b) => a - b)
      const spans: { s: number; e: number; keys: number[] | null }[] = []
      let at = 0
      starts.forEach((s, i) => {
        if (s > at) spans.push({ s: at, e: s, keys: null })
        const c = chords.get(s)!
        const e = Math.min(c.end, starts[i + 1] ?? total)
        spans.push({ s, e, keys: [...c.keys].sort((a, b) => a - b) })
        at = e
      })
      if (at < total) spans.push({ s: at, e: total, keys: null })
      for (const bar of bars) bar[key] = bar[key] ?? []
      for (const sp of spans) {
        let u = sp.s
        while (u < sp.e) {
          const bi = barOf(u), bar = bars[bi], bt = beatTicks(bi)
          const barEnd = offsets[bi] + bar.units
          const pos = u - offsets[bi]
          const beatNo = Math.floor(pos / bt)
          let upto: number, parts: number[], trip: number | undefined
          if (tripletBeats.has(`${bi}:${beatNo}`)) {
            // inside a beat in three: triplet eighths, or a quarter of the triplet
            upto = Math.min(sp.e, offsets[bi] + (beatNo + 1) * bt)
            const len = upto - u, at3 = pos % bt
            parts = len === bt && at3 === 0 ? [bt] : len === 8 && at3 !== 8 ? [8] : Array.from({ length: Math.max(1, Math.round(len / 4)) }, () => 4)
            trip = parts.length === 1 && parts[0] === bt ? undefined : bi * 1000 + beatNo
          } else {
            // straight values up to the next beat in three (or the bar line)
            let stop = barEnd
            for (let b = beatNo + 1; offsets[bi] + b * bt < barEnd; b++) if (tripletBeats.has(`${bi}:${b}`)) { stop = offsets[bi] + b * bt; break }
            upto = Math.min(sp.e, stop)
            parts = splitLength(pos / 3, (upto - u) / 3, bar.units / 3, bar.den === 8 && bar.num % 3 === 0).map(x => x * 3)
          }
          let p = pos
          parts.forEach((len, j) => {
            const last = j === parts.length - 1 && upto === sp.e
            const ev: ScoreEvent = { pos: p, len, keys: sp.keys, tie: !!sp.keys && !last, time: tickTime(offsets[bi] + p) }
            if (trip !== undefined) ev.triplet = trip
            if (!sp.keys && ghostRests) ev.ghost = true
            bar[key]!.push(ev)
            p += len
          })
          u = upto
        }
      }
    }
    write(upper, hand, false)
    const second: VoiceKey = hand === 'R' ? 'R2' : 'L2'
    if (lower.size) {
      write([...lower], second, true)
      // the second voice only in bars where it plays
      for (const bar of bars) if (bar[second]?.every(e => !e.keys)) delete bar[second]
    }
    for (const bar of bars) if (bar[hand].every(e => !e.keys)) bar[hand] = [{ pos: 0, len: bar.units, keys: null, tie: false, time: bar.start }]
  }

  // the sustain pedal, bar by bar
  for (const p of inp.pedal ?? []) {
    for (const [time, down] of [[p.down, true], [p.up, false]] as const) {
      const bi = barOfBeat(beatAt(beats, time))
      if (bars[bi]) (bars[bi].pedal ??= []).push({ time, down })
    }
  }
  // chord names, where they change (lead sheet), on the nearest eighth
  if (opts.lead) {
    let last = ''
    for (const c of opts.lead.chords) {
      if (!c.name || c.name === last) continue
      last = c.name
      const b = beatAt(beats, c.time), bi = barOfBeat(b)
      if (!bars[bi]) continue
      const pos = Math.max(0, Math.round((b - barBeat[bi]) * beatTicks(bi) / 6) * 6)
      ;(bars[bi].chords ??= []).push({ pos: Math.min(pos, bars[bi].units - 1), name: c.name, time: c.time })
    }
  }
  return { bars, keyFifths: inp.keyFifths, grid, swing, lead }
}
