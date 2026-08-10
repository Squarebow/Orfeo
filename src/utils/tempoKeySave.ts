import { useStore } from '../store'
import { parseMidiBuffer } from './midiParser'
import { detectKeyFromTracks, parseKeySignature, formatKey } from './keyDetection'
import { confirmDialog } from './confirmController'

// ── Tempo/Key save — bakes the session's BPM and transpose changes into a
// new _ORFEO_vN file (see electron/main.ts's tempoKey:save), same
// versioning convention as every other save tool. Gated behind the
// Settings "save tempo/key changes" toggle — off by default so BPM/
// transpose stay the session-only display preferences they've always been
// unless a user explicitly opts in. ─────────────────────────────────────────
export async function saveTempoKeyChanges(): Promise<boolean> {
  try {
    const state = useStore.getState()
    const sourcePath = (state.midi as any)?._filePath as string | undefined
    if (!sourcePath) return false

    const bpmRatio = state.originalBpm > 0 ? state.bpm / state.originalBpm : 1
    const transposeSemitones = state.detectedKey?.transpose ?? 0
    if (bpmRatio === 1 && transposeSemitones === 0) return true // nothing to save

    const parts: string[] = []
    if (bpmRatio !== 1) {
      parts.push(`Changed BPM from ${Math.round(state.originalBpm)} to ${Math.round(state.bpm)}`)
    }
    if (transposeSemitones !== 0 && state.detectedKey) {
      const fromKey = formatKey({ ...state.detectedKey, transpose: 0 }, state.noteNaming, state.accidentals)
      const toKey   = formatKey(state.detectedKey, state.noteNaming, state.accidentals)
      parts.push(`Changed key from ${fromKey} to ${toKey}`)
    }

    // Final key (base + transpose already folded in), sent so main.ts can
    // stamp it as an ORFEO_KEY meta event — @tonejs/midi's own key-
    // signature ENCODER silently drops the value on any re-save (verified
    // directly: round-tripping an unchanged file through .toArray() alone
    // already loses it, nothing to do with transpose math being wrong).
    // Bypasses that entirely, same pattern as ORFEO_TRACK_NAME/COLOR.
    const finalKey = state.detectedKey
      ? { semitone: ((state.detectedKey.semitone + state.detectedKey.transpose) % 12 + 12) % 12, isMinor: state.detectedKey.isMinor }
      : undefined

    const result = await window.electronAPI.saveTempoKey({
      filePath: sourcePath, bpmRatio, transposeSemitones, summary: parts.join(', '), finalKey,
    })
    if (!result.ok) {
      await confirmDialog({ title: 'Save Failed', message: result.message ?? 'Could not save tempo/key changes.', buttons: ['OK'] })
      return false
    }

    if (result.base64 && result.fileName && result.filePath) {
      const b   = atob(result.base64)
      const arr = new Uint8Array(b.length)
      for (let i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i)
      const parsed = parseMidiBuffer(arr.buffer, result.fileName, result.filePath)
      useStore.getState().setMidi(parsed) // resets bpm/originalBpm to the new file's own tempo
      const raw = parsed as any
      if (raw._keySignature != null) {
        useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
      } else {
        useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
      }
    }
    useStore.getState().setLibraryNeedsRefresh(true)
    return true
  } catch (err) {
    console.error('[Orfeo] saveTempoKeyChanges failed:', err)
    await confirmDialog({ title: 'Save Failed', message: 'Could not save tempo/key changes.', detail: String(err), buttons: ['OK'] })
    return false
  }
}

// ── Shared unsaved-changes guard — same shape as
// noteEditorState.ts's confirmDiscardDirtyNoteEdits, called alongside it
// at every place that can discard the current file (new file load, drag-
// drop, app close, Reset). Returns true if the caller should proceed. ──────
export async function confirmDiscardDirtyTempoKey(message: string): Promise<boolean> {
  const state = useStore.getState()
  if (!state.saveTempoKeyChangesEnabled || !state.midi) return true
  const dirty = state.bpm !== state.originalBpm || (state.detectedKey?.transpose ?? 0) !== 0
  if (!dirty) return true

  const choice = await confirmDialog({
    title: 'Unsaved Tempo/Key Changes',
    message,
    detail: 'Your tempo and/or key changes will be lost if you discard.',
    buttons: ['Save', 'Discard', 'Cancel'],
  })
  if (choice === 2) return false // Cancel
  if (choice === 0) {            // Save
    const ok = await saveTempoKeyChanges()
    if (!ok) return false
  } else {                       // Discard — revert to the loaded file's own values
    const s = useStore.getState()
    useStore.setState({ bpm: s.originalBpm })
    if (s.detectedKey) useStore.setState({ detectedKey: { ...s.detectedKey, transpose: 0 } })
  }
  return true
}
