// ── From MIDI to a readable score (practice stage 8) ─────────────────────────
// A MIDI file says when each key goes down and up, in seconds; a score says
// which note values, on which staff, in which bar. This turns one into the
// other: every note's place is read in beats (so tempo changes don't matter),
// rounded to the nearest sixteenth (or eighth, for a file played in by hand),
// the notes starting together in one hand become one chord, a held note that
// runs into the next one is cut there (one voice per staff: easier to read),
// and the lengths are written as note values that keep the beats visible,
// tied over beats and bar lines where needed. The right hand goes on the upper
// staff, the left on the lower. Pure: no store, no drawing (score/draw.ts).

export interface ScoreNote { midi: number; time: number; dur: number; hand: 'L' | 'R' }
export interface ScoreInput {
  notes: ScoreNote[]           // as they should be played (the key change already added)
  beatTimes: number[]          // every beat of the song, seconds
  barStarts: number[]          // every bar's start, seconds
  timeSigs: { num: number; den: number; time: number }[]
  duration: number
  keyFifths: number            // the key signature: sharps (+) or flats (−)
  grid?: 1 | 2                 // the finest value in sixteenths: 1 (sixteenths) or 2 (eighths)
}

export interface ScoreEvent {
  pos: number                  // in the bar, sixteenths
  len: number                  // sixteenths: 16 whole … 1 sixteenth (dotted values 12, 6, 3)
  keys: number[] | null        // the notes (MIDI), or null for a rest
  tie: boolean                 // tied over to the next event
  time: number                 // where in the song it starts, seconds
}
export interface ScoreBar {
  n: number                    // 1-based
  num: number; den: number     // time signature
  units: number                // its length in sixteenths
  start: number; end: number   // seconds
  R: ScoreEvent[]; L: ScoreEvent[]
}
export interface Score { bars: ScoreBar[]; keyFifths: number; grid: 1 | 2 }

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

/** How many of the notes start right on a sixteenth (in beats, so any tempo):
 *  close to 1 for a file written in a program, lower for one played in */
export function onTheGrid(notes: ScoreNote[], beatTimes: number[], den = 4): number {
  if (!notes.length) return 1
  const per = 16 / den
  let on = 0
  for (const n of notes) { const u = beatAt(beatTimes, n.time) * per; if (Math.abs(u - Math.round(u)) <= 0.12) on++ }
  return on / notes.length
}

// ── Writing a length as note values ──────────────────────────────────────────
// Biggest value first that starts where such a value may start, so the beats
// stay visible: a half note on beat 1 or 3, a quarter on a beat, and so on.
const VALUES = [16, 12, 8, 6, 4, 3, 2, 1]
const ALIGN: Record<number, number> = { 16: 16, 8: 8, 4: 4, 2: 2, 1: 1 }
// where a value may start: plain values on their own multiple; dotted ones in
// compound time (6/8, 12/8) on each dotted beat, otherwise only where twice
// their plain value would (a dotted quarter on beat 1 or 3 of 4/4)
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

// ── The score ────────────────────────────────────────────────────────────────
export function buildScore(inp: ScoreInput): Score {
  const grid = inp.grid ?? 1
  const beats = inp.beatTimes
  const sigAt = (t: number) => { let s = inp.timeSigs[0] ?? { num: 4, den: 4, time: 0 }; for (const x of inp.timeSigs) if (x.time <= t + 1e-6) s = x; return s }
  const bars: ScoreBar[] = inp.barStarts.map((start, i) => {
    const sig = sigAt(start)
    return { n: i + 1, num: sig.num, den: sig.den, units: Math.max(1, Math.round(sig.num * 16 / sig.den)), start, end: inp.barStarts[i + 1] ?? inp.duration, R: [], L: [] }
  })
  if (!bars.length) return { bars, keyFifths: inp.keyFifths, grid }
  // each bar's first beat, and where a sixteenth falls in seconds
  const barBeat = bars.map(b => beatAt(beats, b.start))
  const unitTime = (bi: number, u: number) => timeAt(beats, barBeat[bi] + u * bars[bi].den / 16)
  // a place in the song as (bar, sixteenth), rounded to the grid
  const place = (t: number): number => {
    const b = beatAt(beats, t)
    let lo = 0, hi = bars.length - 1
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (barBeat[m] <= b + 1e-6) lo = m; else hi = m - 1 }
    const u = Math.round((b - barBeat[lo]) * 16 / bars[lo].den / grid) * grid
    // as one long count of sixteenths from bar 1
    return offsets[lo] + Math.max(0, u)
  }
  const offsets: number[] = []
  bars.reduce((acc, b, i) => { offsets[i] = acc; return acc + b.units }, 0)
  const total = offsets[bars.length - 1] + bars[bars.length - 1].units
  const barOfUnit = (u: number) => { let lo = 0, hi = bars.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (offsets[m] <= u) lo = m; else hi = m - 1 } return lo }

  for (const hand of ['R', 'L'] as const) {
    // the hand's notes as chords: start → its keys and the furthest end
    const chords = new Map<number, { keys: Set<number>; end: number }>()
    for (const n of inp.notes) {
      if (n.hand !== hand) continue
      const s = Math.min(place(n.time), total - grid)
      const e = Math.max(s + grid, Math.min(place(n.time + n.dur), total))
      const c = chords.get(s) ?? { keys: new Set<number>(), end: s }
      c.keys.add(n.midi); c.end = Math.max(c.end, e)
      chords.set(s, c)
    }
    const starts = [...chords.keys()].sort((a, b) => a - b)
    // one voice: each chord lasts until the next one starts (or it ends)
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

    // cut at bar lines and into note values, tied where a note goes on
    for (const sp of spans) {
      let u = sp.s
      while (u < sp.e) {
        const bi = barOfUnit(u), bar = bars[bi]
        const barEnd = offsets[bi] + bar.units
        const upto = Math.min(sp.e, barEnd)
        const pos = u - offsets[bi]
        const parts = splitLength(pos, upto - u, bar.units, bar.den === 8 && bar.num % 3 === 0)
        let p = pos
        parts.forEach((len, k) => {
          const last = k === parts.length - 1 && upto === sp.e
          bar[hand].push({ pos: p, len, keys: sp.keys, tie: !!sp.keys && !last, time: unitTime(bi, p) })
          p += len
        })
        u = upto
      }
    }
    // a bar with nothing but rests in a hand: one whole-bar rest
    for (const bar of bars) if (bar[hand].every(e => !e.keys)) bar[hand] = [{ pos: 0, len: bar.units, keys: null, tie: false, time: bar.start }]
  }
  return { bars, keyFifths: inp.keyFifths, grid }
}
