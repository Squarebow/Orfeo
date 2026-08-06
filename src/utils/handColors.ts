// ── Fixed LH/RH colors — always blue for left hand, pink for right hand,
// independent of any per-track palette color. See docs/LR Hand rework
// (gitignored) for the full rationale: a track that's a genuine split
// output (every note the same hand) always renders in these colors; a
// single mixed-hand track only does when Left/Right Hand + Performance
// mode are both active — otherwise it keeps its normal track color. ────────
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
  opts: { homogeneousTrack: boolean; showHandLabels: boolean; performanceMode: boolean },
): string {
  if (!note.hand) return defaultColor
  if (opts.homogeneousTrack || (opts.showHandLabels && opts.performanceMode)) {
    return note.hand === 'L' ? HAND_LH_CSS : HAND_RH_CSS
  }
  return defaultColor
}
