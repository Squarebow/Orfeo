import { Midi } from '@tonejs/midi'
import type { ParsedNote } from '../types'
import { pianoSet, guessHandsAcross, reshapePianoToHands } from './pianoSet'

// A Note Editor copy with one piano track holding both hands (plus a bass)
function song(): Midi {
  const m = new Midi()
  const piano = m.addTrack(); piano.name = 'Grand'; piano.channel = 0; piano.instrument.number = 0
  ;(piano as any).index = 0
  piano.addCC({ number: 64, value: 127, ticks: 0 })
  for (let i = 0; i < 4; i++) {
    piano.addNote({ midi: 40 + i, ticks: i * 480, durationTicks: 400 }); (piano.notes[piano.notes.length - 1] as any).hand = 'L'
    piano.addNote({ midi: 72 + i, ticks: i * 480, durationTicks: 400 }); (piano.notes[piano.notes.length - 1] as any).hand = 'R'
  }
  const bass = m.addTrack(); bass.name = 'Bass'; bass.channel = 1; (bass as any).index = 1
  bass.addNote({ midi: 28, ticks: 0, durationTicks: 400 })
  return m
}

export function runPianoSetTest(): number {
  console.group('[pianoSet] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // ── which tracks are edited together ──
  const tr = [{ index: 0, group: 'piano' }, { index: 1, group: 'bass' }, { index: 2, group: 'piano' }]
  check(pianoSet(tr, 0).join() === '0,2' && pianoSet(tr, 2).join() === '0,2', 'two piano tracks: edited together')
  check(pianoSet(tr, 1).join() === '1', 'any other track: on its own')
  check(pianoSet([...tr, { index: 3, group: 'piano' }], 0).join() === '0', 'three pianos: one at a time (decide in the Playback Editor first)')

  // ── saving: one track becomes the two hands ──
  const m = song()
  check(reshapePianoToHands(m, [0]) === true, 'one track split into two: a new version')
  const [lh, , rh] = m.tracks
  check(m.tracks.length === 3 && lh.name === 'Grand LH' && rh.name === 'Grand RH', 'named "… LH" and "… RH"')
  check(lh.notes.length === 4 && lh.notes.every(n => n.midi < 60) && rh.notes.length === 4 && rh.notes.every(n => n.midi >= 72), 'every note on its hand\'s track')
  check(rh.channel === 0 && rh.instrument.number === 0 && (rh.controlChanges[64]?.length ?? 0) === 1, 'the right hand plays like before: channel, sound, pedal')
  check(m.tracks[1].notes.length === 1, 'the bass untouched')

  // ── a fix after that: a note moved between the two hand tracks ──
  ;(lh.notes[3] as any).hand = 'R'
  ;(lh as any).index = 0; (rh as any).index = 2
  check(reshapePianoToHands(m, [0, 2]) === false, 'moving notes between existing hand tracks: a hand fix, same file')
  check(lh.notes.length === 3 && rh.notes.length === 5, 'the note moved to the right hand\'s track')

  // ── two parts that aren't the hands, different sounds ──
  const p = new Midi()
  const a = p.addTrack(); a.name = 'Piano 1'; a.instrument.number = 0; (a as any).index = 0
  const b = p.addTrack(); b.name = 'E.Piano'; b.instrument.number = 4; (b as any).index = 1
  for (let i = 0; i < 3; i++) {
    a.addNote({ midi: 45, ticks: i * 480, durationTicks: 400 }); (a.notes[i] as any).hand = i === 0 ? 'R' : 'L'
    b.addNote({ midi: 76, ticks: i * 480, durationTicks: 400 }); (b.notes[i] as any).hand = 'R'
  }
  check(reshapePianoToHands(p, [0, 1]) === true, 'two parts made into the hands: a new version')
  check(a.instrument.number === 0 && b.instrument.number === 0, 'two different piano sounds: both the grand piano')
  check(a.name === 'Piano 1 LH' && b.name === 'Piano 1 RH', 'the hands take the first part\'s name')

  // ── the guess across two parts ──
  const n = (midi: number, time: number, hand: 'L' | 'R'): ParsedNote => ({ midi, time, duration: 0.4, velocity: 0.7, trackIndex: 0, hand, handConfidence: 1 } as ParsedNote)
  const t1 = [n(36, 0, 'R'), n(38, 0.5, 'R'), n(84, 1, 'R')], t2 = [n(80, 0, 'R'), n(82, 0.5, 'R'), n(40, 1, 'R')]
  check(guessHandsAcross([t1, t2]) && t1[0].hand === 'L' && t2[0].hand === 'R', 'two parts guessed as one piano: low notes left, high right')
  check(!guessHandsAcross([[n(40, 0, 'L')], [n(80, 0, 'R')]]), 'already the two hands: left as they are')

  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
