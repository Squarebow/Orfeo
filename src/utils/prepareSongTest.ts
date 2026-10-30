import { Midi } from '@tonejs/midi'
import { prepareSong } from './prepareSong'
import { parseMidiBuffer } from './midiParser'
import { shiftCorrection } from './tempoCorrection'
import { useStore, currentCorrection } from '../store'

// Three silent 4/4 bars at 100 BPM (7.2 s), then the music
const PPQ = 480
function leadSong(): ArrayBuffer {
  const m = new Midi()
  m.header.tempos.push({ ticks: 0, bpm: 100 })
  m.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
  m.header.update()
  const t = m.addTrack()
  for (let i = 0; i < 16; i++) t.addNote({ midi: 60 + (i % 5), ticks: 12 * PPQ + i * PPQ, durationTicks: PPQ, velocity: 0.7 })
  const a = m.toArray()
  return a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer
}
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function runPrepareSongTest(): number {
  console.group('[prepareSong] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const leadBytes = leadSong()
  const p = prepareSong(parseMidiBuffer(leadBytes, 'x.mid'), { skip: true, keepCountIn: true, correction: null })
  check(p._leadTick === 12 * PPQ && Math.abs((p._leadSec ?? 0) - 7.2) < 1e-6, `cut recorded in ticks and original seconds, got ${p._leadTick} / ${p._leadSec}`)
  check(p._origRaw === leadBytes && p._raw !== leadBytes, 'original bytes kept, song plays the cut bytes')
  check(p.tracks[0].notes[0].time < 0.01, `first note at the start, got ${p.tracks[0].notes[0].time}`)
  check(prepareSong(p, { skip: true, keepCountIn: true, correction: null }) === p, 'idempotent')
  const off = prepareSong(parseMidiBuffer(leadBytes, 'x.mid'), { skip: false, keepCountIn: true, correction: null })
  check(off._leadTick === 0 && off._origRaw === leadBytes && Math.abs(off.tracks[0].notes[0].time - 7.2) < 0.01, 'switch off: untouched')

  const c = { segments: [{ start: 9, anchor: 9.5, period: 0.5, beatsPerBar: 4, den: 4 }] }
  check(eq(shiftCorrection(shiftCorrection(c, -7.2), 7.2), c), 'correction round trip')
  check(shiftCorrection(c, -10).segments[0].start === 0, 'segment starting in the skipped bars clamps to 0')

  // Through the store: a correction tapped with the switch on is kept in the
  // file's own time, so it still fits with the switch off — and the song keeps
  // the same identity either way
  useStore.setState({ skipEmptyBars: true, keepDrumCountIn: true, tempoCorrections: {} })
  useStore.getState().setMidi(parseMidiBuffer(leadBytes, 'x.mid'))
  const onKey = useStore.getState().songKey!
  const tapped = { segments: [{ start: 1, anchor: 1.5, period: 0.6, beatsPerBar: 4, den: 4 }] }
  useStore.getState().setSongCorrection(onKey, tapped)
  check(Math.abs(useStore.getState().tempoCorrections[onKey].segments[0].start - 8.2) < 1e-9, 'stored in the file\'s own time')
  check(eq(currentCorrection(useStore.getState()), tapped), 'read back in song time')
  useStore.setState({ skipEmptyBars: false })
  useStore.getState().setMidi(parseMidiBuffer(leadBytes, 'x.mid'))
  check(useStore.getState().songKey === onKey, 'same song identity with the switch off')
  check(Math.abs(currentCorrection(useStore.getState())!.segments[0].anchor - 8.7) < 1e-9, 'correction still on the same beat with the switch off')
  useStore.getState().setMidi(null)

  console.log(`prepareSong: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
