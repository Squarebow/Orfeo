import { readFileSync } from 'node:fs'
import { parseMidiBuffer } from '../utils/midiParser'
import { buildExportSong } from './exportSong'
import { renderStudioSynth } from './exportStudio'
import { TAIL_SEC } from './exportEncode'

// Plays a demo song through the Studio export synth (GeneralUser, as shipped)
const file = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }

export async function runExportStudioTest(): Promise<number> {
  console.group('[exportStudio] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const midi = parseMidiBuffer(file('public/Demo/Scott Joplin - Entertainer.mid'), 'Entertainer.mid') as any
  const tracks = midi.tracks.map((t: any) => ({ index: t.index, program: t.program, muted: false, solo: false, volume: 1, pan: 0, reverb: 0, chorus: 0 }))
  const song = buildExportSong(midi, tracks, 'original')
  // the first 20 s only, to keep the check quick
  const short = { ...song, events: song.events.filter(e => e.time < 20), duration: 20 }
  const bank = file('public/GeneralUser-GS.sf2')

  let progressed = 0
  const a = await renderStudioSynth(short, [bank], p => { progressed = Math.max(progressed, p) })
  const want = (20 + TAIL_SEC) * 44100
  check(a.rate === 44100, `44.1 kHz, got ${a.rate}`)
  check(Math.abs(a.l.length - want) <= 128, `length = song + tail (${want}), got ${a.l.length}`)
  let peak = 0
  for (let i = 0; i < a.l.length; i++) peak = Math.max(peak, Math.abs(a.l[i]), Math.abs(a.r[i]))
  check(peak > 0.01, `makes sound, peak ${peak}`)
  check(progressed >= 0.99, `progress reaches the end, got ${progressed}`)

  const b = await renderStudioSynth(short, [bank])
  let same = a.l.length === b.l.length
  for (let i = 0; same && i < a.l.length; i += 97) same = a.l[i] === b.l[i] && a.r[i] === b.r[i]
  check(same, 'two renders are identical')

  let cancelledAt = 0
  const c = await renderStudioSynth(short, [bank], p => { cancelledAt = p }, () => cancelledAt > 0.2)
  check(c.l.length === 0, `cancel → empty, got ${c.l.length}`)

  console.log(`exportStudio: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
