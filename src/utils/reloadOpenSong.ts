// ── Skip empty bars at the start: switching it on or off with a song open ────
// The open song is read again from the file's own bytes and handed to the
// store, which prepares it with the new setting (prepareSong.ts) — the same
// as opening it, unsaved edits asked about first, as for any other load.
import { useStore } from '../store'
import { parseMidiBuffer } from './midiParser'
import { detectKeyFromTracks, parseKeySignature } from './keyDetection'
import { confirmDiscardDirtyNoteEdits } from './noteEditorState'
import { confirmDiscardDirtyTempoKey } from './tempoKeySave'
import { t } from './i18n'

export async function reloadOpenSong(): Promise<void> {
  const m = useStore.getState().midi
  const raw = m?._origRaw ?? m?._raw
  if (!m || !raw) return
  const parsed = parseMidiBuffer(raw, m.fileName, (m as any)._filePath ?? '')
  useStore.getState().setMidi(parsed)
  const ks = (parsed as any)._keySignature
  useStore.getState().setDetectedKey(ks != null ? parseKeySignature(ks.key, ks.scale) : detectKeyFromTracks(parsed.tracks))
}

/** After either switch changed: apply it to the open song now (asking first
 *  about unsaved edits); declined, it applies from the next song opened */
export async function applySkipEmptyBarsChange(): Promise<void> {
  if (!useStore.getState().midi) return
  const message = t`Apply "Skip empty bars at the start" to the open song now?`
  if (!(await confirmDiscardDirtyNoteEdits(message))) return
  if (!(await confirmDiscardDirtyTempoKey(message))) return
  await reloadOpenSong()
}
