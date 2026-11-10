// ── The two short tours for a new install (docs: Settings › Appearance › Tours) ──
// First launch: Library, Open a song, Sound, MIDI keyboard. First song: Tracks,
// play and tempo, loop, chords, Explorers. Each shows once, on a new install only.
//
// Who sees them: the main process writes `tours: { firstLaunch: false, firstSong: false }`
// into a brand-new settings file (electron/main.ts, before anything else is saved).
// A copy updated from an earlier version already has settings but no `tours`, and
// counts as having seen both, so existing users never get them by surprise.

export type TourId = 'firstLaunch' | 'firstSong'
export type ToursSeen = Record<TourId, boolean>
export const TOUR_IDS: TourId[] = ['firstLaunch', 'firstSong']

/** The saved mark, or "seen" when there is none (an existing user's settings). */
export function toursFromPrefs(saved: unknown): { seen: ToursSeen; needsSave: boolean } {
  const o = saved && typeof saved === 'object' && !Array.isArray(saved) ? saved as Record<string, unknown> : null
  if (o && TOUR_IDS.every(id => typeof o[id] === 'boolean')) return { seen: { firstLaunch: !!o.firstLaunch, firstSong: !!o.firstSong }, needsSave: false }
  return { seen: { firstLaunch: true, firstSong: true }, needsSave: true }
}

// ── Where the card sits next to what it points at ──────────────────────────
export type Side = 'top' | 'bottom' | 'left' | 'right'
export interface Box { left: number; top: number; width: number; height: number }
export interface CardPlace { left: number; top: number; side: Side; arrow: number }

export const CARD_GAP = 14     // from the highlight to the card, room for the pointer
export const VIEW_MARGIN = 8   // the card never touches the window edge
const ARROW_INSET = 18         // the pointer stays this far from the card's corners

const OPPOSITE: Record<Side, Side> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' }

/** The card's spot on the preferred side of the target, or the opposite side when
 *  it doesn't fit there, or whichever side has the most room. Kept inside the window.
 *  `side` says where the card sits relative to the target; `arrow` is how far along
 *  the card's facing edge the pointer is, so it points at the target's middle. */
export function placeCard(target: Box, card: { width: number; height: number }, view: { width: number; height: number }, prefer: Side): CardPlace {
  const room: Record<Side, number> = {
    top: target.top - CARD_GAP - VIEW_MARGIN,
    bottom: view.height - (target.top + target.height) - CARD_GAP - VIEW_MARGIN,
    left: target.left - CARD_GAP - VIEW_MARGIN,
    right: view.width - (target.left + target.width) - CARD_GAP - VIEW_MARGIN,
  }
  const need = (s: Side) => (s === 'top' || s === 'bottom' ? card.height : card.width)
  const fits = (s: Side) => room[s] >= need(s)
  const side: Side = fits(prefer) ? prefer
    : fits(OPPOSITE[prefer]) ? OPPOSITE[prefer]
    : (Object.keys(room) as Side[]).reduce((a, b) => (room[b] - need(b) > room[a] - need(a) ? b : a))
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))
  const cx = target.left + target.width / 2, cy = target.top + target.height / 2
  let left: number, top: number
  if (side === 'top' || side === 'bottom') {
    left = clamp(cx - card.width / 2, VIEW_MARGIN, view.width - VIEW_MARGIN - card.width)
    top = side === 'bottom' ? target.top + target.height + CARD_GAP : target.top - CARD_GAP - card.height
    top = clamp(top, VIEW_MARGIN, view.height - VIEW_MARGIN - card.height)
    return { left, top, side, arrow: clamp(cx - left, ARROW_INSET, card.width - ARROW_INSET) }
  }
  top = clamp(cy - card.height / 2, VIEW_MARGIN, view.height - VIEW_MARGIN - card.height)
  left = side === 'right' ? target.left + target.width + CARD_GAP : target.left - CARD_GAP - card.width
  left = clamp(left, VIEW_MARGIN, view.width - VIEW_MARGIN - card.width)
  return { left, top, side, arrow: clamp(cy - top, ARROW_INSET, card.height - ARROW_INSET) }
}

/** The next step that has something to point at, going forward or back; null past either end. */
export function nextShownStep(from: number, dir: 1 | -1, count: number, hasTarget: (i: number) => boolean): number | null {
  for (let i = from + dir; i >= 0 && i < count; i += dir) if (hasTarget(i)) return i
  return null
}
