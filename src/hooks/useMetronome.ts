import { useEffect, useRef } from 'react'
import { useStore } from '../store'

/**
 * useMetronome — Web Audio lookahead scheduler.
 * Runs an independent beat clock at the current BPM.
 * Resets when playback starts/stops. Adapts immediately when BPM changes.
 */
export function useMetronome() {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const schedulerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextBeatRef = useRef(0)       // audioCtx time of next scheduled beat
  const beatCountRef = useRef(0)      // for downbeat detection
  const lastBpmRef = useRef(0)
  const activeRef = useRef(false)

  function getCtx() {
    if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
      audioCtxRef.current = new AudioContext()
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume()
    }
    return audioCtxRef.current
  }

  function click(ctx: AudioContext, when: number, accent: boolean) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = accent ? 1200 : 900
    gain.gain.setValueAtTime(accent ? 0.55 : 0.3, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.035)
    osc.start(when)
    osc.stop(when + 0.04)
  }

  function startMetronome() {
    if (activeRef.current) return
    activeRef.current = true

    const ctx = getCtx()
    const { bpm, midi } = useStore.getState()
    const numerator = midi?.timeSignatureNumerator ?? 4

    lastBpmRef.current = bpm
    beatCountRef.current = 0
    // Start first beat slightly in the future so audio context is warmed up
    nextBeatRef.current = ctx.currentTime + 0.08

    schedulerRef.current = setInterval(() => {
      const { metronomeEnabled, playbackState, bpm: curBpm, midi: curMidi } = useStore.getState()

      if (!metronomeEnabled || playbackState !== 'playing') {
        stopMetronome()
        return
      }

      const ctx2 = getCtx()
      const num = curMidi?.timeSignatureNumerator ?? 4

      // BPM changed — reschedule from now without skipping a beat
      if (curBpm !== lastBpmRef.current) {
        lastBpmRef.current = curBpm
        // Keep the same beat count but update next beat timing
        nextBeatRef.current = ctx2.currentTime + 0.02
      }

      const spb = 60 / curBpm  // seconds per beat
      const lookahead = ctx2.currentTime + 0.12  // schedule 120ms ahead

      while (nextBeatRef.current < lookahead) {
        const isAccent = beatCountRef.current % num === 0
        click(ctx2, nextBeatRef.current, isAccent)
        nextBeatRef.current += spb
        beatCountRef.current++
      }
    }, 25)
  }

  function stopMetronome() {
    if (schedulerRef.current) {
      clearInterval(schedulerRef.current)
      schedulerRef.current = null
    }
    activeRef.current = false
    lastBpmRef.current = 0
  }

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      if (state.metronomeEnabled && state.playbackState === 'playing') {
        startMetronome()
      } else {
        stopMetronome()
      }
    })

    return () => {
      unsub()
      stopMetronome()
      audioCtxRef.current?.close()
    }
  }, [])
}
