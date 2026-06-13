import { useCallback, useState } from 'react'
import { useStore } from '@/store'
import { parseMidiBuffer, numberArrayToBuffer } from '@/utils/midiParser'

export function useMidiFile() {
  const setMidiFile = useStore(s => s.setMidiFile)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openFile = useCallback(async () => {
    setError(null)
    setLoading(true)

    try {
      const result = await window.orfeo.openMidiFile()
      if (!result) { setLoading(false); return }

      const buffer = numberArrayToBuffer(result.data)
      const midiFile = parseMidiBuffer(buffer, result.name, result.path)
      setMidiFile(midiFile)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open MIDI file')
    } finally {
      setLoading(false)
    }
  }, [setMidiFile])

  return { openFile, loading, error }
}
