import { t } from '../utils/i18n'
import { rightShare, loopRounds, type TakeRecord } from './take'

// ── How it went, in words (practice stage 4) ─────────────────────────────────
// A few plain sentences after you stop: what went well first, then one thing
// worth another go, never a grade or a score (principle 1: never punish, only
// encourage). Comparisons with earlier takes are said only when they're good
// news. Whole sentences, each its own translatable string (gotcha G13).

export interface HowItWent {
  lines: string[]
  focus: { from: number; to: number } | null   // bars worth another go
}

const waited = (k: TakeRecord) => k.wait || k.way === 'wait'

/** The stretch of up to four bars that gave the most trouble: missed and extra
 *  notes, and the places the song had to wait (longer waits count more) */
export function troubleBars(k: TakeRecord, span = 4): { from: number; to: number; weight: number } | null {
  const w = new Map<number, number>()
  for (const [bar, , missed, extra, waits, waitSec] of k.bars) {
    const v = missed + extra + (waits ? waits + Math.min(waitSec, 4) / 2 : 0)
    if (v > 0) w.set(bar, v)
  }
  if (!w.size) return null
  let best: { from: number; to: number; weight: number } | null = null
  for (let a = k.fromBar; a <= k.toBar; a++) {
    if (!w.has(a)) continue
    let sum = 0, last = a
    for (let b = a; b < a + span && b <= k.toBar; b++) if (w.has(b)) { sum += w.get(b)!; last = b }
    if (!best || sum > best.weight + 1e-9) best = { from: a, to: last, weight: sum }
  }
  return best
}

/** The most recent earlier take played the same way, over much the same bars */
export function comparable(k: TakeRecord, earlier: TakeRecord[]): TakeRecord | null {
  for (let i = earlier.length - 1; i >= 0; i--) {
    const e = earlier[i]
    if (e.way !== k.way || e.hand !== k.hand || e.level !== k.level || waited(e) !== waited(k)) continue
    const overlap = Math.min(e.toBar, k.toBar) - Math.max(e.fromBar, k.fromBar) + 1
    if (overlap >= Math.max(1, (k.toBar - k.fromBar + 1) / 2)) return e
  }
  return null
}

