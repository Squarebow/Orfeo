import { Matcher, StepWaiter, type Expected } from './matcher'

const E = (midi: number, time: number, hand: 'L' | 'R' = 'R', bar = 1): Expected => ({ midi, time, hand, bar })
const W = 0.2

export function runMatcherTest(): number {
  console.group('[matcher] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // spot on, a little early, a little late
  {
    const m = new Matcher([E(60, 1), E(62, 2), E(64, 3)], W)
    check(m.play({ midi: 60, time: 1 }).kind === 'hit', 'on time: right')
    const early = m.play({ midi: 62, time: 1.9 })
    check(early.kind === 'hit' && Math.abs((early as any).offset + 0.1) < 1e-9, 'early: right, offset −0.1')
    const late = m.play({ midi: 64, time: 3.15 })
    check(late.kind === 'hit' && (late as any).offset > 0, 'late: right, offset +')
    check(m.summary().hit === 3 && m.summary().missed === 0, 'three right')
    check(m.summary().hitOffsets.length === 3 && m.summary().spread > 0.05, 'each right note keeps its timing; the spread shows it wandered')
  }
  // a chord in any order
  {
    const m = new Matcher([E(60, 1), E(64, 1), E(67, 1)], W)
    for (const n of [67, 60, 64]) m.play({ midi: n, time: 1.02 })
    check(m.summary().hit === 3, 'a chord played top first: all three right')
  }
  // a rolled chord, low to high over 90 ms
  {
    const m = new Matcher([E(48, 2, 'L'), E(55, 2, 'L'), E(64, 2, 'L')], W)
    ;[48, 55, 64].forEach((n, i) => m.play({ midi: n, time: 2 + i * 0.045 }))
    check(m.summary().hit === 3 && m.summary().perHand.L.hit === 3, 'a rolled chord: right, left hand')
  }
  // a repeated note: each press pairs with its own note
  {
    const m = new Matcher([E(60, 1), E(60, 1.25), E(60, 1.5)], W)
    const a = m.play({ midi: 60, time: 1.26 }) as any
    check(a.kind === 'hit' && a.exp.time === 1.25, 'a repeated note pairs with the nearest one')
    m.play({ midi: 60, time: 1.01 }); m.play({ midi: 60, time: 1.49 })
    check(m.summary().hit === 3, 'repeated notes: three right')
    check(m.play({ midi: 60, time: 1.5 }).kind === 'extra', 'a fourth press: extra')
  }
  // wrong note = extra + the right one missed once the song is past it
  {
    const m = new Matcher([E(60, 1, 'R', 1), E(62, 3, 'R', 2)], W, t => (t < 2 ? 1 : 2))
    check(m.play({ midi: 61, time: 1 }).kind === 'extra', 'a wrong key: extra')
    check(m.advance(1.1).length === 0, 'not missed while still within reach')
    const miss = m.advance(1.3)
    check(miss.length === 1 && miss[0].kind === 'missed', 'missed once the song is past it')
    const s = m.summary()
    check(s.extra === 1 && s.missed === 1 && s.pending === 1 && s.perBar.get(1)?.extra === 1, 'per bar: the wrong note in bar 1')
  }
  // too far away in time: extra
  {
    const m = new Matcher([E(60, 1)], W)
    check(m.play({ midi: 60, time: 1.5 }).kind === 'extra', 'half a second late: extra')
  }
  // going round the loop again: notes from there on are to play again
  {
    const m = new Matcher([E(60, 1), E(62, 2), E(64, 3)], W)
    m.play({ midi: 60, time: 1 }); m.advance(5)
    check(m.summary().missed === 2, 'two missed before the loop goes round')
    m.restartAt(2)
    const s = m.summary()
    check(s.hit === 0 && s.missed === 0 && s.pending === 2, 'after going round: a fresh take, the notes from there on to play')
    check(m.play({ midi: 62, time: 2 }).kind === 'hit', 'and can be played again')
    const late = new Matcher([E(60, 1), E(62, 2)], W)
    late.play({ midi: 60, time: 1.1 }); late.play({ midi: 62, time: 2.1 }); late.restartAt(0)
    late.play({ midi: 60, time: 0.95 })
    check(Math.abs(late.summary().meanOffset + 0.05) < 1e-9, 'the average counts only this time round')
  }
  // notes the keyboard can't reach are left out
  {
    const m = new Matcher([E(24, 1, 'L'), E(60, 1)], W)
    check(m.skip(e => e.midi < 36, true) === 1, 'one note out of reach')
    m.advance(9)
    check(m.summary().missed === 1, 'the unreachable note is not counted missed')
    m.restartAt(0)
    check(m.summary().pending === 1, 'and stays out on the next take')
  }

  // the waiting: a chord holds the song until all its notes are down
  {
    const m = new Matcher([E(48, 1, 'L'), E(60, 1.01), E(64, 1.02), E(62, 2)], W)
    const w = new StepWaiter(m, 0.1, 0.03)
    check(w.steps.length === 2 && w.steps[0].idx.length === 3, 'notes starting within 30 ms: one step')
    check(w.check(1.05) === null, 'within the grace: plays on')
    check(w.check(1.11)?.time === 1, 'past it: waits at the chord')
    m.play({ midi: 64, time: 1.1 }); m.play({ midi: 61, time: 1.1 })
    check(w.check(1.11) !== null, 'one note and a wrong one: still waiting')
    m.play({ midi: 48, time: 1.1 }); m.play({ midi: 60, time: 1.1 })
    check(w.check(1.11) === null, 'all three down, one at a time: plays on')
    m.play({ midi: 62, time: 1.95 })
    check(w.check(2.5) === null, 'played ahead of the song: never waits')
    w.reset(0); m.restartAt(0)
    check(w.check(1.2)?.time === 1, 'from the top again: waits at the chord again')
  }

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
