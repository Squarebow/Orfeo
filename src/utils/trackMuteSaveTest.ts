import { Midi } from '@tonejs/midi'
import { parseMidiBuffer } from './midiParser'

// A song saved with a track muted opens with that track muted (ORFEO_TRACK_MUTED,
// written by the Playback Editor's save in electron/main.ts)
function saved(meta: string[]) {
  const m = new Midi()
  m.header.tempos.push({ ticks: 0, bpm: 120 })
  m.header.update()
  m.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.7 })
  m.addTrack().addNote({ midi: 40, ticks: 0, durationTicks: 480, velocity: 0.7 })
  ;(m.header as any).meta = meta.map(text => ({ type: 'text', text, ticks: 0 }))
  const a = m.toArray()
  return parseMidiBuffer(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer, 'test.mid') as any
}

export function runTrackMuteSaveTest(): number {
  console.group('[trackMuteSave] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const both = saved(['ORFEO_TRACK_MUTED:0:0', 'ORFEO_TRACK_MUTED:1:1', 'ORFEO_TRACK_VISIBLE:1:0'])
  check(both._orfeoTrackMuted?.[1] === true, 'muted track read back as muted')
  check(both._orfeoTrackMuted?.[0] === false, 'unmuted track read back as unmuted')
  check(both._orfeoTrackVisible?.[1] === false, 'the eye still reads alongside')
  check(both.tracks.length === 2, 'a muted track stays in the song')

  const older = saved([])
  check(older._orfeoTrackMuted === undefined, 'a file without the mark: nothing forced')

  check(saved(['ORFEO_TRACK_MUTED:1:yes'])._orfeoTrackMuted === undefined, 'a damaged mark is ignored')

  console.log(`trackMuteSave: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
