import { pianistPlan, noteForCode } from './devPlay'
import { Matcher, type Expected } from './matcher'

// eight steps: a left-hand bass note and a right-hand two-note chord each beat
const song: Expected[] = Array.from({ length: 8 }, (_, i) => [
  { midi: 36 + i, time: i * 0.5, hand: 'L' as const, bar: 1 + (i >> 2), dur: 0.4 },
  { midi: 60 + i, time: i * 0.5, hand: 'R' as const, bar: 1 + (i >> 2), dur: 0.4 },
  { midi: 64 + i, time: i * 0.5, hand: 'R' as const, bar: 1 + (i >> 2), dur: 0.4 },
]).flat()

function judge(style: Parameters<typeof pianistPlan>[1]) {
  const m = new Matcher(song, 0.25)
  for (const p of pianistPlan(song, style)) m.play({ midi: p.midi, time: p.time })
  m.advance(99)
  return m.summary()
}

export function runDevPlayTest(): number {
  console.group('[devPlay] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const spot = judge('spot')
  check(spot.hit === 24 && spot.missed === 0 && spot.extra === 0 && Math.abs(spot.meanOffset) < 1e-9, 'spot on: every note right, on time')
  check(judge('early').hit === 24 && judge('early').meanOffset < -0.05, 'early: every note right, early')
  check(judge('late').meanOffset > 0.05, 'late: late')
  const wrong = judge('wrong')
  check(wrong.extra > 0 && wrong.extra === wrong.missed, 'wrong notes: each one extra, and its right note missed')
  const missed = judge('missed')
  check(missed.missed > 0 && missed.extra === 0, 'missed notes: missed, nothing extra')
  const one = judge('oneHand')
  check(one.perHand.L.missed === 8 && one.perHand.R.hit === 16, 'one hand only: the left hand all missed')
  check(judge('rolled').hit === 24, 'rolled chords still count as right')
  const plan = pianistPlan(song, 'rolled')
  check(plan.filter(p => p.time > 0 && p.time < 0.2).length === 2, 'rolled: a chord spread out')
  const hes = pianistPlan(song, 'hesitate')
  check(hes.some(p => p.time === 3 + 0.6) && hes.some(p => p.time === 3.5), 'hesitating: the 7th step late, the 8th back in time')
  check(pianistPlan(song, 'off').length === 0, 'off: plays nothing')

  check(noteForCode('KeyQ', 4) === 60 && noteForCode('KeyZ', 4) === 48 && noteForCode('Digit2', 4) === 61 && noteForCode('KeyA', 4) === null, 'computer keys: Q is middle C, Z an octave lower')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
