// ── Fixed LH/RH colors — always blue for left hand, pink for right hand,
// independent of any per-track palette color. ONE rule, the piano roll's:
// a track that's a genuine split output (every note the same hand) always
// renders in these colors; a mixed-hand track does while hand colours are on
// (Settings, or the Note Editor's hand reassigning) — otherwise it keeps its
// track color. The keys light exactly as the roll draws (the user's rule:
// keyboard colours always follow the piano roll, every instrument). PianoRoll
// draws with the same test (numeric colours); everything else calls this. ──
import type { Hand } from '../types'

export const HAND_LH_CSS = 'var(--hand-lh)'
export const HAND_RH_CSS = 'var(--hand-rh)'

export function isHomogeneousHandTrack(notes: { hand?: Hand }[]): boolean {
  if (notes.length === 0) return false
  let seen: Hand | null = null
  for (const n of notes) {
    if (!n.hand) return false
    if (seen === null) seen = n.hand
    else if (seen !== n.hand) return false
  }
  return true
}

export function resolveHandAwareColor(
  note: { hand?: Hand },
  defaultColor: string,
  opts: { homogeneousTrack: boolean; handColoring: boolean },
): string {
  if (!note.hand) return defaultColor
  if (opts.homogeneousTrack || opts.handColoring) {
    return note.hand === 'L' ? HAND_LH_CSS : HAND_RH_CSS
  }
  return defaultColor
}
