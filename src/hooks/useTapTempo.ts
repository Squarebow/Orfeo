import { useEffect } from 'react'
import { useStore } from '../store'
import { MIN_TAPS } from '../utils/tapTempoFit'
import { finishTapping, cancelTap, tappingInterrupted, setTapLatencyProvider } from '../utils/tapTempoSession'
import { getOutputLatencySec as getSamplesOutputLatencySec } from './useSamplesEngine'
import { getOutputLatencySec as getGmOutputLatencySec } from './useAudioEngine'

const IDLE_FINISH_MS = 2000

// ── Tap Tempo watcher — supplies the output-device delay for tap stamping,
// finishes tapping after a 2 s pause, and ends the tapping phase on any
// seek / loop wrap / stop so taps from two different places in the song are
// never fitted together. Mounted once (TapTempoPad). ─────────────────────
export function useTapTempo() {
  useEffect(() => {
    setTapLatencyProvider(() =>
      useStore.getState().audioEngine === 'samples' ? getSamplesOutputLatencySec() : getGmOutputLatencySec())
    const iv = setInterval(() => {
      const ses = useStore.getState().tapSession
      if (ses?.phase === 'tapping' && performance.now() - ses.lastTapAt > IDLE_FINISH_MS) finishTapping()
    }, 200)
    const unsub = useStore.subscribe((st, prev) => {
      const ses = st.tapSession
      if (!ses || ses.phase === 'preview' || !prev.tapSession) return
      if (!tappingInterrupted(prev, st)) return
      if (ses.taps.length >= MIN_TAPS) finishTapping(); else cancelTap()
    })
    return () => { clearInterval(iv); unsub(); setTapLatencyProvider(() => 0) }
  }, [])
}
