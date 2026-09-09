import type { ParsedTrack } from '../types'

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
export function pickChordTracks(tracks: ParsedTrack[]): ChordTrackRoles {
  const cached = _pickCache.get(tracks)
  if (cached) return cached

  const nonDrum = tracks.filter(t => !t.isDrum && t.notes.length > 0)

  // ── Bass track (root anchor + slash naming) ─────────────────────────
  let bassTrackIndex: number | null = null
  const gmBass = nonDrum.find(t => isBassProgram(t.program))
  if (gmBass) {
    bassTrackIndex = gmBass.index
  } else {
    const cand = nonDrum
      .filter(t => medianPitch(t) < 52 && meanPolyphony(t) < 1.6)
      .sort((a, b) => medianPitch(a) - medianPitch(b))[0]
    if (cand) bassTrackIndex = cand.index
  }

  // ── Chord scope: every pitched instrument, minus the bass ───────────
  let scope = nonDrum.filter(t => t.index !== bassTrackIndex && !isUnpitchedProgram(t.program))

  // Drop monophonic lines sitting in the melody register — a "Piano-Vocal-
  // Guitar" sheet's vocal staff, a lead riff on a string/choir patch, a high
  // marimba ostinato. These carry the tune, not the harmony, and left in
  // scope they turn every triad into an add9/13. Keep them only if nothing
  // genuinely polyphonic remains (an all-monophonic arrangement still needs
  // something to read).
  const isMonoMelody = (t: ParsedTrack) => meanPolyphony(t) < 1.5 && medianPitch(t) >= 66
  const chordy = scope.filter(t => !isMonoMelody(t))
  if (chordy.length > 0 && chordy.some(t => meanPolyphony(t) >= 1.6)) scope = chordy

  // Every candidate got dropped as mono-melody-register (an all-solo-lead
  // arrangement, nothing polyphonic anywhere) — fall back to the single
  // most-polyphonic non-bass track so the detector still runs.
  if (scope.length === 0) {
    const fb = nonDrum
      .filter(t => t.index !== bassTrackIndex)
      .sort((a, b) => meanPolyphony(b) - meanPolyphony(a))[0]
    scope = fb ? [fb] : []
  }

  const result: ChordTrackRoles = {
    chordTrackIndices: scope.map(t => t.index),
    bassTrackIndex,
  }
  _pickCache.set(tracks, result)
  return result
}
