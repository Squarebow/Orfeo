import { useEffect, useRef } from 'react'
import { useStore } from '../store'

/**
 * useMetronome — plays an audible click on each beat using Web Audio API.
 * Syncs to currentTime and BPM from the store.
 */
export function useMetronome() {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const lastBeatRef = useRef<number>(-1)
  const rafRef = useRef<number | null>(null)

  const getCtx = () => {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') audioCtxRef.current.resume()
    return audioCtxRef.current
  }

  const playClick = (beat: number) => {
    const ctx = getCtx()
    const isDownbeat = beat % (useStore.getState().midi?.timeSignatureNumerator ?? 4) === 0

    // Create a short click sound
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.frequency.value = isDownbeat ? 1000 : 800  // higher pitch on beat 1
    gain.gain.setValueAtTime(isDownbeat ? 0.4 : 0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05)

    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + 0.05)
  }

  useEffect(() => {
    const tick = () => {
      const { metronomeEnabled, playbackState, currentTime, bpm, midi } = useStore.getState()

      if (metronomeEnabled && playbackState === 'playing' && midi) {
        const secondsPerBeat = 60 / bpm
        const currentBeat = Math.floor(currentTime / secondsPerBeat)

        if (currentBeat !== lastBeatRef.current) {
          lastBeatRef.current = currentBeat
          playClick(currentBeat)
        }
      } else {
        lastBeatRef.current = -1
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      audioCtxRef.current?.close()
    }
  }, [])
}