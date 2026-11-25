// ── A key light's colour, decided the moment the key lights ──────────────────
// Every engine schedules its key lights ahead of time, but the hand colours can
// change while a song plays. Resolved at schedule time, the keyboard kept the
// colours from when Play was pressed until the next pause, while the piano roll
// (which asks on every frame) followed the toggle at once. So the engines call
// this from inside the light's own timer.
import { useStore } from '../store'
import { NES } from '../utils/noteEditorState'
import { resolveHandAwareColor } from '../utils/handColors'
import { handColouredTracks } from '../utils/handColouredTracks'
import type { Hand } from '../types'

export function liveHandColor(note: { hand?: Hand; trackIndex?: number }, defaultColor: string, homogeneousTrack: boolean): string {
  const { midi, tracks, noteEditorActive } = useStore.getState()
  return resolveHandAwareColor(note, defaultColor, {
    homogeneousTrack,
    // the piano you'd play shows its hands (handColouredTracks.ts); the Note
    // Editor's own Hand toggle adds the track being edited (the roll's same test)
    handColoring: (note.trackIndex !== undefined && handColouredTracks(midi, tracks).has(note.trackIndex))
      || (noteEditorActive && NES.reassignHandsMode),
  })
}
