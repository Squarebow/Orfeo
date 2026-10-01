import type { ParsedMidi, TempoEvent } from '../types'

// ── Tempo correction — per-song, user-tapped replacement of the BEAT LAYER
// only (bar lines, beats, tempo/time-sig readout maps). Notes, audio and
// midi.bpm are never touched; every consumer of the beat layer already reads
// these parsed-MIDI fields, so swapping them is the whole feature. The
// untouched file grid is stashed as `_fileGrid` so re-correcting or
// resetting never stacks on a previous correction. ─────────────────────────
export interface TimeSigEvent { num: number; den: number; time: number }
export interface TempoSegment {
  start: number        // song seconds where this correction takes over
  anchor: number       // song seconds of a downbeat (beat 1)
  period: number       // seconds per beat
  beatsPerBar: number
  den: number
  snap?: { ratio: number; barShift: number }
}
export interface SongTempoCorrection { segments: TempoSegment[] }
export interface FileGrid { beats: number[]; bars: number[]; tempoMap: TempoEvent[]; timeSigMap: TimeSigEvent[] }

const EPS = 1e-6
const SEAM_FRAC = 0.5
const MAX_BEATS = 200000
// Same tempo bounds as the tap fit — anything outside is a corrupt entry
const MIN_PERIOD = 60 / 400
const MAX_PERIOD = 60 / 20

export function fileGridOf(midi: ParsedMidi): FileGrid {
  const m = midi as any
  if (m._fileGrid) return m._fileGrid as FileGrid
  return {
    beats: m._beatTimes ?? [], bars: m._barTimes ?? [],
    tempoMap: m._tempoMap ?? [], timeSigMap: m._timeSigMap ?? [],
  }
}

export function sigAt(map: TimeSigEvent[], t: number): { num: number; den: number } {
  let cur = map[0] ? { num: map[0].num, den: map[0].den } : { num: 4, den: 4 }
  for (const e of map) { if (e.time <= t + EPS) cur = { num: e.num, den: e.den }; else break }
  return cur
}

export function lastIndexAtOrBefore(arr: number[], t: number): number {
  let lo = 0, hi = arr.length - 1, ans = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (arr[mid] <= t + EPS) { ans = mid; lo = mid + 1 } else hi = mid - 1
  }
  return ans
}

export function nearestIndex(arr: number[], t: number): number {
  if (arr.length === 0) return -1
  const i = lastIndexAtOrBefore(arr, t)
  if (i < 0) return 0
  if (i + 1 < arr.length && arr[i + 1] - t < t - arr[i]) return i + 1
  return i
}

export function buildSegment(midi: ParsedMidi, start: number, fit: { period: number; anchor: number }): TempoSegment {
  const file = fileGridOf(midi)
  const sig = sigAt(file.timeSigMap, start)
  return { start, anchor: fit.anchor, period: fit.period, beatsPerBar: sig.num, den: sig.den }
}

interface SegGrid { beats: number[]; bars: number[]; tempo: TempoEvent[]; sigs: TimeSigEvent[] }

function freeGrid(seg: TempoSegment, limit: number): SegGrid {
  const beats: number[] = [], bars: number[] = []
  const bpb = Math.max(1, Math.round(seg.beatsPerBar))
  const kMin = Math.ceil((seg.start - seg.anchor) / seg.period - EPS)
  for (let k = kMin; beats.length < MAX_BEATS; k++) {
    const t = seg.anchor + k * seg.period
    if (t >= limit - EPS) break
    beats.push(t)
    if (((k % bpb) + bpb) % bpb === 0) bars.push(t)
  }
  const t0 = beats[0] ?? seg.start
  return {
    beats, bars,
    tempo: [{ bpm: 60 / seg.period, time: t0 }],
    sigs: [{ num: bpb, den: seg.den, time: t0 }],
  }
}

function segmentGrid(_file: FileGrid, seg: TempoSegment, limit: number): SegGrid {
  return freeGrid(seg, limit)
}

