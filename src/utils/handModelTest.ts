import { assignHands, setSecondHandReader } from './handAssignment'
import { setHandModelOn, shippedHandModel, handModelOn } from './handModelReader'
import { noteFeatures, FEATURES } from './handModelFeatures'

export function runHandModelTest(): number {
  console.group('[handModel] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // a left hand on C3 chords, a right hand tune a fifth above middle C
  const piece = () => {
    const notes: { midi: number; time: number; duration: number; truth: 'L' | 'R' }[] = []
    for (let i = 0; i < 48; i++) {
      for (const m of [48, 52, 55]) notes.push({ midi: m, time: i * 0.5, duration: 0.45, truth: 'L' })
      notes.push({ midi: 67 + [0, 2, 4, 5, 7, 5, 4, 2][i % 8], time: i * 0.5, duration: 0.25, truth: 'R' })
      notes.push({ midi: 67 + [4, 5, 7, 9, 11, 9, 7, 5][i % 8], time: i * 0.5 + 0.25, duration: 0.25, truth: 'R' })
    }
    return notes
  }

  try {
    const model = shippedHandModel()
    check(true, 'the shipped model unpacks')
    const notes = piece()
    const engine = notes.map(n => ({ hand: n.truth, confidence: 0.5 }))
    const x = noteFeatures(notes, engine)
    check(x.length === notes.length * FEATURES && x.every(Number.isFinite), 'one row of numbers per note, all finite')
    const r = model.read(notes, engine)
    check(r.length === notes.length && r.every(a => a.confidence >= 0 && a.confidence <= 1), 'a hand and a confidence for every note')
    const right = r.filter((a, i) => a.hand === notes[i].truth).length
    check(right / notes.length >= 0.98, `chords below, tune above: hands right ${right} / ${notes.length}`)

    // the switch: off = the engine alone, on = the model's answer
    setHandModelOn(false)
    check(!handModelOn(), 'off')
    const offRead = assignHands(notes).assignments
    setHandModelOn(true)
    const onRead = assignHands(notes).assignments
    const direct = model.read(notes, offRead.map(a => ({ hand: a.hand, confidence: a.confidence })))
    check(onRead.every((a, i) => a.hand === direct[i].hand && Math.abs(a.confidence - direct[i].confidence) < 1e-9), 'switched on, the engine gives the model\'s reading')
    check(onRead.every((a, i) => a.note === notes[i]), 'in the caller\'s order')

    // certain answers never go through the model
    let asked = 0
    setSecondHandReader((ns, eng) => { asked++; return eng })
    const line = Array.from({ length: 20 }, (_, i) => ({ midi: 72 + (i % 5), time: i * 0.5, duration: 0.4 }))
    assignHands(line)
    check(asked === 0, 'a single tune is one hand, the model not asked')
    const twoTracks = [...Array.from({ length: 20 }, (_, i) => ({ midi: 76, time: i * 0.5, duration: 0.4, trackIndex: 1, group: 'piano' })),
      ...Array.from({ length: 20 }, (_, i) => ({ midi: 48, time: i * 0.5, duration: 0.4, trackIndex: 0, group: 'piano' }))]
    assignHands(twoTracks)
    check(asked === 0, 'two tracks of one piano: by track, the model not asked')
  } catch (e) {
    fail++; console.error('FAIL: threw', e)
  } finally {
    setSecondHandReader(null)
  }

  console.log(`  handModel: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
