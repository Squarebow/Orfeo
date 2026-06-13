import { Midi } from '@tonejs/midi'
import type { MidiFile, MidiTrack, MidiNote } from '@/types'
import { getTrackColor } from './colors'

/**
 * Parse raw MIDI bytes (from Electron file read) into Orfeo MidiFile format
 */
export function parseMidiBuffer(buffer: ArrayBuffer, fileName: string, filePath: string): MidiFile {
  const midi = new Midi(buffer)

  const bpm = midi.header.tempos[0]?.bpm ?? 120
  const timeSig = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
  const duration = midi.duration

  const tracks: MidiTrack[] = midi.tracks
    .filter(t => t.notes.length > 0)
    .map((t, index) => {
      const notes: MidiNote[] = t.notes.map((n, ni) => ({
        id: `t${index}-n${ni}`,
        midi: n.midi,
        time: n.time,
        duration: n.duration,
        velocity: Math.round(n.velocity * 127),
        trackIndex: index,
        channel: t.channel ?? 0,
      }))

      return {
        index,
        name: t.name || `Track ${index + 1}`,
        channel: t.channel ?? index,
        instrument: t.instrument.number ?? 0,
        color: getTrackColor(index),
        notes,
        muted: false,
        solo: false,
        visible: true,
        volume: 1,
        pan: 0,
      }
    })

  // Estimate total bars
  const beatsPerBar = timeSig[0]
  const secondsPerBeat = 60 / bpm
  const totalBars = Math.ceil(duration / (secondsPerBeat * beatsPerBar))

  return {
    name: fileName.replace(/\.(mid|midi)$/i, ''),
    path: filePath,
    duration,
    bpm,
    timeSignature: { numerator: timeSig[0], denominator: timeSig[1] },
    tracks,
    totalBars,
  }
}

/**
 * Convert Electron IPC data (number array) to ArrayBuffer
 */
export function numberArrayToBuffer(data: number[]): ArrayBuffer {
  const buffer = new ArrayBuffer(data.length)
  const view = new Uint8Array(buffer)
  data.forEach((byte, i) => { view[i] = byte })
  return buffer
}

/**
 * Format seconds to mm:ss display
 */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * Convert seconds to bar.beat string given tempo and time signature
 */
export function secondsToBarBeat(
  seconds: number,
  bpm: number,
  numerator: number
): string {
  const secondsPerBeat = 60 / bpm
  const totalBeats = seconds / secondsPerBeat
  const bar = Math.floor(totalBeats / numerator) + 1
  const beat = Math.floor(totalBeats % numerator) + 1
  return `${bar}:${beat}`
}
