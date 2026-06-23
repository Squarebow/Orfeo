import { useCallback } from 'react'
import { useStore } from '../store'
import { parseMidiBuffer } from '../utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from '../utils/keyDetection'

export function useMidiFile() {
  const setMidi = useStore((s) => s.setMidi)
  const setDetectedKey = useStore((s) => s.setDetectedKey)

  const openFile = useCallback(async () => {
    try {
      const result = await window.electronAPI.openMidiFile()
      if (!result) return

      const binary = atob(result.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

      const parsed = parseMidiBuffer(bytes.buffer, result.fileName, result.filePath ?? '')
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