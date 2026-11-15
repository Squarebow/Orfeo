import type { ParsedTrack, ParsedNote } from '../types'
import { pickChordTracks, stavePairsOf } from './trackChordRole'

function note(midi: number, time: number, duration: number): ParsedNote {
  return { midi, time, duration, velocity: 0.7, trackIndex: 0 }
}
// a block-chord comping track: triads every beat
function comping(index: number, program: number, roots: number[]): ParsedTrack {
  const notes: ParsedNote[] = []
  roots.forEach((r, i) => { for (const off of [0, 4, 7]) notes.push({ ...note(r + off, i, 0.9), trackIndex: index }) })
  return { index, name: '', gmName: '', program, group: '', isDrum: false, color: '', channel: 0, notes }
}
// a monophonic melody / bass line
function mono(index: number, program: number, base: number, n: number): ParsedTrack {
  const notes: ParsedNote[] = []
  for (let i = 0; i < n; i++) notes.push({ ...note(base + (i % 5), i, 0.5), trackIndex: index })
  return { index, name: '', gmName: '', program, group: '', isDrum: false, color: '', channel: 0, notes }
}

export function runTrackChordRoleTest(): void {
  console.group('[trackChordRole] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // solo piano
  const r1 = pickChordTracks([comping(0, 0, [60, 65, 67, 60, 65, 67, 60, 65])])
  check(r1.chordTrackIndices.join() === '0', 'solo piano → [0]')

  // piano + bass: bass excluded, becomes bassTrackIndex
  const r2 = pickChordTracks([
    comping(0, 0, [60, 65, 67, 60, 65, 67, 60, 65]),
    mono(1, 34, 36, 8), // fretless bass, low
  ])
  check(r2.chordTrackIndices.join() === '0', 'piano+bass → chords [0]')
  check(r2.bassTrackIndex === 1, 'piano+bass → bassTrackIndex 1')

  // piano + flute melody: flute (program 73, monophonic, high) excluded
  const r3 = pickChordTracks([
    comping(0, 0, [60, 65, 67, 60, 65, 67, 60, 65]),
    mono(1, 73, 79, 8),
  ])
  check(r3.chordTrackIndices.join() === '0', 'piano+flute → chords [0], flute dropped')

  // melody only → detection still runs on that melody line (nothing else exists)
  const r4 = pickChordTracks([mono(0, 73, 72, 12)])
  check(r4.chordTrackIndices.length === 1 && r4.chordTrackIndices[0] === 0,
    'melody-only → detector still runs on the melody line ([0], nothing else to use)')

  // A piano on two staves: a right-hand tune and a low left hand. One by one,
  // the left staff passes for a bass line and its notes lose their chord vote;
  // as the one instrument it is, both staves are read for the chords.
  const rh = { ...mono(0, 0, 72, 16), name: 'Piano RH', group: 'piano' }
  const lh = { ...mono(1, 0, 40, 16), name: 'Piano LH', group: 'piano' }
  const pairs = stavePairsOf([rh, lh])
  check(pairs.length === 1 && pairs[0][0] === 0 && pairs[0][1] === 1, 'the two piano staves are found as one instrument, right hand first')
  const apart = pickChordTracks([rh, lh])
  check(apart.bassTrackIndex === 1, 'judged one by one, the left staff passes for the bass (the old reading)')
  const together = pickChordTracks([rh, lh], pairs)
  check(together.bassTrackIndex === null && together.chordTrackIndices.join() === '0,1', 'as one instrument, both staves are read for the chords')
  const withBass = pickChordTracks([rh, lh, mono(2, 34, 33, 16)], pairs)
  check(withBass.bassTrackIndex === 2 && withBass.chordTrackIndices.join() === '0,1', 'a real bass part still anchors the chords')

  console.log(`trackChordRole: ${pass} passed, ${fail} failed`)
  console.groupEnd()
}
