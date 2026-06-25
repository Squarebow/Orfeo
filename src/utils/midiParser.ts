import { Midi } from '@tonejs/midi'
import type { ParsedMidi, ParsedTrack, ParsedNote } from '../types'
import { getGMName, getGMGroup } from './gmInstruments'

const TRACK_COLORS = [
  '#e8a027', '#6b7ab5', '#4ecdc4', '#e06c75',
  '#98c379', '#c678dd', '#61afef', '#e5c07b',
  '#f0a500', '#7ec8e3', '#d4a5a5', '#a8d8a8',
]

export function parseMidiBuffer(buffer: ArrayBuffer, fileName: string, filePath = ''): ParsedMidi {
  const midi = new Midi(buffer)

  const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120
  // Full tempo map: [{bpm, time}] sorted by time — for tempo-change support
  const tempoMap = midi.header.tempos
    .map((t: any) => ({ bpm: t.bpm, time: t.time ?? 0 }))
    .sort((a: any, b: any) => a.time - b.time)
  const timeSig = midi.header.timeSignatures.length > 0
    ? midi.header.timeSignatures[0].timeSignature
    : [4, 4]

  // Extract key signature from MIDI metadata
  let keySignature: { key: number; scale: string } | null = null
  try {
    const ks = (midi.header as any).keySignatures
    if (ks && ks.length > 0) {
      keySignature = { key: ks[0].key ?? 0, scale: ks[0].scale ?? 'major' }
    }
  } catch {}

  const tracks: ParsedTrack[] = []

  midi.tracks.forEach((track, i) => {
    if (track.notes.length === 0) return
    const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length]
    const isDrum = track.channel === 9
    const program = isDrum ? -1 : (track.instrument?.number ?? 0)
    const gmName = isDrum ? 'Standard Drum Kit' : getGMName(program)
    const group = getGMGroup(program, isDrum)

    const notes: ParsedNote[] = track.notes.map(n => ({
      midi: n.midi,
      time: n.time,
      duration: n.duration,
      velocity: n.velocity,
      trackIndex: tracks.length,
    }))

    tracks.push({
      index: tracks.length,
      name: track.name || gmName,
      gmName,
      program,
      group,
      isDrum,
      color,
      notes,
      channel: track.channel ?? i,
    })
  })

  let duration = midi.duration
  if (duration <= 0) {
    for (const t of tracks) {
      for (const n of t.notes) {
        const end = n.time + n.duration
        if (end > duration) duration = end
      }
    }
  }

  const result: any = {
    fileName,
    duration,
    bpm,
    timeSignatureNumerator: timeSig[0],
    timeSignatureDenominator: timeSig[1],
    tracks,
    noteCount: tracks.reduce((sum, t) => sum + t.notes.length, 0),
    _raw: buffer,
    _keySignature: keySignature,
    _filePath: filePath,
    _rawMidiTracks: midi.tracks,
    _tempoMap: tempoMap,
  }

  return result
}

export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function midiToKeyIndex(midi: number): number {
  return midi - 21
}

export function isBlackKey(midi: number): boolean {
  const note = midi % 12
  return [1, 3, 6, 8, 10].includes(note)
}