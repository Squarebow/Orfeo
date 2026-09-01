import type { ParsedTrack, ParsedNote } from '../types'
import { buildChordSequence } from './chordSequenceBuilder'

const OPTS = { noteNaming: 'english' as const, accidentals: 'flat' as const, namingStyle: 'abbreviation' as const, transpose: 0 }
// 8 bars of 2s each, 4 beats/bar → a beat every 0.5s
const GRID = {
  bars: [0, 2, 4, 6, 8, 10, 12, 14, 16],
  halfBars: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16],
  beats: Array.from({ length: 33 }, (_, i) => i * 0.5),
}
function n(midi: number, time: number, dur: number, ti = 0): ParsedNote {
  return { midi, time, duration: dur, velocity: 0.7, trackIndex: ti }
}
function track(index: number, notes: ParsedNote[]): ParsedTrack {
  return { index, name: '', gmName: '', program: 0, group: 'piano', isDrum: false, color: '', channel: 0, notes }
}

export function runChordSequenceBuilderTest(): void {
  console.group('[chordSequenceBuilder] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // (a) held C major triad for 8 bars + a moving melody note on top → 1 segment
  const held: ParsedNote[] = [n(48, 0, 16), n(52, 0, 16), n(55, 0, 16)]
  for (let b = 0; b < 8; b++) held.push(n(72 + (b % 4), b * 2, 1.5)) // melody C D E F …
  const s1 = buildChordSequence([track(0, held)], null, GRID, OPTS)
  check(s1.length === 1, `held triad + melody → 1 segment (got ${s1.length}: ${s1.map(e => e.name)})`)
  check(/^C/.test(s1[0]?.name ?? ''), `…named C-something ("${s1[0]?.name}")`)

  // (b) block change every 2 bars: C (bars 1-2), F (3-4), G (5-6), C (7-8)
  const prog: ParsedNote[] = []
  const chords = [[48, 52, 55], [53, 57, 60], [55, 59, 62], [48, 52, 55]]
  chords.forEach((c, i) => c.forEach(m => prog.push(n(m, i * 4, 3.8))))
  const s2 = buildChordSequence([track(0, prog)], null, GRID, OPTS)
  check(s2.length === 4, `I-IV-V-I → 4 segments (got ${s2.length}: ${s2.map(e => e.name)})`)
  check(s2.every((e, i) => Math.abs(e.displayTime - i * 4) <= 1),
    `…each starts within a half-bar of its downbeat (${s2.map(e => e.displayTime)})`)

  // (c) C major arpeggiated one note per beat for 8 bars → 1 segment, not 32
  const arp: ParsedNote[] = []
  const cyc = [48, 52, 55, 60]
  for (let i = 0; i < 32; i++) arp.push(n(cyc[i % 4], i * 0.5, 0.45))
  const s3 = buildChordSequence([track(0, arp)], null, GRID, OPTS)
  check(s3.length === 1, `arpeggiated C → 1 segment (got ${s3.length}: ${s3.map(e => e.name)})`)

  // (d) static C triad with a walking bass C-E-G-B under it → 1 segment
  //     (the upper harmony never moves; a fast walking bass earns no slash)
  const walk: ParsedNote[] = [n(60, 0, 16), n(64, 0, 16), n(67, 0, 16)]
  const bassNotes: ParsedNote[] = []
  const wcyc = [36, 40, 43, 47]
  for (let i = 0; i < 16; i++) bassNotes.push(n(wcyc[i % 4], i, 0.9, 1))
  const s4 = buildChordSequence([track(0, walk)], track(1, bassNotes), GRID, OPTS)
  check(s4.length === 1, `static triad + walking bass → 1 segment (got ${s4.length}: ${s4.map(e => e.name)})`)
  check(s4[0]?.short === false, '…not flagged short')

  console.log(`chordSequenceBuilder: ${pass} passed, ${fail} failed`)
  console.groupEnd()
}
