import type { ParsedTrack } from '../types'
import { findStavePairs } from './handAssignment'
import { HAND_ASSIGN_GROUPS } from './keyboardGroups'

export interface ChordTrackRoles {
  chordTrackIndices: number[]
  bassTrackIndex: number | null
}

// ── GM program families ─────────────────────────────────────────────────
const isBassProgram = (p: number) => p >= 32 && p <= 39
// GM's sound-effect patches (gunshot, applause, seashore, helicopter, phone
// ring, …) aren't a melody-vs-harmony judgment — they're not a chantable
// pitched instrument at all, so they never belong in the chord read.
const isUnpitchedProgram = (p: number) => p >= 120 && p <= 127

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

const _pickCache = new WeakMap<ParsedTrack[], ChordTrackRoles>()

/** The two staves of each keyboard instrument written as two tracks, by track
 *  index: the same pairs the hands come from (findStavePairs). `name` must be
 *  the track's name as written in the file, not a display fallback. */
export function stavePairsOf(tracks: { index: number; name: string; channel: number; group: string; isDrum: boolean; notes: { midi: number; time: number; duration: number }[] }[]): [number, number][] {
  const kb = tracks.filter(t => HAND_ASSIGN_GROUPS.has(t.group) && !t.isDrum)
  return findStavePairs(kb).map(p => [kb[p.upper].index, kb[p.lower].index])
}

// ── pickChordTracks — Auto mode's track scope ───────────────────────────
// Every non-drum, non-bass, pitched instrument is a harmony candidate — no
// instrument-family whitelist. A patch's GM name doesn't tell you its role:
// a "Synth Brass" comping the changes (Toto - Africa) is exactly as valid a
// chord source as a piano, and a mono flute solo is exactly as much a
// distraction as a mono trumpet solo. Telling melody from harmony is the
// content-based job of isMonoMelody below plus the per-note tagging in
// chordSequenceBuilder — not a job for a fixed program-number list. The
// bass line is returned separately: it anchors the root and, when a song's
// harmony *is* an arpeggiated bassline (Riders on the Storm), the detector
// folds it in.
// ── Two staves, one instrument ──────────────────────────────────────────
// A piano written on two staves arrives as two tracks. Judged one by one,
// its left hand looked like a bass line (low, mostly one note at a time) and
// its right hand like a melody, so the left hand's chord notes lost their
// vote, or the right hand's chords were dropped. Both staves are now judged
// together, as the one instrument they are — the same as when they're
// merged into one track. Each note is still told apart as melody or harmony
// by chordSequenceBuilder, as for any one-track piano.
export function pickChordTracks(tracks: ParsedTrack[], stavePairs: [number, number][] = []): ChordTrackRoles {
  const cached = _pickCache.get(tracks)
  if (cached) return cached

  const nonDrum = tracks.filter(t => !t.isDrum && t.notes.length > 0)

  // Staves joined into one instrument for judging; `members` are its tracks
  const partner = new Map<number, number>()
  for (const [a, b] of stavePairs) { partner.set(a, b); partner.set(b, a) }
  type Part = { members: ParsedTrack[]; judge: ParsedTrack }
  const parts: Part[] = []
  const seen = new Set<number>()
  for (const t of nonDrum) {
    if (seen.has(t.index)) continue
    const other = partner.has(t.index) ? nonDrum.find(o => o.index === partner.get(t.index)) : undefined
    if (other && !seen.has(other.index)) {
      seen.add(t.index); seen.add(other.index)
      parts.push({ members: [t, other], judge: { ...t, notes: [...t.notes, ...other.notes].sort((x, y) => x.time - y.time) } })
    } else {
      seen.add(t.index)
      parts.push({ members: [t], judge: t })
    }
  }
  const tracksOf = (ps: Part[]) => ps.flatMap(p => p.members)

  // ── Bass track (root anchor + slash naming) ─────────────────────────
  // never one staff of a two-staff instrument: that's a hand, not a bass part
  let bassTrackIndex: number | null = null
  const single = parts.filter(p => p.members.length === 1).map(p => p.judge)
  const gmBass = single.find(t => isBassProgram(t.program))
  if (gmBass) {
    bassTrackIndex = gmBass.index
  } else {
    const cand = single
      .filter(t => medianPitch(t) < 52 && meanPolyphony(t) < 1.6)
      .sort((a, b) => medianPitch(a) - medianPitch(b))[0]
    if (cand) bassTrackIndex = cand.index
  }

  // ── Chord scope: every pitched instrument, minus the bass ───────────
  const scopeParts = parts.filter(p => !(p.members.length === 1 && p.judge.index === bassTrackIndex) && !isUnpitchedProgram(p.judge.program))
  let scope = tracksOf(scopeParts)

  // Drop monophonic lines sitting in the melody register — a "Piano-Vocal-
  // Guitar" sheet's vocal staff, a lead riff on a string/choir patch, a high
  // marimba ostinato. These carry the tune, not the harmony, and left in
  // scope they turn every triad into an add9/13. Keep them only if nothing
  // genuinely polyphonic remains (an all-monophonic arrangement still needs
  // something to read).
  const isMonoMelody = (t: ParsedTrack) => meanPolyphony(t) < 1.5 && medianPitch(t) >= 66
  const chordy = scopeParts.filter(p => !isMonoMelody(p.judge))
  if (chordy.length > 0 && chordy.some(p => meanPolyphony(p.judge) >= 1.6)) scope = tracksOf(chordy)

  // Every candidate got dropped as mono-melody-register (an all-solo-lead
  // arrangement, nothing polyphonic anywhere) — fall back to the single
  // most-polyphonic non-bass instrument so the detector still runs.
  if (scope.length === 0) {
    const fb = parts
      .filter(p => !(p.members.length === 1 && p.judge.index === bassTrackIndex))
      .sort((a, b) => meanPolyphony(b.judge) - meanPolyphony(a.judge))[0]
    scope = fb ? fb.members : []
  }

  const result: ChordTrackRoles = {
    chordTrackIndices: scope.map(t => t.index),
    bassTrackIndex,
  }
  _pickCache.set(tracks, result)
  return result
}
