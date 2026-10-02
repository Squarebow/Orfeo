import { Midi } from '@tonejs/midi'
import type { ParsedMidi } from '../types'
import { buildFileGrid } from './beatGridBuild'
import { collectOnsets } from './tapRefine'
import { applyTempoCorrection, type SongTempoCorrection } from './tempoCorrection'
import { getGMGroup } from './gmInstruments'
import { judgeTempo, type TrustResult } from './tempoTrust'

// ── Tempo-warning analysis entry points. `analyzeParsed` judges the open
// song from its already-parsed MIDI (its _beatTimes already include any
// kept Tap Tempo). `analyzeBuffer` is the lean path for Library songs: just
// notes + the file's own grid (no hand assignment, no key detection), same
// drum/instrument-family rules as midiParser.ts so both paths agree. ─────

const UNCHECKED: TrustResult = { flagged: false, from: null, throughout: false, hintBpm: null, shifted: false, fileBpm: 0, okWindows: 0, offWindows: 0, unclearWindows: 0 }

function judgeParsed(midi: ParsedMidi): TrustResult {
  const m = midi as any
  const beats: number[] = m._beatTimes ?? []
  const fileBpm = Math.round(m._tempoMap?.[0]?.bpm ?? midi.bpm ?? 0)
  return judgeTempo(beats, collectOnsets(midi, 0, midi.duration), midi.duration, fileBpm)
}

export function analyzeParsed(midi: ParsedMidi): TrustResult {
  try { return judgeParsed(midi) } catch { return { ...UNCHECKED } }
}

export function analyzeBuffer(buf: ArrayBuffer, correction?: SongTempoCorrection | null): TrustResult {
  try {
    const midi = new Midi(buf)
    const tracks = midi.tracks.filter(t => t.notes.length > 0).map((t, i) => {
      const isDrum = t.channel === 9
      const program = isDrum ? -1 : (t.instrument?.number ?? 0)
      return {
        index: i, isDrum, group: getGMGroup(program, isDrum),
        notes: t.notes.map(n => ({ time: n.time, midi: n.midi, velocity: n.velocity, duration: n.duration })),
      }
    })
    let duration = midi.duration
    if (duration <= 0) for (const t of tracks) for (const n of t.notes) duration = Math.max(duration, n.time + n.duration)
    const { barTimes, beatTimes } = buildFileGrid(midi.header as any, duration)
    const tempoMap = midi.header.tempos.map(t => ({ bpm: t.bpm, time: t.time ?? 0 })).sort((a, b) => a.time - b.time)
    const timeSigMap = midi.header.timeSignatures
      .map(s => ({ num: s.timeSignature[0], den: s.timeSignature[1], time: midi.header.ticksToSeconds(s.ticks) }))
      .sort((a, b) => a.time - b.time)
    let lean = {
      duration, bpm: tempoMap[0]?.bpm ?? 120, tracks,
      _beatTimes: beatTimes, _barTimes: barTimes, _barStarts: barTimes, _tempoMap: tempoMap, _timeSigMap: timeSigMap,
    } as unknown as ParsedMidi
    if (correction) lean = applyTempoCorrection(lean, correction)
    return judgeParsed(lean)
  } catch {
    return { ...UNCHECKED }
  }
}

// Does a Library file need (re)checking? Unknown file, changed on disk
// (size/mtime), no cached result, or a result from an older detector.
export function needsCheck(
  index: { size: number; mtime: number; songKey: string } | undefined,
  stat: { size: number; mtime: number },
  cache: Record<string, { v: number }>,
  version: number,
): boolean {
  if (!index || index.size !== stat.size || index.mtime !== stat.mtime) return true
  const c = cache[index.songKey]
  return !c || c.v !== version
}
