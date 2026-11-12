import { fitKeyboardSize, isKeyRange, keyCount, pressKey, rangeLabel, type RangeStep } from './keyboardRange'

export function runKeyboardRangeTest(): number {
  console.group('[keyboardRange] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // Common keyboards and the on-screen size they get
  check(fitKeyboardSize({ low: 21, high: 108 }) === 88, '88 keys A0–C8 → 88')
  check(fitKeyboardSize({ low: 36, high: 96 }) === 61, '61 keys C2–C7 → 61')
  check(fitKeyboardSize({ low: 28, high: 103 }) === 73, '76 keys E1–G7 → 73')
  check(fitKeyboardSize({ low: 36, high: 84 }) === 61, '49 keys C2–C6 → 61')
  check(fitKeyboardSize({ low: 48, high: 72 }) === 61, '25 keys C3–C5 → 61')
  check(fitKeyboardSize({ low: 48, high: 108 }) === 88, '61 keys an octave up (C3–C8) → 88')
  check(fitKeyboardSize({ low: 29, high: 96 }) === 73, 'F1–C7 → 73')
  check(fitKeyboardSize({ low: 0, high: 127 }) === 88, 'beyond 88 → 88')

  check(keyCount({ low: 21, high: 108 }) === 88, '88 counted')
  check(keyCount({ low: 36, high: 96 }) === 61, '61 counted')

  // Saved values
  check(isKeyRange({ low: 36, high: 96 }), 'valid range')
  check(!isKeyRange({ low: 96, high: 36 }), 'reversed is invalid')
  check(!isKeyRange({ low: 60, high: 60 }), 'one key is invalid')
  check(!isKeyRange({ low: -1, high: 96 }) && !isKeyRange({ low: 36, high: 128 }), 'outside MIDI is invalid')
  check(!isKeyRange({ low: '36', high: 96 }) && !isKeyRange(null) && !isKeyRange('x'), 'wrong types are invalid')

  // The two presses
  let s: RangeStep = { step: 'low' }
  s = pressKey(s, 36)
  check(s.step === 'high' && s.low === 36, 'first press is the lowest')
  s = pressKey(s, 36)
  check(s.step === 'high', 'same key again waits')
  s = pressKey(s, 96)
  check(s.step === 'done' && s.range.low === 36 && s.range.high === 96, 'second press is the highest')
  check(pressKey(s, 50) === s, 'done stays done')
  const swapped = pressKey(pressKey({ step: 'low' }, 96), 36)
  check(swapped.step === 'done' && swapped.range.low === 36 && swapped.range.high === 96, 'highest first is swapped')

  // Labels
  check(rangeLabel({ low: 36, high: 96 }, 'english', 'flat') === 'C2–C7', `english label ${rangeLabel({ low: 36, high: 96 }, 'english', 'flat')}`)
  check(rangeLabel({ low: 21, high: 108 }, 'hidden', 'flat') === 'A0–C8', 'hidden names fall back to letters')
  check(rangeLabel({ low: 36, high: 96 }, 'solfege', 'flat') === 'Do2–Do7', 'solfège label')

  console.log(`keyboardRange: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
