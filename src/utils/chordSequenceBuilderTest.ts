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

export function runChordSequenceBuilderTest(): number {
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

  // (e) a clean, fully-struck one-beat Cm7 between two other chords — today's
  // known gap (docs/Chord Engine Dual-Mode Plan.md): the 7th can never ring
  // the 2 beats Safe's continuous check requires, so the span reads as a
  // bare triad, fails the confidence bar, and gets folded into a neighbour.
  // This pins that CURRENT behaviour as a regression baseline.
  const gap: ParsedNote[] = [
    n(55, 0, 1.9), n(59, 0, 1.9), n(62, 0, 1.9),                          // G major, 0–2s
    n(48, 2.0, 0.45), n(51, 2.0, 0.45), n(55, 2.0, 0.45), n(58, 2.0, 0.45), // Cm7 grab, one beat (2.0–2.5s)
    n(53, 2.5, 5.3), n(57, 2.5, 5.3), n(60, 2.5, 5.3),                    // F major, 2.5s+
  ]
  const sSafe = buildChordSequence([track(0, gap)], null, GRID, OPTS)
  check(sSafe.length === 2, `safe: one-beat Cm7 gets folded away → 2 events (got ${sSafe.length}: ${sSafe.map(e => e.name)})`)
  check(/^G/.test(sSafe[0]?.name ?? ''), `…first event is G-something ("${sSafe[0]?.name}")`)
  check(/^F/.test(sSafe[1]?.name ?? ''), `…second event is F-something ("${sSafe[1]?.name}")`)
  check(Math.abs((sSafe[1]?.time ?? -1) - 2.0) < 0.01, `…second event absorbs the Cm7 beat, starts at 2.0s (got ${sSafe[1]?.time})`)

  // (f) same one-beat Cm7 as (e) — Progressive should recover it, because
  // all four notes are struck together within a single octave.
  const sProg = buildChordSequence([track(0, gap)], null, GRID, { ...OPTS, chordReadingMode: 'progressive' })
  check(sProg.length === 3, `progressive: one-beat Cm7 recovered as its own event → 3 events (got ${sProg.length}: ${sProg.map(e => e.name)})`)
  check(/^G/.test(sProg[0]?.name ?? ''), `…first event is G-something ("${sProg[0]?.name}")`)
  check(/^C/.test(sProg[1]?.name ?? '') && /7/.test(sProg[1]?.name ?? ''), `…second event is a C-seventh chord ("${sProg[1]?.name}")`)
  check(Math.abs((sProg[1]?.time ?? -1) - 2.0) < 0.01, `…second event starts at 2.0s (got ${sProg[1]?.time})`)
  check(/^F/.test(sProg[2]?.name ?? ''), `…third event is F-something ("${sProg[2]?.name}")`)
  check(Math.abs((sProg[2]?.time ?? -1) - 2.5) < 0.01, `…third event starts at 2.5s (got ${sProg[2]?.time})`)

  // (g) same shape, but the "7th" is struck two-plus octaves above the rest
  // of the grab — not a real chord grab, so Progressive must NOT recover it
  // and must match Safe exactly (still 2 events).
  const far: ParsedNote[] = [
    n(55, 0, 1.9), n(59, 0, 1.9), n(62, 0, 1.9),                          // G major, 0–2s
    n(48, 2.0, 0.45), n(51, 2.0, 0.45), n(55, 2.0, 0.45), n(82, 2.0, 0.45), // "7th" far out of register — not a real grab
    n(53, 2.5, 5.3), n(57, 2.5, 5.3), n(60, 2.5, 5.3),                    // F major, 2.5s+
  ]
  const sProgFar = buildChordSequence([track(0, far)], null, GRID, { ...OPTS, chordReadingMode: 'progressive' })
  check(sProgFar.length === 2, `progressive: out-of-octave "7th" is not a real grab → still 2 events (got ${sProgFar.length}: ${sProgFar.map(e => e.name)})`)
  check(Math.abs((sProgFar[1]?.time ?? -1) - 2.0) < 0.01, `…still absorbs at 2.0s, same as safe (got ${sProgFar[1]?.time})`)

  // (h) Progressive must not change anything when there's no colour tone to
  // recover — re-run (a)-(d) in progressive mode, expect identical output.
  const s1p = buildChordSequence([track(0, held)], null, GRID, { ...OPTS, chordReadingMode: 'progressive' })
  check(JSON.stringify(s1p.map(e => e.name)) === JSON.stringify(s1.map(e => e.name)), `progressive matches safe on (a) (got ${s1p.map(e => e.name)})`)
  const s2p = buildChordSequence([track(0, prog)], null, GRID, { ...OPTS, chordReadingMode: 'progressive' })
  check(JSON.stringify(s2p.map(e => e.name)) === JSON.stringify(s2.map(e => e.name)), `progressive matches safe on (b) (got ${s2p.map(e => e.name)})`)
  const s3p = buildChordSequence([track(0, arp)], null, GRID, { ...OPTS, chordReadingMode: 'progressive' })
  check(JSON.stringify(s3p.map(e => e.name)) === JSON.stringify(s3.map(e => e.name)), `progressive matches safe on (c) (got ${s3p.map(e => e.name)})`)
  const s4p = buildChordSequence([track(0, walk)], track(1, bassNotes), GRID, { ...OPTS, chordReadingMode: 'progressive' })
  check(JSON.stringify(s4p.map(e => e.name)) === JSON.stringify(s4.map(e => e.name)), `progressive matches safe on (d) (got ${s4p.map(e => e.name)})`)

  // (i) pins Progressive's pitch-class cap (progressiveBoost's
  // `if (pcs.size > 5) break`) — a six-pitch-class grab, sandwiched the same
  // way as (e)/(f)/(g): a C13 voicing (C, E, G, Bb, D, A — all within one
  // octave, MIDI 60-70), struck together as one grab lasting a single beat.
  // With the cap intact, the 6th pitch class (A) never gets to join the
  // grab's own chroma, so Progressive can only confirm 5 of the 6 tones and
  // reads the span as C9 — never the full C13. If the cap were ever removed
  // or loosened, this would read C13 instead, so this is what would catch
  // that regression.
  const capGrab: ParsedNote[] = [
    n(55, 0, 1.9), n(59, 0, 1.9), n(62, 0, 1.9),                          // G major, 0–2s
    n(60, 2.0, 0.45), n(64, 2.0, 0.45), n(67, 2.0, 0.45),                 // C13 grab, one beat (2.0–2.5s):
    n(70, 2.0, 0.45), n(62, 2.0, 0.45), n(69, 2.0, 0.45),                 // C E G Bb D A, struck together
    n(53, 2.5, 5.3), n(57, 2.5, 5.3), n(60, 2.5, 5.3),                    // F major, 2.5s+
  ]
  const sProgCap = buildChordSequence([track(0, capGrab)], null, GRID, { ...OPTS, chordReadingMode: 'progressive' })
  check(sProgCap.length === 3, `progressive: capped grab recovered as its own event → 3 events (got ${sProgCap.length}: ${sProgCap.map(e => e.name)})`)
  check(Math.abs((sProgCap[1]?.time ?? -1) - 2.0) < 0.01, `…second event starts at 2.0s (got ${sProgCap[1]?.time})`)
  check(/^C9(?!\d)/.test(sProgCap[1]?.name ?? ''), `…second event reads as C9, capped below the full C13 ("${sProgCap[1]?.name}")`)
  check(!/13/.test(sProgCap[1]?.name ?? ''), `…never reads the uncapped C13 ("${sProgCap[1]?.name}")`)

  console.log(`chordSequenceBuilder: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
