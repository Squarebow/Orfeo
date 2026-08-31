import type { ParsedTrack } from '../types'

export interface ChordTrackRoles {
  chordTrackIndices: number[]
  bassTrackIndex: number | null
}

// GM program families
const isBassProgram = (p: number) => p >= 32 && p <= 39
const isMelodyProgram = (p: number) =>
  (p >= 64 && p <= 71) || (p >= 72 && p <= 79) || (p >= 80 && p <= 87) || (p >= 104 && p <= 111)

// ── Tuning ──────────────────────────────────────────────────────────────
const MONO_POLY = 1.45          // below this, a track is not really playing chords
const MELODY_REGISTER = 72      // median MIDI above this + monophonic = a lead line

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
// Returns the "harmonic set": every non-drum track that could be carrying
// chords, so the detector never goes blind when the main comping
// instrument rests (Fernando: piano plays the verse, then rests through the
// chorus while guitar / strings / choir carry it). That's EVERY non-drum
// track except (a) the bass and (b) a clearly-monophonic melody line (low
// polyphony + a lead-instrument family or a high register). Not a
// "best track" contest — coverage beats precision here, and the
// beat-synchronous chroma weights whatever is actually sounding.
export function pickChordTracks(tracks: ParsedTrack[]): ChordTrackRoles {
  const cached = _pickCache.get(tracks)
  if (cached) return cached

  const meta = tracks
    .filter(t => !t.isDrum && t.notes.length > 0)
    .map(t => ({ t, poly: meanPolyphony(t), med: medianPitch(t) }))

  // ── Bass track (drives slash naming only) ───────────────────────────
  let bassTrackIndex: number | null = null
  const gmBass = meta.find(m => isBassProgram(m.t.program))
  if (gmBass) {
    bassTrackIndex = gmBass.t.index
  } else {
    const cand = meta
      .filter(m => m.med < 50 && m.poly < 1.6)
      .sort((a, b) => a.med - b.med)[0]
    if (cand) bassTrackIndex = cand.t.index
  }

  // ── Harmonic set ────────────────────────────────────────────────────
  const harmonic = meta.filter(m => {
    if (m.t.index === bassTrackIndex || isBassProgram(m.t.program)) return false
    const monoMelody = m.poly < MONO_POLY && (isMelodyProgram(m.t.program) || m.med > MELODY_REGISTER)
    return !monoMelody
  })

  // Always give the detector something: if every non-bass track looks like a
  // melody line (a lead sheet), keep the most-polyphonic of them.
  const chordTrackIndices = harmonic.length > 0
    ? harmonic.map(m => m.t.index)
    : meta
        .filter(m => m.t.index !== bassTrackIndex && !isBassProgram(m.t.program))
        .sort((a, b) => b.poly - a.poly)
        .slice(0, 1)
        .map(m => m.t.index)

  const result: ChordTrackRoles = { chordTrackIndices, bassTrackIndex }
  _pickCache.set(tracks, result)
  return result
}
