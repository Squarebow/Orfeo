import { Midi } from '@tonejs/midi'
import { prepareSong } from './prepareSong'
import { parseMidiBuffer } from './midiParser'
import { correctionToSong, correctionToFile } from './tempoCorrection'
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
  check(eq(correctionToFile(correctionToSong(c, 7.2), 7.2, c), c), 'correction round trip')
  check(correctionToSong(c, 10).segments[0].start === 0, 'segment starting in the skipped bars starts at the new beginning')
  // corrections that start inside the skipped bars come back exactly as they were
  const inLead = { segments: [
    { start: 0, anchor: 0.2, period: 0.62, beatsPerBar: 4, den: 4 },
    { start: 3, anchor: 3.1, period: 0.61, beatsPerBar: 4, den: 4 },
    { start: 9, anchor: 9.5, period: 0.6, beatsPerBar: 4, den: 4 }] }
  check(eq(correctionToFile(correctionToSong(inLead, 7.2), 7.2, inLead), inLead), 'segments in the skipped bars survive a round trip')

  // A chord whose root is played a hair early, on the music's first downbeat:
  // every note of it stays (review: the early root was deleted)
  {
    const m = new Midi()
    m.header.tempos.push({ ticks: 0, bpm: 120 })
    m.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
    m.header.update()
    const t = m.addTrack()
    t.addNote({ midi: 60, ticks: 16 * PPQ - 3, durationTicks: PPQ, velocity: 0.7 })
    t.addNote({ midi: 64, ticks: 16 * PPQ, durationTicks: PPQ, velocity: 0.7 })
    t.addNote({ midi: 67, ticks: 16 * PPQ, durationTicks: PPQ, velocity: 0.7 })
    const a = m.toArray()
    const q = prepareSong(parseMidiBuffer(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer, 'x.mid'), { skip: true, keepCountIn: true, correction: null })
    check((q._leadTick ?? 0) > 0 && q.tracks[0].notes.map(n => n.midi).sort().join() === '60,64,67', `early chord root kept: ${q.tracks[0].notes.map(n => n.midi)}`)
  }

  // A separate click track that plays only before the music: cutting the clicks
  // must not leave it empty, or every later track would shift by one (review)
  {
    const m = new Midi()
    m.header.tempos.push({ ticks: 0, bpm: 120 })
    m.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
    m.header.update()
    const click = m.addTrack(); click.channel = 9
    for (let i = 0; i < 4; i++) click.addNote({ midi: 42, ticks: 12 * PPQ + i * PPQ, durationTicks: 60, velocity: 0.6 })
    const piano = m.addTrack(); piano.channel = 0
    piano.addNote({ midi: 60, ticks: 16 * PPQ, durationTicks: PPQ, velocity: 0.7 })
    const bass = m.addTrack(); bass.channel = 1
    bass.addNote({ midi: 36, ticks: 16 * PPQ, durationTicks: PPQ, velocity: 0.7 })
    const a = m.toArray()
    const raw = a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer
    const full = parseMidiBuffer(raw, 'x.mid')
    const q = prepareSong(parseMidiBuffer(raw, 'x.mid'), { skip: true, keepCountIn: false, correction: null })
    check((q._leadTick ?? 0) > 0 && q.tracks.length === full.tracks.length, `no track emptied: ${full.tracks.length} → ${q.tracks.length}`)
  }

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
  // A correction starting inside the skipped bars, then an edit with the switch
  // on that changes nothing about it: stored exactly as before (review)
  useStore.setState({ skipEmptyBars: true, tempoCorrections: { [onKey]: inLead } })
  useStore.getState().setMidi(parseMidiBuffer(leadBytes, 'x.mid'))
  useStore.getState().setSongCorrection(onKey, currentCorrection(useStore.getState()))
  check(eq(useStore.getState().tempoCorrections[onKey], inLead), `stored correction unchanged by an edit with the switch on: ${JSON.stringify(useStore.getState().tempoCorrections[onKey])}`)
  useStore.getState().setMidi(null)

  // Never both on: Chord Transcription's charts number bars as the file has
  // them, Skip empty bars renumbers from the music — switching one on
  // switches the other off
  useStore.setState({ skipEmptyBars: true, chordTranscriptionEnabled: false })
  useStore.getState().setChordTranscriptionEnabled(true)
  check(useStore.getState().chordTranscriptionEnabled && !useStore.getState().skipEmptyBars, 'Chord Transcription on → Skip empty bars off')
  useStore.getState().setSkipEmptyBars(true)
  check(useStore.getState().skipEmptyBars && !useStore.getState().chordTranscriptionEnabled, 'Skip empty bars on → Chord Transcription off')
  useStore.getState().setChordTranscriptionEnabled(false)
  check(useStore.getState().skipEmptyBars, 'switching one off leaves the other alone')
  useStore.setState({ skipEmptyBars: false })

  console.log(`prepareSong: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
