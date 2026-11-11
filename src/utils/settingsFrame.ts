// ── The Settings window's frame: where it sits, how big it is, and how much its
// content is scaled. The content is laid out at its designed size (DESIGN) and
// scaled as one piece with CSS `zoom`, so every text, card and control grows in
// proportion and the layout never changes; a bigger window means bigger, easier
// to read settings, like a page zoomed in a browser. Dragging an edge changes
// one side; dragging a corner keeps the window's proportions. All sizes here are
// screen pixels; the top of the window stays clear of the title-bar strip. ────

export interface Frame { x: number; y: number; w: number; h: number }
export interface View { w: number; h: number }
export type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

export const DESIGN = { w: 1000, h: 640 }   // the layout the cards were designed at
export const TOP_CLEAR = 44                  // the title-bar strip, where Windows draws its controls
export const MARGIN = 8                      // gap kept to the other window edges
export const MIN = { w: 640, h: 420 }
export const MAX_ZOOM = 2
const DEFAULT_SHARE = 0.85                   // a first opening fills this much of the window, at most

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))
const room = (view: View) => ({ w: view.w - 2 * MARGIN, h: view.h - TOP_CLEAR - MARGIN })

/** How much the content is scaled: by the tighter of width and height, never below
 *  its designed size (a small window gets the usual layout, not tiny text) */
export function frameZoom(f: Frame): number {
  return clamp(Math.min(f.w / DESIGN.w, f.h / DESIGN.h), 1, MAX_ZOOM)
}

/** Kept inside the window: no smaller than MIN (or the room there is), never
 *  over the title-bar strip or past an edge */
export function fitFrame(f: Frame, view: View): Frame {
  const r = room(view)
  const w = clamp(f.w, Math.min(MIN.w, r.w), r.w)
  const h = clamp(f.h, Math.min(MIN.h, r.h), r.h)
  const x = clamp(f.x, MARGIN, view.w - MARGIN - w)
  const y = clamp(f.y, TOP_CLEAR, view.h - MARGIN - h)
  return { x, y, w, h }
}

/** A first opening: the designed proportions, as large as fits in DEFAULT_SHARE of the
 *  window (at least the designed size where there's room), centred below the strip */
export function defaultFrame(view: View): Frame {
  const r = room(view)
  const scale = clamp(Math.min((view.w * DEFAULT_SHARE) / DESIGN.w, ((view.h - TOP_CLEAR) * DEFAULT_SHARE) / DESIGN.h), 1, MAX_ZOOM)
  const w = Math.min(Math.round(DESIGN.w * scale), r.w)
  const h = Math.min(Math.round(DESIGN.h * scale), r.h)
  const x = Math.round((view.w - w) / 2)
  const y = Math.round(TOP_CLEAR + (view.h - TOP_CLEAR - h) / 2)
  return fitFrame({ x, y, w, h }, view)
}

/** Dragging an edge or corner by (dx, dy) from where the drag started. The opposite
 *  side or corner stays put; a corner keeps the proportions the window had. */
export function resizeFrame(start: Frame, edge: Edge, dx: number, dy: number, view: View): Frame {
  const right = start.x + start.w, bottom = start.y + start.h
  const minW = Math.min(MIN.w, room(view).w), minH = Math.min(MIN.h, room(view).h)
  const west = edge.includes('w'), east = edge.includes('e'), north = edge.includes('n'), south = edge.includes('s')
  // how far each side may go before it meets the window's edge or the strip
  const maxW = west ? right - MARGIN : view.w - MARGIN - start.x
  const maxH = north ? bottom - TOP_CLEAR : view.h - MARGIN - start.y

  let w = start.w, h = start.h
  if (edge.length === 2) {
    const sx = (start.w + (west ? -dx : dx)) / start.w
    const sy = (start.h + (north ? -dy : dy)) / start.h
    const s0 = Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy
    const s = clamp(s0, Math.max(minW / start.w, minH / start.h), Math.min(maxW / start.w, maxH / start.h))
    w = start.w * s; h = start.h * s
  } else if (east || west) {
    w = clamp(start.w + (west ? -dx : dx), minW, maxW)
  } else {
    h = clamp(start.h + (north ? -dy : dy), minH, maxH)
  }
  w = Math.round(w); h = Math.round(h)
  return { x: west ? right - w : start.x, y: north ? bottom - h : start.y, w, h }
}

/** A saved frame, checked */
export function restoreFrame(saved: unknown): Frame | null {
  const f = saved as Partial<Frame> | null
  if (!f || typeof f !== 'object') return null
  const ok = (v: unknown) => typeof v === 'number' && Number.isFinite(v)
  return ok(f.x) && ok(f.y) && ok(f.w) && ok(f.h) && f.w! > 0 && f.h! > 0 ? { x: f.x!, y: f.y!, w: f.w!, h: f.h! } : null
}
