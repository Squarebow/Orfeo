// ── useChordSequence ──────────────────────────────────────────────────────────
// Pre-computes ChordEvent[] for the loaded file and stores it. The detection
// itself lives in utils/chordSequenceBuilder.ts (beat-synchronous chroma +
// chord-template matching); this hook only resolves WHICH tracks feed it,
// per the current tracking mode, and re-runs when the file or any relevant
// setting changes.

import { useEffect } from 'react'
import { useStore } from '../store'
import { pickChordTracks } from '../utils/trackChordRole'
import type { ChordTrackRoles } from '../utils/trackChordRole'
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
  const chordSensitivity = useStore(s => s.chordSensitivity)
  const setChordSequence = useStore(s => s.setChordSequence)
  const setChordFollowTrackIndex = useStore(s => s.setChordFollowTrackIndex)

  // "Follow by track" is a per-file choice — clear it on every new file.
  useEffect(() => { setChordFollowTrackIndex(null) }, [midi, setChordFollowTrackIndex])

  useEffect(() => {
    if (!midi) { setChordSequence([]); return }

    const nonDrum = midi.tracks.filter(t => !t.isDrum)

    // The bass line is resolved for every mode — it anchors the chord root
    // and is folded into the detector's chroma. `pickChordTracks` is memoised
    // so calling it here is free even outside Auto.
    const roles: ChordTrackRoles = pickChordTracks(midi.tracks)
    const bass: ParsedTrack | null = roles.bassTrackIndex != null
      ? midi.tracks.find(t => t.index === roles.bassTrackIndex) ?? null
      : null

    let scope: ParsedTrack[]

    if (chordTrackingMode === 'auto') {
      // The chord instruments only (piano/keys/guitar/strings) — melody and
      // ornament tracks are excluded.
      scope = roles.chordTrackIndices.length > 0
        ? midi.tracks.filter(t => roles.chordTrackIndices.includes(t.index))
        : nonDrum.filter(t => t.index !== roles.bassTrackIndex)
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
      // Harmony — Auto's detection over every non-drum track (melody included),
      // for dense textures where no one instrument holds the chords.
      scope = nonDrum.filter(t => t.index !== roles.bassTrackIndex)
    }

    // Sensitivity — how eager the detector is to call something a new chord.
    // A single user knob (Settings › Notation & Chords), independent of the
    // tracking mode: the mode picks the track scope, this picks the detail.
    //
    // TEMPORARILY LOCKED at the default (0.4) — see [[project-orfeo-chord-
    // detection-redesign]] in memory. While the underlying algorithm itself
    // is still being debugged and validated against real songs, letting this
    // vary made it unclear whether a wrong reading came from the algorithm
    // or from wherever the slider happened to be sitting; 0.4 is also the
    // value the whole regression-audit suite has been validated against.
    // The store value, its persistence, and the Settings slider still all
    // work — the slider is just dimmed and inert (see SettingsPanel.tsx) —
    // only this line ignores the live value. To re-enable: swap the literal
    // back for `chordSensitivity` and un-dim the slider.
    const grid = buildBeatGrid(midi)
    const seq = buildChordSequence(scope, bass, grid, {
      noteNaming, accidentals, namingStyle: chordNamingStyle, transpose,
      sensitivity: 0.4, // locked — see comment above (was: chordSensitivity)
    })
    setChordSequence(seq)
  }, [
    midi, noteNaming, accidentals, transpose, chordNamingStyle, chordSensitivity,
    chordTrackingMode, chordFollowSubMode, chordFollowGroup, chordFollowTrackIndex,
    setChordSequence,
  ])
}
