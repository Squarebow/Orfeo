import { createNoteEditorHistory } from './noteEditorHistory'
import { midiToEditableCopy } from './noteEditorCommands'
import type { ToneNote } from './noteEditorCommands'
import { confirmDialog } from './confirmController'
import { useStore } from '../store'

export type NEQuantize = 4 | 8 | 16 | 32

// ── Tool modes — mutually exclusive, isolated behavior each (see
// PianoRoll.tsx's onEditDown/Move/Up). 'select' is the default: move/resize/
// multi-select notes, grab+pan empty space. 'pen' only adds (Alt+click) or
// marks notes delete-ready. 'marquee'/'lasso' only select, never add/move/
// delete/resize. ─────────────────────────────────────────────────────────
export type NETool = 'select' | 'pen' | 'marquee' | 'lasso'

// ── Default hint shown in the toolbar when cursor is outside the roll.
// "Click a track to solo it" ALSO lives as a permanent header label in
// NoteEditorToolbar — that's fine, this one is the idle fallback for the
// context-aware row-3 hint (which changes with tool/hover/selection state),
// not a duplicate of anything dynamic. ──────────────────────────────────────
const DEFAULT_HINT = 'Nothing selected'

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
  // Existing notes that were moved/resized/repitched/velocity-changed this
  // session (not new additions — those are newNotes above, and render
  // outline-only instead). Pulses the same white border as a selected note,
  // so an edit stays visible on the roll after you deselect it. Cleared on
  // Save & Reload along with newNotes — "after save all get normal
  // properties" (see NoteEditorToolbar.tsx's handleSave). ──────────────────
  editedNotes:        new Set<ToneNote>(),

  // ── Active tool — see NETool above. Toolbar sets this; PianoRoll reads it
  // every pointer event; toolbar re-renders via onToolChange. ──────────────
  activeTool:         'select' as NETool,
  onToolChange:       null as (() => void) | null,

  // ── Reassign-hands mode — separate from the Settings LH/RH algorithm
  // toggle (which controls whether assignHands() runs on load at all). This
  // one only controls whether the *editor* shows hand-colored notes and
  // offers Assign LH/RH right now. Off by default so opening the editor
  // never surprises you with a wall of color you didn't ask for. ──────────
  reassignHandsMode:  false,
  onReassignHandsModeChange: null as (() => void) | null,

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
    this.editedNotes.clear()
    this.editMidi           = null
    this.needsFlatRebuild   = false
    this.hoverHint          = DEFAULT_HINT
    this.snapRef.current            = true
    this.quantizeDivisorRef.current = 8
    this.showNoteNamesRef.current   = false
    this.activeTool                 = 'select'
    this.reassignHandsMode          = false
  },
}

