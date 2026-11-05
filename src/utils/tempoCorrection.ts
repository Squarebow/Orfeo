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
  pattern?: number[]   // bar lengths in beats, repeating from the anchor: 3 3 3 4
  map?: GridMap        // a whole beat layer copied from another version (copyBars.ts)
}
export interface SongTempoCorrection { segments: TempoSegment[] }
export interface FileGrid { beats: number[]; bars: number[]; tempoMap: TempoEvent[]; timeSigMap: TimeSigEvent[] }
export interface GridMap { beats: number[]; bars: number[]; tempo: TempoEvent[]; sigs: TimeSigEvent[] }

// ── Bar pattern as typed: "3 3 3 4", "3+3+3+4" or "3, 3, 3, 4". One number is
// a plain bar length. Null if it isn't a pattern. ─────────────────────────
const MAX_BAR_BEATS = 32
const MAX_PATTERN = 64

export function parseBarPattern(text: string): number[] | null {
  const parts = text.trim().split(/[\s,+]+/).filter(Boolean)
  if (parts.length === 0 || parts.length > MAX_PATTERN) return null
  const pat = parts.map(Number)
  return pat.every(n => Number.isInteger(n) && n >= 1 && n <= MAX_BAR_BEATS) ? pat : null
}

export function formatBarPattern(seg: TempoSegment): string {
  return (seg.pattern ?? [seg.beatsPerBar]).join(' ')
}

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
  const beats: number[] = [], bars: number[] = [], sigs: TimeSigEvent[] = []
  const pattern = seg.pattern?.length ? seg.pattern : [Math.max(1, Math.round(seg.beatsPerBar))]
  const cycle = pattern.reduce((a, b) => a + b, 0)
  // For each beat of the cycle, the length of the bar it's in and whether it's the 1
  const lenAt: number[] = [], isOne: boolean[] = []
  for (const len of pattern) for (let i = 0; i < len; i++) { lenAt.push(len); isOne.push(i === 0) }
  const kMin = Math.ceil((seg.start - seg.anchor) / seg.period - EPS)
  for (let k = kMin; beats.length < MAX_BEATS; k++) {
    const t = seg.anchor + k * seg.period
    if (t >= limit - EPS) break
    const pos = ((k % cycle) + cycle) % cycle
    beats.push(t)
    if (isOne[pos]) bars.push(t)
    // the time signature changes on the 1 of a bar of another length
    const last = sigs[sigs.length - 1]
    if (!last || (isOne[pos] && last.num !== lenAt[pos])) sigs.push({ num: lenAt[pos], den: seg.den, time: t })
  }
  const t0 = beats[0] ?? seg.start
  return {
    beats, bars,
    tempo: [{ bpm: 60 / seg.period, time: t0 }],
    sigs: sigs.length ? sigs : [{ num: pattern[0], den: seg.den, time: t0 }],
  }
}

// A beat layer copied from another version, as far as this segment reaches
function mapGrid(seg: TempoSegment, limit: number): SegGrid {
  const m = seg.map!
  const inRange = (t: number) => t >= seg.start - EPS && t < limit - EPS
  return {
    beats: m.beats.filter(inRange), bars: m.bars.filter(inRange),
    tempo: m.tempo.filter(e => inRange(e.time)), sigs: m.sigs.filter(e => inRange(e.time)),
  }
}

// "Keep the file's own bar lines": the file's beats, bars and time-signature
// changes pass through untouched; only the tempo NUMBER is rescaled by the
// tapped/file beat ratio (a file counted at double speed reads half). Used
// when the taps land exactly on the file's own beats (see tapRefine.ts's
// matchFileBeat) — its grid is right, only its tempo label is off.
function fileGrid(file: FileGrid, seg: TempoSegment, limit: number): SegGrid {
  const r = seg.snap!.ratio
  const inRange = (t: number) => t >= seg.start - EPS && t < limit - EPS
  const beats = file.beats.filter(inRange)
  const bars = file.bars.filter(inRange)
  const t0 = beats[0] ?? seg.start
  let bpm0 = file.tempoMap[0]?.bpm ?? 60 / seg.period
  for (const e of file.tempoMap) { if (e.time <= t0 + EPS) bpm0 = e.bpm; else break }
  const tempo: TempoEvent[] = [{ bpm: bpm0 / r, time: t0 }]
  for (const e of file.tempoMap) if (e.time > t0 + EPS && e.time < limit - EPS) tempo.push({ bpm: e.bpm / r, time: e.time })
  const sig0 = sigAt(file.timeSigMap, t0)
  const sigs: TimeSigEvent[] = [{ ...sig0, time: t0 }]
  for (const e of file.timeSigMap) if (e.time > t0 + EPS && e.time < limit - EPS) sigs.push({ ...e })
  return { beats, bars, tempo, sigs }
}

function segmentGrid(file: FileGrid, seg: TempoSegment, limit: number): SegGrid {
  if (seg.map) return mapGrid(seg, limit)
  return seg.snap ? fileGrid(file, seg, limit) : freeGrid(seg, limit)
}

const finiteList = (x: any, ok: (v: any) => boolean) => Array.isArray(x) && x.every(ok)
const isTime = (v: any) => typeof v === 'number' && Number.isFinite(v)

