import type { ParsedTrack, ParsedNote } from '../types'
import { pickChordTracks } from './trackChordRole'

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

  console.log(`trackChordRole: ${pass} passed, ${fail} failed`)
  console.groupEnd()
}
