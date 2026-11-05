import type { ParsedMidi } from '../types'
import { matchSongs, copiedSegment, likelySameSong, SAME_SONG } from './copyBars'
import { applyTempoCorrection } from './tempoCorrection'

// A song in 3 3 3 4 bars at 190, and the same notes in a file that only says
// 4/4 at 120, with an empty start and loose timing.
function song(notes: { time: number; midi: number }[], extra: Record<string, unknown> = {}): ParsedMidi {
  return {
    fileName: 't.mid', duration: 90, bpm: 120, timeSignatureNumerator: 4, timeSignatureDenominator: 4, noteCount: notes.length,
    tracks: [{ index: 0, isDrum: false, notes }],
    _beatTimes: [], _barTimes: [], _tempoMap: [{ bpm: 120, time: 0 }], _timeSigMap: [{ num: 4, den: 4, time: 0 }],
    ...extra,
  } as unknown as ParsedMidi
}

export function runCopyBarsTest(): number {
  console.group('[copyBars] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

  const beat = 60 / 190
  let seed = 7
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
  const melody = Array.from({ length: 400 }, (_, i) => ({ time: i * beat * 0.5, midi: 48 + Math.floor(rnd() * 30) }))
  const beats = Array.from({ length: 220 }, (_, i) => i * beat)
  const cycle = [0, 3, 6, 9]
  const bars = beats.filter((_, i) => cycle.includes(i % 13))
  const good = song(melody, {
    _beatTimes: beats, _barTimes: bars, _tempoMap: [{ bpm: 190, time: 0 }],
    _timeSigMap: [{ num: 3, den: 4, time: 0 }, { num: 4, den: 4, time: 9 * beat }, { num: 3, den: 4, time: 13 * beat }],
  })
  const lead = 6, stretch = 1.01
  const loose = song(melody.map(n => ({ midi: n.midi, time: lead + n.time * stretch + (rnd() - 0.5) * 0.02 })))

  // same notes: found, and the time map carries the bars across
  const m = matchSongs(good, loose)!
  check(!!m && m.share >= SAME_SONG, `same notes recognised, share ${m?.share}`)
  check(near(m.slope, stretch, 0.005), `slope ${m.slope}`)
  check(near(m.warp(10), lead + 10 * stretch, 0.03), `10 s lands at ${m.warp(10)}`)

  const seg = copiedSegment(good, loose, m)!
  check(near(seg.map!.bars[0], lead, 0.03), `first bar at ${seg.map!.bars[0]}`)
  check(near(seg.map!.bars[3], lead + 9 * beat * stretch, 0.03), 'fourth bar keeps its place in the pattern')
  check(near(seg.map!.tempo[0].bpm, 190 / stretch, 1), `tempo reads ${seg.map!.tempo[0].bpm}`)
  check(seg.map!.sigs.map(e => e.num).join() === '3,4,3', `time signatures carried, got ${seg.map!.sigs.map(e => e.num)}`)

  // on the song: the whole beat layer is replaced, the notes aren't touched
  const out = applyTempoCorrection(loose, { segments: [seg] }) as any
  check(out._barTimes.length === seg.map!.bars.length && out._beatTimes[0] === seg.map!.beats[0], 'the song takes the copied grid')
  check(out.tracks === loose.tracks, 'notes untouched')
  check(out._timeSigMap.map((e: any) => e.num).join() === '3,4,3', 'time panel follows the copied signatures')

  // a song's own lead-in cut off in the source doesn't stop the copy
  const shifted = song(melody.map(n => ({ midi: n.midi, time: n.time - 3 })).filter(n => n.time >= 0))
  const cut = matchSongs(good, shifted)!
  const cutSeg = copiedSegment(good, shifted, cut)!
  check(cutSeg.map!.beats.every(t => t >= 0), 'nothing before the start of the song')
  check(cutSeg.map!.sigs[0].time === 0, 'the signature in force at the start is kept')

  // different music with the same notes doesn't pass
  const other = song(Array.from({ length: 400 }, (_, i) => ({ time: i * 0.21, midi: 48 + Math.floor(rnd() * 30) })))
  const no = matchSongs(good, other)
  check(!no || no.share < SAME_SONG, `different song rejected, share ${no?.share}`)

  // too little to compare
  check(matchSongs(song([{ time: 0, midi: 60 }]), good) === null, 'too few notes')

  // names
  check(likelySameSong('09-stranglers_1981-golden_brown-[k].mid', 'Stranglers - Golden Brown (2).mid'), 'tagged name matches')
  check(likelySameSong('Abba - Fernando.mid', 'abba_fernando.kar'), 'other spelling matches')
  check(!likelySameSong('Abba - Fernando.mid', 'Abba - Waterloo.mid'), 'same artist, other song')
  check(!likelySameSong('Golden Brown.mid', 'Golden Slumbers.mid'), 'one shared word is not enough')

  console.log(`copyBars: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
