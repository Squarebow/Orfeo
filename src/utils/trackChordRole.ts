import type { ParsedTrack } from '../types'

export interface ChordTrackRoles {
  chordTrackIndices: number[]
  bassTrackIndex: number | null
}

// ── GM program families ─────────────────────────────────────────────────
const isBassProgram = (p: number) => p >= 32 && p <= 39
// The instruments that actually carry chords in real arrangements — piano,
// keys, organ, guitar, strings, ensembles, pads. Everything else (reeds,
// pipes, brass, synth leads, ethnic winds) is there for melody and
// embellishment and must not distract the chord read.
const isHarmonicProgram = (p: number) =>
  p <= 23                       // piano, chromatic perc (keys), organ
  || (p >= 24 && p <= 31)       // guitar
  || (p >= 40 && p <= 55)       // strings, ensemble
  || (p >= 88 && p <= 95)       // synth pad

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
// The chord instruments (isHarmonicProgram), minus the bass, minus drums —
// no polyphony contest, because a monophonic guitar or piano arpeggio still
// carries the harmony and must be followed. The bass line is returned
// separately: it anchors the root and, when a song's harmony *is* an
// arpeggiated bassline (Riders on the Storm), the detector folds it in.
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

  // ── Chord scope: the harmonic instruments, minus the bass ───────────
  let scope = nonDrum.filter(t => t.index !== bassTrackIndex && isHarmonicProgram(t.program))

  // Drop monophonic lines sitting in the melody register — a "Piano-Vocal-
  // Guitar" sheet's vocal staff, a lead riff on a string/choir patch, a high
  // marimba ostinato. These carry the tune, not the harmony, and left in
  // scope they turn every triad into an add9/13. Keep them only if nothing
  // genuinely polyphonic remains (an all-monophonic arrangement still needs
  // something to read).
  const isMonoMelody = (t: ParsedTrack) => meanPolyphony(t) < 1.5 && medianPitch(t) >= 66
  const chordy = scope.filter(t => !isMonoMelody(t))
  if (chordy.length > 0 && chordy.some(t => meanPolyphony(t) >= 1.6)) scope = chordy

  // Nothing whitelisted (an all-synth or all-wind arrangement) — fall back
  // to the single most-polyphonic non-bass track so the detector still runs.
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
