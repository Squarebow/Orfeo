import { Midi } from '@tonejs/midi'
import { parseMidiBuffer } from './midiParser'
import { useStore } from '../store'
import {
  cmdSetNoteVelocity,
  cmdAddNote,
  cmdMoveNote,
  cmdRepitchNote,
  editableCopyToBuffer,
} from './noteEditorCommands'
import { createNoteEditorHistory } from './noteEditorHistory'

// ── runNoteEditorRoundTripTest ────────────────────────────────────────────────
// Phase 0 proof-of-concept: parse the currently loaded MIDI into a fresh
// @tonejs/midi instance, apply a set of commands via the editor command system,
// encode back to ArrayBuffer, and verify that:
//   (a) track + note counts survive intact
//   (b) the mutated values are present in the re-parsed output
//   (c) parseMidiBuffer() accepts the output without error
//   (d) undo/redo round-trips correctly
//
// Exposed as window.__orfeoNoteEditorRoundTripTest in development mode.
// Non-destructive — does not modify the currently loaded MIDI in the store.
export function runNoteEditorRoundTripTest(): void {
  const midi = useStore.getState().midi
  if (!midi) {
    console.error('[NoteEditorRoundTrip] No MIDI loaded — open a file first')
    return
  }

  const raw = (midi as any)._raw as ArrayBuffer | undefined
  if (!raw) {
    console.error('[NoteEditorRoundTrip] No _raw buffer on midi — parseMidiBuffer must have run')
    return
  }

  console.group('[NoteEditorRoundTrip] Phase 0 round-trip test')

  // ── Step 1: Fresh parse ────────────────────────────────────────────────────
  const midiObj = new Midi(raw)
  const origTrackCount = midiObj.tracks.length
  const origNoteCount  = midiObj.tracks.reduce((s, t) => s + t.notes.length, 0)
  console.log(`Input: ${origTrackCount} tracks, ${origNoteCount} total notes`)

  const track0 = midiObj.tracks.find(t => t.notes.length > 0)
  if (!track0) {
    console.error('[NoteEditorRoundTrip] No track with notes found')
    console.groupEnd()
    return
  }

  const note0 = track0.notes[0]
  console.log('Note 0 (before):', {
    midi: note0.midi, ticks: note0.ticks,
    durationTicks: note0.durationTicks, velocity: note0.velocity.toFixed(3),
  })

  // ── Step 2: Apply commands via history ─────────────────────────────────────
  const history = createNoteEditorHistory()

  // velocity nudge
  const origVel   = note0.velocity
  const targetVel = parseFloat(Math.max(0.1, origVel - 0.1).toFixed(3))
  const velCmd    = cmdSetNoteVelocity(note0, targetVel)
  velCmd.apply()
  history.push(velCmd)

  // add a test note (middle C, 1 beat long at 480ppq)
  const ppq      = (midiObj.header as any).ppq ?? 480
  const addCmd   = cmdAddNote(track0, {
    midi: 60, ticks: 0, durationTicks: ppq, velocity: 0.75,
  })
  addCmd.apply()
  history.push(addCmd)

  const addedTrackNoteCount = track0.notes.length

  console.log(`Commands applied: velocity ${origVel.toFixed(3)} → ${note0.velocity.toFixed(3)}, added test note (total on track: ${addedTrackNoteCount})`)

  // ── Step 3: Encode to buffer ───────────────────────────────────────────────
  const outputBuffer = editableCopyToBuffer(midiObj)
  console.log(`Encoded: ${outputBuffer.byteLength} bytes (original _raw: ${raw.byteLength} bytes)`)

  // ── Step 4: Re-parse and verify structure ──────────────────────────────────
  const verify      = new Midi(outputBuffer)
  const verifyNotes = verify.tracks.reduce((s, t) => s + t.notes.length, 0)
  const trackOk     = verify.tracks.length === origTrackCount
  const noteOk      = verifyNotes === origNoteCount + 1   // one note was added

  console.log(`Re-parsed: ${verify.tracks.length} tracks (${trackOk ? '✓' : '✗'}), ${verifyNotes} notes (${noteOk ? '✓' : '✗'} — expected ${origNoteCount + 1})`)

  const verifyNote0 = verify.tracks.find(t => t.notes.length > 0)?.notes.find(n => n.ticks === note0.ticks && n.midi === note0.midi)
  if (verifyNote0) {
    const velOk = Math.abs(verifyNote0.velocity - targetVel) < 0.01
    console.log(`Velocity round-trip: ${velOk ? '✓' : '✗'} (expected ${targetVel}, got ${verifyNote0.velocity.toFixed(3)})`)
  }

  // ── Step 5: parseMidiBuffer compatibility ──────────────────────────────────
  try {
    const reParsed = parseMidiBuffer(outputBuffer, 'round-trip-test.mid', '')
    console.log(`parseMidiBuffer compat: ✓ (${reParsed.tracks.length} tracks, ${reParsed.noteCount} notes)`)
  } catch (e) {
    console.error('parseMidiBuffer compat: ✗', e)
  }

  // ── Step 6: Undo ───────────────────────────────────────────────────────────
  const undoAdd = history.undo()   // undo addNote
  const undoVel = history.undo()   // undo velocity change
  const addUndone = track0.notes.length === addedTrackNoteCount - 1
  const velUndone = Math.abs(note0.velocity - origVel) < 0.001
  console.log(`Undo add note: ${undoAdd && addUndone ? '✓' : '✗'} (track notes: ${track0.notes.length})`)
  console.log(`Undo velocity: ${undoVel && velUndone ? '✓' : '✗'} (velocity: ${note0.velocity.toFixed(3)}, expected ${origVel.toFixed(3)})`)

  // ── Step 7: Redo ───────────────────────────────────────────────────────────
  const redoVel = history.redo()   // redo velocity change
  const redoAdd = history.redo()   // redo addNote
  const addRedone = track0.notes.length === addedTrackNoteCount
  const velRedone = Math.abs(note0.velocity - targetVel) < 0.001
  console.log(`Redo velocity: ${redoVel && velRedone ? '✓' : '✗'} (velocity: ${note0.velocity.toFixed(3)})`)
  console.log(`Redo add note: ${redoAdd && addRedone ? '✓' : '✗'} (track notes: ${track0.notes.length})`)

  console.log('canUndo:', history.canUndo, '| canRedo:', history.canRedo)
  console.log('Stack:', history.debugStack())

  const allPassed = trackOk && noteOk && undoAdd && undoVel && redoVel && redoAdd && addUndone && velUndone && addRedone && velRedone
  console.log(`\nPhase 0 result: ${allPassed ? '✓ ALL PASSED' : '✗ FAILURES ABOVE'}`)
  console.groupEnd()
}
