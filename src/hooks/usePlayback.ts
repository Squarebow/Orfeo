import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'

/**
 * usePlayback — drives the currentTime forward in real time.
 * Uses requestAnimationFrame for smooth 60fps updates.
 * Tempo ratio (bpm / originalBpm) is applied for pitch-independent speed.
 */
export function usePlayback() {
  const {
    midi,
    playbackState,
    currentTime,
    bpm,
    originalBpm,
    loopEnabled,
    loopStart,
    loopEnd,
    setCurrentTime,
    setPlaybackState,
  } = useStore()

  const rafRef = useRef<number | null>(null)
  const lastTimestampRef = useRef<number | null>(null)
  const currentTimeRef = useRef(currentTime)

  // Keep ref in sync so the RAF loop always has latest value
  currentTimeRef.current = currentTime

  const stop = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    lastTimestampRef.current = null
    setPlaybackState('stopped')
    setCurrentTime(0)
  }, [setPlaybackState, setCurrentTime])

  const pause = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    lastTimestampRef.current = null
    setPlaybackState('paused')
  }, [setPlaybackState])

  const play = useCallback(() => {
    setPlaybackState('playing')
  }, [setPlaybackState])

  const seek = useCallback((time: number) => {
    setCurrentTime(Math.max(0, time))
  }, [setCurrentTime])

  // Animation loop
  useEffect(() => {
    if (playbackState !== 'playing' || !midi) return

    const tempoRatio = bpm / originalBpm

    const tick = (timestamp: number) => {
      if (lastTimestampRef.current === null) {
        lastTimestampRef.current = timestamp
      }

      const delta = (timestamp - lastTimestampRef.current) / 1000 // seconds
      lastTimestampRef.current = timestamp

      let newTime = currentTimeRef.current + delta * tempoRatio

      // Loop handling
      if (loopEnabled && loopEnd > loopStart && newTime >= loopEnd) {
        newTime = loopStart
      } else if (newTime >= midi.duration) {
        // Reached end — stop
        setCurrentTime(midi.duration)
        setPlaybackState('stopped')
        return
      }

      setCurrentTime(newTime)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      lastTimestampRef.current = null
    }
  }, [playbackState, midi, bpm, originalBpm, loopEnabled, loopStart, loopEnd, setCurrentTime, setPlaybackState])

  return { play, pause, stop, seek }
}
