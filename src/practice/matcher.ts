// ── Orfeo listens: pairing what you play with your part (practice stage 2) ───
// Pure: no store, no clock. Every note of your part is "expected" at its place
// in the song; every key you press is "played" at the place in the song where
// you pressed it. A played note pairs with the nearest expected note of the
// same pitch that is still unpaired and close enough in time; otherwise it is
// extra. An expected note nobody paired by the time the song is past it is
// missed. Chords in any order, rolled chords and repeated notes all fall out
// of "nearest unpaired of the same pitch".

export type Hand = 'L' | 'R'

export interface Expected {
  midi: number          // as you should play it (the key change already added)
  time: number          // in the song, seconds
  hand: Hand
  bar: number           // 1-based
  dur?: number          // how long it's held, song seconds (the virtual pianist)
}
export interface Played { midi: number; time: number; vel?: number }

export type Outcome =
  | { kind: 'hit'; exp: Expected; played: Played; offset: number }   // offset: song seconds, + late, − early
  | { kind: 'missed'; exp: Expected }
  | { kind: 'extra'; played: Played; bar: number }

export interface Tally { hit: number; missed: number; extra: number }
export interface Summary extends Tally {
  pending: number
  perHand: Record<Hand, Tally>
  perBar: Map<number, Tally>
  meanOffset: number        // song seconds over the hits, + late
}

const tally = (): Tally => ({ hit: 0, missed: 0, extra: 0 })

export class Matcher {
  private exp: Expected[]
  private state: ('pending' | 'hit' | 'missed' | 'skip')[]
  private extras: { played: Played; bar: number }[] = []
  private offsets: (number | null)[]
  private outOfReach: boolean[]
  private nextMiss = 0                     // first index that may still be pending
  constructor(expected: Expected[], private window: number, private barOf: (t: number) => number = () => 1) {
    this.exp = [...expected].sort((a, b) => a.time - b.time || a.midi - b.midi)
    this.state = this.exp.map(() => 'pending')
    this.offsets = this.exp.map(() => null)
    this.outOfReach = this.exp.map(() => false)
  }

  get expected(): readonly Expected[] { return this.exp }

  /** A key pressed at `p.time` in the song */
  play(p: Played): Outcome {
    let best = -1, bestD = Infinity
    // binary search to the window's start, then scan through it
    let lo = 0, hi = this.exp.length
    while (lo < hi) { const m = (lo + hi) >> 1; if (this.exp[m].time < p.time - this.window) lo = m + 1; else hi = m }
    for (let i = lo; i < this.exp.length && this.exp[i].time <= p.time + this.window; i++) {
      if (this.state[i] !== 'pending' || this.exp[i].midi !== p.midi) continue
      const d = Math.abs(this.exp[i].time - p.time)
      if (d < bestD) { best = i; bestD = d }
    }
    if (best < 0) {
      const bar = this.barOf(p.time)
      this.extras.push({ played: p, bar })
      return { kind: 'extra', played: p, bar }
    }
    this.state[best] = 'hit'
    const offset = p.time - this.exp[best].time
    this.offsets[best] = offset
    return { kind: 'hit', exp: this.exp[best], played: p, offset }
  }

  /** The song has reached `time`: notes left unplayed behind it are missed */
  advance(time: number): Outcome[] {
    const out: Outcome[] = []
    let i = this.nextMiss
    for (; i < this.exp.length && this.exp[i].time + this.window < time; i++) {
      if (this.state[i] === 'pending') { this.state[i] = 'missed'; out.push({ kind: 'missed', exp: this.exp[i] }) }
    }
    this.nextMiss = i
    return out
  }

  /** Playing from `time` (a seek, the loop going round): a fresh take from
   *  there. What lies before isn't part of it; everything after is to play */
  restartAt(time: number): void {
    for (let i = 0; i < this.exp.length; i++) {
      const inTake = this.exp[i].time >= time - 1e-6
      this.state[i] = inTake && !this.outOfReach[i] ? 'pending' : 'skip'
      this.offsets[i] = null
    }
    this.extras = []
    this.nextMiss = 0
    while (this.nextMiss < this.exp.length && this.exp[this.nextMiss].time < time - 1e-6) this.nextMiss++
  }

  /** Notes your keyboard can't reach: neither expected nor missed */
  skip(pred: (e: Expected) => boolean, forGood = false): number {
    let n = 0
    this.exp.forEach((e, i) => { if (pred(e) && this.state[i] === 'pending') { this.state[i] = 'skip'; if (forGood) this.outOfReach[i] = true; n++ } })
    return n
  }

  summary(): Summary {
    const s: Summary = { ...tally(), pending: 0, perHand: { L: tally(), R: tally() }, perBar: new Map(), meanOffset: 0 }
    const bar = (b: number) => { let t = s.perBar.get(b); if (!t) { t = tally(); s.perBar.set(b, t) } return t }
    this.exp.forEach((e, i) => {
      const st = this.state[i]
      if (st === 'pending') { s.pending++; return }
      if (st === 'skip') return
      s[st]++; s.perHand[e.hand][st]++; bar(e.bar)[st]++
    })
    for (const x of this.extras) { s.extra++; bar(x.bar).extra++ }
    const offs = this.offsets.filter((o, i): o is number => o !== null && this.state[i] === 'hit')
    s.meanOffset = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0
    return s
  }
}
