import { Midi } from '@tonejs/midi'
import type { ParsedMidi, ParsedTrack, ParsedNote } from '../types'

// Track colors — amber right, slate left, then cycling palette for more tracks
const TRACK_COLORS = [
  '#e8a027', // amber (right hand / track 1)
  '#6b7ab5', // slate violet (left hand / track 2)
  '#4ecdc4', // teal
  '#e06c75', // rose
  '#98c379', // green
  '#c678dd', // purple
  '#61afef', // blue
  '#e5c07b', // gold
]

export function parseMidiBuffer(buffer: ArrayBuffer, fileName: string): ParsedMidi {
  const midi = new Midi(buffer)

  const bpm = midi.header.tempos.length > 0 ? midi.header.tempos[0].bpm : 120
  const timeSig = midi.header.timeSignatures.length > 0
    ? midi.header.timeSignatures[0].timeSignature
    : [4, 4]

  const tracks: ParsedTrack[] = []

  midi.tracks.forEach((track, i) => {
    // Skip tracks with no notes
    if (track.notes.length === 0) return

    const color = TRACK_COLORS[tracks.length % TRACK_COLORS.length]
    const notes: ParsedNote[] = track.notes.map((n) => ({
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

  // Compute total duration from last note end
  let duration = midi.duration
  if (duration <= 0) {
    // Fallback: compute manually
    for (const t of tracks) {
      for (const n of t.notes) {
        const end = n.time + n.duration
        if (end > duration) duration = end
      }
    }
  }

  const noteCount = tracks.reduce((sum, t) => sum + t.notes.length, 0)

  return {
    fileName,
    duration,
    bpm,
    timeSignatureNumerator: timeSig[0],
    timeSignatureDenominator: timeSig[1],
    tracks,
    noteCount,
  }
}

/** Format seconds as mm:ss */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/** Convert MIDI pitch to key index on an 88-key piano (A0 = 0, C8 = 87) */
export function midiToKeyIndex(midi: number): number {
  return midi - 21 // A0 = MIDI 21
}

/** Returns true if MIDI pitch is a black key */
export function isBlackKey(midi: number): boolean {
  const note = midi % 12
  return [1, 3, 6, 8, 10].includes(note)
}
