import { daysOf, kindsOf, kindName, progressWords, kindOf } from './progress'
import type { TakeRecord } from './take'

const DAY = 86400000
const base = new Date(2026, 10, 1, 18, 0).getTime()
function take(day: number, p: Partial<TakeRecord> = {}): TakeRecord {
  return {
    at: base + day * DAY, way: 'practise', hand: 'R', level: 1, wait: false, ramp: false, speed: 100, from: 0, to: 16, fromBar: 1, toBar: 8,
    end: 'pause', realSec: 16, overTempo: 1, counts: { hit: 30, missed: 2, extra: 0 }, L: { hit: 0, missed: 0, extra: 0 }, R: { hit: 30, missed: 2, extra: 0 },
    bars: [[1, 4, 0, 0, 0, 0], [2, 4, 0, 0, 0, 0], [3, 2, 2, 0, 0, 0], [4, 4, 0, 0, 0, 0]], timing: { mean: 0, spread: 40, n: 30 }, waits: 0, waitSec: 0, ...p,
  }
}

export function runProgressTest(): number {
  console.group('[progress] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // ── kinds: like with like ──
  const mixed = [take(0), take(0, { hand: 'L' }), take(1, { way: 'wait', hand: 'B', wait: true }), take(2, { way: 'perform', level: 2, hand: 'B' })]
  const kinds = kindsOf(mixed)
  check(kinds.length === 4 && kinds[0].kind.way === 'perform', 'four kinds, the latest first')
  check(kindName(kindOf(mixed[0])) === 'Play along, right hand' && kindName(kindOf(mixed[2])) === 'Play along, both hands, waiting' && kindName(kindOf(mixed[3])) === 'Performance, level 2', 'named in words')

  // ── days ──
  const d = daysOf([take(0, { counts: { hit: 6, missed: 4, extra: 0 } }), take(0, { counts: { hit: 14, missed: 6, extra: 0 } }), take(3)])
  check(d.length === 2 && d[0].takes === 2 && d[0].right === 67, 'one point a day: 20 of 30 right = 67 %')
  check(d[1].right === 94 && d[0].pace === null, 'right notes when the song kept going, no pace')
  const w = daysOf([take(0, { way: 'wait', hand: 'B', wait: true, realSec: 32 })])
  check(w[0].pace === 50 && w[0].right === null, 'when the song waited: twice as long = 50 % of the tempo')
  const s = daysOf([take(0, { speed: 60, counts: { hit: 30, missed: 0, extra: 0 } }), take(0, { speed: 70, counts: { hit: 10, missed: 10, extra: 0 } })])
  check(s[0].speed === 70, 'the fastest tempo practised that day')

  // ── words ──
  check(progressWords(daysOf([take(0)])).join().includes('another day'), 'one day: come back another day')
  const rising = [
    take(0, { counts: { hit: 20, missed: 12, extra: 0 }, bars: [[1, 4, 0, 0, 0, 0], [3, 1, 3, 1, 0, 0], [4, 1, 3, 0, 0, 0], [6, 2, 2, 0, 0, 0]], timing: { mean: 0, spread: 90, n: 20 }, speed: 60 }),
    take(4, { counts: { hit: 31, missed: 1, extra: 0 }, bars: [[1, 4, 0, 0, 0, 0], [3, 4, 0, 0, 0, 0], [4, 4, 0, 0, 0, 0], [6, 2, 2, 0, 0, 0]], timing: { mean: 0, spread: 40, n: 31 }, speed: 75 }),
  ]
  const lines = progressWords(daysOf(rising))
  check(lines[0].startsWith('Practised on 2 days since'), 'how many days, since when')
  check(lines.includes('The right notes went from 63 % to 97 %.'), 'right notes going up')
  check(lines.includes('You practise it at 75 % of the tempo now, up from 60 %.'), 'the tempo going up')
  check(lines.includes('Your timing is steadier than when you started.'), 'steadier timing')
  check(lines.includes('Bars 3–4 are much cleaner than they were.'), 'the bars that got better')
  check(lines.includes('Bar 6 still trips you up now and then: worth a loop.'), 'the bar that still needs a loop, said gently')
  const flat = progressWords(daysOf([take(0), take(2)]))
  check(flat.some(l => l.includes('holding steady')) && !flat.some(l => /worse|down|less/.test(l)), 'no better, no worse: encouragement, never a step back')
  const pace = progressWords(daysOf([take(0, { way: 'wait', hand: 'B', wait: true, realSec: 32 }), take(5, { way: 'wait', hand: 'B', wait: true, realSec: 20 })]))
  check(pace.includes('It flows much closer to the tempo now: from 50 % of it to 80 %.'), 'Wait for me: closer to the tempo')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
