import { buildBeatGrid } from './beatGrid'
import type { ParsedMidi } from '../types'

export function runBeatGridTest(): void {
  console.group('[beatGrid] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // 4/4 at 120bpm: bar = 2s, half-bar = 1s
  const m1 = { _barTimes: [0, 2, 4, 6], duration: 8 } as unknown as ParsedMidi
  const g1 = buildBeatGrid(m1)
  check(JSON.stringify(g1.bars) === '[0,2,4,6]', '4/4 bars pass through')
  check(g1.halfBars[0] === 0 && g1.halfBars[1] === 1 && g1.halfBars[2] === 2,
    `half-bars interleave midpoints, got ${g1.halfBars.slice(0,3)}`)

  // missing grid -> 2s fallback
  const m2 = { duration: 10 } as unknown as ParsedMidi
  const g2 = buildBeatGrid(m2)
  check(g2.bars.length > 0 && g2.bars[1] === 2, 'fallback grid is 2s')

  console.log(`beatGrid: ${pass} passed, ${fail} failed`)
  console.groupEnd()
}
