import { useEffect } from 'react'
import { useStore } from '../store'
import { interruptTapping, tappingInterrupted, setTapLatencyProvider, noteClockTick } from '../utils/tapTempoSession'
import { getOutputLatencySec as getSamplesOutputLatencySec } from './useSamplesEngine'
import { getOutputLatencySec as getGmOutputLatencySec } from './useAudioEngine'

// ── Tap Tempo watcher — supplies the output-device delay for tap stamping,
// and ends the tapping phase on any
// seek / loop wrap / stop so taps from two different places in the song are
// never fitted together. Mounted once (TapTempoPad). ─────────────────────
export function useTapTempo() {
  useEffect(() => {
    setTapLatencyProvider(() =>
      useStore.getState().audioEngine === 'samples' ? getSamplesOutputLatencySec() : getGmOutputLatencySec())
    const unsub = useStore.subscribe((st, prev) => {
      if (st.currentTime !== prev.currentTime) noteClockTick()
      const ses = st.tapSession
      if (!ses || ses.phase === 'preview' || !prev.tapSession) return
      if (!tappingInterrupted(prev, st)) return
      interruptTapping()
    })
    return () => { unsub(); setTapLatencyProvider(() => 0) }
  }, [])
}
