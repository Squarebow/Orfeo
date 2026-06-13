import { useEffect } from 'react'
import { useStore } from '@/store'
import { detectChord } from '@/utils/chordDetection'

export function useChordDetection() {
  const activeKeys = useStore(s => s.activeKeys)
  const setCurrentChord = useStore(s => s.setCurrentChord)
  const settings = useStore(s => s.settings)

  useEffect(() => {
    const midiNumbers = Array.from(activeKeys.keys())
    const chord = detectChord(midiNumbers, settings.noteNaming)
    setCurrentChord(chord)
  }, [activeKeys, settings.noteNaming, setCurrentChord])
}
