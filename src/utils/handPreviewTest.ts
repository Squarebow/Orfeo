import { estimateHandAccuracy, getLowConfidencePassages, passageKey, markPassageSeen, isPassageSeen } from './handPreview'
import { RESTORED_CONFIDENCE } from './handMetadata'
import type { ParsedNote } from '../types'

const note = (time: number, handConfidence: number | undefined, hand: 'L' | 'R' | undefined = 'R'): ParsedNote =>
  ({ midi: 60, time, duration: 0.2, velocity: 0.7, trackIndex: 0, hand, handConfidence } as ParsedNote)

export function runHandPreviewTest(): number {
  console.group('[handPreview] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // a guess Orfeo was sure about all through: about 95 %, never "100 %"
  check(estimateHandAccuracy(Array.from({ length: 50 }, (_, i) => note(i, 1))) === 95, 'all sure → about 95 %')
  // mostly unsure (a song where the guess struggled): a lower, rounded figure
  const mixed = [...Array.from({ length: 20 }, (_, i) => note(i, 0.95)), ...Array.from({ length: 80 }, (_, i) => note(20 + i, 0.3))]
  const est = estimateHandAccuracy(mixed)
  check(est !== null && est % 5 === 0 && est >= 75 && est < 95, `mixed → a rounded figure below 95, got ${est}`)
  // hands restored from a saved song carry no confidence: no figure
  check(estimateHandAccuracy([note(0, RESTORED_CONFIDENCE), note(1, RESTORED_CONFIDENCE)]) === null, 'restored hands → no figure')
  check(estimateHandAccuracy([note(0, undefined, undefined)]) === null, 'no hands → no figure')

  // passages, and looked-at memory
  const ps = getLowConfidencePassages([note(0, 0.2), note(0.5, 0.3), note(5, 0.9), note(10, 0.1)])
  check(ps.length === 2, `two passages worth a look, got ${ps.length}`)
  const key = passageKey('C:/Songs/Song.mid', 3)
  check(!isPassageSeen(key, ps[1].start), 'not looked at yet')
  markPassageSeen(key, ps[1].start)
  check(isPassageSeen(key, ps[1].start) && !isPassageSeen(key, ps[0].start), 'only the passage jumped to counts as looked at')

  console.log(`handPreview: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
