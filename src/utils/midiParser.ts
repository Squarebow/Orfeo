import { Midi } from '@tonejs/midi'
import type { ParsedMidi, ParsedTrack, ParsedNote } from '../types'
import { getGMName, getGMGroup } from './gmInstruments'

const TRACK_COLORS = [
  '#e8a027', '#6b7ab5', '#4ecdc4', '#e06c75',
  '#98c379', '#c678dd', '#61afef', '#e5c07b',
  '#f0a500', '#7ec8e3', '#d4a5a5', '#a8d8a8',
]

export function parseMidiBuffer(buffer: ArrayBuffer, fileName: string, filePath = ''): ParsedMidi {
  // FUTURE: KAR lyric events (meta type 0x05 = lyrics, 0x01 = text) could
  // be extracted here for a karaoke display overlay. Not in scope currently.
  // @tonejs/midi v2.x handles these silently via the underlying midi-file parser.
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

    // ── Extract first-occurrence CC values for mixer initialization ───────────
    // @tonejs/midi normalizes CC values to 0–1. CC10 pan: 0.5 = center.
    const parseCC = (n: number): number | undefined => {
      const ccs = (track as any).controlChanges
      if (!ccs) return undefined
      const arr = ccs[n]
      return Array.isArray(arr) && arr.length > 0 ? arr[0].value : undefined
    }

    const parsedTrack: any = {
      index: tracks.length,
      name: track.name || gmName,
      gmName,
      program,
      group,
      isDrum,
      color,
      notes,
      channel: track.channel ?? i,
      _cc7:  parseCC(7),
      _cc10: parseCC(10),
      _cc91: parseCC(91),
      _cc93: parseCC(93),
    }

    tracks.push(parsedTrack)
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

  // ── Precompute bar start times using full tempo map ─────────────────────────
  // Single source of truth consumed by PianoRoll and TopBar via the store.
  const barStarts: number[] = []
  {
    const beatsPerBar = timeSig[0]
    const effectiveTempoMap = tempoMap.length > 0 ? tempoMap : [{ bpm, time: 0 }]
    let bt = 0, bti = 0
    while (bt <= duration + 0.5) {
      barStarts.push(bt)
      while (bti + 1 < effectiveTempoMap.length && effectiveTempoMap[bti + 1].time <= bt) bti++
      bt += (60 / effectiveTempoMap[bti].bpm) * beatsPerBar
    }
  }

  // ── Restore Orfeo custom track names from header text meta-events ────────────
  // Format: ORFEO_TRACK_NAME:N:name — type-0x01 text events injected by editor:save.
  // Only present in files previously saved through Orfeo; ignored for all other files.
  const orfeoTrackNames: Record<number, string> = {}
  for (const meta of (midi.header as any).meta ?? []) {
    if (typeof meta.text === 'string' && meta.text.startsWith('ORFEO_TRACK_NAME:')) {
      const rest = meta.text.slice('ORFEO_TRACK_NAME:'.length)
      const colonIdx = rest.indexOf(':')
      if (colonIdx >= 0) {
        const idx = parseInt(rest.slice(0, colonIdx), 10)
        const name = rest.slice(colonIdx + 1)
        if (!isNaN(idx) && name) orfeoTrackNames[idx] = name
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
    _barStarts: barStarts,
    _orfeoTrackNames: Object.keys(orfeoTrackNames).length > 0 ? orfeoTrackNames : undefined,
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