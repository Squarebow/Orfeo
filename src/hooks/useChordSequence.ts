// ── useChordSequence ──────────────────────────────────────────────────────────
// Pre-computes a full ChordEvent[] for the loaded MIDI file and stores it in
// the Zustand store. Re-runs when the file, note naming, accidentals, chord
// tracking mode/scope, or chord naming style change.
//
// The detection work itself (buildChordEvent → detectChord/detectChordStructured
// → tonal.js's combinatorial chord search) is memoized in chordDetection.ts, but
// a harmonically dense song can still have hundreds of genuinely distinct chord
// shapes — a single setTimeout(0) around the whole loop (the old approach)
// defers WHEN it starts, not how long it runs once started, so it still froze
// the UI for the entire computation. The loop below instead yields back to the
// event loop every CHUNK_SIZE events via yieldToMain(), so the main thread is
// never blocked for more than one chunk's worth of work at a time.

import { useEffect } from 'react'
import { useStore } from '../store'
import { detectChord, detectChordStructured, localizeChord } from '../utils/chordDetection'
import { getNoteName } from '../utils/noteNames'
import type { ChordEvent, ChordNamingStyle } from '../types'
import type { NoteNaming, Accidentals } from '../types'

const CLUSTER_GAP_MS = 80
// ── Cooperative chunking — yield to the main thread every this many
// clusters/sweep-steps so a dense song's detection work never blocks input
// or paint for more than one chunk at a time. ─────────────────────────────
const CHUNK_SIZE = 200

function yieldToMain(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

type ChordSourceTrack = {
  index: number
  group: string
  isDrum: boolean
  notes: { time: number; midi: number; duration: number }[]
}

// ── Build a display-ready ChordEvent from a raw active pitch set — shared by
// both detection algorithms below so their output shape never drifts apart. ──
function buildChordEvent(
  time: number,
  midiSet: Set<number>,
  displayNaming: NoteNaming,
  accidentals: Accidentals,
  namingStyle: ChordNamingStyle,
): { name: string; notes: string[]; realMidi: number[]; structured: ChordEvent['structured'] } | null {
  const rawName = detectChord(midiSet)
  if (!rawName) return null
  const localName = localizeChord(rawName, displayNaming, accidentals, namingStyle)
  if (!localName) return null

  const sortedMidi = Array.from(midiSet).sort((a, b) => a - b)
  const seenPCs = new Set<number>()
  const notes: string[] = []
  for (const midi of sortedMidi) {
    const pc = midi % 12
    if (seenPCs.has(pc)) continue
    seenPCs.add(pc)
    const n = getNoteName(midi, displayNaming, accidentals)
    if (n) notes.push(n)
  }

  return { name: localName, notes, realMidi: sortedMidi, structured: detectChordStructured(midiSet) }
}

// ---------------------------------------------------------------------------
// Classic — today's behavior, unchanged: cluster notes by ONSET proximity
// (80ms window) across every track in scope, detect+dedupe per cluster.
// Onset-only and sustain-blind — kept only as an explicit legacy mode.
// ---------------------------------------------------------------------------
async function computeChordSequenceClassic(
  tracks: ChordSourceTrack[],
  noteNaming: NoteNaming,
  accidentals: Accidentals,
  transpose: number,
  namingStyle: ChordNamingStyle,
  isCancelled: () => boolean,
): Promise<ChordEvent[]> {
  const allNotes: { time: number; midi: number }[] = []
  for (const track of tracks) {
    for (const note of track.notes) allNotes.push({ time: note.time, midi: note.midi + transpose })
  }
  if (allNotes.length === 0) return []
  allNotes.sort((a, b) => a.time - b.time)

  const clusters: { time: number; midis: number[] }[] = []
  for (const note of allNotes) {
    const last = clusters[clusters.length - 1]
    if (last && note.time - last.time <= CLUSTER_GAP_MS / 1000) {
      last.midis.push(note.midi)
    } else {
      clusters.push({ time: note.time, midis: [note.midi] })
    }
  }

  const displayNaming: NoteNaming = noteNaming === 'hidden' ? 'english' : noteNaming
  const events: ChordEvent[] = []
  let prevName: string | null = null

  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i]
    if (cluster.midis.length >= 2) {
      const built = buildChordEvent(cluster.time, new Set(cluster.midis), displayNaming, accidentals, namingStyle)
      if (built && built.name !== prevName) {
        prevName = built.name
        events.push({ time: cluster.time, ...built })
      }
    }
    if (i % CHUNK_SIZE === CHUNK_SIZE - 1) {
      await yieldToMain()
      if (isCancelled()) return events
    }
  }

  return events
}

