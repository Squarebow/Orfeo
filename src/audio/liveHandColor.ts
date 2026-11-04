// ── A key light's colour, decided the moment the key lights ──────────────────
// Every engine schedules its key lights ahead of time, but the hand colours can
// change while a song plays. Resolved at schedule time, the keyboard kept the
// colours from when Play was pressed until the next pause, while the piano roll
// (which asks on every frame) followed the toggle at once. So the engines call
// this from inside the light's own timer.
import { useStore } from '../store'
import { NES } from '../utils/noteEditorState'
import { resolveHandAwareColor } from '../utils/handColors'
import type { Hand } from '../types'

export function liveHandColor(note: { hand?: Hand }, defaultColor: string, homogeneousTrack: boolean): string {
  const { showHandLabels, handLabelMode, noteEditorActive } = useStore.getState()
  return resolveHandAwareColor(note, defaultColor, {
    homogeneousTrack,
    // The Settings toggle stays authoritative; the Note Editor's own Hand toggle
    // only adds to it (same rule as the roll's handColoringOn in PianoRoll.tsx)
    showHandLabels: showHandLabels || (noteEditorActive && NES.reassignHandsMode),
    performanceMode: handLabelMode === 'performance',
  })
}
