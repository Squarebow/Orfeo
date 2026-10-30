// ── Export to audio: what plays ─────────────────────────────────────────────
// Turns a song and a version into one flat, time-sorted list of events (in
// seconds, as played) plus the mix each channel gets and the master settings.
// Both export renderers (Studio, Native) play from this, each the way its live
// engine plays — the event content mirrors sendSong() in useNativeEngine.ts.
//   original — the file as written: every track, its own tempo, key and mix
//   focus    — keys, bass and drums only (focusRole, as the Focus button)
//   heard    — as the player hears it now: mutes/solo, tempo, key, Mixer,
//              instruments changed in the panel, master settings, the loop
// A recording from the keyboard (later) only needs to arrive as a ParsedMidi.
import type { ParsedMidi, ParsedTrack, TrackState } from '../types'
import { focusRole } from '../utils/keyboardGroups'
import { programTimeline } from './programTimeline'

export type ExportVersion = 'original' | 'focus' | 'heard'
export interface ExportEvent { time: number; track: number; status: number; d1: number; d2: number }
export interface ExportChannel { volume: number; pan: number; reverb: number; chorus: number }
export interface ExportMaster { gain: number; toneDb: number; comp: { enabled: boolean; preset: number } }
export interface ExportSong {
  events: ExportEvent[]
  channels: (ExportChannel | null)[]
  channelTrack: (number | null)[]
  master: ExportMaster
  duration: number
  trackCount: number
  hasKeys: boolean
}
export interface HeardState { tempoRatio: number; transpose: number; master: ExportMaster; loop: { start: number; end: number } | null }

const NEUTRAL_MASTER: ExportMaster = { gain: 1, toneDb: 0, comp: { enabled: false, preset: 0 } }
const MIN_NOTE = 0.04   // as the engines: a note is never shorter than 40 ms

// The file's own mix for a track (what the Tracks panel starts from, makeTrackState)
function fileMix(t: ParsedTrack): ExportChannel {
  const a = t as any
  return { volume: a._cc7 ?? 1, pan: a._cc10 != null ? (a._cc10 - 0.5) * 2 : 0, reverb: a._cc91 ?? 0, chorus: a._cc93 ?? 0 }
}

