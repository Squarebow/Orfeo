import { Midi } from '@tonejs/midi'
import type { ParsedMidi, ParsedTrack, ParsedNote } from '../types'

const TRACK_COLORS = [
  '#e8a027', '#6b7ab5', '#4ecdc4', '#e06c75',
  '#98c379', '#c678dd', '#61afef', '#e5c07b',
]

export function parseMidiBuffer(buffer: ArrayBuffer, fileName: string): ParsedMidi {
  const midi = new Midi(buffer)

  const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120
  const timeSig = midi.header.timeSignatures.length > 0
    ? midi.header.timeSignatures[0].timeSignature
    : [4, 4]

  const tracks: ParsedTrack[] = []

  midi.tracks.forEach((track, i) => {
    if (track.notes.length === 0) return
    const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length]
    const notes: ParsedNote[] = track.notes.map(n => ({
      midi: n.midi,
      time: n.time,
      duration: n.duration,
      velocity: n.velocity,
      trackIndex: tracks.length,
    }))
    tracks.push({
      index: tracks.length,
      name: track.name || `Track ${i + 1}`,
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

  const result: ParsedMidi = {
    fileName,
    duration,
    bpm,
    timeSignatureNumerator: timeSig[0],
    timeSignatureDenominator: timeSig[1],
    tracks,
    noteCount: tracks.reduce((sum, t) => sum + t.notes.length, 0),
    // Store raw buffer for JZZ playback
    _raw: buffer,
  } as any

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