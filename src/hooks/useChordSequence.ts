// ── useChordSequence ──────────────────────────────────────────────────────────
// Pre-computes a full ChordEvent[] for the loaded MIDI file and stores it in
// the Zustand store. Re-runs when the file, note naming, or accidentals change.
// Deferred with setTimeout(0) so it never blocks the render thread.

import { useEffect } from 'react'
import { useStore } from '../store'
import { detectChord, detectChordStructured } from '../utils/chordDetection'
import { localizeChord } from '../utils/chordDetection'
import { getNoteName } from '../utils/noteNames'
import type { ChordEvent } from '../types'
import type { NoteNaming, Accidentals } from '../types'

const CLUSTER_GAP_MS = 80

// ── Build the full chord sequence for a MIDI file ────────────────────────────
function computeChordSequence(
  tracks: { isDrum: boolean; notes: { time: number; midi: number; duration: number }[] }[],
  noteNaming: NoteNaming,
  accidentals: Accidentals,
  transpose: number,
): ChordEvent[] {
  // ── Collect all non-drum notes into a flat list — shifted by transpose so
  // chord names match what's actually heard/lit, same offset the audio
  // engine applies at playback time (useAudioEngine.ts/useSamplesEngine.ts).
  // Without this, changing key left the sequence's names stuck on the
  // file's original pitches. ────────────────────────────────────────────
  const allNotes: { time: number; midi: number }[] = []
  for (const track of tracks) {
    if (track.isDrum) continue
    for (const note of track.notes) allNotes.push({ time: note.time, midi: note.midi + transpose })
  }
  if (allNotes.length === 0) return []
  allNotes.sort((a, b) => a.time - b.time)

  // ── Group notes into 80ms clusters ───────────────────────────────────────
  const clusters: { time: number; midis: number[] }[] = []
  for (const note of allNotes) {
    const last = clusters[clusters.length - 1]
    if (last && note.time - last.time <= CLUSTER_GAP_MS / 1000) {
      last.midis.push(note.midi)
    } else {
      clusters.push({ time: note.time, midis: [note.midi] })
    }
  }

  // ── Resolve naming — hidden falls back to english for internal display ────
  const displayNaming: NoteNaming = noteNaming === 'hidden' ? 'english' : noteNaming

  // ── Detect chord per cluster, filter singles, deduplicate consecutive ─────
  const events: ChordEvent[] = []
  let prevName: string | null = null

  for (const cluster of clusters) {
    if (cluster.midis.length < 2) continue

    const midiSet = new Set(cluster.midis)
    const rawName = detectChord(midiSet)
    if (!rawName) continue

    const localName = localizeChord(rawName, displayNaming, accidentals)
    if (!localName) continue

    // ── Deduplicate consecutive identical chords ──────────────────────────
    if (localName === prevName) continue
    prevName = localName

    // ── Build unique pitch-class note names for display ───────────────────
    const seenPCs = new Set<number>()
    const notes: string[] = []
    for (const midi of cluster.midis.sort((a, b) => a - b)) {
      const pc = midi % 12
      if (seenPCs.has(pc)) continue
      seenPCs.add(pc)
      const n = getNoteName(midi, displayNaming, accidentals)
      if (n) notes.push(n)
    }

    const structured = detectChordStructured(midiSet)

    events.push({ time: cluster.time, name: localName, notes, structured })
  }

  return events
}

// ── Hook — call once in App.tsx ───────────────────────────────────────────────
export function useChordSequence() {
  const midi = useStore((s) => s.midi)
  const noteNaming = useStore((s) => s.noteNaming)
  const accidentals = useStore((s) => s.accidentals)
  const transpose = useStore((s) => s.detectedKey?.transpose ?? 0)
  const setChordSequence = useStore((s) => s.setChordSequence)

  useEffect(() => {
    if (!midi) { setChordSequence([]); return }

    // ── Defer off render thread so file load doesn't stall the UI ────────
    const id = setTimeout(() => {
      const seq = computeChordSequence(midi.tracks, noteNaming, accidentals, transpose)
      setChordSequence(seq)
    }, 0)

    return () => clearTimeout(id)
  }, [midi, noteNaming, accidentals, transpose, setChordSequence])
}
