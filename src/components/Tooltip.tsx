import { useRef, useState, useLayoutEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

// ── Tooltip — dark background, amber border, amber title row + a muted
// description row underneath. Built for the Console Mixer (knobs, icons,
// the header) since nothing matching that two-part style existed anywhere
// else in the app to reuse — every other `title` in this codebase is a
// plain native browser tooltip. Portaled to document.body (same
// escape-the-parent-stacking-context pattern as LoopRegionStrip's bar-range
// popup) so it floats above the modal regardless of where it's used inside
// it. ─────────────────────────────────────────────────────────────────────

export interface TooltipContent {
  title: string
  description?: string
}

type Placement = 'top' | 'bottom' | 'left' | 'right'

const MARGIN = 8    // minimum gap kept from the window's own edges
const GAP    = 8    // gap between the anchor and the box, same as the old hardcoded 8s

// ── Un-clamped position for a box of the given size, anchored per `placement`
// — this is exactly what the old hardcoded top/left+transform math produced,
// just expressed as a direct top-left corner instead of a center point plus
// a CSS transform (transforms can't be measured/clamped after the fact as
// easily as a plain top/left can). ────────────────────────────────────────
function naiveRect(anchor: DOMRect, placement: Placement, w: number, h: number) {
  switch (placement) {
    case 'top':    return { top: anchor.top - GAP - h,                    left: anchor.left + anchor.width / 2 - w / 2 }
    case 'bottom': return { top: anchor.bottom + GAP,                     left: anchor.left + anchor.width / 2 - w / 2 }
    case 'left':   return { top: anchor.top + anchor.height / 2 - h / 2,  left: anchor.left - GAP - w }
    case 'right':  return { top: anchor.top + anchor.height / 2 - h / 2,  left: anchor.right + GAP }
  }
}

// ── TooltipBox — pure presentational half. Takes an already-resolved anchor
// rect (not an element) so callers with dynamic content (hover-per-tick,
// live-drag values) can reposition/re-content it without needing their own
// ref plumbing — see MasterStrip.tsx's Compressor and Volume knobs. ───────
//
// Boundary clamping — the app-wide rule: a tooltip must never render outside
// the window, regardless of which panel/collapse state produced its anchor
// position. Since this is a fullscreen Electron window, `window.innerWidth/
// Height` IS the app's own bounds, so no per-panel special-casing is needed
// — measuring the anchor's actual on-screen position already accounts for
// collapsed vs. expanded panels, docked-left vs. docked-right rails, etc.
// Two-pass: render once (invisible) at the naive position purely to measure
// the box's real rendered size (text length varies per call site), then a
// layout effect clamps/flips against the real viewport and reveals it — all
// before the browser paints, so there's no visible jump.
export function TooltipBox({ anchorRect, content, visible, placement = 'top', oneLine = false }: {
  anchorRect: DOMRect | null
  content: TooltipContent | null
  visible: boolean
  placement?: Placement
  // Plain, single-tip styling (white/normal-case/normal-weight, no amber
  // heading) instead of the amber-title + muted-description pair — for
  // short, self-explanatory hints that don't need a two-part structure.
  oneLine?: boolean
}) {
  const boxRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)

  useLayoutEffect(() => {
    if (!visible || !anchorRect || !content || !boxRef.current) { setPos(null); return }
    const w = boxRef.current.offsetWidth
    const h = boxRef.current.offsetHeight
    let { top, left } = naiveRect(anchorRect, placement, w, h)
    // Horizontal: shift, don't flip — a top/bottom tooltip nudged sideways
    // still reads as attached to its anchor; 'left'/'right' are flipped to
    // the opposite side instead, since shifting would land them on top of
    // the anchor rather than beside it.
    if (placement === 'top' || placement === 'bottom') {
      left = Math.max(MARGIN, Math.min(left, window.innerWidth - w - MARGIN))
    } else if (placement === 'left' && left < MARGIN) {
      left = anchorRect.right + GAP   // no room on the left — flip to the right of the anchor
    } else if (placement === 'right' && left + w > window.innerWidth - MARGIN) {
      left = anchorRect.left - GAP - w   // no room on the right — flip to the left of the anchor
    }
    // Vertical: flip side entirely for top/bottom — shifting a 'top' tooltip
    // down to fit would just land it on top of its own anchor.
    if (placement === 'top' && top < MARGIN) {
      top = anchorRect.bottom + GAP
    } else if (placement === 'bottom' && top + h > window.innerHeight - MARGIN) {
      top = anchorRect.top - GAP - h
    }
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - h - MARGIN))
    setPos({ top, left })
  }, [visible, anchorRect, content?.title, content?.description, placement, oneLine])

  if (!visible || !anchorRect || !content) return null

  return createPortal(
    <div
      ref={boxRef}
      style={{
        position: 'fixed',
        // Off-screen + hidden until the real (clamped) position is measured —
        // keeps the probe render from ever flashing at the wrong spot.
        top: pos?.top ?? -9999, left: pos?.left ?? -9999,
        visibility: pos ? 'visible' : 'hidden',
        background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)',
        borderRadius: 6, padding: '6px 10px',
        // Hard caps — a tooltip must never balloon into a panel, whatever it's
        // handed (e.g. a raw multi-line error). Long words wrap, overflow clips.
        maxWidth: 260, maxHeight: 160, overflow: 'hidden',
        overflowWrap: 'anywhere',
        display: 'flex', flexDirection: 'column', gap: 3,
        pointerEvents: 'none', zIndex: 99999,
        '--_modal-shadow': 'var(--elevation-strip)',
      } as React.CSSProperties}
      className="orfeo-modal-glow"
    >
      {oneLine ? (
        <div style={{ fontSize: 10, fontFamily: 'var(--font-ui)', fontWeight: 400, lineHeight: 1.4, color: 'var(--text-default)' }}>
          {content.title}
          {content.description && <>{' '}{content.description}</>}
        </div>
      ) : (
        <>
          <div style={{
            fontSize: 9, fontFamily: 'var(--font-ui)', fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--text-amber)', whiteSpace: 'nowrap',
          }}>
            {content.title}
          </div>
          {content.description && (
            <div style={{
              fontSize: 10, fontFamily: 'var(--font-ui)', lineHeight: 1.4,
              color: 'var(--text-muted)', whiteSpace: 'pre-line',
            }}>
              {content.description}
            </div>
          )}
        </>
      )}
    </div>,
    document.body,
  )
}

