import { useEffect, useRef } from 'react'
import { useStore } from '../store'

// ── Beat ↔ time math (exported for TopBar live-BPM display) ─────────────────

// Total beats elapsed from song start to `time` seconds, integrating through tempo map
export function getElapsedBeats(
  tempoMap: { bpm: number; time: number }[],
  time: number,
): number {
  if (!tempoMap.length) return time * 2  // 120 BPM fallback
  let beats = 0
  for (let i = 0; i < tempoMap.length; i++) {
    const segStart = tempoMap[i].time
    const segEnd   = i + 1 < tempoMap.length ? tempoMap[i + 1].time : Infinity
    const until    = segEnd === Infinity ? time : Math.min(time, segEnd)
    if (until <= segStart) break
    beats += (until - segStart) * (tempoMap[i].bpm / 60)
    if (until < segEnd) break  // time is inside this segment
  }
  return beats
}

// Inverse: song-file seconds at which beat number `targetBeat` falls
export function getSongTimeForBeat(
  tempoMap: { bpm: number; time: number }[],
  targetBeat: number,
): number {
  if (!tempoMap.length) return targetBeat / 2  // 120 BPM fallback
  let beatsAccum = 0
  for (let i = 0; i < tempoMap.length; i++) {
    const segStart   = tempoMap[i].time
    const segEnd     = i + 1 < tempoMap.length ? tempoMap[i + 1].time : Infinity
    const segDur     = segEnd === Infinity ? Infinity : segEnd - segStart
    const beatsInSeg = segDur === Infinity ? Infinity : segDur * (tempoMap[i].bpm / 60)

    if (beatsAccum + beatsInSeg > targetBeat) {
      return segStart + (targetBeat - beatsAccum) / (tempoMap[i].bpm / 60)
    }
    beatsAccum += beatsInSeg
  }
  // Past all defined segments: extrapolate at last BPM
  const last = tempoMap[tempoMap.length - 1]
  return last.time + (targetBeat - beatsAccum) / (last.bpm / 60)
}

// ── Metronome hook ───────────────────────────────────────────────────────────

export function useMetronome() {
  const ctxRef          = useRef<AudioContext | null>(null)
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  // Tracks highest beat number already scheduled to avoid double-firing
  const lastScheduled   = useRef<number>(-1)
  // Invariant during playback: audioCtxTime - currentTime / ratio = constant
  const audioOffsetRef  = useRef<number>(0)
  const stopTimer       = useRef<ReturnType<typeof setTimeout> | null>(null)

  function getCtx(): AudioContext {
    if (!ctxRef.current || ctxRef.current.state === 'closed') ctxRef.current = new AudioContext()
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
    lastScheduled.current = -1
  }

  function startScheduler() {
    if (intervalRef.current) return
    const ctx = getCtx()
    const { currentTime, bpm, originalBpm } = useStore.getState()
    const ratio = originalBpm > 0 ? bpm / originalBpm : 1
    // Establish audio↔song correspondence.
    // While ratio stays constant: ctx.currentTime - currentTime/ratio = constant.
    audioOffsetRef.current = ctx.currentTime - currentTime / ratio
    lastScheduled.current = -1

    // 300ms lookahead — enough buffer to absorb PixiJS main-thread jitter
    const LOOKAHEAD = 0.30

    intervalRef.current = setInterval(() => {
      const { metronomeEnabled, playbackState, currentTime, midi, bpm, originalBpm } = useStore.getState()
      if (!metronomeEnabled || playbackState !== 'playing') { stopScheduler(); return }

      const ctx      = getCtx()
      const now      = ctx.currentTime
      const tempoMap = (midi as any)?._tempoMap as { bpm: number; time: number }[] ?? []
      const ratio    = originalBpm > 0 ? bpm / originalBpm : 1
      const numerator = midi?.timeSignatureNumerator ?? 4

      // Beat count at current song position — exact, integrates through all tempo changes
      const elapsedBeats = getElapsedBeats(tempoMap, currentTime)

      // First beat to schedule: whichever is later — the upcoming beat in the song,
      // or one past the last already scheduled (prevents double-firing)
      const startBeat = Math.max(
        Math.ceil(elapsedBeats - 0.02),  // 0.02-beat grace: catch beat we're right on
        lastScheduled.current + 1,
      )

      // Schedule every beat whose exact audio time falls within the lookahead window
      for (let bt = startBeat; ; bt++) {
        // Exact file time for this beat (integrates tempo map),
        // converted to wall-clock (÷ ratio), then to AudioContext time (+ offset).
        const beatAudioTime = audioOffsetRef.current + getSongTimeForBeat(tempoMap, bt) / ratio
        if (beatAudioTime >= now + LOOKAHEAD) break  // past lookahead window — stop
        if (beatAudioTime < now + 0.005) {            // already in the past — skip cleanly
          lastScheduled.current = Math.max(lastScheduled.current, bt)
          continue
        }
        scheduleClick(ctx, beatAudioTime, bt % numerator === 0)
        lastScheduled.current = bt
      }
    }, 25)
  }

  useEffect(() => {
    const unsub = useStore.subscribe((state) => {
      if (state.metronomeEnabled && state.playbackState === 'playing') {
        // Cancel any pending stop (e.g. from wheel-scrub pause)
        if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current = null }
        if (!intervalRef.current) startScheduler()
      } else {
        // Debounce stop 80ms — ignores transient pauses from wheel scrub
        if (stopTimer.current) clearTimeout(stopTimer.current)
        stopTimer.current = setTimeout(() => { stopScheduler(); stopTimer.current = null }, 80)
      }
    })
    return () => { unsub(); stopScheduler(); ctxRef.current?.close() }
  }, [])
}
