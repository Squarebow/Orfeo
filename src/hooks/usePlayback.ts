import { useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'

export function usePlayback() {
  const rafRef = useRef<number | null>(null)
  const isRunningRef = useRef(false)
  // Fallback clock when JZZ player not available yet
  const fallbackStartPerfRef = useRef(0)
  const fallbackStartTimeRef = useRef(0)

  const stopRaf = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    isRunningRef.current = false
  }, [])

  const startRaf = useCallback(() => {
    stopRaf()
    isRunningRef.current = true
    const { bpm, originalBpm, currentTime } = useStore.getState()
    fallbackStartPerfRef.current = performance.now()
    fallbackStartTimeRef.current = currentTime
    const ratio = bpm / originalBpm

    const tick = () => {
      if (!isRunningRef.current) return
      const { playbackState, midi } = useStore.getState()
      if (playbackState !== 'playing') { stopRaf(); return }

      const player = (window as any).__orfeoPlayer
      if (player) {
        // Sync from JZZ player clock
        try {
          const ms = player.positionMS()
          if (typeof ms === 'number' && ms >= 0) {
            const secs = ms / 1000
            const duration = midi?.duration ?? 0
            const { loopRegionActive, loopStart, loopEnd } = useStore.getState()

            // ── Loop region seek — fires before end-of-file check ──────────────
            if (loopRegionActive && loopStart !== null && loopEnd !== null && secs >= loopEnd) {
              try { player.play(); player.jumpMS(Math.floor(loopStart * 1000)) } catch {}
              fallbackStartPerfRef.current = performance.now()
              fallbackStartTimeRef.current = loopStart
              useStore.setState({ currentTime: loopStart })
              rafRef.current = requestAnimationFrame(tick)
              return
            }

            if (secs >= duration && duration > 0) {
              // ── Entire-file loop when active with no region set ────────────
              if (loopRegionActive) {
                try { player.play(); player.jumpMS(0) } catch {}
                fallbackStartPerfRef.current = performance.now()
                fallbackStartTimeRef.current = 0
                useStore.setState({ currentTime: 0 })
                rafRef.current = requestAnimationFrame(tick)
                return
              }
              useStore.setState({ currentTime: duration, playbackState: 'stopped' })
              stopRaf(); return
            }
            useStore.setState({ currentTime: secs })
            rafRef.current = requestAnimationFrame(tick)
            return
          }
        } catch {}
      }

      // Fallback: performance.now() based clock
      const elapsed = (performance.now() - fallbackStartPerfRef.current) / 1000
      const newTime = fallbackStartTimeRef.current + elapsed * ratio
      const duration = midi?.duration ?? 0
      const { loopRegionActive, loopStart, loopEnd } = useStore.getState()

      // ── Loop region seek (fallback/samples path) ─────────────────────────
      if (loopRegionActive && loopStart !== null && loopEnd !== null && newTime >= loopEnd) {
        stopRaf()
        useStore.setState({ currentTime: loopStart, playbackState: 'paused' })
        Promise.resolve().then(() => useStore.setState({ playbackState: 'playing' }))
        return
      }

      if (newTime >= duration && duration > 0) {
        // ── Entire-file loop (fallback/samples path) ────────────────────────
        if (loopRegionActive) {
          stopRaf()
          useStore.setState({ currentTime: 0, playbackState: 'paused' })
          Promise.resolve().then(() => useStore.setState({ playbackState: 'playing' }))
          return
        }
        useStore.setState({ currentTime: duration, playbackState: 'stopped' })
        stopRaf(); return
      }
      useStore.setState({ currentTime: newTime })
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [stopRaf])

  const play = useCallback(async () => {
    useStore.setState({ playbackState: 'playing' })
    startRaf()
  }, [startRaf])

  const pause = useCallback(() => {
    stopRaf()
    useStore.setState({ playbackState: 'paused' })
  }, [stopRaf])

  const stop = useCallback(() => {
    stopRaf()
    useStore.setState({ playbackState: 'stopped', currentTime: 0 })
  }, [stopRaf])

  const seek = useCallback((timeSec: number) => {
    const clamped = Math.max(0, timeSec)
    const wasPlaying = useStore.getState().playbackState === 'playing'
    stopRaf()
    if (wasPlaying) {
      useStore.setState({ currentTime: clamped, playbackState: 'paused' })
    } else {
      useStore.setState({ currentTime: clamped })
    }
  }, [stopRaf])

  const seekAndPlay = useCallback((timeSec: number) => {
    const clamped = Math.max(0, timeSec)
    stopRaf()
    fallbackStartPerfRef.current = performance.now()
    fallbackStartTimeRef.current = clamped
    useStore.setState({ currentTime: clamped, playbackState: 'playing' })
    startRaf()
  }, [stopRaf, startRaf])

  // Watch for external state changes
  useEffect(() => {
    const unsub = useStore.subscribe((state, prev) => {
      if (state.playbackState === 'playing' && prev.playbackState !== 'playing') {
        fallbackStartPerfRef.current = performance.now()
        fallbackStartTimeRef.current = state.currentTime
        startRaf()
      }
      if (state.playbackState !== 'playing' && prev.playbackState === 'playing') {
        stopRaf()
      }
    })
    return unsub
  }, [startRaf, stopRaf])

  useEffect(() => () => stopRaf(), [stopRaf])

  return { play, pause, stop, seek, seekAndPlay }
}