// ---------------------------------------------------------------------------
// Sustain-aware — General Harmony / Follow Instrument modes. Sweeps a
// timeline of note-on/note-off events (across whichever tracks are in
// scope) and re-detects the chord every time the set of currently-RINGING
// notes actually changes, instead of only when notes happen to attack
// together. This is what keeps a sustained pad/triad correctly named while
// a melody moves over it, instead of the melody's own onsets repeatedly
// hijacking the detector (see docs/superpowers/specs/2026-08-20-chord-
// settings-design.md for the full writeup).
// ---------------------------------------------------------------------------
async function computeChordSequenceSustained(
  tracks: ChordSourceTrack[],
  noteNaming: NoteNaming,
  accidentals: Accidentals,
  transpose: number,
  namingStyle: ChordNamingStyle,
  isCancelled: () => boolean,
): Promise<ChordEvent[]> {
  type SweepEvent = { time: number; midi: number; onset: boolean }
  const sweep: SweepEvent[] = []
  for (const track of tracks) {
    for (const note of track.notes) {
      const midi = note.midi + transpose
      sweep.push({ time: note.time, midi, onset: true })
      sweep.push({ time: note.time + note.duration, midi, onset: false })
    }
  }
  if (sweep.length === 0) return []
  // Onsets before offsets at an identical timestamp — a note starting the
  // instant another ends reads as a handoff, not a momentary silent gap.
  sweep.sort((a, b) => a.time - b.time || (a.onset === b.onset ? 0 : a.onset ? -1 : 1))

  const displayNaming: NoteNaming = noteNaming === 'hidden' ? 'english' : noteNaming
  const active = new Map<number, number>()   // midi → count of tracks currently sounding it
  const events: ChordEvent[] = []
  let prevName: string | null = null

  let i = 0
  let stepsSinceYield = 0
  while (i < sweep.length) {
    const t = sweep[i].time
    // Apply every event at this exact instant before re-detecting, so a
    // simultaneous onset+offset pair settles into one snapshot instead of
    // emitting a spurious in-between chord.
    while (i < sweep.length && sweep[i].time === t) {
      const e = sweep[i]
      const next = (active.get(e.midi) ?? 0) + (e.onset ? 1 : -1)
      if (next <= 0) active.delete(e.midi); else active.set(e.midi, next)
      i++
    }

    if (active.size >= 2) {
      const built = buildChordEvent(t, new Set(active.keys()), displayNaming, accidentals, namingStyle)
      if (built && built.name !== prevName) {
        prevName = built.name
        events.push({ time: t, ...built })
      }
    }

    if (++stepsSinceYield >= CHUNK_SIZE) {
      stepsSinceYield = 0
      await yieldToMain()
      if (isCancelled()) return events
    }
  }

  return events
}

// ── Hook — call once in App.tsx ───────────────────────────────────────────────
export function useChordSequence() {
  const midi = useStore((s) => s.midi)
  const noteNaming = useStore((s) => s.noteNaming)
  const accidentals = useStore((s) => s.accidentals)
  const transpose = useStore((s) => s.detectedKey?.transpose ?? 0)
  const chordTrackingMode = useStore((s) => s.chordTrackingMode)
  const chordFollowSubMode = useStore((s) => s.chordFollowSubMode)
  const chordFollowGroup = useStore((s) => s.chordFollowGroup)
  const chordFollowTrackIndex = useStore((s) => s.chordFollowTrackIndex)
  const chordNamingStyle = useStore((s) => s.chordNamingStyle)
  const setChordSequence = useStore((s) => s.setChordSequence)
  const setChordFollowTrackIndex = useStore((s) => s.setChordFollowTrackIndex)

  // ── "Follow by track" is a per-file choice, not a persisted preference —
  // clear it on every new file load so a stale index from the previous
  // song's track list can't silently carry over into this one. ────────────
  useEffect(() => {
    setChordFollowTrackIndex(null)
  }, [midi, setChordFollowTrackIndex])

  useEffect(() => {
    if (!midi) { setChordSequence([]); return }

    let cancelled = false
    const isCancelled = () => cancelled

    // ── Chunked + yielding (see computeChordSequence{Classic,Sustained}) so
    // file load never stalls the UI, however dense the song. ───────────────
    ;(async () => {
      const nonDrumTracks = midi.tracks.filter(t => !t.isDrum)

      // ── Resolve Follow's scope, falling back to General Harmony (never
      // Classic — Classic is the mode being fixed, not a safety net) when
      // the chosen group/track isn't present in this file. ────────────────
      let scopedTracks = nonDrumTracks
      let effectiveMode = chordTrackingMode
      if (chordTrackingMode === 'follow') {
        if (chordFollowSubMode === 'group' && chordFollowGroup) {
          const inGroup = nonDrumTracks.filter(t => t.group === chordFollowGroup)
          if (inGroup.length > 0) scopedTracks = inGroup
          else effectiveMode = 'harmony'
        } else if (chordFollowSubMode === 'track' && chordFollowTrackIndex !== null) {
          const one = nonDrumTracks.filter(t => t.index === chordFollowTrackIndex)
          if (one.length > 0) scopedTracks = one
          else effectiveMode = 'harmony'
        } else {
          effectiveMode = 'harmony'
        }
      }

      const seq = effectiveMode === 'classic'
        ? await computeChordSequenceClassic(nonDrumTracks, noteNaming, accidentals, transpose, chordNamingStyle, isCancelled)
        : await computeChordSequenceSustained(scopedTracks, noteNaming, accidentals, transpose, chordNamingStyle, isCancelled)
      if (!cancelled) setChordSequence(seq)
    })()

    return () => { cancelled = true }
  }, [
    midi, noteNaming, accidentals, transpose, chordNamingStyle,
    chordTrackingMode, chordFollowSubMode, chordFollowGroup, chordFollowTrackIndex,
    setChordSequence,
  ])
}
