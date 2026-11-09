import { Midi } from '@tonejs/midi'
import { parseMidiBuffer } from './midiParser'
import { DRUM_HOLD_MAX_SEC } from './drumHold'

// 120 BPM: one beat = 0.5 s. Piano plays 0–10 s.
const PPQ = 480
const sec = (s: number) => Math.round(s * 2 * PPQ)
function song(drums: { at: number; held: number; key?: number }[], extra?: (m: Midi) => void): ArrayBuffer {
  const m = new Midi()
  m.header.tempos.push({ ticks: 0, bpm: 120 })
  m.header.update()
  const piano = m.addTrack()
  for (let i = 0; i < 20; i++) piano.addNote({ midi: 60 + (i % 7), ticks: sec(i * 0.5), durationTicks: sec(0.5), velocity: 0.7 })
  const kit = m.addTrack()
  kit.channel = 9
  for (const d of drums) kit.addNote({ midi: d.key ?? 38, ticks: sec(d.at), durationTicks: sec(d.held), velocity: 0.8 })
  extra?.(m)
  const a = m.toArray()
  return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.01

export function runDrumHoldTest(): number {
  console.group('[drumHold] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // a snare held four and a half minutes past the music
  const stray = parseMidiBuffer(song([{ at: 1, held: 0.1 }, { at: 9.5, held: 275 }]), 'stray.mid')
  check(near(stray.duration, 9.5 + DRUM_HOLD_MAX_SEC), `the song ends a few seconds after that hit, not minutes later, got ${stray.duration}`)
  const kit = stray.tracks.find(t => t.isDrum)!
  check(near(kit.notes[1].duration, DRUM_HOLD_MAX_SEC) && near(kit.notes[0].duration, 0.1), 'only the held hit is shortened, the others keep their length')

  // ordinary drums change nothing
  const plain = parseMidiBuffer(song([{ at: 1, held: 0.1 }, { at: 9.5, held: 0.25 }]), 'plain.mid')
  check(near(plain.duration, 10), `a normal song keeps its length, got ${plain.duration}`)

  // a last cymbal written long to ring out still counts in full
  const ring = parseMidiBuffer(song([{ at: 9.5, held: 6, key: 49 }]), 'ring.mid')
  check(near(ring.duration, 15.5), `a ringing cymbal keeps the song going until it's done, got ${ring.duration}`)

  // only drums: a held organ chord is real music
  const organ = parseMidiBuffer(song([], m => { const t = m.addTrack(); t.instrument.number = 19; t.addNote({ midi: 48, ticks: sec(8), durationTicks: sec(60), velocity: 0.6 }) }), 'organ.mid')
  check(near(organ.duration, 68), `a long organ note still sets the end, got ${organ.duration}`)

  console.log(`drumHold: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
