import { createNoteEditorHistory } from './noteEditorHistory'
import type { ToneNote } from './noteEditorCommands'

export type NETool     = 'pencil' | 'select'
export type NEQuantize = 4 | 8 | 16 | 32

// ── NoteEditorState — module-level singleton bridging NoteEditorToolbar ↔ PianoRoll
// Both components read/write this object; no prop threading needed.
// All fields are ephemeral (not persisted); reset() is called on mode enter/exit.
export const NES = {
  toolModeRef:        { current: 'pencil' as NETool },
  snapRef:            { current: true },
  quantizeDivisorRef: { current: 8 as NEQuantize },
  showNoteNamesRef:   { current: false },
  history:            createNoteEditorHistory(),
  dirty:              false,
  newNotes:           new Set<ToneNote>(),

  // ── Set by any edit command; checked by PianoRoll drawFrame to force flatNotes rebuild ──
  needsFlatRebuild: false,

  // ── Registered by NoteEditorToolbar — fires on every history push/undo/redo ────────────
  onHistoryChange: null as (() => void) | null,

  // ── Reset all ephemeral state — call on edit mode enter/exit and on file load ──────────
  reset() {
    this.history.clear()
    this.dirty              = false
    this.newNotes.clear()
    this.needsFlatRebuild   = false
    this.toolModeRef.current        = 'pencil'
    this.snapRef.current            = true
    this.quantizeDivisorRef.current = 8
    this.showNoteNamesRef.current   = false
  },
}
