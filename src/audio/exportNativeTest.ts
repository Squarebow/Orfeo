import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { parseMidiBuffer } from '../utils/midiParser'
import { buildExportSong } from './exportSong'
import { packNativeJob } from './exportNative'
import { TAIL_SEC } from './exportEncode'

// Packs a demo song for the native engine and renders it through the built
// add-on (native/build/orfeo_audio.node — `npm run native:build` first)
const file = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer }

export async function runExportNativeTest(): Promise<number> {
  console.group('[exportNative] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const midi = parseMidiBuffer(file('public/Demo/Scott Joplin - Entertainer.mid'), 'Entertainer.mid') as any
  const tracks = midi.tracks.map((t: any) => ({ index: t.index, program: t.program, muted: false, solo: false, volume: 1, pan: 0, reverb: 0, chorus: 0 }))
  const full = buildExportSong(midi, tracks, 'original')
  const song = { ...full, events: full.events.filter(e => e.time < 20), duration: 20 }

  // 1. Packing: one entry per event, 3 bytes each, in order
  const job = packNativeJob(song, { fluidDir: 'F', soundfonts: ['S'], masterGain: 1.37 })
  check(job.times.length === song.events.length && job.bytes.length === song.events.length * 3, 'one packed entry per event')
  const k = song.events.findIndex(e => (e.status & 0xf0) === 0x90)
  check(job.times[k] === song.events[k].time && job.tracks[k] === song.events[k].track
    && job.bytes[3 * k] === song.events[k].status && job.bytes[3 * k + 1] === song.events[k].d1 && job.bytes[3 * k + 2] === song.events[k].d2, 'event packed as time, track, status, d1, d2')
  check(job.job.channels.length === 16 && job.job.sampleRate === 44100 && job.job.tailSec === TAIL_SEC, '16 channels, 44.1 kHz, 2 s tail')
  check(job.job.masterGain === 1.37 && job.job.toneDb === 0 && job.job.compEnabled === false, 'master from the song (neutral) × the given gain')

  // 2. Through the real add-on
  const req = createRequire(resolve('package.json'))
  const { OfflineRender } = req(resolve('native/build/orfeo_audio.node'))
  const real = packNativeJob(song, { fluidDir: resolve('native/build/fluidsynth'), soundfonts: [resolve('public/GeneralUser-GS.sf2')], masterGain: 1.37 })
  const r = new OfflineRender(real.job, real.times, real.tracks, real.bytes, real.trackCount, real.duration)
  let out: Float32Array[] | null = null, last = 0
  while (!(out = r.take())) { last = r.progress(); await new Promise(res => setTimeout(res, 50)) }
  const want = Math.round((20 + TAIL_SEC) * 44100)
  check(Math.abs(out[0].length - want) <= 1 && out[1].length === out[0].length, `length = song + tail (${want}), got ${out[0].length}`)
  let peak = 0
  for (let i = 0; i < out[0].length; i++) peak = Math.max(peak, Math.abs(out[0][i]), Math.abs(out[1][i]))
  check(peak > 0.01, `makes sound, peak ${peak}`)
  check(last >= 0 && last <= 1, `progress in 0..1, got ${last}`)

  // 3. Cancel
  const c = new OfflineRender(real.job, real.times, real.tracks, real.bytes, real.trackCount, real.duration)
  c.cancel()
  let threw = ''
  try { while (!c.take()) await new Promise(res => setTimeout(res, 20)) } catch (e: any) { threw = String(e?.message ?? e) }
  check(threw === 'cancelled', `cancel → "cancelled", got "${threw}"`)

  console.log(`exportNative: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
