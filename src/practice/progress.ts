import { t, currentLanguage } from '../utils/i18n'
import type { TakeRecord } from './take'

// ── Progress over days and weeks (practice stage 6) ─────────────────────────
// Read from the numbers already kept (practice/history.ts), nothing new saved.
// Like is compared with like: the same way of playing, hand, level and
// whether the song waited. Each day you practised becomes one point: how many
// notes were right, how close to the tempo it flowed (when the song waited),
// the tempo you practised at, how steady the timing was. Then a few plain
// sentences, good news first; what still needs work is said gently, as a
// suggestion, never as a fault. Pure: no store.

export interface Kind { way: TakeRecord['way']; hand: TakeRecord['hand']; level: number; wait: boolean }
const waited = (k: TakeRecord) => k.wait || k.way === 'wait'
// Wait for me is now Play along with Wait on (25. 11.): its earlier takes count as that
export const kindOf = (k: TakeRecord): Kind => k.way === 'wait'
  ? { way: 'practise', hand: 'B', level: 0, wait: true }
  : ({ way: k.way, hand: k.way === 'practise' ? k.hand : 'B', level: k.way === 'perform' ? k.level : 0, wait: waited(k) })
export const kindKey = (k: Kind) => `${k.way}|${k.hand}|${k.level}|${k.wait ? 1 : 0}`

export function kindName(k: Kind): string {
  if (k.way === 'wait') return t`Wait for me`
  if (k.way === 'perform') return t`Performance, level ${k.level}`
  const hand = k.hand === 'L' ? t`left hand` : k.hand === 'R' ? t`right hand` : t`both hands`
  return k.wait ? t`Play along, ${hand}, waiting` : t`Play along, ${hand}`
}

export interface Day {
  date: string               // YYYY-MM-DD, local
  at: number                 // the day's last take
  takes: number
  minutes: number
  right: number | null       // % of notes right (when the song kept going)
  pace: number | null        // % of the tempo it flowed at (when the song waited): 100 = in tempo
  speed: number | null       // the fastest % of the tempo you practised at that day
  spread: number | null      // how much the timing wandered, ms
  bars: Map<number, { notes: number; trouble: number }>
}

const pad = (n: number) => String(n).padStart(2, '0')
export const dayOf = (at: number) => { const d = new Date(at); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }

/** The takes of one kind, day by day, oldest first */
export function daysOf(takes: TakeRecord[]): Day[] {
  const by = new Map<string, TakeRecord[]>()
  for (const k of [...takes].sort((a, b) => a.at - b.at)) { const d = dayOf(k.at); by.set(d, [...(by.get(d) ?? []), k]) }
  return [...by.entries()].map(([date, ks]) => {
    const hit = ks.reduce((a, k) => a + k.counts.hit, 0), asked = ks.reduce((a, k) => a + k.counts.hit + k.counts.missed, 0)
    const atTempo = ks.reduce((a, k) => a + Math.max(0, k.to - k.from) * 100 / k.speed, 0), real = ks.reduce((a, k) => a + k.realSec, 0)
    const timed = ks.filter(k => !waited(k) && k.timing.n >= 4)
    const tn = timed.reduce((a, k) => a + k.timing.n, 0)
    const bars = new Map<number, { notes: number; trouble: number }>()
    for (const k of ks) for (const [b, h, m, x, w] of k.bars) {
      const v = bars.get(b) ?? { notes: 0, trouble: 0 }
      v.notes += h + m; v.trouble += m + x + w
      bars.set(b, v)
    }
    const w = waited(ks[0])
    return {
      date, at: ks[ks.length - 1].at, takes: ks.length, minutes: Math.round(real / 6) / 10,
      right: !w && asked ? Math.round(hit / asked * 100) : null,
      pace: w && real > 0 ? Math.min(100, Math.round(atTempo / real * 100)) : null,
      speed: Math.max(...ks.map(k => k.speed)),
      spread: tn ? Math.round(timed.reduce((a, k) => a + k.timing.spread * k.timing.n, 0) / tn) : null,
      bars,
    }
  })
}

/** Every kind of practice the song has, the most recent first */
export function kindsOf(takes: TakeRecord[]): { kind: Kind; takes: TakeRecord[] }[] {
  const by = new Map<string, { kind: Kind; takes: TakeRecord[] }>()
  for (const k of takes) { const kind = kindOf(k), key = kindKey(kind); const g = by.get(key) ?? { kind, takes: [] }; g.takes.push(k); by.set(key, g) }
  return [...by.values()].sort((a, b) => Math.max(...b.takes.map(k => k.at)) - Math.max(...a.takes.map(k => k.at)))
}

