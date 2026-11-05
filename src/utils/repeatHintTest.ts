import type { ParsedMidi } from '../types'
import { findRepeats } from './repeatHint'

const findRepeat = (...args: Parameters<typeof findRepeats>) => findRepeats(...args)[0] ?? null

// A bass line that plays `cycle` different notes over and over, one per beat
function looped(cycle: number[], beats: number): { midi: ParsedMidi; grid: number[] } {
  const grid = Array.from({ length: beats }, (_, i) => i * 0.5)
  const notes = grid.map((time, i) => ({ time, duration: 0.4, midi: cycle[i % cycle.length] }))
  return { grid, midi: { duration: beats * 0.5, tracks: [{ index: 0, isDrum: false, notes }] } as unknown as ParsedMidi }
}

export function runRepeatHintTest(): number {
  console.group('[repeatHint] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // 13 beats round: 3 3 3 4 with the 1s standing out
  const thirteen = [36, 40, 43, 38, 41, 45, 40, 43, 47, 41, 45, 48, 50]
  const a = looped(thirteen, 200)
  const hint = findRepeat(a.midi, a.grid, 0, 4)
  check(hint?.beats === 13, `13-beat repeat found, got ${hint?.beats}`)
  check(hint?.pattern.reduce((x, y) => x + y, 0) === 13, `bars add up, got ${hint?.pattern}`)
  check(!!hint?.pattern.every(x => x === 3 || x === 4), `bars of 3 and 4, got ${hint?.pattern}`)
  check(findRepeat(a.midi, a.grid, 0, 13) === null, 'quiet once the bars fit')

  // seven even beats: one bar of 7, and two rounds of it stay one bar of 7
  const b = looped([36, 40, 43, 47, 41, 45, 38], 200)
  const seven = findRepeat(b.midi, b.grid, 0, 4)
  check(seven?.beats === 7 && seven.pattern.join() === '7', `7 beats, got ${JSON.stringify(seven)}`)

  // bars that fit say nothing
  const c = looped([36, 40, 43, 47], 200)
  check(findRepeat(c.midi, c.grid, 0, 4) === null, 'a 4-beat loop in 4s')
  check(findRepeat(c.midi, c.grid, 0, 2) === null, 'a 4-beat loop in 2s')

  // one held note sounds alike at any distance: no repeat worth naming
  const d = looped([36], 200)
  check(findRepeat(d.midi, d.grid, 0, 4) === null, 'the same note throughout')

  // a song too short to tell
  const e = looped(thirteen, 40)
  check(findRepeat(e.midi, e.grid, 0, 4) === null, 'too short')

  // two parts with different repeats: both offered, the longer-lasting first
  const f = looped([36, 40, 43, 47, 41, 45, 38], 200)
  const g = looped(thirteen, 120)
  const joined = { duration: 160, tracks: [{ index: 0, isDrum: false, notes: [...f.midi.tracks[0].notes, ...g.midi.tracks[0].notes.map(n => ({ ...n, time: n.time + 100 }))] }] } as unknown as ParsedMidi
  const both = findRepeats(joined, Array.from({ length: 320 }, (_, i) => i * 0.5), 0, 4)
  check(both.map(x => x.beats).join() === '7,13', `both parts, got ${both.map(x => x.beats)}`)

  console.log(`repeatHint: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
