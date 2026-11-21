import { Midi } from '@tonejs/midi'
import { parseMidiBuffer } from './midiParser'
import { encodeFingers, decodeFingers, fingerMeta, restoreFingers, handPlaces, whiteIndex, midiOfWhite, madeUpFingering } from './fingering'

export function runFingeringTest(): number {
  console.group('[fingering] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string, got?: unknown) => { c ? pass++ : (fail++, console.error('FAIL:', m, got ?? '')) }

  // ── kept in the file ──
  const f = [undefined, undefined, undefined, 1, 2, 3, 3, undefined, 5]
  const enc = encodeFingers(f)
  check(enc === '3*0.1.2.2*3.0.5', 'runs written short', enc)
  check(JSON.stringify(decodeFingers(enc)) === JSON.stringify(f), 'and read back the same')
  check(fingerMeta(2, [{}, {}]) === null, 'no fingers, nothing written')
  const meta = fingerMeta(2, f.map(x => ({ finger: x })))!
  check(meta.text === 'ORFEO_FINGERS:2:' + enc && meta.ticks === 0, 'one text meta per track')
  const tracks = [{ index: 1, notes: [{}, {}] as { finger?: number }[] }, { index: 2, notes: f.map(() => ({} as { finger?: number })) }]
  check(restoreFingers(tracks, [{ text: 'other' }, meta]) === 5 && tracks[1].notes[3].finger === 1 && tracks[1].notes[8].finger === 5 && !tracks[1].notes[0].finger, 'back onto the right notes')
  const changed = [{ index: 2, notes: [{}] as { finger?: number }[] }]
  check(restoreFingers(changed, [meta]) === 0, 'a track that changed since is left alone')

  // ── white keys ──
  check(whiteIndex(60) === 35 && whiteIndex(61) === 35 && midiOfWhite(35) === 60 && midiOfWhite(39) === 67, 'C4 is white key 35, G4 four above')

  // ── where the hand sits, and where it moves ──
  const R = (midi: number, time: number, finger?: number) => ({ midi, time, finger, hand: 'R' as const })
  // C D E F G with 1 2 3 4 5: one position, C to G
  const five = handPlaces([R(60, 0, 1), R(62, 1, 2), R(64, 2, 3), R(65, 3, 4), R(67, 4, 5)])
  check(five.length === 1 && five[0].low === 60 && five[0].high === 67 && !five[0].moved, 'five fingers on five keys: one place, C to G')
  // then thumb under onto F: a move, F to C
  const under = handPlaces([R(60, 0, 1), R(62, 1, 2), R(64, 2, 3), R(65, 3, 1), R(67, 4, 2)])
  check(under.length === 2 && under[1].moved && under[1].low === 65 && under[1].high === 72 && under[1].time === 3, 'the thumb under onto F: the hand moves there')
  check(handPlaces([R(60, 0, 1), R(69, 1, 5)]).length === 1, 'a stretch of a key: not a move')
  const oct = handPlaces([{ midi: 45, time: 0, finger: 5, hand: 'L' }, { midi: 57, time: 0, finger: 1, hand: 'L' }, { midi: 45, time: 1, finger: 5, hand: 'L' }, { midi: 57, time: 1, finger: 1, hand: 'L' }])
  check(oct.length === 1, 'left-hand octaves with 5 and 1: the hand stays put', oct)
  const L = handPlaces([{ midi: 48, time: 0, finger: 5, hand: 'L' }, { midi: 55, time: 1, finger: 1, hand: 'L' }])
  check(L.length === 1 && L[0].low === 48 && L[0].high === 55, 'the left hand: little finger low, thumb high')
  check(handPlaces([R(60, 0), R(62, 1)]).length === 0, 'no fingers, no places')
  const mu = [R(60, 0), R(62, 1), R(64, 2), R(72, 3), R(74, 4)]
  madeUpFingering(mu)
  check(mu.map(n => n.finger).join() === '1,2,3,1,2', 'Dev Tools fingering: a new position where a note falls outside five keys', mu.map(n => n.finger))
  const ch = [R(60, 0), R(64, 0), R(67, 0), R(72, 1), R(76, 1)]
  madeUpFingering(ch)
  check(ch.map(n => n.finger).join() === '1,3,5,1,3', 'a chord fingered from its lowest note', ch.map(n => n.finger))

  // ── through a real file: saved as the Note Editor saves it, read back on load ──
  {
    const m = new Midi()
    const tr = m.addTrack()
    tr.instrument.number = 0
    ;[60, 62, 64, 65].forEach((k, i) => tr.addNote({ midi: k, time: i * 0.5, duration: 0.4 }))
    ;(m.header as any).meta = [fingerMeta(0, [{ finger: 1 }, { finger: 2 }, {}, { finger: 4 }])]
    const back = parseMidiBuffer(m.toArray().buffer as ArrayBuffer, 'f.mid', '')
    const notes = back.tracks[0]?.notes ?? []
    check(notes.map(n => n.finger ?? 0).join() === '1,2,0,4', 'saved in the file and read back on the same notes', notes.map(n => n.finger))
  }

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