// ── Bars: a stretch that used to trip you up and doesn't now, and one that
// still does ──────────────────────────────────────────────────────────────────
function troubleRate(days: Day[], bar: number): { notes: number; rate: number } {
  let notes = 0, trouble = 0
  for (const d of days) { const v = d.bars.get(bar); if (v) { notes += v.notes; trouble += v.trouble } }
  return { notes, rate: notes ? trouble / notes : 0 }
}
function stretch(bars: number[], score: (b: number) => number, min: number): { from: number; to: number } | null {
  let best: { from: number; to: number; s: number } | null = null
  for (const a of bars) {
    if (score(a) <= 0) continue   // a stretch starts on a bar that counts
    let s = 0, last = a
    for (let b = a; b < a + 4; b++) { const v = score(b); if (v > 0) { s += v; last = b } }
    if (s >= min && (!best || s > best.s)) best = { from: a, to: last, s }
  }
  return best && { from: best.from, to: best.to }
}

export function progressWords(days: Day[]): string[] {
  if (!days.length) return []
  if (days.length < 2) return [t`Play it again on another day to see how it's coming along.`]
  const first = days[0], last = days[days.length - 1]
  const since = new Date(first.at).toLocaleDateString(currentLanguage, { day: 'numeric', month: 'long' })
  const lines = [t`Practised on ${days.length} days since ${since}.`]
  let good = 0
  const firstOf = <K extends 'right' | 'pace' | 'speed' | 'spread'>(key: K) => days.find(d => d[key] !== null)?.[key] ?? null
  const r0 = firstOf('right'), p0 = firstOf('pace'), s0 = firstOf('speed'), t0 = firstOf('spread')
  if (r0 !== null && last.right !== null) {
    if (r0 >= 95 && last.right >= 95) { lines.push(t`Nearly every note has been right from the start.`); good++ }
    else if (last.right - r0 >= 5) { lines.push(t`The right notes went from ${r0} % to ${last.right} %.`); good++ }
  }
  if (p0 !== null && last.pace !== null && last.pace - p0 >= 5) { lines.push(t`It flows much closer to the tempo now: from ${p0} % of it to ${last.pace} %.`); good++ }
  if (s0 !== null && last.speed !== null && last.speed > s0) { lines.push(t`You practise it at ${last.speed} % of the tempo now, up from ${s0} %.`); good++ }
  if (t0 !== null && last.spread !== null && t0 >= 30 && last.spread <= t0 * 0.8) { lines.push(t`Your timing is steadier than when you started.`); good++ }

  // bars: compare the earlier days with the latest
  const earlier = days.slice(0, -1)
  const allBars = [...new Set(days.flatMap(d => [...d.bars.keys()]))].sort((a, b) => a - b)
  const better = stretch(allBars, b => {
    const e = troubleRate(earlier, b), n = troubleRate([last], b)
    return e.notes >= 2 && n.notes >= 2 && e.rate >= 0.2 && n.rate <= e.rate / 2 ? e.rate - n.rate : 0
  }, 0.25)
  if (better) { lines.push(better.from === better.to ? t`Bar ${better.from} is much cleaner than it was.` : t`Bars ${better.from}–${better.to} are much cleaner than they were.`); good++ }
  if (!good) lines.push(t`It's holding steady: keep going, it settles with time.`)
  const still = stretch(allBars, b => {
    const e = troubleRate(earlier, b), n = troubleRate([last], b)
    return e.notes >= 2 && n.notes >= 2 && e.rate >= 0.2 && n.rate >= 0.2 ? n.rate : 0
  }, 0.25)
  if (still && !(better && still.from <= better.to && still.to >= better.from)) {
    lines.push(still.from === still.to ? t`Bar ${still.from} still trips you up now and then: worth a loop.` : t`Bars ${still.from}–${still.to} still trip you up now and then: worth a loop.`)
  }
  return lines
}

/** What the picture shows for this kind: notes right, or (when the song
 *  waited) how close to the tempo it flowed */
export const measureOf = (k: Kind): 'right' | 'pace' => (k.wait ? 'pace' : 'right')
