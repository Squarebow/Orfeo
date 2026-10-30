import { buildSteps } from './stepThrough'

// Steps follow what's on the roll: eye on, not muted, and the soloed track
// when one is. A hidden track you hear is accompaniment: no steps.
export function runStepThroughTest(): number {
  console.group('[stepThrough] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const ts = (index: number, o: { muted?: boolean; visible?: boolean; solo?: boolean } = {}) =>
    ({ index, muted: false, solo: false, visible: true, color: '#123456', ...o }) as any
  const tr = (index: number, channel: number, times: number[], isDrum = false) =>
    ({ index, channel, isDrum, notes: times.map(time => ({ time, midi: 60 + index, velocity: 0.8, duration: 0.5 })) })
  const midi = { tracks: [tr(0, 0, [1]), tr(1, 1, [2]), tr(2, 2, [3]), tr(3, 9, [4], true)] }

  const steps = buildSteps(midi, [ts(0), ts(1, { muted: true }), ts(2, { visible: false }), ts(3)])
  check(steps.map(s => s.time).join() === '1', `steps only on tracks shown on the roll (eye on, not muted), got ${steps.map(s => s.time)}`)
  const solo = buildSteps(midi, [ts(0, { solo: true }), ts(1), ts(2, { visible: false }), ts(3)])
  check(solo.map(s => s.time).join() === '1', 'solo: only the soloed track is heard and shown, so only it makes steps')

  console.log(`stepThrough: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
