import { useCallback } from 'react'
import { useStore } from '../store'
import { parseMidiBuffer } from '../utils/midiParser'

export function useMidiFile() {
  const setMidi = useStore((s) => s.setMidi)
  const setPlaybackState = useStore((s) => s.setPlaybackState)

  const openFile = useCallback(async () => {
    try {
      const result = await window.electronAPI.openMidiFile()
      if (!result) return // user cancelled

      // Convert base64 → ArrayBuffer
      const binary = atob(result.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }

      const parsed = parseMidiBuffer(bytes.buffer, result.fileName)
      setMidi(parsed)
      setPlaybackState('stopped')
    } catch (err) {
      console.error('Failed to open MIDI file:', err)
    }
  }, [setMidi, setPlaybackState])

  return { openFile }
}