export function howItWent(k: TakeRecord, opts: { earlier?: TakeRecord[]; session?: TakeRecord[]; rampedTo?: number | null; metronome?: boolean } = {}): HowItWent {
  const lines: string[] = []
  const share = rightShare(k.counts)
  const both = k.hand === 'B'

  // ── What went well ──
  if (waited(k)) {
    if (k.waits === 0 && k.counts.extra <= 1) lines.push(t`You played straight through: the song never had to wait for you.`)
    else if (k.waits === 1) lines.push(t`The song only had to wait for you once.`)
    else if (k.waits <= 3) lines.push(t`The song only had to wait for you a few times.`)
    else lines.push(t`You found every note, one step at a time.`)
  } else {
    const l = rightShare(k.L), r = rightShare(k.R)
    const lN = k.L.hit + k.L.missed, rN = k.R.hit + k.R.missed
    if (share >= 0.97 && k.counts.extra <= 1) lines.push(t`Lovely: nearly every note was right.`)
    else if (both && lN >= 6 && rN >= 6 && Math.max(l, r) >= 0.9 && Math.min(l, r) < 0.75) {
      lines.push(r >= l ? t`Most of the right hand was spot on.` : t`Most of the left hand was spot on.`)
      lines.push(r >= l ? t`The left hand is the one to give a little more time.` : t`The right hand is the one to give a little more time.`)
    }
    else if (share >= 0.85) lines.push(t`Most of the notes were right.`)
    else if (share >= 0.6) lines.push(t`Well over half of the notes were right, and it's coming together.`)
    else if (share >= 0.3) lines.push(t`A good start: the notes are beginning to fall into place.`)
    else lines.push(t`A first go: it gets easier each time through.`)
  }

  // ── Timing, when the song kept going ──
  if (!waited(k) && k.timing.n >= 8) {
    if (k.timing.mean <= -25) lines.push(t`You tended to play a little ahead of the beat.`)
    else if (k.timing.mean >= 25) lines.push(t`You tended to play a little behind the beat.`)
    else if (k.timing.spread >= 80) lines.push(opts.metronome ? t`The timing wandered a little; the metronome can help steady it.` : t`The timing wandered a little in places.`)
    else if (k.timing.spread < 60) lines.push(t`Your timing was steady and right with the beat.`)
  }

  // ── How long it took, when the song waited ──
  if (waited(k) && (k.to - k.from) * 100 / k.speed >= 4) {
    const own = k.way === 'wait' || k.speed === 100
    const pct = Math.round((k.overTempo - 1) * 10) * 10
    const times = (Math.round(k.overTempo * 2) / 2).toLocaleString()
    if (k.overTempo <= 1.1) lines.push(t`It flowed almost exactly in tempo.`)
    else if (k.overTempo <= 1.6) lines.push(own ? t`It took about ${pct} % longer than the song's own tempo.` : t`It took about ${pct} % longer than the tempo you set.`)
    else lines.push(own ? t`It took about ${times} times as long as the song's own tempo: speed comes by itself with practice.` : t`It took about ${times} times as long as the tempo you set: speed comes by itself with practice.`)
  }

  // ── Better than last time (good news only) ──
  const before = comparable(k, opts.earlier ?? [])
  if (before) {
    if (!waited(k) && share - rightShare(before.counts) >= 0.05) lines.push(t`More notes were right than last time.`)
    else if (waited(k)) {
      const perBar = (x: TakeRecord) => x.waits / Math.max(1, x.toBar - x.fromBar + 1)
      if (perBar(k) < perBar(before) * 0.75) lines.push(t`The song had to wait less than last time.`)
      else if (k.overTempo <= before.overTempo - 0.1) lines.push(t`And it flowed faster than last time.`)
    }
  }

  // ── Rounds of the loop, and the speed going up ──
  const { rounds, cleanRun } = loopRounds(opts.session ?? [k])
  if (rounds >= 2) {
    if (cleanRun === rounds) lines.push(t`${rounds} times round the loop, all without a slip.`)
    else if (cleanRun >= 2) lines.push(t`${rounds} times round the loop, the last ${cleanRun} without a slip.`)
    else lines.push(t`${rounds} times round the loop.`)
  }
  if (opts.rampedTo != null) lines.push(opts.rampedTo >= 100 ? t`That's the song's own tempo now: well done.` : t`The speed is up to ${opts.rampedTo} % now.`)

  // ── One thing worth another go ──
  let focus: HowItWent['focus'] = null
  const tb = troubleBars(k)
  const whole = tb && tb.from === k.fromBar && tb.to === k.toBar
  if (tb && tb.weight >= 2 && !whole) {
    focus = { from: tb.from, to: tb.to }
    if (waited(k)) lines.push(tb.from === tb.to ? t`The song waited longest in bar ${tb.from}; it's worth another go.` : t`The song waited longest in bars ${tb.from}–${tb.to}; they're worth another go.`)
    else lines.push(tb.from === tb.to ? t`Bar ${tb.from} is worth another go.` : t`Bars ${tb.from}–${tb.to} are worth another go.`)
  }
  return { lines, focus }
}

// ── The numbers as a table (CSV), one row per take ───────────────────────────
const csvCell = (v: string | number) => { const s = String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
export function takesCsv(takes: TakeRecord[]): string {
  const head = [t`Date`, t`Time`, t`Way`, t`Hand`, t`Level`, t`Waits for you`, t`Speed %`, t`From bar`, t`To bar`,
    t`Right`, t`Missed`, t`Extra`, t`Right, left hand`, t`Missed, left hand`, t`Right, right hand`, t`Missed, right hand`,
    t`Average timing (ms, + late)`, t`Timing spread (ms)`, t`Times it waited`, t`Seconds waited`, t`Time over tempo`]
  const way = (w: string) => (w === 'wait' ? t`Wait for me` : w === 'perform' ? t`Performance` : t`Play along`)
  const hand = (h: string) => (h === 'L' ? t`Left` : h === 'R' ? t`Right` : t`Both`)
  const pad = (n: number) => String(n).padStart(2, '0')
  const rows = takes.map(k => {
    const d = new Date(k.at)
    return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, `${pad(d.getHours())}:${pad(d.getMinutes())}`,
      way(k.way), hand(k.hand), k.way === 'perform' ? k.level : '', k.wait ? t`Yes` : t`No`, k.speed, k.fromBar, k.toBar,
      k.counts.hit, k.counts.missed, k.counts.extra, k.L.hit, k.L.missed, k.R.hit, k.R.missed,
      k.timing.n ? k.timing.mean : '', k.timing.n ? k.timing.spread : '', k.waits, k.waitSec, k.overTempo]
  })
  return [head, ...rows].map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n'
}
