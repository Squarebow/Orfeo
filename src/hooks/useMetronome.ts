import { useEffect, useRef } from 'react'
import { useStore } from '../store'

function getBpmAtTime(tempoMap: { bpm: number; time: number }[], time: number): number {
  if (!tempoMap || tempoMap.length === 0) return 120
  let bpm = tempoMap[0].bpm
  for (const event of tempoMap) {
    if (event.time <= time) bpm = event.bpm
    else break
  }
  return bpm
}

export function useMetronome() {
  const ctxRef              = useRef<AudioContext | null>(null)
  const intervalRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const nextBeatRef         = useRef<number>(0)
  const beatNumRef          = useRef<number>(0)
  const lastDisplayedBpmRef = useRef<number>(0)
  const bpmWriteTimer       = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Debounce stop so wheel-scrub pause/play cycles don't restart the metronome
  const stopTimer           = useRef<ReturnType<typeof setTimeout> | null>(null)

  function getCtx(): AudioContext {
    if (!ctxRef.current || ctxRef.current.state === 'closed') {
      ctxRef.current = new AudioContext()
    }
    if (ctxRef.current.state === 'suspended') ctxRef.current.resume()
    return ctxRef.current
  }

  function scheduleClick(ctx: AudioContext, when: number, accent: boolean) {
    const osc  = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = accent ? 1400 : 1000
    gain.gain.setValueAtTime(accent ? 0.9 : 0.6, when)
    gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04)
    osc.start(when)
    osc.stop(when + 0.05)
  }

  function stopScheduler() {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (bpmWriteTimer.current) { clearTimeout(bpmWriteTimer.current); bpmWriteTimer.current = null }
    nextBeatRef.current         = 0
    beatNumRef.current          = 0
    lastDisplayedBpmRef.current = 0
  }

  function startScheduler() {
    if (intervalRef.current) return
    const ctx = getCtx()

    // Align first click to the current beat grid position in the song
    const { currentTime, midi, bpm, originalBpm } = useStore.getState()
    const tempoMap0  = (midi as any)?._tempoMap as { bpm: number; time: number }[] | undefined
    const rawBpm0    = getBpmAtTime(tempoMap0 ?? [], currentTime)
    const ratio0     = originalBpm > 0 ? bpm / originalBpm : 1
    const spb0       = 60 / (rawBpm0 * ratio0)

    const elapsedBeats   = currentTime / spb0
    beatNumRef.current   = Math.floor(elapsedBeats)
    const fracBeat       = elapsedBeats - beatNumRef.current
    const timeToNextBeat = (1 - fracBeat) * spb0
    // Schedule first click at next grid-aligned beat; ensure at least 20ms ahead
    nextBeatRef.current  = ctx.currentTime + Math.max(0.02, timeToNextBeat)

    // 300ms lookahead — enough buffer to absorb main-thread jitter from PixiJS rendering
    const LOOKAHEAD = 0.30

    intervalRef.current = setInterval(() => {
      const { metronomeEnabled, playbackState, currentTime, midi, bpm, originalBpm } = useStore.getState()

      if (!metronomeEnabled || playbackState !== 'playing') {
        stopScheduler()
        return
      }

      const ctx = getCtx()
      const now = ctx.currentTime

      const tempoMap     = (midi as any)?._tempoMap as { bpm: number; time: number }[] | undefined
      const rawBpm       = getBpmAtTime(tempoMap ?? [], currentTime)
      const ratio        = originalBpm > 0 ? bpm / originalBpm : 1
      const effectiveBpm = rawBpm * ratio
      const spb          = 60 / effectiveBpm

      // Update BPM display via debounced timeout — never setState inside audio loop
      const roundedRaw = Math.round(rawBpm)
      if (roundedRaw !== lastDisplayedBpmRef.current) {
        lastDisplayedBpmRef.current = roundedRaw
        if (Math.abs(ratio - 1) < 0.001) {
          if (bpmWriteTimer.current) clearTimeout(bpmWriteTimer.current)
          bpmWriteTimer.current = setTimeout(() => {
            useStore.setState({ bpm: rawBpm, originalBpm: rawBpm })
          }, 80)
        }
      }

      // Snap forward if the scheduler fell a full beat behind (e.g. tab was hidden)
      // Advance by whole beats to preserve accent alignment
      if (nextBeatRef.current < now - spb) {
        const beatsSkipped   = Math.ceil((now - nextBeatRef.current) / spb)
        nextBeatRef.current += beatsSkipped * spb
        beatNumRef.current  += beatsSkipped
      }

      const numerator = midi?.timeSignatureNumerator ?? 4

      while (nextBeatRef.current < now + LOOKAHEAD) {
        scheduleClick(ctx, nextBeatRef.current, beatNumRef.current % numerator === 0)
        nextBeatRef.current += spb
        beatNumRef.current++
      }
    }, 25)
  }

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      if (state.metronomeEnabled && state.playbackState === 'playing') {
        // Cancel any pending stop (e.g. from wheel scrub pause)
        if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current = null }
        if (!intervalRef.current) startScheduler()
      } else {
        // Debounce stop by 80ms — ignores transient pauses from wheel scrub
        if (stopTimer.current) clearTimeout(stopTimer.current)
        stopTimer.current = setTimeout(() => {
          stopScheduler()
          stopTimer.current = null
        }, 80)
      }
    })
    return () => { unsub(); stopScheduler(); ctxRef.current?.close() }
  }, [])
}
