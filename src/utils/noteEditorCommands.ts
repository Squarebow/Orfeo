import { Midi } from '@tonejs/midi'
import type { Track } from '@tonejs/midi'

// ── Local alias for the Note class from @tonejs/midi ──────────────────────────
// Note is not re-exported from the main barrel, so we derive the type from Track.
export type ToneNote = Track['notes'][number]

// ── Spec for creating a new note ──────────────────────────────────────────────
export interface NoteSpec {
  midi: number
  ticks: number
  durationTicks: number
  velocity: number           // 0–1 normalised
  noteOffVelocity?: number   // 0–1 normalised, defaults to 0
}

// ── Undoable command returned by every cmd* function ──────────────────────────
export interface NoteCommand {
  apply(): void
  revert(): void
  description: string
}

// ── cmdAddNote ────────────────────────────────────────────────────────────────
// Inserts a note in tick-sorted order via track.addNote(), captures the
// resulting Note instance for reliable identity in revert().
export function cmdAddNote(track: Track, spec: NoteSpec): NoteCommand {
  let addedNote: ToneNote | null = null

  return {
    description: `Add note midi=${spec.midi} at tick=${spec.ticks}`,

    apply() {
      const before = new Set(track.notes)
      track.addNote({
        midi: spec.midi,
        ticks: spec.ticks,
        durationTicks: spec.durationTicks,
        velocity: spec.velocity,
        noteOffVelocity: spec.noteOffVelocity ?? 0,
      })
      addedNote = track.notes.find(n => !before.has(n)) ?? null
    },

    revert() {
      if (!addedNote) return
      const idx = track.notes.indexOf(addedNote)
      if (idx !== -1) track.notes.splice(idx, 1)
      addedNote = null
    },
  }
}

// ── cmdRemoveNote ─────────────────────────────────────────────────────────────
// Splices the note out; revert re-inserts via addNote() (restores sort order).
export function cmdRemoveNote(track: Track, note: ToneNote): NoteCommand {
  const snapshot: NoteSpec = {
    midi: note.midi,
    ticks: note.ticks,
    durationTicks: note.durationTicks,
    velocity: note.velocity,
    noteOffVelocity: note.noteOffVelocity,
  }

  return {
    description: `Remove note midi=${note.midi} at tick=${note.ticks}`,

    apply() {
      const idx = track.notes.indexOf(note)
      if (idx !== -1) track.notes.splice(idx, 1)
    },

    revert() {
      track.addNote({
        midi: snapshot.midi,
        ticks: snapshot.ticks,
        durationTicks: snapshot.durationTicks,
        velocity: snapshot.velocity,
        noteOffVelocity: snapshot.noteOffVelocity ?? 0,
      })
    },
  }
}

// ── cmdMoveNote ───────────────────────────────────────────────────────────────
// Retimes a note by setting its ticks directly, then re-sorts the track's
// notes array to maintain tick order (required by the encoder).
export function cmdMoveNote(track: Track, note: ToneNote, newTicks: number): NoteCommand {
  const originalTicks = note.ticks

  return {
    description: `Move note midi=${note.midi}: tick ${originalTicks} → ${newTicks}`,

    apply() {
      note.ticks = newTicks
      track.notes.sort((a, b) => a.ticks - b.ticks)
    },

    revert() {
      note.ticks = originalTicks
      track.notes.sort((a, b) => a.ticks - b.ticks)
    },
  }
}

// ── cmdRepitchNote ────────────────────────────────────────────────────────────
export function cmdRepitchNote(note: ToneNote, newMidi: number): NoteCommand {
  const originalMidi = note.midi

  return {
    description: `Repitch note: midi ${originalMidi} → ${newMidi}`,
    apply()  { note.midi = newMidi },
    revert() { note.midi = originalMidi },
  }
}

// ── cmdResizeNote ─────────────────────────────────────────────────────────────
export function cmdResizeNote(note: ToneNote, newDurationTicks: number): NoteCommand {
  const originalDurationTicks = note.durationTicks

  return {
    description: `Resize note midi=${note.midi}: durationTicks ${originalDurationTicks} → ${newDurationTicks}`,
    apply()  { note.durationTicks = newDurationTicks },
    revert() { note.durationTicks = originalDurationTicks },
  }
}

// ── cmdSetNoteVelocity ────────────────────────────────────────────────────────
export function cmdSetNoteVelocity(note: ToneNote, newVelocity: number): NoteCommand {
  const originalVelocity = note.velocity

  return {
    description: `Velocity note midi=${note.midi}: ${originalVelocity.toFixed(2)} → ${newVelocity.toFixed(2)}`,
    apply()  { note.velocity = Math.max(0, Math.min(1, newVelocity)) },
    revert() { note.velocity = originalVelocity },
  }
}

// ── cmdSetRangeVelocity ───────────────────────────────────────────────────────
// Sets the same velocity on multiple notes as a single undoable step.
export function cmdSetRangeVelocity(notes: ToneNote[], newVelocity: number): NoteCommand {
  const originals = notes.map(n => n.velocity)
  const clamped = Math.max(0, Math.min(1, newVelocity))

  return {
    description: `Set velocity on ${notes.length} notes → ${clamped.toFixed(2)}`,
    apply()  { notes.forEach(n => { n.velocity = clamped }) },
    revert() { notes.forEach((n, i) => { n.velocity = originals[i] }) },
  }
}

// ── midiToEditableCopy ────────────────────────────────────────────────────────
// Parses a fresh, mutable Midi instance from the _raw buffer attached to every
// ParsedMidi object by parseMidiBuffer(). This is the editing copy — separate
// from the @tonejs/midi model used for playback, which should not be mutated.
export function midiToEditableCopy(rawBuffer: ArrayBuffer): Midi {
  return new Midi(rawBuffer)
}

// ── editableCopyToBuffer ──────────────────────────────────────────────────────
// Encodes a mutable Midi instance back to an ArrayBuffer suitable for passing
// to parseMidiBuffer() or Orfeo's reloadFile() path.
export function editableCopyToBuffer(midi: Midi): ArrayBuffer {
  const encoded = midi.toArray()
  // Slice to get an independent ArrayBuffer (safe even if byteOffset !== 0).
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer
}
