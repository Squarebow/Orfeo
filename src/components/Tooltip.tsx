import { useRef, useState, type ReactNode } from 'react'
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

// ── TooltipBox — pure presentational half. Takes an already-resolved anchor
// rect (not an element) so callers with dynamic content (hover-per-tick,
// live-drag values) can reposition/re-content it without needing their own
// ref plumbing — see MasterStrip.tsx's Compressor and Volume knobs. ───────
export function TooltipBox({ anchorRect, content, visible, placement = 'top' }: {
  anchorRect: DOMRect | null
  content: TooltipContent | null
  visible: boolean
  placement?: 'top' | 'bottom' | 'left'
}) {
  if (!visible || !anchorRect || !content) return null
  // 'left' anchors to the rect's own vertical center + left edge — for a
  // tall anchor (the 202px Master Volume knob), 'top' floats the tooltip
  // way above the actual knob since it's positioned off the rect's TOP
  // edge, not off wherever the cursor/handle actually is.
  const top  = placement === 'top' ? anchorRect.top - 8
             : placement === 'left' ? anchorRect.top + anchorRect.height / 2
             : anchorRect.bottom + 8
  const left = placement === 'left' ? anchorRect.left - 8 : anchorRect.left + anchorRect.width / 2
  return createPortal(
    <div style={{
      position: 'fixed',
      top, left,
      transform: placement === 'top' ? 'translate(-50%, -100%)'
               : placement === 'left' ? 'translate(-100%, -50%)'
               : 'translate(-50%, 0)',
      background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)',
      borderRadius: 6, padding: '6px 10px',
      maxWidth: 200,
      display: 'flex', flexDirection: 'column', gap: 3,
      pointerEvents: 'none', zIndex: 99999,
      '--_modal-shadow': 'var(--elevation-strip)',
    } as React.CSSProperties} className="orfeo-modal-glow">
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
          color: 'var(--text-muted)',
        }}>
          {content.description}
        </div>
      )}
    </div>,
    document.body,
  )
}

// ── Tooltip — convenience wrapper for the common static case (most knobs
// and icons): wraps children, shows TooltipBox on hover. For dynamic
// content (changes per mouse position, or live during a drag), use
// TooltipBox directly instead — see the Compressor/Volume knobs. ─────────
export default function Tooltip({ title, description, placement = 'top', children }: {
  title: string
  description?: string
  placement?: 'top' | 'bottom' | 'left'
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'inline-flex' }}
    >
      {children}
      <TooltipBox
        anchorRect={hover ? ref.current?.getBoundingClientRect() ?? null : null}
        content={{ title, description }}
        visible={hover}
        placement={placement}
      />
    </div>
  )
}