// ── Build a File Info changelog summary from this session's applied note
// commands — tallies by the description prefix each cmd* function in
// noteEditorCommands.ts already writes, rather than duplicating a `kind`
// field. Batch commands (e.g. "Remove 3 notes") count their own N. ────────
export function buildNoteEditSummary(descriptions: string[]): string {
  let added = 0, removed = 0, moved = 0, repitched = 0, resized = 0, velocityChanged = 0, reassigned = 0
  for (const d of descriptions) {
    const batchRemove = d.match(/^Remove (\d+) notes?$/)
    const batchVelocity = d.match(/^Set velocity on (\d+) notes/)
    // Assign left/right hand — "Assign left hand" (1 note) or "Assign right
    // hand to N notes" (batch), from PianoRoll.tsx's assignSelectedHand.
    const batchAssign = d.match(/^Assign (?:left|right) hand to (\d+) notes$/)
    // Multi-select drag — "Move N notes", from PianoRoll.tsx's
    // 'selection-move' editDrag mode. Distinct from singular "Move note
    // midi=...tick=..." below (different string shape, was silently
    // uncounted since it doesn't start with "Move note").
    const batchMove = d.match(/^Move (\d+) notes$/)
    if (d.startsWith('Add note')) added++
    else if (batchRemove) removed += parseInt(batchRemove[1], 10)
    else if (d.startsWith('Remove note')) removed++
    else if (batchMove) moved += parseInt(batchMove[1], 10)
    else if (d.startsWith('Move note')) moved++
    else if (d.startsWith('Repitch note')) repitched++
    // "Resize note" never actually occurs — PianoRoll writes "Resize start"/
    // "Resize end" — matched on the shared "Resize " prefix instead.
    else if (d.startsWith('Resize ')) resized++
    else if (batchVelocity) velocityChanged += parseInt(batchVelocity[1], 10)
    else if (d.startsWith('Velocity note')) velocityChanged++
    else if (batchAssign) reassigned += parseInt(batchAssign[1], 10)
    else if (d.startsWith('Assign left hand') || d.startsWith('Assign right hand')) reassigned++
  }
  const s = (n: number) => n === 1 ? '' : 's'
  const parts: string[] = []
  if (added > 0) parts.push(`added ${added} note${s(added)}`)
  if (removed > 0) parts.push(`removed ${removed} note${s(removed)}`)
  if (moved > 0) parts.push(`moved ${moved} note${s(moved)}`)
  if (repitched > 0) parts.push(`repitched ${repitched} note${s(repitched)}`)
  if (resized > 0) parts.push(`resized ${resized} note${s(resized)}`)
  if (velocityChanged > 0) parts.push(`changed velocity on ${velocityChanged} note${s(velocityChanged)}`)
  if (reassigned > 0) parts.push(`reassigned hand on ${reassigned} note${s(reassigned)}`)
  return parts.length > 0 ? parts.join(', ') : 'Saved'
}

// ── Shared unsaved-changes guard — logo reset, load a different file, drag a
// new file in all funnel through this so "Save changes?" behaves identically
// everywhere. Returns true if the caller should proceed, false if the user
// cancelled. Scoped to Note Editor's NES.dirty only (not MidiEditor's
// uncommitted track-panel state). ───────────────────────────────────────────
export async function confirmDiscardDirtyNoteEdits(message: string): Promise<boolean> {
  if (NES.dirty) {
    const choice = await confirmDialog({
      title: 'Unsaved Changes',
      message,
      detail: 'Your note edits will be lost if you discard.',
      buttons: ['Save', 'Discard', 'Cancel'],
    })
    if (choice === 2) return false // Cancel
    if (choice === 0) {            // Save
      const ok = await NES.onSaveRequest?.()
      if (!ok) return false
    }
    NES.dirty = false // Discard, or successful save
  }
  // ── Force-close the Note Editor on every file switch/reset this guards —
  // unconditional, not gated on NES.dirty above. The editor's whole session
  // (NES.editMidi, reassignHandsMode, undo history, and the store's
  // noteEditorSoloTrackIndex/preSoloTrackVisibility solo snapshot) is
  // scoped to whatever file was loaded when it entered edit mode:
  // NES.editMidi is only ever (re)built on the noteEditorActive
  // false→true edge (see PianoRoll.tsx's "Edit mode enter/exit" effect),
  // and preSoloTrackVisibility is a plain positional boolean[] captured
  // against the old tracks array. Leaving the editor open across a file
  // swap — which happens even with zero edits made, just Reassign Hands
  // toggled on, since dirty was false and this used to return early above
  // — left both pointing at the old file: right-click's Assign LH/RH
  // options silently disappeared (editMidi's position-based index mapping
  // no longer matched the new file's tracks), and toggling Hand mode wiped
  // the roll (the old file's solo-visibility snapshot applied positionally
  // onto the new file's differently-sized tracks array). Closing here
  // mirrors NoteEditorToolbar's own ✕ button exactly, and keeps this an
  // always-off-on-reopen tool as intended — nothing about it should
  // survive a file switch. ─────────────────────────────────────────────
  const store = useStore.getState()
  if (store.noteEditorActive) {
    store.unsoloTrackForEdit()
    store.setNoteEditorActive(false)
    NES.reset()
  }
  return true
}
