import { createNoteEditorHistory } from './noteEditorHistory'
import { midiToEditableCopy } from './noteEditorCommands'
import type { ToneNote } from './noteEditorCommands'

export type NEQuantize = 4 | 8 | 16 | 32

// ── Default hint shown in the toolbar when cursor is outside the roll ─────────
const DEFAULT_HINT = 'Click a track in the panel to solo it for editing'

// ── NoteEditorState — module-level singleton bridging NoteEditorToolbar ↔ PianoRoll
// Both components read/write this object; no prop threading needed.
// All fields are ephemeral (not persisted); reset() is called on mode enter/exit.
export const NES = {
  snapRef:            { current: true },
  quantizeDivisorRef: { current: 8 as NEQuantize },
  showNoteNamesRef:   { current: false },
  history:            createNoteEditorHistory(),
  dirty:              false,
  newNotes:           new Set<ToneNote>(),

  // ── Live @tonejs/midi Midi copy — created from _raw when entering edit mode.
  // All edit operations target this instead of ParsedMidi (which uses plain objects
  // with no ticks/addNote/header). Null when not in edit mode.
  editMidi: null as ReturnType<typeof midiToEditableCopy> | null,

  // ── Set by any edit command; checked by PianoRoll drawFrame to force flatNotes rebuild ──
  needsFlatRebuild: false,

  // ── Live hint text — updated by PianoRoll on hover, displayed in toolbar ────
  hoverHint:    DEFAULT_HINT,
  defaultHint:  DEFAULT_HINT,

  // ── Registered by NoteEditorToolbar — fires on every history push/undo/redo ────────────
  onHistoryChange: null as (() => void) | null,

  // ── Fires when PianoRoll updates hoverHint — toolbar subscribes to re-render hint line ──
  onHintChange: null as (() => void) | null,

  // ── Registered by PianoRoll — toolbar Reset button calls this to rebuild editMidi ───────
  onResetRequest: null as (() => void) | null,

  // ── Registered by NoteEditorToolbar — called by SettingsPanel / App close to trigger save ──
  onSaveRequest: null as (() => Promise<boolean>) | null,

  // ── Reset all ephemeral state — call on edit mode enter/exit and on file load ──────────
  reset() {
    this.history.clear()
    this.dirty              = false
    this.newNotes.clear()
    this.editMidi           = null
    this.needsFlatRebuild   = false
    this.hoverHint          = DEFAULT_HINT
    this.snapRef.current            = true
    this.quantizeDivisorRef.current = 8
    this.showNoteNamesRef.current   = false
  },
}
