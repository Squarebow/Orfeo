import type { ParsedTrack } from '../types'

export interface ChordTrackRoles {
  chordTrackIndices: number[]
  bassTrackIndex: number | null
}

// GM program families
const isBassProgram = (p: number) => p >= 32 && p <= 39
const isMelodyProgram = (p: number) =>
  (p >= 64 && p <= 71) || (p >= 72 && p <= 79) || (p >= 80 && p <= 87) || (p >= 104 && p <= 111)
const isChordalProgram = (p: number) =>
  p <= 7 || (p >= 16 && p <= 31) || (p >= 40 && p <= 55) || (p >= 88 && p <= 95)

// ── Tuning ──────────────────────────────────────────────────────────────
const PICKER_MERGE_MARGIN = 6     // 2nd track must score within this of the top
const PICKER_SECOND_POLY = 2.2    // …and be at least this polyphonic
const PICKER_MIN_SCORE = 8        // below this → [] (caller uses Harmony)

function meanPolyphony(track: ParsedTrack): number {
  const N = track.notes
  if (N.length === 0) return 0
  let sum = 0
  for (const n of N) {
    let c = 0
    const at = n.time + 0.05
    for (const m of N) if (m.time < at && m.time + m.duration > at) c++
    sum += c
  }
  return sum / N.length
}

function medianPitch(track: ParsedTrack): number {
  const ps = track.notes.map(n => n.midi).sort((a, b) => a - b)
  return ps[ps.length >> 1] ?? 60
}

export function scoreChordTrack(track: ParsedTrack, songDuration: number): number {
  if (track.isDrum || track.notes.length === 0) return -999
  const poly = meanPolyphony(track)
  const med = medianPitch(track)
  const first = track.notes[0].time
  const last = track.notes[track.notes.length - 1]
  const coverage = songDuration > 0 ? (last.time + last.duration - first) / songDuration : 0
  let s = Math.min(poly, 4) * 10 + coverage * 8
  if (isBassProgram(track.program)) s -= 100
  if (med < 48) s -= 15
  if (isMelodyProgram(track.program)) s -= 12
  if (isChordalProgram(track.program)) s += 8
  if (poly < 1.5) s -= 20
  return s
}

export function pickChordTracks(tracks: ParsedTrack[]): ChordTrackRoles {
  const dur = tracks.reduce((mx, t) => {
    const l = t.notes[t.notes.length - 1]
    return l ? Math.max(mx, l.time + l.duration) : mx
  }, 0)

  const scored = tracks
    .filter(t => !t.isDrum && t.notes.length > 0)
    .map(t => ({ t, score: scoreChordTrack(t, dur), poly: meanPolyphony(t), med: medianPitch(t) }))
    .sort((a, b) => b.score - a.score)

  const top = scored[0]
  let chordTrackIndices: number[] = []
  if (top && top.score > PICKER_MIN_SCORE) {
    chordTrackIndices = [top.t.index]
    for (const s of scored.slice(1)) {
      if (chordTrackIndices.length >= 2) break
      if (s.score >= top.score - PICKER_MERGE_MARGIN && s.poly >= PICKER_SECOND_POLY) {
        chordTrackIndices.push(s.t.index)
      }
    }
  }

  // ── Bass track: GM bass family, else a non-picked mostly-mono low track ──
  let bassTrackIndex: number | null = null
  const gmBass = tracks.find(t => !t.isDrum && isBassProgram(t.program) && t.notes.length > 0)
  if (gmBass) {
    bassTrackIndex = gmBass.index
  } else {
    const cand = scored
      .filter(s => !chordTrackIndices.includes(s.t.index) && s.med < 50 && s.poly < 1.6)
      .sort((a, b) => a.med - b.med)[0]
    if (cand) bassTrackIndex = cand.t.index
  }

  return { chordTrackIndices, bassTrackIndex }
}
