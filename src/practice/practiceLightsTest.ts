import { prepareLights, practiceLights, chordToPlay } from './practiceLights'
import type { Expected } from './matcher'

// practiceLights.ts wires itself to the store on import, which is harmless
// headless (nothing plays, nothing lights).

export function runPracticeLightsTest(): number {
  console.group('[practice lights] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const e = (midi: number, time: number, dur: number, hand: 'L' | 'R' = 'R', finger?: number): Expected =>
    ({ midi, time, dur, hand, bar: 1, ...(finger ? { finger } : {}) })
  // C (with finger 1), then E, then C again straight after; a left-hand G under the first C
  const notes = [e(48, 1.0, 1.0, 'L'), e(60, 1.0, 0.5, 'R', 1), e(64, 1.5, 0.5), e(60, 2.0, 0.5)]
  const p = prepareLights(notes)
  const none = () => false
  const at = (t: number, o: Partial<Parameters<typeof practiceLights>[2]> = {}) =>
    [...practiceLights(p, t, { playing: true, holdAt: null, ahead: 0.25, gap: 0.08, done: none, ...o }).keys()].sort((a, b) => a - b).join()

  // ── as the song plays ──
  check(at(0.7) === '', 'nothing lit long before')
  check(at(0.8) === '48,60', 'a moment early: both hands of the first chord')
  check(at(1.2) === '48,60', 'lit while they sound')
  check(at(1.3) === '48,60,64', 'E lights a moment early, while the C still sounds')
  check(at(1.55) === '48,64', 'the C goes dark when it ends')
  check(at(1.76) === '48,60,64', 'C played again lights a moment early')
  check(at(1.66) === '48,64', 'and stays dark until then')
  {
    // a C held right up to the next C: dark for a moment before it's struck again
    const q = prepareLights([e(60, 1.0, 1.0), e(60, 2.0, 0.5)])
    const lit = (t: number) => practiceLights(q, t, { playing: true, holdAt: null, ahead: 0.25, gap: 0.08, done: none }).has(60)
    check(lit(1.6) && !lit(1.7) && lit(1.76), 'a repeated key goes dark, then lights again')
  }
  const fingers = practiceLights(p, 1.0, { playing: true, holdAt: null, ahead: 0.25, gap: 0.08, done: none })
  check(fingers.get(60)?.finger === 1 && fingers.get(60)?.hand === 'R' && fingers.get(48)?.hand === 'L' && fingers.get(48)?.finger === undefined, 'the hand and, when known, the finger')

  // ── while the song waits ──
  check(at(1.5, { playing: false, holdAt: 1.0 }) === '48,60', 'waiting: the keys it waits for')
  check(at(1.5, { playing: false, holdAt: 1.0, done: i => i === 1 }) === '48', 'a key you played goes dark; the rest stay lit')
  check(at(1.5, { playing: false, holdAt: 1.5 }) === '64', 'the next step on its own')

  // ── stopped or paused ──
  check(at(0, { playing: false }) === '48,60', 'stopped before the song: the first notes you play')
  check(at(1.2, { playing: false }) === '64', 'paused between notes: the next ones')
  check(at(0, { playing: false, done: i => i <= 1 }) === '64', 'notes out of reach are passed over')
  check(at(3, { playing: false }) === '', 'past the end: nothing')

  // ── the chord to play (the footer) ──
  {
    // a held C under E then G: C and G when the G comes (the E has ended)
    const q = prepareLights([e(48, 1.0, 2.0, 'L'), e(64, 1.0, 0.5), e(67, 1.5, 0.5), e(65, 3.5, 0.5)])
    const to = (t: number, o: Partial<{ playing: boolean; holdAt: number | null }> = {}) =>
      chordToPlay(q, t, { playing: true, holdAt: null, ahead: 0.25, ...o }).join()
    check(to(0, { playing: false }) === '48,64', 'stopped: the first chord')
    check(to(1.3) === '48,67', 'a moment early: the next step with the held note under it (the E has ended)')
    check(to(1.1) === '48,64', 'playing: the step now')
    check(to(2.0, { playing: false, holdAt: 1.5 }) === '48,67', 'waiting: the waited-for step, with what still sounds')
    check(to(3.4) === '65', 'a note on its own')
    check(chordToPlay(prepareLights([]), 1, { playing: true, holdAt: null, ahead: 0.25 }).length === 0, 'nothing to play')
  }

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
