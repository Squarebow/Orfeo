import { buildSteps } from './stepThrough'
import { notesSoundingAt } from './midiParser'

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

// A step and the keyboard agree on what the chord is: every note Step Through
// groups into a step is lit when the playhead lands on that step.
export function runStepLightsTest(): number {
  console.group('[stepThrough] lights self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const note = (midi: number, time: number, duration = 0.5) => ({ midi, time, duration, velocity: 0.8, trackIndex: 0 })
  type Note = ReturnType<typeof note>
  const song = (notes: Note[]) => ({ tracks: [{ index: 0, channel: 0, isDrum: false, notes }] })
  const shown = [{ index: 0, visible: true, muted: false, solo: false, color: '#123456' }] as any
  const lit = (notes: Note[], time: number) => notesSoundingAt(song(notes).tracks as any, time).map(n => n.midi)

  // the reported case: a chord whose notes start a moment after the first
  for (const gap of [0, 0.01, 0.02, 0.021, 0.025, 0.029]) {
    const chord = [note(60, 1), note(64, 1 + gap / 2), note(67, 1 + gap)]
    const steps = buildSteps(song(chord), shown)
    check(steps.length === 1 && steps[0].notes.length === 3, `${gap * 1000} ms apart is one step`)
    check(lit(chord, steps[0].time).length === 3, `${gap * 1000} ms apart lights all three, got ${lit(chord, steps[0].time)}`)
  }

  // awkward start times: the two agree whatever the rounding does
  let bad = 0
  for (let t = 0.1; t < 40; t += 0.137) {
    for (let gap = 0.001; gap <= 0.031; gap += 0.001) {
      const pair = [note(60, t), note(67, t + gap)]
      const first = buildSteps(song(pair), shown)[0]
      if (first.notes.length !== lit(pair, first.time).length) bad++
    }
  }
  check(bad === 0, `steps and keys agree, ${bad} misses`)

  // further apart is the next step, and doesn't light early
  const apart = [note(60, 1), note(64, 1.05)]
  check(buildSteps(song(apart), shown).length === 2, '50 ms apart is two steps')
  check(lit(apart, 1).length === 1, '50 ms apart lights only the first')

  // very short notes still light on their own step
  check(lit([note(60, 1, 0.01), note(64, 1.02, 0.01)], 1).length === 2, 'short notes light on their step')

  // a note that has ended stays dark; one still held stays lit
  check(lit([note(60, 0, 1)], 1).length === 0, 'ended note is dark')
  check(lit([note(60, 0, 1)], 0.99).length === 0, 'note in its last moment is dark')
  check(lit([note(60, 0, 1)], 0.5).length === 1, 'held note is lit')

  console.log(`stepThrough lights: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
