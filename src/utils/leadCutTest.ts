import { findLeadCut } from './leadCut'
import type { ParsedMidi, ParsedTrack } from '../types'

// A 4/4 song at 120: a bar every 2 s, a beat every 0.5 s
const BARS = Array.from({ length: 16 }, (_, i) => i * 2)
const BEATS = Array.from({ length: 64 }, (_, i) => i * 0.5)
type N = [time: number, durOrNote: number]
function track(index: number, isDrum: boolean, notes: { midi: number; time: number; duration: number }[]): ParsedTrack {
  return { index, name: '', gmName: '', program: 0, group: isDrum ? 'drums' : 'piano', isDrum, color: '#000000', channel: isDrum ? 9 : 0,
    notes: notes.map(n => ({ ...n, velocity: 0.8 })) } as ParsedTrack
}
function song(o: { piano?: N[]; drums?: N[] }): ParsedMidi {
  const tracks: ParsedTrack[] = []
  if (o.piano) tracks.push(track(tracks.length, false, o.piano.map(([time, duration]) => ({ midi: 60, time, duration }))))
  if (o.drums) tracks.push(track(tracks.length, true, o.drums.map(([time, midi]) => ({ midi, time, duration: 0.1 }))))
  return { fileName: 'x.mid', duration: 30, bpm: 120, timeSignatureNumerator: 4, timeSignatureDenominator: 4, tracks,
    noteCount: tracks.reduce((t, x) => t + x.notes.length, 0), _barTimes: BARS, _beatTimes: BEATS }
}
// a click on every beat from `from` up to `to` seconds
const beatsOf = (from: number, to: number, note: number): N[] => BEATS.filter(b => b >= from && b < to).map(b => [b, note])
// a busy drum bar: kick and snare on sixteenths
const fillIn = (at: number): N[] => Array.from({ length: 16 }, (_, i) => [at + i * 0.125, i % 2 ? 38 : 36] as N)
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function runLeadCutTest(): number {
  console.group('[leadCut] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  check(eq(findLeadCut(song({ piano: [[6.0, 1]] }), true), { bar: 3, sec: 6 }), 'three empty bars skipped')
  check(findLeadCut(song({ piano: [[0.5, 1]] }), true) === null, 'music in bar 1: untouched')
  check(eq(findLeadCut(song({ piano: [[5.5, 0.5]] }), true), { bar: 2, sec: 4 }), 'pickup keeps its bar')
  const clicks = beatsOf(4, 8, 42)
  check(eq(findLeadCut(song({ piano: [[8, 1]], drums: clicks }), true), { bar: 2, sec: 4 }), 'count-in kept')
  check(eq(findLeadCut(song({ piano: [[8, 1]], drums: clicks }), false), { bar: 4, sec: 8 }), 'count-in cut')
  const four = beatsOf(0, 8, 37)
  check(eq(findLeadCut(song({ piano: [[8, 1]], drums: four }), true), { bar: 2, sec: 4 }), 'long click run: last two kept')
  check(eq(findLeadCut(song({ piano: [[8, 1]], drums: four }), false), { bar: 4, sec: 8 }), 'long click run: all cut')
  check(eq(findLeadCut(song({ piano: [[8, 1]], drums: beatsOf(6, 8, 42) }), true), { bar: 3, sec: 6 }), 'one click bar kept')
  check(eq(findLeadCut(song({ piano: [[8, 1]], drums: fillIn(6) }), false), { bar: 3, sec: 6 }), 'a drum fill is music')
  check(eq(findLeadCut(song({ piano: [[8, 1]], drums: [...beatsOf(2, 4, 42), ...beatsOf(6, 8, 42)] }), false), { bar: 4, sec: 8 }), 'only clicks right before the music count')
  check(eq(findLeadCut(song({ piano: [[3, 4], [8, 1]] }), true), { bar: 1, sec: 2 }), 'held note across: cut no later than its bar')
  check(findLeadCut(song({ drums: four }), true) === null, 'clicks only: untouched')
  check(findLeadCut(song({}), true) === null, 'no notes: untouched')
  check(eq(findLeadCut(song({ piano: [[5.999, 1]] }), true), { bar: 3, sec: 6 }), 'a hair early still counts as the bar it belongs to')

  console.log(`leadCut: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
