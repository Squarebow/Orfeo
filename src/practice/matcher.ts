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
  finger?: number       // your fingering, 1 the thumb (the key lights)
  track?: number        // the track it's in, and the note's own hand: the key lights in the colour
  noteHand?: Hand       // the piano roll gives the note (liveHandColor)
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
  spread: number            // how much the timing wandered: the hits' standard deviation, song seconds
  hitOffsets: { bar: number; hand: Hand; offset: number }[]   // each right note's timing, in song order
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

  /** The tempo changed: the same real-time window is a different stretch of the song */
  setWindow(w: number): void { this.window = w }

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

  /** Note `i` of `expected` is played, or not asked for in this take */
  isDone(i: number): boolean { return this.state[i] === 'hit' || this.state[i] === 'skip' }

  summary(): Summary {
    const s: Summary = { ...tally(), pending: 0, perHand: { L: tally(), R: tally() }, perBar: new Map(), meanOffset: 0, spread: 0, hitOffsets: [] }
    const bar = (b: number) => { let t = s.perBar.get(b); if (!t) { t = tally(); s.perBar.set(b, t) } return t }
    this.exp.forEach((e, i) => {
      const st = this.state[i]
      if (st === 'pending') { s.pending++; return }
      if (st === 'skip') return
      s[st]++; s.perHand[e.hand][st]++; bar(e.bar)[st]++
    })
    for (const x of this.extras) { s.extra++; bar(x.bar).extra++ }
    this.exp.forEach((e, i) => { const o = this.offsets[i]; if (o !== null && this.state[i] === 'hit') s.hitOffsets.push({ bar: e.bar, hand: e.hand, offset: o }) })
    const offs = s.hitOffsets.map(h => h.offset)
    s.meanOffset = offs.length ? offs.reduce((a, b) => a + b, 0) / offs.length : 0
    s.spread = offs.length > 1 ? Math.sqrt(offs.reduce((a, b) => a + (b - s.meanOffset) ** 2, 0) / offs.length) : 0
    return s
  }
}

// ── The waiting (practice stage 3) ───────────────────────────────────────────
// Your part in steps: notes starting together (within `chordGrace`, as Step
// Through groups them) are one step. The song may run `grace` past a step's
// place (you hear the music a little after it's sent); beyond that, a step not
// yet played holds the song until every one of its notes is down, in any
// order, one at a time if you like. Wrong notes don't move it on.
export class StepWaiter {
  readonly steps: { time: number; idx: number[] }[] = []
  private cur = 0
  setGrace(g: number): void { this.grace = g }
  constructor(private m: Matcher, private grace: number, chordGrace: number) {
    m.expected.forEach((e, i) => {
      const last = this.steps[this.steps.length - 1]
      if (last && e.time - last.time <= chordGrace) last.idx.push(i)
      else this.steps.push({ time: e.time, idx: [i] })
    })
  }
  private done(k: number) { return this.steps[k].idx.every(i => this.m.isDone(i)) }
  /** Playing from `time`: the next step is the first at or after it */
  reset(time: number): void {
    let lo = 0, hi = this.steps.length
    while (lo < hi) { const mid = (lo + hi) >> 1; if (this.steps[mid].time < time - 1e-6) lo = mid + 1; else hi = mid }
    this.cur = lo
  }
  /** The song has reached `clock`: the step to wait at, or null to play on */
  check(clock: number): { time: number; notes: number[] } | null {
    while (this.cur < this.steps.length && this.steps[this.cur].time + this.grace <= clock) {
      if (!this.done(this.cur)) return { time: this.steps[this.cur].time, notes: this.steps[this.cur].idx.map(i => this.m.expected[i].midi) }
      this.cur++
    }
    return null
  }
}
