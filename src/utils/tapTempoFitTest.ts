import { fitTaps } from './tapTempoFit'

export function runTapTempoFitTest(): number {
  console.group('[tapTempoFit] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol
  const steady = (start: number, p: number, n: number) => Array.from({ length: n }, (_, i) => start + i * p)

  // exact steady taps
  const f1 = fitTaps(steady(10, 0.65, 8))
  check(!!f1 && near(f1.period, 0.65, 1e-9) && near(f1.anchor, 10, 1e-9) && f1.accepted === 8, `steady: ${JSON.stringify(f1)}`)

  // ±15 ms deterministic jitter
  const jit = [0, 12, -15, 9, -6, 14, -11, 3, -8, 10]
  const f2 = fitTaps(steady(5, 0.65, 10).map((t, i) => t + jit[i] / 1000))
  check(!!f2 && near(f2.period, 0.65, 0.0065) && near(f2.anchor, 5, 0.02), `jitter: ${JSON.stringify(f2)}`)

  // one missed tap (beat 3 skipped) — period must not halve, anchor stays
  const missed = steady(2, 0.6, 8).filter((_, i) => i !== 3)
  const f3 = fitTaps(missed)
  check(!!f3 && near(f3.period, 0.6, 1e-6) && f3.accepted === 7, `missed: ${JSON.stringify(f3)}`)

  // one doubled tap (40 ms after beat 2) — dropped
  const doubled = steady(2, 0.6, 8); doubled.splice(3, 0, doubled[2] + 0.04)
  const f4 = fitTaps(doubled)
  check(!!f4 && near(f4.period, 0.6, 1e-6) && f4.accepted === 8, `doubled: ${JSON.stringify(f4)}`)

  // one wild outlier (beat 4 tapped 40% late) — rejected
  const wild = steady(0, 0.5, 10); wild[4] += 0.2
  const f5 = fitTaps(wild)
  check(!!f5 && near(f5.period, 0.5, 0.002) && f5.accepted === 9, `outlier: ${JSON.stringify(f5)}`)

  // too few taps
  check(fitTaps(steady(0, 0.5, 3)) === null, '3 taps -> null')
  // tempo out of bounds (10 bpm)
  check(fitTaps(steady(0, 6, 5)) === null, '10 bpm -> null')
  // unsorted input is tolerated
  const f6 = fitTaps([1.3, 0.0, 0.65, 1.95, 2.6])
  check(!!f6 && near(f6.period, 0.65, 1e-9) && near(f6.anchor, 0, 1e-9), 'unsorted input')

  console.log(`tapTempoFit: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
