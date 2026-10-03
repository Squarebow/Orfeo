import { useEffect } from 'react'
import { useStore } from '../store'
import { setCountInDeps } from '../utils/countInRunner'
import { metronomeContext, scheduleMetronomeClick, setMetronomeAnchor } from './useMetronome'
import { getOutputLatencySec as getSamplesOutputLatencySec } from './useSamplesEngine'
import { getOutputLatencySec as getGmOutputLatencySec } from './useAudioEngine'

// ── Wires the count-in runner (utils/countInRunner.ts) to the real audio:
// the metronome's AudioContext for the clicks and the active engine's
// measured output delay for lining up the first note. Mounted once (App). ─
export function useCountIn() {
  useEffect(() => {
    setCountInDeps({
      now: () => metronomeContext().currentTime,
      perfNow: () => performance.now(),
      ctxLatency: () => { const c = metronomeContext() as any; return (c.outputLatency || c.baseLatency || 0) as number },
      engineLatency: () => (useStore.getState().audioEngine === 'samples' ? getSamplesOutputLatencySec() : getGmOutputLatencySec()),
      click: (when, accent) => { const osc = scheduleMetronomeClick(when, accent); return { stop: () => osc.stop(0) } },
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (t) => window.clearTimeout(t as number),
      anchor: setMetronomeAnchor,
      engine: () => useStore.getState().audioEngine,
      engineStartedAt: () => ((window as any).__orfeoEngineStartedAt ?? null) as number | null,
      prepare: () => { (window as any).__orfeoPrepareStart?.() },
    })
    return () => setCountInDeps(null)
  }, [])
}
