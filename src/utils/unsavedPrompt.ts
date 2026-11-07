// ── The warning itself: asked before the open song goes away ─────────────────
// True when it's fine to carry on: nothing to lose, the warning is switched off,
// or the user chose to go ahead. The words live in unsavedChanges.ts.
import { useStore } from '../store'
import { confirmDialog } from './confirmController'
import { t } from './i18n'
import { countUnsaved, hasUnsaved, unsavedDetail } from './unsavedChanges'

/** Would confirmUnsavedChanges ask anything? */
export function willWarnAboutChanges(): boolean {
  const s = useStore.getState()
  return s.unsavedWarningEnabled && !!s.midi && hasUnsaved(countUnsaved(s.tracks, s.mixerBaseline, s.focusActive))
}

export async function confirmUnsavedChanges(message = t`These changes to the song will be lost:`, proceed = t`Continue Without Saving`): Promise<boolean> {
  if (!willWarnAboutChanges()) return true
  const s = useStore.getState()
  const unsaved = countUnsaved(s.tracks, s.mixerBaseline, s.focusActive)
  const choice = await confirmDialog({
    title: t`Unsaved changes`,
    message,
    detail: unsavedDetail(unsaved),
    buttons: [proceed, t`Cancel`],
    destructiveIndex: 0,
    startOnSafe: true,
  })
  return choice === 0
}