function validMap(m: any): boolean {
  return !!m && finiteList(m.beats, isTime) && finiteList(m.bars, isTime) && m.beats.length >= 2
    && finiteList(m.tempo, (e: any) => !!e && isTime(e.time) && isTime(e.bpm) && e.bpm > 0)
    && finiteList(m.sigs, (e: any) => !!e && isTime(e.time) && Number.isInteger(e.num) && e.num >= 1 && Number.isInteger(e.den) && e.den >= 1)
}

function validSeg(s: any): s is TempoSegment {
  return !!s && [s.start, s.anchor, s.period, s.beatsPerBar, s.den].every(v => typeof v === 'number' && Number.isFinite(v))
    && s.period >= MIN_PERIOD && s.period <= MAX_PERIOD && s.beatsPerBar >= 1 && s.den >= 1 && s.start >= 0
    && (s.snap === undefined || (!!s.snap && typeof s.snap.ratio === 'number' && s.snap.ratio > 0 && Number.isInteger(s.snap.barShift)))
    && (s.pattern === undefined || (finiteList(s.pattern, (n: any) => Number.isInteger(n) && n >= 1 && n <= MAX_BAR_BEATS) && s.pattern.length >= 1 && s.pattern.length <= MAX_PATTERN))
    && (s.map === undefined || validMap(s.map))
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
    // a copied layer brings its own tempo and signature for the bars before its first beat
    const from = seg.map ? seg.start : first
    tempo = tempo.filter(e => e.time < from - EPS)
    sigs = sigs.filter(e => e.time < from - EPS)
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

// A copied beat layer moved or stretched in time, with its tempo numbers to match
function retimeMap(m: GridMap, f: (t: number) => number, bpmScale = 1): GridMap {
  return {
    beats: m.beats.map(f), bars: m.bars.map(f),
    tempo: m.tempo.map(e => ({ ...e, time: f(e.time), bpm: e.bpm * bpmScale })),
    sigs: m.sigs.map(e => ({ ...e, time: f(e.time) })),
  }
}

function slid(seg: TempoSegment, sec: number): TempoSegment {
  return { ...seg, anchor: seg.anchor + sec, ...(seg.map ? { map: retimeMap(seg.map, t => t + sec) } : {}) }
}

// Fine-tune: slide the whole grid earlier/later by a few milliseconds
export function nudgeSegment(seg: TempoSegment, sec: number): TempoSegment {
  return slid(seg, sec)
}

export function removeSegmentAt(c: SongTempoCorrection, i: number): SongTempoCorrection {
  return { segments: c.segments.filter((_, j) => j !== i) }
}

// For the pad's menu: where each tapped tempo starts and what it is
export function describeCorrection(c: SongTempoCorrection | null | undefined): { start: number; bpm: number }[] {
  return (c?.segments ?? []).map(s => ({ start: s.start, bpm: 60 / s.period }))
}

export function scaleCorrection(c: SongTempoCorrection, k: number): SongTempoCorrection {
  return {
    segments: c.segments.map(s => ({
      ...s, start: s.start * k, anchor: s.anchor * k, period: s.period * k,
      ...(s.map ? { map: retimeMap(s.map, t => t * k, 1 / k) } : {}),
    })),
  }
}

// Corrections are stored in the file's own seconds; a song opened with its
// empty lead-in skipped (prepareSong.ts) runs `lead` seconds earlier. Of the
// segments starting inside the skipped bars, the one in force where the song
// now starts stays, from 0; the others only shape the skipped bars.
export function correctionToSong(c: SongTempoCorrection, lead: number): SongTempoCorrection {
  if (!lead) return c
  const segs = [...c.segments].sort((a, b) => a.start - b.start)
  const live = segs.filter(s => s.start < lead).at(-1)
  const out = segs.filter(s => s.start >= lead).map(s => ({ ...slid(s, -lead), start: s.start - lead }))
  if (live) out.unshift({ ...slid(live, -lead), start: 0 })
  return { segments: out }
}

// …and back, for storing: `stored` is what's kept now, so the skipped bars'
// segments survive, and a segment edited from the song's new start begins
// where its stored one did. Unchanged segments come back exactly as stored.
export function correctionToFile(c: SongTempoCorrection, lead: number, stored: SongTempoCorrection | null | undefined): SongTempoCorrection {
  if (!lead) return c
  const before = [...(stored?.segments ?? [])].filter(s => s.start < lead).sort((a, b) => a.start - b.start)
  const live = before.at(-1)
  const near = (a: number, b: number) => Math.abs(a - b) < 1e-6
  const out = c.segments.map(s => {
    const f = { ...slid(s, lead), start: s.start + lead }
    if (s.start <= EPS && live) f.start = live.start
    const same = (stored?.segments ?? []).find(o => near(o.start, f.start) && near(o.anchor, f.anchor) && near(o.period, f.period)
      && o.beatsPerBar === f.beatsPerBar && o.den === f.den && JSON.stringify(o.snap) === JSON.stringify(f.snap)
      && JSON.stringify(o.pattern) === JSON.stringify(f.pattern) && !o.map === !f.map)
    return same ?? f
  })
  const startsAtZero = c.segments.some(s => s.start <= EPS)
  return { segments: [...(startsAtZero ? before.slice(0, -1) : before), ...out].sort((a, b) => a.start - b.start) }
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