export function buildExportSong(midi: ParsedMidi, tracks: TrackState[], version: ExportVersion, heard?: HeardState): ExportSong {
  const h = version === 'heard' ? heard : undefined
  const anySolo = !!h && tracks.some(t => t.solo)
  const sounds = (t: ParsedTrack): boolean => {
    if (version === 'focus') return focusRole(t) !== 'off'
    if (!h) return true
    const ts = tracks.find(s => s.index === t.index)
    return !!ts && !ts.muted && (!anySolo || ts.solo)
  }
  const playing = midi.tracks.filter(sounds)
  const channelsUsed = new Set(playing.map(t => t.channel & 0x0f))
  // Instruments: as the panel has them only for "as I hear it"; otherwise the file's own
  const programs = h ? tracks : midi.tracks.map(t => ({ index: t.index, program: t.program }))

  type Raw = [time: number, order: number, track: number, status: number, d1: number, d2: number]
  const raw: Raw[] = []
  const transpose = h?.transpose ?? 0
  for (const t of midi.tracks) {
    const ch = t.channel & 0x0f
    if (sounds(t)) {
      for (const n of t.notes) {
        const key = ch === 9 || t.isDrum ? n.midi : Math.max(0, Math.min(127, n.midi + transpose))
        const vel = Math.max(1, Math.min(127, Math.round(n.velocity * 127)))
        raw.push([n.time, 2, t.index, 0x90 | ch, key, vel])
        raw.push([n.time + Math.max(n.duration, MIN_NOTE), 0, t.index, 0x80 | ch, key, 0])
      }
    }
    if (!channelsUsed.has(ch)) continue
    for (const p of t.sustainEvents ?? []) raw.push([p.time, 1, t.index, 0xb0 | ch, 64, p.down ? 127 : 0])
    ;(t.volumeEvents ?? []).forEach((e, i) => raw.push([i ? e.time : 0, 1, t.index, 0xb0 | ch, 7, Math.round(e.value * 127)]))
    ;(t.expressionEvents ?? []).forEach((e, i) => raw.push([i ? e.time : 0, 1, t.index, 0xb0 | ch, 11, Math.round(e.value * 127)]))
  }
  for (const [ch, switches] of programTimeline({ tracks: playing }, programs)) {
    for (const sw of switches) raw.push([sw.time, 1, sw.track, 0xc0 | ch, sw.program, 0])
  }

  // ── The loop: keep what's inside, from 0; the controller/instrument state at
  // its start carries over; a note still sounding at its end is released there
  let list = raw
  const loop = h?.loop
  if (loop && loop.end > loop.start) {
    const state = new Map<string, Raw>()
    const inside: Raw[] = []
    const cutOffs = new Map<string, Raw>()
    for (const e of raw) {
      const [time, , , status, d1] = e
      const kind = status & 0xf0
      if (kind === 0x90) {
        if (time >= loop.start && time < loop.end) inside.push([time - loop.start, e[1], e[2], status, d1, e[5]])
        continue
      }
      if (kind === 0x80) {
        const k = `${status & 0x0f}:${d1}:${e[2]}`
        if (time > loop.start && time <= loop.end) inside.push([time - loop.start, e[1], e[2], status, d1, 0])
        else if (time > loop.end) cutOffs.set(k, [loop.end - loop.start, 0, e[2], status, d1, 0])
        continue
      }
      if (time < loop.start) { state.set(`${status}:${kind === 0xb0 ? d1 : ''}`, [0, 1, e[2], status, d1, e[5]]); continue }
      if (time < loop.end) inside.push([time - loop.start, e[1], e[2], status, d1, e[5]])
    }
    // release only notes that started inside the loop
    const started = new Set(inside.filter(e => (e[3] & 0xf0) === 0x90).map(e => `${e[3] & 0x0f}:${e[4]}:${e[2]}`))
    const offsInside = new Set(inside.filter(e => (e[3] & 0xf0) === 0x80).map(e => `${e[3] & 0x0f}:${e[4]}:${e[2]}`))
    for (const [k, off] of cutOffs) if (started.has(k) && !offsInside.has(k)) inside.push(off)
    list = [...state.values(), ...inside]
  }

  const ratio = h && h.tempoRatio > 0 ? h.tempoRatio : 1
  list.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const events: ExportEvent[] = list.map(e => ({ time: e[0] / ratio, track: e[2], status: e[3], d1: e[4], d2: e[5] }))
  let duration = 0
  for (const e of events) if ((e.status & 0xf0) === 0x80) duration = Math.max(duration, e.time)

  // ── Each channel's mix (the last track on a channel sets it, as applyTrackMix
  // does) and the track whose volume moves rule the channel (songVolume.ts)
  const channels: (ExportChannel | null)[] = Array(16).fill(null)
  const channelTrack: (number | null)[] = Array(16).fill(null)
  for (const t of playing) {
    const ch = t.channel & 0x0f
    const ts = tracks.find(s => s.index === t.index)
    channels[ch] = h && ts ? { volume: ts.volume, pan: ts.pan, reverb: ts.reverb, chorus: ts.chorus } : fileMix(t)
  }
  for (const t of midi.tracks) {
    const ch = t.channel & 0x0f
    if (channelsUsed.has(ch) && t.volumeEvents?.length && channelTrack[ch] === null) channelTrack[ch] = t.index
  }

  return {
    events, channels, channelTrack,
    master: h ? h.master : NEUTRAL_MASTER,
    duration,
    trackCount: midi.tracks.reduce((n, t) => Math.max(n, t.index + 1), 0),
    hasKeys: playing.some(t => focusRole(t) === 'keys'),
  }
}

const SUFFIX: Record<ExportVersion, string> = { original: '', focus: ' (Focus)', heard: ' (As I hear it)' }
export function exportFileName(songName: string, version: ExportVersion, ext: 'mp3' | 'wav'): string {
  return `${songName}${SUFFIX[version]}.${ext}`
}
