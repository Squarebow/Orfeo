import { useEffect, useRef } from 'react'
import { useStore } from '../store'

// ── Metronome hook ───────────────────────────────────────────────────────────

export function useMetronome() {
  const ctxRef          = useRef<AudioContext | null>(null)
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  // Tracks highest beat index (into the file's _beatTimes grid) already
  // scheduled, to avoid double-firing
  const lastScheduled   = useRef<number>(-1)
  // Invariant during playback: audioCtxTime - currentTime / ratio = constant
  const audioOffsetRef  = useRef<number>(0)
  const stopTimer       = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bar-start times as a Set for O(1) accent lookup, rebuilt only when the
  // loaded file's bar grid changes (not every scheduler tick)
  const barTimeSetRef   = useRef<{ src: number[] | null; set: Set<number> }>({ src: null, set: new Set() })

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

      const ctx     = getCtx()
      const now     = ctx.currentTime
      const ratio   = originalBpm > 0 ? bpm / originalBpm : 1
      // Real beat/bar grid for this file — honours every tempo AND every
      // time-signature change (see midiParser.ts's _beatTimes/_barTimes),
      // not just the first of each.
      const beatTimes   = (midi as any)?._beatTimes as number[] | undefined ?? []
      const barTimesArr = (midi as any)?._barTimes as number[] | undefined ?? []
      if (beatTimes.length === 0) return

      if (barTimeSetRef.current.src !== barTimesArr) {
        barTimeSetRef.current = { src: barTimesArr, set: new Set(barTimesArr) }
      }
      const barTimeSet = barTimeSetRef.current.set

      // First beat index to schedule: whichever is later — the upcoming beat
      // in the song, or one past the last already scheduled (prevents
      // double-firing). Binary search since beatTimes is sorted ascending.
      let lo = 0, hi = beatTimes.length
      const target = currentTime - 0.02  // small grace: catch a beat we're right on
      while (lo < hi) {
        const mid = (lo + hi) >> 1
        if (beatTimes[mid] < target) lo = mid + 1
        else hi = mid
      }
      const startIdx = Math.max(lo, lastScheduled.current + 1)

      // Schedule every beat whose exact audio time falls within the lookahead window
      for (let idx = startIdx; idx < beatTimes.length; idx++) {
        // Exact file time for this beat, converted to wall-clock (÷ ratio),
        // then to AudioContext time (+ offset).
        const beatAudioTime = audioOffsetRef.current + beatTimes[idx] / ratio
        if (beatAudioTime >= now + LOOKAHEAD) break  // past lookahead window — stop
        if (beatAudioTime < now + 0.005) {            // already in the past — skip cleanly
          lastScheduled.current = Math.max(lastScheduled.current, idx)
          continue
        }
        scheduleClick(ctx, beatAudioTime, barTimeSet.has(beatTimes[idx]))
        lastScheduled.current = idx
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
