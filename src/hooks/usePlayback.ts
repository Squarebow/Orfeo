import { useCallback, useEffect, useRef } from 'react'
import { useStore } from '@/store'
import { secondsToBarBeat } from '@/utils/midiParser'

export function usePlayback() {
  const {
    midiFile, playbackState, position, tempo,
    setPlaybackState, setPosition, releaseAllKeys, pressKey, releaseKey,
    tracks, setCurrentChord, settings
  } = useStore()

  const startTimeRef = useRef<number>(0)
  const startOffsetRef = useRef<number>(0)
  const animFrameRef = useRef<number>(0)
  const scheduledNotes = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map())

  const getCurrentSeconds = useCallback(() => {
    if (playbackState !== 'playing') return position.seconds
    return startOffsetRef.current + (performance.now() - startTimeRef.current) / 1000
  }, [playbackState, position.seconds])

  const play = useCallback(() => {
    if (!midiFile) return
    startTimeRef.current = performance.now()
    startOffsetRef.current = position.seconds
    setPlaybackState('playing')
  }, [midiFile, position.seconds, setPlaybackState])

  const pause = useCallback(() => {
    setPlaybackState('paused')
    setPosition({
      seconds: getCurrentSeconds(),
      bar: position.bar,
      beat: position.beat,
    })
    releaseAllKeys()
    scheduledNotes.current.forEach(t => clearTimeout(t))
    scheduledNotes.current.clear()
    cancelAnimationFrame(animFrameRef.current)
  }, [setPlaybackState, setPosition, getCurrentSeconds, position, releaseAllKeys])

  const stop = useCallback(() => {
    setPlaybackState('stopped')
    setPosition({ seconds: 0, bar: 1, beat: 1 })
    releaseAllKeys()
    scheduledNotes.current.forEach(t => clearTimeout(t))
    scheduledNotes.current.clear()
    cancelAnimationFrame(animFrameRef.current)
  }, [setPlaybackState, setPosition, releaseAllKeys])

  // Animation loop — updates position display
  useEffect(() => {
    if (playbackState !== 'playing' || !midiFile) return

    const tick = () => {
      const seconds = getCurrentSeconds()
      if (seconds >= midiFile.duration) {
        stop()
        return
      }
      const barBeat = secondsToBarBeat(
        seconds, tempo, midiFile.timeSignature.numerator
      )
      const [bar, beat] = barBeat.split(':').map(Number)
      setPosition({ seconds, bar, beat })
      animFrameRef.current = requestAnimationFrame(tick)
    }

    animFrameRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animFrameRef.current)
  }, [playbackState, midiFile, tempo, getCurrentSeconds, setPosition, stop])

  return { play, pause, stop, getCurrentSeconds }
}
