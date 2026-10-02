import { judgeTempo } from './tempoTrust'

type O = { t: number; w: number }
const grid = (period: number, dur: number, offset = 0) => { const b: number[] = []; for (let t = offset; t <= dur; t += period) b.push(+t.toFixed(6)); return b }
// kick on every beat (strong) + hats on the off-beats (weak)
function band(period: number, from: number, to: number): O[] {
  const o: O[] = []
  for (let t = from; t < to; t += period) { o.push({ t, w: 0.9 }); o.push({ t: t + period / 2, w: 0.2 }) }
  return o
}

export function runTempoTrustTest(): number {
  console.group('[tempoTrust] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number | null, b: number, tol: number) => a != null && Math.abs(a - b) <= tol

  // 1. band on the file's own grid -> fine
  const r1 = judgeTempo(grid(0.5, 120), band(0.5, 0, 120), 120, 120)
  check(!r1.flagged && r1.okWindows >= 5, `on-grid not flagged, got ${JSON.stringify(r1)}`)

  // 2. band at ~92 against a 60 grid -> flagged throughout, hint 92
  const r2 = judgeTempo(grid(1.0, 120), band(0.652, 0, 120), 120, 60)
  check(r2.flagged && r2.throughout && near(r2.hintBpm, 92, 1), `wrong tempo flagged, got ${JSON.stringify(r2)}`)

  // 3. grid shifted by half a beat -> flagged, hint ~= file tempo
  const r3 = judgeTempo(grid(0.5, 120, 0.25), band(0.5, 0, 120), 120, 120)
  check(r3.flagged && near(r3.hintBpm, 120, 2), `shifted grid flagged, got ${JSON.stringify(r3)}`)

  // 4. freely played (random onsets) -> never flagged
  let seed = 3
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 }
  const free: O[] = []; for (let t = 0; t < 120; t += 0.15 + rnd() * 0.7) free.push({ t, w: 0.9 })
  const r4 = judgeTempo(grid(0.5, 120), free, 120, 120)
  check(!r4.flagged, `rubato not flagged, got ${JSON.stringify(r4)}`)

  // 5. sparse whole notes -> never flagged
  const sparse: O[] = []; for (let t = 0; t < 120; t += 2) sparse.push({ t: t + 0.3, w: 0.9 })
  check(!judgeTempo(grid(0.5, 120), sparse, 120, 120).flagged, 'sparse not flagged')

  // 6. right for 40 s, then a faster groove the file never mentions
  const mixed = [...band(1.0, 0, 40), ...band(0.652, 40, 120)]
  const r6 = judgeTempo(grid(1.0, 120), mixed, 120, 60)
  check(r6.flagged && !r6.throughout && near(r6.from, 40, 0.5), `flagged from 40 s, got ${JSON.stringify(r6)}`)

  // 7. too short to judge -> never flagged
  check(!judgeTempo(grid(1.0, 15), band(0.652, 0, 15), 15, 60).flagged, 'short song not flagged')

  console.log(`tempoTrust: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
