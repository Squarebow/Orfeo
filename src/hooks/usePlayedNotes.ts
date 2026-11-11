import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { readPlayedNotes, keyWentDown, PLAYED_SETTLE_MS, type PlayedNotes } from '../utils/explorerShared'

// ── What you last played on your keyboard, for both Explorers (one rule, see
// explorerShared). Reads the keys a moment after the last one goes down, so a
// rolled chord is read once it's complete; letting go keeps the last reading.
// `listening` off (Explorer closed, minimised, or playing a progression itself)
// forgets it. ────────────────────────────────────────────────────────────────
export function usePlayedNotes(listening: boolean): PlayedNotes | null {
  const held = useStore(s => s.midiHeldKeys)
  const [played, setPlayed] = useState<PlayedNotes | null>(null)
  const prevHeld = useRef<ReadonlySet<number>>(new Set())

  useEffect(() => { if (!listening) setPlayed(null) }, [listening])

  useEffect(() => {
    const pressed = keyWentDown(prevHeld.current, held)
    prevHeld.current = held
    if (!listening || !pressed) return
    const id = setTimeout(() => {
      const next = readPlayedNotes(useStore.getState().midiHeldKeys)
      // the same keys again: keep the reading as it is, so nothing re-selects
      if (next) setPlayed(prev => (prev && prev.notes.join() === next.notes.join() ? prev : next))
    }, PLAYED_SETTLE_MS)
    return () => clearTimeout(id)
  }, [held, listening])

  return played
}
