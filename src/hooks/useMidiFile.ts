import { useCallback } from 'react'
import { useStore } from '../store'
import { parseMidiBuffer } from '../utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from '../utils/keyDetection'
import { resolveAndTrackImport } from '../utils/foreignFormatImport'
import { confirmSongAway } from '../utils/unsavedPrompt'
import { t } from '../utils/i18n'

export function useMidiFile() {
  const setMidi = useStore((s) => s.setMidi)
  const setDetectedKey = useStore((s) => s.setDetectedKey)

  const openFile = useCallback(async () => {
    try {
      const result = await window.electronAPI.openMidiFile()
      if (!result) return
      // after the file is picked: backing out of the picker loses nothing
      if (!(await confirmSongAway(t`Save your changes before opening this file?`, t`Open Without Saving`, t`Save All & Open`))) return

      const libraryFolder = (useStore.getState() as any).libraryFolder as string | null ?? null
      const resolved = await resolveAndTrackImport(
        result.filePath ?? '', result.base64, result.fileName, libraryFolder,
      )

      const binary = atob(resolved.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      const parsed = parseMidiBuffer(bytes.buffer, resolved.fileName, resolved.filePath)
      setMidi(parsed)

      // Detect key from MIDI metadata first, fallback to note analysis
      const raw = parsed as any
      if (raw._keySignature != null) {
        const key = parseKeySignature(raw._keySignature.key, raw._keySignature.scale)
        setDetectedKey(key)
      } else {
        const key = detectKeyFromTracks(parsed.tracks)
        setDetectedKey(key)
      }
    } catch (err) {
      console.error('Failed to open MIDI file:', err)
    }
  }, [setMidi, setDetectedKey])

  return { openFile }
}