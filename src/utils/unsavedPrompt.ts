// ── One window before the open song goes away ───────────────────────────────
// Closing Orfeo, opening another song (Library, Open, drag and drop, double-
// click), the logo reset: every unsaved change in one list, the same list as
// the save badge in the top bar, instead of a popup per tool. True = go on.
// The imported-file question (MusicXML…) stays its own: it's about the
// original file, not this song's changes.
import { useStore } from '../store'
import { confirmDialog } from './confirmController'
import { t } from './i18n'
import { NES, confirmDiscardDirtyNoteEdits } from './noteEditorState'
import { collectUnsaved, saveAll, resetTempoKey, type UnsavedRow } from './sessionSave'

/** What the window would list: notes and tempo & key always; track and Mixer
 *  changes only while "Warn about unsaved changes" is on */
function rowsToAsk(): UnsavedRow[] {
  const warn = useStore.getState().unsavedWarningEnabled
  return collectUnsaved().filter(r => r.kind !== 'import' && (warn || r.kind === 'notes' || r.kind === 'tempoKey'))
}

/** Would confirmSongAway ask anything? */
export function willWarnAboutChanges(): boolean {
  return rowsToAsk().length > 0
}

export async function confirmSongAway(
  message = t`Save these changes to the song first?`,
  leave = t`Continue Without Saving`,
  saveAndLeave = t`Save All & Continue`,
): Promise<boolean> {
  const rows = rowsToAsk()
  if (rows.length) {
    const lines = rows.map(r => `${r.label}: ${r.detail}`)
    const editorOnly = rows.some(r => r.kind === 'playbackEditor')
    lines.push('', editorOnly
      ? t`Save All makes one new version; the original stays as it is. Playback Editor edits are saved in the Playback Editor.`
      : t`Save All makes one new version; the original stays as it is.`)
    const choice = await confirmDialog({
      title: t`You have unsaved changes`,
      message,
      detail: lines.join('\n'),
      buttons: [saveAndLeave, leave, t`Cancel`],
      secondaryIndex: 1,
      startOnSafe: true,
    })
    if (choice === 2) return false
    if (choice === 0) {
      if (!(await saveAll({ includeImport: false }))) return false
    } else {
      NES.dirty = false
      if (rows.some(r => r.kind === 'tempoKey')) resetTempoKey()
    }
  }
  // Closes the Note Editor (nothing left to ask: it's saved or let go above)
  return confirmDiscardDirtyNoteEdits('')
}
