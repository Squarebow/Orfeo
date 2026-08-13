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

// ── insertSorted — splice a Note back into a tick-sorted notes array ─────────
// Used by cmd revert/redo paths to preserve the exact Note object reference
// instead of calling track.addNote() (which creates a new object and breaks
// identity checks like NES.newNotes.has(note) after undo/redo).
function insertSorted(track: Track, note: ToneNote) {
  const idx = track.notes.findIndex(n => n.ticks > note.ticks)
  if (idx === -1) track.notes.push(note)
  else track.notes.splice(idx, 0, note)
}

// ── cmdAddNote ────────────────────────────────────────────────────────────────
// First apply: inserts via track.addNote(), captures the resulting Note.
// Subsequent apply (redo): splices the SAME Note reference back via insertSorted
// so NES.newNotes identity checks survive undo/redo cycles.
export function cmdAddNote(track: Track, spec: NoteSpec): NoteCommand {
  let addedNote: ToneNote | null = null

  return {
    description: `Add note midi=${spec.midi} at tick=${spec.ticks}`,

    apply() {
      if (addedNote === null) {
        // ── First apply: create via addNote(), find the resulting instance ───
        const before = new Set(track.notes)
        track.addNote({
          midi: spec.midi,
          ticks: spec.ticks,
          durationTicks: spec.durationTicks,
          velocity: spec.velocity,
          noteOffVelocity: spec.noteOffVelocity ?? 0,
        })
        addedNote = track.notes.find(n => !before.has(n)) ?? null
      } else {
        // ── Redo: splice the same Note reference back in sorted position ─────
        insertSorted(track, addedNote)
      }
    },

    revert() {
      if (!addedNote) return
      const idx = track.notes.indexOf(addedNote)
      if (idx !== -1) track.notes.splice(idx, 1)
      // Keep addedNote reference — redo needs it
    },
  }
}

// ── cmdRemoveNote ─────────────────────────────────────────────────────────────
// Splices the note out; revert re-inserts the SAME Note reference via
// insertSorted so identity checks (NES.newNotes.has, track.notes.indexOf)
// continue to work after undo/redo. No addNote() call — no new object created.
export function cmdRemoveNote(track: Track, note: ToneNote): NoteCommand {
  return {
    description: `Remove note midi=${note.midi} at tick=${note.ticks}`,

    apply() {
      const idx = track.notes.indexOf(note)
      if (idx !== -1) track.notes.splice(idx, 1)
    },

    revert() {
      insertSorted(track, note)
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
  const midi = new Midi(rawBuffer)
  // @tonejs/midi's Track class has no `index` field — midiParser.ts's
  // ParsedMidi tracks carry a custom `.index` that both audio engines match
  // against store track state (mute/solo/program) via
  // `tracks.find(t => t.index === track.index)`. Critically, midiParser.ts
  // assigns that index only to NON-EMPTY tracks, in COMPACTED order — an
  // empty filler track (extremely common: notation-software marker/meta
  // tracks with zero notes) is skipped entirely, so index 2 there might be
  // raw array position 5. Stamping by raw array position instead (as this
  // used to) works only when a file happens to have zero empty tracks —
  // otherwise every real track's index is off by however many empty tracks
  // preceded it, so the audio engines' lookup either finds nothing (silent
  // schedule) or, worse, silently matches a DIFFERENT track's mute/program
  // state (reported symptom: reassigning a hand on a piano note made
  // playback switch to a completely different track's instrument sound —
  // the piano track's raw-position index happened to collide with the
  // strings track's real compacted index). Parse order is otherwise
  // identical to the original since both come from the same _raw bytes and
  // note edits never reorder or add/remove tracks. ─────────────────────────
  let compactedIndex = 0
  midi.tracks.forEach(t => {
    if (t.notes.length === 0) return
    ;(t as any).index = compactedIndex++
  })
  return midi
}

// ── copyHandTagsOntoEditBuffer ──────────────────────────────────────────────
// Stamps `.hand`/`.handConfidence` from the store's already-tagged ParsedMidi
// notes onto the freshly-parsed edit buffer's notes, matched by array
// position (track index, then note index) — safe only at edit-buffer
// creation time, before any add/remove/move happens, since both were parsed
// from the identical _raw bytes and are still in identical order at that
// point. Without this, `NES.editMidi`'s notes are stock @tonejs/midi Track
// notes with no hand fields at all — nothing for a later save to persist
// (see noteEditorState.ts's handSave export-hint injection) or for live
// hand-colored rendering to read.
export function copyHandTagsOntoEditBuffer(storeMidi: any, editMidi: Midi): void {
  if (!storeMidi?.tracks) return
  // editMidi.tracks is a raw parse — it keeps every track including empty
  // filler ones, in original file position. storeMidi.tracks (ParsedMidi,
  // from midiParser.ts) is already compacted to non-empty tracks only, with
  // `.index` assigned among survivors. Zipping the two directly by array
  // position (as this used to) silently misaligned the moment a file had
  // even one empty track before the real content — extremely common (most
  // exported MIDI files carry a few 0-note meta/marker tracks first) — which
  // meant hand tags almost never actually made it into the edit buffer. ────
  const nonEmpty = editMidi.tracks.filter(t => t.notes.length > 0)
  nonEmpty.forEach((track, ti) => {
    const srcTrack = storeMidi.tracks[ti]
    if (!srcTrack?.notes || srcTrack.notes.length !== track.notes.length) return
    track.notes.forEach((note, ni) => {
      const src = srcTrack.notes[ni]
      if (src?.hand !== undefined) {
        ;(note as any).hand = src.hand
        ;(note as any).handConfidence = src.handConfidence
        ;(note as any).handSource = src.handSource
      }
    })
  })
}

// ── cmdRemoveNotes ────────────────────────────────────────────────────────────
// Removes multiple notes as a single undoable step.
// revert() re-inserts the same Note references via insertSorted.
export function cmdRemoveNotes(track: Track, notes: ToneNote[]): NoteCommand {
  return {
    description: `Remove ${notes.length} note${notes.length > 1 ? 's' : ''}`,

    apply() {
      for (const n of notes) {
        const idx = track.notes.indexOf(n)
        if (idx !== -1) track.notes.splice(idx, 1)
      }
    },

    revert() {
      for (const n of notes) insertSorted(track, n)
    },
  }
}

// ── editableCopyToBuffer ──────────────────────────────────────────────────────
// Encodes a mutable Midi instance back to an ArrayBuffer suitable for passing
// to parseMidiBuffer() or Orfeo's reloadFile() path.
export function editableCopyToBuffer(midi: Midi): ArrayBuffer {
  const encoded = midi.toArray()
  // Slice to get an independent ArrayBuffer (safe even if byteOffset !== 0).
  return encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength) as ArrayBuffer
}
