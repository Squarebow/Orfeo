import { useEffect, useRef } from 'react'
import { useStore } from '../store'
import { resumeIndexAfterGridSwap } from '../utils/metronomeResume'

// ── Shared metronome audio — one AudioContext for the metronome AND the
// count-in (utils/countInRunner.ts), so a count-in's last click and the
// song's first metronome click sit on the same clock. ─────────────────────
let sharedCtx: AudioContext | null = null
export function metronomeContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === 'closed') sharedCtx = new AudioContext()
  if (sharedCtx.state === 'suspended') sharedCtx.resume()
  return sharedCtx
}

// One click at an exact AudioContext time; returns the oscillator so a
// cancelled count-in can silence clicks already scheduled.
export function scheduleMetronomeClick(when: number, accent: boolean): OscillatorNode {
  const ctx  = metronomeContext()
  const osc  = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.frequency.value = accent ? 1400 : 1000
  const vol = useStore.getState().metronomeVolume
  gain.gain.setValueAtTime(Math.max(0.0011, (accent ? 0.9 : 0.6) * vol), when)
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.04)
  osc.start(when)
  osc.stop(when + 0.05)
  return osc
}

// A count-in tells the scheduler exactly which audio time the song starts at,
// so the first song click lands one beat after the last count-in click
// instead of wherever the (timer-driven) playback start happened to fire.
let pendingAnchor: { audioTime: number; songTime: number; setAt: number } | null = null
export function setMetronomeAnchor(audioTime: number, songTime: number) {
  pendingAnchor = { audioTime, songTime, setAt: performance.now() }
}

// ── Metronome hook ───────────────────────────────────────────────────────────

export function useMetronome() {
  const intervalRef     = useRef<ReturnType<typeof setInterval> | null>(null)
  // Tracks highest beat index (into the file's _beatTimes grid) already
  // scheduled, to avoid double-firing
  const lastScheduled   = useRef<number>(-1)
  // Time of that last scheduled beat + the beat array it indexes — a Tap
  // Tempo grid swap replaces the array mid-playback, so the index is re-
  // derived from the time (see utils/metronomeResume.ts)
  const lastScheduledTime = useRef<number>(-Infinity)
  const beatSrcRef      = useRef<number[] | null>(null)
  // Invariant during playback: audioCtxTime - currentTime / ratio = constant
  const audioOffsetRef  = useRef<number>(0)
  const stopTimer       = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Bar-start times as a Set for O(1) accent lookup, rebuilt only when the
  // loaded file's bar grid changes (not every scheduler tick)
  const barTimeSetRef   = useRef<{ src: number[] | null; set: Set<number> }>({ src: null, set: new Set() })

  const getCtx = metronomeContext
  const scheduleClick = (_ctx: AudioContext, when: number, accent: boolean) => { scheduleMetronomeClick(when, accent) }

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
    // fresh count-in anchor: the song started at an exact audio time
    if (pendingAnchor && performance.now() - pendingAnchor.setAt < 2000) {
      audioOffsetRef.current = pendingAnchor.audioTime - pendingAnchor.songTime / ratio
    }
    pendingAnchor = null
    lastScheduled.current = -1
    lastScheduledTime.current = -Infinity
    beatSrcRef.current = null

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
      if (beatSrcRef.current !== beatTimes) {
        if (beatSrcRef.current !== null) lastScheduled.current = resumeIndexAfterGridSwap(beatTimes, lastScheduledTime.current)
        beatSrcRef.current = beatTimes
      }
      const startIdx = Math.max(lo, lastScheduled.current + 1)

      // Schedule every beat whose exact audio time falls within the lookahead window
      for (let idx = startIdx; idx < beatTimes.length; idx++) {
        // Exact file time for this beat, converted to wall-clock (÷ ratio),
        // then to AudioContext time (+ offset).
        const beatAudioTime = audioOffsetRef.current + beatTimes[idx] / ratio
        if (beatAudioTime >= now + LOOKAHEAD) break  // past lookahead window — stop
        if (beatAudioTime < now + 0.005) {            // already in the past — skip cleanly
          if (idx > lastScheduled.current) { lastScheduled.current = idx; lastScheduledTime.current = beatTimes[idx] }
          continue
        }
        scheduleClick(ctx, beatAudioTime, barTimeSet.has(beatTimes[idx]))
        lastScheduled.current = idx
        lastScheduledTime.current = beatTimes[idx]
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
    return () => { unsub(); stopScheduler() }
  }, [])
}
