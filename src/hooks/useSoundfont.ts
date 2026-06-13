import { useCallback, useRef, useState } from 'react'

// Placeholder — full soundfont engine to be implemented in Phase 1b
// Will use Tone.js + WAV/AIFF samples

export function useSoundfont() {
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)
  const audioCtxRef = useRef<AudioContext | null>(null)

  const init = useCallback(async () => {
    setLoading(true)
    try {
      audioCtxRef.current = new AudioContext()
      // TODO: load default soundfont samples
      setLoaded(true)
    } catch {
      console.warn('Audio context unavailable')
    } finally {
      setLoading(false)
    }
  }, [])

  const playNote = useCallback((midi: number, velocity: number = 80) => {
    // TODO: trigger sample for midi note
    console.log(`Play note: ${midi} vel: ${velocity}`)
  }, [])

  const stopNote = useCallback((midi: number) => {
    // TODO: release sample
    console.log(`Stop note: ${midi}`)
  }, [])

  return { loaded, loading, init, playNote, stopNote }
}