// ── Tooltip — convenience wrapper for the common static case (most knobs
// and icons): wraps children, shows TooltipBox on hover. For dynamic
// content (changes per mouse position, or live during a drag), use
// TooltipBox directly instead — see the Compressor/Volume knobs. ─────────
export default function Tooltip({ title, description, placement = 'top', oneLine, wrapperStyle, children }: {
  title: string
  description?: string
  placement?: Placement
  // See TooltipBox — plain single-tip styling instead of the amber-heading
  // two-part layout. In this mode `title` IS the tip text (kept as the same
  // prop rather than adding a separate one, since callers only ever need
  // one string either way); `description`, if also passed, renders as a
  // second plain line with no visual distinction from the first.
  oneLine?: boolean
  // Escape hatch for wrapping a layout-critical child (flex:1, width:'100%',
  // a grid item, etc.) — the wrapper div's own default (inline-flex, no
  // sizing) would otherwise silently swallow those, since the child is no
  // longer the direct flex/grid item its parent expects. Merge the same
  // sizing props here that used to live on the child itself.
  //
  // GOTCHA — wrapping a full-width BLOCK-level row (e.g. a list row that
  // used to just be a plain `<div>` filling its parent's width for free):
  // `wrapperStyle={{ width: '100%' }}` alone is NOT enough. The wrapper
  // stays `display:'inline-flex'`, and a flex container does NOT stretch
  // its child along the main axis by default — the child still shrinks to
  // its own content width even though the wrapper itself is 100% wide. Add
  // `display: 'block'` to `wrapperStyle` too in that case, so the child
  // goes back to plain block-layout sizing (fills its parent automatically,
  // no flex math involved) — exactly like it did before it was wrapped.
  // Symptom if this is missed: background/highlight only as wide as the
  // text, right-aligned content (e.g. a trailing icon) sitting right after
  // the text instead of at the far edge, and any width-measuring logic
  // (marquee overflow, etc.) inside the row reading a collapsed width.
  //
  // DON'T reach for `wrapperStyle={{ display: 'contents' }}` to preserve a
  // `display:contents` grid-passthrough row — that trades the layout bug for
  // a positioning one: a `display:contents` element generates no box of its
  // own, so `ref.current.getBoundingClientRect()` returns a zero-sized rect
  // pinned at the window's origin, and the tooltip renders in the top-left
  // corner of the screen instead of anywhere near its anchor. For a child
  // that lives inside a `display:contents` (or any other layout where an
  // extra wrapper div isn't safe to introduce at all), use the `useTooltip`
  // hook below instead — it attaches hover tracking + the anchor ref
  // directly to your own element, no wrapper introduced.
  wrapperStyle?: React.CSSProperties
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-flex', ...wrapperStyle }}
    >
      {children}
      <TooltipBox
        anchorRect={hover ? ref.current?.getBoundingClientRect() ?? null : null}
        content={{ title, description }}
        visible={hover}
        placement={placement}
        oneLine={oneLine}
      />
    </div>
  )
}

// ── useTooltip — same behavior as <Tooltip>, but with no wrapper element at
// all: spread the returned props directly onto your own element (button,
// div, whatever it is), then render `.box` as a sibling anywhere in your
// component's return. For a child that can't tolerate an extra wrapper —
// a `display:contents` grid-passthrough row, a flex/grid item whose exact
// element identity something else depends on — this sidesteps the whole
// wrapper-div gotcha class above by never introducing one. ────────────────
export function useTooltip<T extends HTMLElement = HTMLElement>(
  content: TooltipContent,
  opts?: { placement?: Placement; oneLine?: boolean },
) {
  const ref = useRef<T>(null)
  const [hover, setHover] = useState(false)
  return {
    ref,
    onMouseEnter: () => setHover(true),
    onMouseLeave: () => setHover(false),
    box: (
      <TooltipBox
        anchorRect={hover ? ref.current?.getBoundingClientRect() ?? null : null}
        content={content}
        visible={hover}
        placement={opts?.placement}
        oneLine={opts?.oneLine}
      />
    ),
  }
}
