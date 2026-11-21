import { marksFor, countMarks, passageFrom, passageBefore, FINE_MS } from './review'
import type { TakeRecord } from './take'

export function runReviewTest(): number {
  console.group('[review] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // ── each note's mark ──
  const take = { speed: 50, played: [
    [1.0, 60, 80, 0, 10, 0.4],     // right, 10 ms late: fine
    [2.03, 62, 70, 0, 60, 0.3],    // right, 60 ms late (at half speed: 0.03 s of the song)
    [2.95, 64, 70, 0, -100],       // right, 100 ms early
    [3.5, 61, 60, 1, 0, 0.2],      // an extra key
    [4.0, 65, 0, 2, 0, 0.5],       // missed
  ] } as unknown as TakeRecord
  const m = marksFor(take)
  check(m.map(x => x.kind).join() === 'fine,late,early,extra,missed', 'fine, late, early, extra, missed')
  check(Math.abs(m[1].exp - 2.0) < 1e-9, 'a late note points back to its own place (60 ms at half speed = 0.03 s of the song)')
  check(Math.abs(m[2].exp - 3.0) < 1e-9 && m[2].dur === 0.25, 'an early one too; no length kept: a short note')
  check(m[4].t === 4 && m[4].dur === 0.5, 'a missed note sits at its own place, its own length')
  check(FINE_MS === 50, 'fine within 50 ms')
  const c = countMarks(m, 0, 3.5)
  check(c.fine === 1 && c.late === 1 && c.early === 1 && c.extra === 0 && c.missed === 0, 'counted by the bars they belong to')

  // ── passages ──
  const bars = { starts: [0, 2, 4, 6, 8, 10, 12, 14], duration: 16 }   // eight bars of 2 s
  check(JSON.stringify(passageFrom('bar', 3, bars, 4.8, 1, 8)) === '{"from":3,"to":3}', 'a bar at a time')
  check(JSON.stringify(passageFrom('screen', 3, bars, 4.8, 1, 8)) === '{"from":3,"to":4}', 'a screenful: the whole bars that fit (two of 2 s in 4.8 s)')
  check(JSON.stringify(passageFrom('screen', 7, bars, 4.8, 1, 8)) === '{"from":7,"to":8}', 'the last bars')
  check(JSON.stringify(passageFrom('screen', 3, bars, 1, 1, 8)) === '{"from":3,"to":3}', 'a bar longer than the screen: still one bar')
  check(JSON.stringify(passageFrom('screen', 1, bars, 9, 2, 5)) === '{"from":2,"to":5}', 'kept to the bars the take covered')
  check(JSON.stringify(passageBefore('screen', 5, bars, 4.8, 1, 8)) === '{"from":3,"to":4}', 'back a screenful')
  check(JSON.stringify(passageBefore('bar', 5, bars, 4.8, 1, 8)) === '{"from":4,"to":4}', 'back a bar')
  check(JSON.stringify(passageBefore('screen', 2, bars, 4.8, 1, 8)) === '{"from":1,"to":1}', 'back to the first bar')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