function validSeg(s: any): s is TempoSegment {
  return !!s && [s.start, s.anchor, s.period, s.beatsPerBar, s.den].every(v => typeof v === 'number' && Number.isFinite(v))
    && s.period >= MIN_PERIOD && s.period <= MAX_PERIOD && s.beatsPerBar >= 1 && s.den >= 1 && s.start >= 0
    && (s.snap === undefined || (!!s.snap && typeof s.snap.ratio === 'number' && s.snap.ratio > 0 && Number.isInteger(s.snap.barShift)))
}

export function applyTempoCorrection(midi: ParsedMidi, c: SongTempoCorrection | null | undefined): ParsedMidi {
  const file = fileGridOf(midi)
  const segs = (c?.segments ?? [])
    .filter(s => validSeg(s) && s.start < midi.duration)
    .sort((a, b) => a.start - b.start)

  let beats = file.beats.slice(), bars = file.bars.slice()
  let tempo = file.tempoMap.slice(), sigs = file.timeSigMap.slice()

  segs.forEach((seg, i) => {
    const limit = i + 1 < segs.length ? segs[i + 1].start : midi.duration + 8 * seg.period
    const g = segmentGrid(file, seg, limit)
    if (g.beats.length === 0) return
    const first = g.beats[0]
    // the file grid is kept only BEFORE the start point, and never within
    // half a beat of the first corrected beat (no near-duplicate at the seam)
    const cut = Math.min(first - SEAM_FRAC * seg.period, seg.start - EPS)
    beats = beats.filter(t => t < cut)
    bars = bars.filter(t => t < cut)
    tempo = tempo.filter(e => e.time < first - EPS)
    sigs = sigs.filter(e => e.time < first - EPS)
    beats.push(...g.beats); bars.push(...g.bars)
    tempo.push(...g.tempo); sigs.push(...g.sigs)
  })

  const out: any = { ...midi, _fileGrid: file }
  out._beatTimes = beats
  out._barTimes = bars
  out._barStarts = bars
  out._tempoMap = tempo
  out._timeSigMap = sigs
  return out as ParsedMidi
}

export function upsertSegment(c: SongTempoCorrection | null | undefined, seg: TempoSegment): SongTempoCorrection {
  const kept = (c?.segments ?? []).filter(s => s.start < seg.start - EPS)
  return { segments: [...kept, seg] }
}

export function shiftDownbeat(seg: TempoSegment, dir: 1 | -1): TempoSegment {
  if (seg.snap) return { ...seg, snap: { ...seg.snap, barShift: seg.snap.barShift + dir } }
  return { ...seg, anchor: seg.anchor + dir * seg.period }
}

export function scaleCorrection(c: SongTempoCorrection, k: number): SongTempoCorrection {
  return { segments: c.segments.map(s => ({ ...s, start: s.start * k, anchor: s.anchor * k, period: s.period * k })) }
}

// Saving a new version of a song (Tempo/Key save, Playback Editor) changes
// its bytes, so its songKey changes too — carry the correction across.
// Baking a speed change rescales file time by 1/bpmRatio (= timeScale).
export function carryCorrection(
  all: Record<string, SongTempoCorrection>, fromKey: string | null, toKey: string, timeScale: number,
): Record<string, SongTempoCorrection> | null {
  if (!fromKey || fromKey === toKey || !all[fromKey]) return null
  return { ...all, [toKey]: scaleCorrection(all[fromKey], timeScale) }
}

export function sanitizeCorrections(x: unknown): Record<string, SongTempoCorrection> {
  const out: Record<string, SongTempoCorrection> = {}
  if (!x || typeof x !== 'object') return out
  for (const [key, v] of Object.entries(x as Record<string, any>)) {
    if (!v || !Array.isArray(v.segments) || v.segments.length === 0 || !v.segments.every(validSeg)) {
      console.warn(`[Orfeo] ignoring invalid tempo correction for ${key}`)
      continue
    }
    out[key] = { segments: v.segments.map((s: TempoSegment) => ({ ...s })) }
  }
  return out
}
