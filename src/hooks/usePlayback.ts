import { useEffect, useRef, useCallback } from 'react'
import * as Tone from 'tone'
import { useStore } from '../store'

export function usePlayback() {
  const rafRef = useRef<number | null>(null)
  const startPerfRef = useRef<number>(0)
  const startMidiRef = useRef<number>(0)
  const tempoRatioRef = useRef<number>(1)
  const isRunningRef = useRef(false)

  const stopRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    isRunningRef.current = false
  }, [])

  const startRaf = useCallback((fromMidiTime: number) => {
    stopRaf()
    const { bpm, originalBpm } = useStore.getState()
    tempoRatioRef.current = bpm / originalBpm
    startPerfRef.current = performance.now()
    startMidiRef.current = fromMidiTime
    isRunningRef.current = true

    const tick = () => {
      if (!isRunningRef.current) return

      const elapsed = (performance.now() - startPerfRef.current) / 1000
      const newTime = startMidiRef.current + elapsed * tempoRatioRef.current
      const { midi, loopEnabled, loopStart, loopEnd, playbackState } = useStore.getState()

      // Stop RAF if state changed externally
      if (playbackState !== 'playing') {
        stopRaf()
        return
      }

      const duration = midi?.duration ?? 0

      if (loopEnabled && loopEnd > loopStart && newTime >= loopEnd) {
        startPerfRef.current = performance.now()
        startMidiRef.current = loopStart
        useStore.setState({ currentTime: loopStart })
      } else if (newTime >= duration && duration > 0) {
        useStore.setState({ currentTime: duration, playbackState: 'stopped' })
        stopRaf()
        return
      } else {
        useStore.setState({ currentTime: newTime })
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [stopRaf])

  const play = useCallback(async () => {
    await Tone.start()
    const t = useStore.getState().currentTime
    useStore.setState({ playbackState: 'playing' })
    startRaf(t)
  }, [startRaf])

  const pause = useCallback(() => {
    stopRaf()
    useStore.setState({ playbackState: 'paused' })
  }, [stopRaf])

  const stop = useCallback(() => {
    stopRaf()
    useStore.setState({ playbackState: 'stopped', currentTime: 0 })
  }, [stopRaf])

  const seek = useCallback((time: number) => {
    const clamped = Math.max(0, time)
    const wasPlaying = useStore.getState().playbackState === 'playing'
    stopRaf()
    if (wasPlaying) {
      useStore.setState({ currentTime: clamped, playbackState: 'paused' })
    } else {
      useStore.setState({ currentTime: clamped })
    }
  }, [stopRaf])

  const seekAndPlay = useCallback((time: number) => {
    const clamped = Math.max(0, time)
    useStore.setState({ currentTime: clamped, playbackState: 'playing' })
    startRaf(clamped)
  }, [startRaf])

  // KEY FIX: subscribe to store and stop RAF whenever playbackState is not 'playing'
  useEffect(() => {
    const unsubscribe = useStore.subscribe((state, prev) => {
      if (prev.playbackState === 'playing' && state.playbackState !== 'playing') {
        stopRaf()
      }
      if (state.playbackState === 'playing' && prev.playbackState !== 'playing') {
        startRaf(state.currentTime)
      }
      if (state.bpm !== prev.bpm && isRunningRef.current) {
        startRaf(state.currentTime)
      }
    })
    return unsubscribe
  }, [stopRaf, startRaf])

  useEffect(() => () => stopRaf(), [stopRaf])

  return { play, pause, stop, seek, seekAndPlay }
}