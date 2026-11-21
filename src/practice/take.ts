import type { Summary, Hand, Tally } from './matcher'
import type { PracticeWay, PracticeHand } from './practiceMode'

// ── What a take keeps (practice stage 4) ─────────────────────────────────────
// A take is one stretch of playing: from Play (or a jump, or the loop going
// round) to a pause, the song's end or the next jump. Its numbers are kept
// per song (practice/history.ts), never the sound. Pure: no store, no clock.

export type TakeEnd = 'pause' | 'end' | 'loop' | 'jump' | 'leave' | 'change'

export interface TakeRecord {
  at: number                 // when it ended (Date.now())
  way: PracticeWay
  hand: PracticeHand
  level: 1 | 2 | 3
  wait: boolean              // the song waited for your notes
  ramp: boolean              // Speed up gradually was on
  speed: number              // % of the song's own tempo
  from: number; to: number   // song seconds
  fromBar: number; toBar: number
  end: TakeEnd
  realSec: number            // how long it took, waiting included
  overTempo: number          // realSec ÷ the time it takes at the speed played: 1 = in tempo
  counts: Tally
  L: Tally; R: Tally
  bars: [bar: number, hit: number, missed: number, extra: number, waits: number, waitSec: number][]
  timing: { mean: number; spread: number; n: number }   // real ms over the right notes, + late
  waits: number; waitSec: number
  // the notes you played (and the ones missed), for the review: kept for the last few sessions only
  // [song time, key, velocity, 0 right / 1 extra / 2 missed, ms early (−) or late (+)]
  played?: [number, number, number, 0 | 1 | 2, number][]
}

export interface Hold { bar: number; sec: number }
export type PlayedLog = NonNullable<TakeRecord['played']>

export interface TakeInput {
  summary: Summary
  ratio: number              // the tempo played ÷ the song's own
  from: number; to: number
  barOf: (t: number) => number
  realSec: number
  holds: Hold[]
  played: PlayedLog
  end: TakeEnd
  at: number
  meta: Pick<TakeRecord, 'way' | 'hand' | 'level' | 'wait' | 'ramp'>
}

const r1 = (x: number) => Math.round(x * 10) / 10

export function buildTake(x: TakeInput): TakeRecord {
  const { summary: s, ratio } = x
  const bars = new Map<number, [number, number, number, number, number, number]>()
  const row = (b: number) => { let v = bars.get(b); if (!v) { v = [b, 0, 0, 0, 0, 0]; bars.set(b, v) } return v }
  for (const [b, t] of s.perBar) { const v = row(b); v[1] = t.hit; v[2] = t.missed; v[3] = t.extra }
  for (const h of x.holds) { const v = row(h.bar); v[4]++; v[5] = r1(v[5] + h.sec) }
  const atTempo = Math.max(0, x.to - x.from) / ratio
  const ms = (songSec: number) => Math.round(songSec / ratio * 1000)
  return {
    at: x.at, ...x.meta, wait: x.meta.wait || x.holds.length > 0,
    speed: Math.round(ratio * 100),
    from: r1(x.from), to: r1(x.to), fromBar: x.barOf(x.from), toBar: x.barOf(Math.max(x.from, x.to - 1e-3)),
    end: x.end,
    realSec: r1(x.realSec),
    overTempo: atTempo > 0 ? Math.round(x.realSec / atTempo * 100) / 100 : 1,
    counts: { hit: s.hit, missed: s.missed, extra: s.extra },
    L: { ...s.perHand.L }, R: { ...s.perHand.R },
    bars: [...bars.values()].sort((a, b) => a[0] - b[0]),
    timing: { mean: ms(s.meanOffset), spread: ms(s.spread), n: s.hitOffsets.length },
    waits: x.holds.length, waitSec: r1(x.holds.reduce((a, h) => a + h.sec, 0)),
    played: x.played,
  }
}

/** Enough of your part went by to say anything about it (a round of a
 *  short loop always counts) */
export const worthKeeping = (t: TakeRecord) => t.counts.hit + t.counts.missed >= (t.end === 'loop' ? 1 : 8)

/** Played through without a slip: what Speed up gradually counts */
export const cleanTake = (t: TakeRecord) => t.counts.missed === 0 && t.counts.extra <= 1 && t.waits === 0

/** Right notes out of all the notes you were asked for */
export const rightShare = (c: Tally) => (c.hit + c.missed > 0 ? c.hit / (c.hit + c.missed) : 1)

// ── Speed up gradually: 60 % to start, 5 % more after every two clean rounds,
// up to the song's own tempo (agreed 18. 11., to be tuned by playing) ─────────
export const RAMP_START = 60
export const RAMP_STEP = 5
export const RAMP_ROUNDS = 2
export interface RampState { speed: number; streak: number }
export function rampAfterRound(r: RampState, clean: boolean): RampState & { raised: boolean } {
  if (!clean) return { speed: r.speed, streak: 0, raised: false }
  const streak = r.streak + 1
  if (streak < RAMP_ROUNDS || r.speed >= 100) return { speed: r.speed, streak, raised: false }
  return { speed: Math.min(100, r.speed + RAMP_STEP), streak: 0, raised: true }
}

// ── Rounds of the loop ───────────────────────────────────────────────────────
/** The rounds just played: the takes that went all the way round the loop,
 *  one after another, ending with the last of `takes` that did */
export function loopRounds(takes: TakeRecord[]): { rounds: number; cleanRun: number } {
  let i = takes.length - 1
  while (i >= 0 && takes[i].end !== 'loop') i--
  if (i < 0) return { rounds: 0, cleanRun: 0 }
  const from = takes[i].from
  let rounds = 0, cleanRun = 0, stillClean = true
  for (; i >= 0 && takes[i].end === 'loop' && Math.abs(takes[i].from - from) < 0.15; i--) {
    rounds++
    if (stillClean && cleanTake(takes[i])) cleanRun++; else stillClean = false
  }
  return { rounds, cleanRun }
}
