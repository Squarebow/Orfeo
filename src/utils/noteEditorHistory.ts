import type { NoteCommand } from './noteEditorCommands'

// ── NoteEditorHistory ─────────────────────────────────────────────────────────
export interface NoteEditorHistory {
  // Execute a command and push it onto the undo stack. Clears any redo history.
  push(cmd: NoteCommand): void
  // Revert the most recent command. Returns false if nothing to undo.
  undo(): boolean
  // Re-apply the most recently undone command. Returns false if nothing to redo.
  redo(): boolean
  readonly canUndo: boolean
  readonly canRedo: boolean
  // Discard all history (e.g. on file save or editor close).
  clear(): void
  // Dev helper — returns each stack entry with the cursor position marked.
  debugStack(): string[]
}

// ── createNoteEditorHistory ───────────────────────────────────────────────────
// Returns a fresh history instance. maxSize caps total stored commands; oldest
// commands are dropped when the limit is exceeded.
export function createNoteEditorHistory(maxSize = 100): NoteEditorHistory {
  const stack: NoteCommand[] = []
  // cursor = index of the next slot to write; everything at [0, cursor) is done.
  let cursor = 0

  return {
    push(cmd) {
      // Discard redo branch above cursor before appending
      stack.splice(cursor)
      stack.push(cmd)
      cursor = stack.length

      // Trim oldest entries when limit is exceeded
      if (stack.length > maxSize) {
        const excess = stack.length - maxSize
        stack.splice(0, excess)
        cursor = stack.length
      }
    },

    undo() {
      if (cursor === 0) return false
      cursor--
      stack[cursor].revert()
      return true
    },

    redo() {
      if (cursor >= stack.length) return false
      stack[cursor].apply()
      cursor++
      return true
    },

    get canUndo() { return cursor > 0 },
    get canRedo()  { return cursor < stack.length },

    clear() {
      stack.length = 0
      cursor = 0
    },

    debugStack() {
      return stack.map((cmd, i) =>
        `${i === cursor ? '→ ' : '  '}[${i}] ${cmd.description}`
      )
    },
  }
}
