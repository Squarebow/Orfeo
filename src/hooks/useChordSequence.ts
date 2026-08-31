// ── useChordSequence ──────────────────────────────────────────────────────────
// Pre-computes ChordEvent[] for the loaded file and stores it. The detection
// itself lives in utils/chordSequenceBuilder.ts (beat-synchronous chroma +
// chord-template matching); this hook only resolves WHICH tracks feed it,
// per the current tracking mode, and re-runs when the file or any relevant
// setting changes.

import { useEffect } from 'react'
import { useStore } from '../store'
import { pickChordTracks } from '../utils/trackChordRole'
import { buildBeatGrid } from '../utils/beatGrid'
import { buildChordSequence } from '../utils/chordSequenceBuilder'
import type { ParsedTrack } from '../types'

export function useChordSequence() {
  const midi = useStore(s => s.midi)
  const noteNaming = useStore(s => s.noteNaming)
  const accidentals = useStore(s => s.accidentals)
  const transpose = useStore(s => s.detectedKey?.transpose ?? 0)
  const chordTrackingMode = useStore(s => s.chordTrackingMode)
  const chordFollowSubMode = useStore(s => s.chordFollowSubMode)
  const chordFollowGroup = useStore(s => s.chordFollowGroup)
  const chordFollowTrackIndex = useStore(s => s.chordFollowTrackIndex)
  const chordNamingStyle = useStore(s => s.chordNamingStyle)
  const setChordSequence = useStore(s => s.setChordSequence)
  const setChordFollowTrackIndex = useStore(s => s.setChordFollowTrackIndex)

  // "Follow by track" is a per-file choice — clear it on every new file.
  useEffect(() => { setChordFollowTrackIndex(null) }, [midi, setChordFollowTrackIndex])

  useEffect(() => {
    if (!midi) { setChordSequence([]); return }

    const nonDrum = midi.tracks.filter(t => !t.isDrum)
    const roles = pickChordTracks(midi.tracks)

    let scope: ParsedTrack[]
    let bass: ParsedTrack | null = null

    if (chordTrackingMode === 'auto') {
      scope = roles.chordTrackIndices.length > 0
        ? midi.tracks.filter(t => roles.chordTrackIndices.includes(t.index))
        : nonDrum
      bass = roles.bassTrackIndex != null
        ? midi.tracks.find(t => t.index === roles.bassTrackIndex) ?? null
        : null
    } else if (chordTrackingMode === 'follow') {
      if (chordFollowSubMode === 'group' && chordFollowGroup) {
        const inGroup = nonDrum.filter(t => t.group === chordFollowGroup)
        scope = inGroup.length > 0 ? inGroup : nonDrum
      } else if (chordFollowSubMode === 'track' && chordFollowTrackIndex !== null) {
        const one = nonDrum.filter(t => t.index === chordFollowTrackIndex)
        scope = one.length > 0 ? one : nonDrum
      } else {
        scope = nonDrum
      }
    } else {
      scope = nonDrum // harmony
    }

    const grid = buildBeatGrid(midi)
    const seq = buildChordSequence(scope, bass, grid, {
      noteNaming, accidentals, namingStyle: chordNamingStyle, transpose,
    })
    setChordSequence(seq)
  }, [
    midi, noteNaming, accidentals, transpose, chordNamingStyle,
    chordTrackingMode, chordFollowSubMode, chordFollowGroup, chordFollowTrackIndex,
    setChordSequence,
  ])
}
