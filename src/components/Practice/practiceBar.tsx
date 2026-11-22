import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { RotateCcw } from 'lucide-react'
import { useMenuDismiss } from '../ContextMenu'

// ── Practice mode's header and footer: one look ──────────────────────────────
// Every tool is an amber icon with an amber name, and the choice in use in
// white (MODE: PLAY ALONG). A click turns a switch on or off, or opens its
// choices: dropping down from the header, up from the footer, all in one
// panel with the same background, amber edge and glow as the app's menus.

export const AMBER = 'var(--text-amber)'
/** Below the header, for the cards that open under it (summary, review, progress) */
export const UNDER_HEADER = 144
export const barIcon = { size: 18, strokeWidth: 1.6, color: AMBER } as const

const word: CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, letterSpacing: '0.08em',
  textTransform: 'uppercase', whiteSpace: 'nowrap', lineHeight: 1,
}
/** A tool's name: amber */
export const featLabel: CSSProperties = { ...word, color: AMBER }
/** The choice in use: white */
export const featValue: CSSProperties = { ...word, color: 'var(--text-active)' }

/** A tool's button: icon, NAME: value. Transparent, the whole thing clickable */
export const toolBtn = (disabled = false): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 7, height: 34, padding: '0 8px',
  border: 'none', borderRadius: 'var(--radius-md)', background: 'transparent',
  cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.45 : 1, flexShrink: 0,
})

/** One choice in a panel: a tick or a colour mark, its name, and a line under it */
export function PopItem({ on, onClick, children, hint, disabled }: {
  on?: boolean; onClick: () => void; children: ReactNode; hint?: ReactNode; disabled?: boolean
}) {
  const [hover, setHover] = useState(false)
  return (
    <button role="menuitemradio" aria-checked={!!on} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3, width: '100%',
        padding: '8px 14px', border: 'none', textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
        background: hover && !disabled ? 'var(--bg-tile)' : 'none', opacity: disabled ? 0.45 : 1,
      }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-ui)', fontSize: 13,
        color: on ? AMBER : hover && !disabled ? AMBER : 'var(--text-default)', fontWeight: on ? 600 : 400 }}>
        {children}
      </span>
      {hint && <span style={{ fontFamily: 'var(--font-ui)', fontSize: 11, lineHeight: 1.35, color: 'var(--text-muted)' }}>{hint}</span>}
    </button>
  )
}

export const popHeading: CSSProperties = { ...featLabel, fontSize: 10, padding: '6px 14px 4px' }
export function PopDivider() { return <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} /> }

/** Room for the widest of `options`, so a changing value never moves what
 *  comes after it (all of them stacked in one cell, only the current one seen) */
export function Reserve({ options, children, align = 'start' }: { options: ReactNode[]; children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <span style={{ display: 'inline-grid', justifyItems: align, alignItems: 'baseline' }}>
      {options.map((o, i) => <span key={i} aria-hidden style={{ gridArea: '1 / 1', visibility: 'hidden', whiteSpace: 'nowrap' }}>{o}</span>)}
      <span style={{ gridArea: '1 / 1', whiteSpace: 'nowrap' }}>{children}</span>
    </span>
  )
}

/** A small reset button that keeps its room when there's nothing to reset */
export function ResetMark({ shown, onClick, title }: { shown: boolean; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} disabled={!shown} aria-label={title} title={title} className="app-no-drag"
      style={{
        visibility: shown ? 'visible' : 'hidden', display: 'flex', alignItems: 'center', color: AMBER, flexShrink: 0,
        background: 'var(--accent-amber-subtle)', border: '1px solid var(--accent-amber-medium)', borderRadius: 4, padding: '1px 5px', cursor: 'pointer',
      }}>
      <RotateCcw size={9} />
    </button>
  )
}

/** Hand colour marks: tiny squares beside a hand's name */
export function HandMarks({ hand }: { hand: 'L' | 'R' | 'B' }) {
  const sq = (c: string) => <span style={{ width: 9, height: 9, borderRadius: 2, background: c, flexShrink: 0 }} />
  return (
    <span style={{ display: 'inline-flex', gap: 3 }}>
      {hand !== 'R' && sq('var(--hand-lh)')}
      {hand !== 'L' && sq('var(--hand-rh)')}
    </span>
  )
}

/** The choices of a tool, opened from its button. `up`: from the footer */
export function BarPop({ anchor, up = false, width = 260, align = 'left', onClose, label, children }: {
  anchor: HTMLElement | null; up?: boolean; width?: number; align?: 'left' | 'right'
  onClose: () => void; label: string; children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  useMenuDismiss(true, ref, onClose)
  const [pos, setPos] = useState<CSSProperties>({ visibility: 'hidden' })
  useLayoutEffect(() => {
    const r = anchor?.getBoundingClientRect()
    if (!r) return
    const left = align === 'right'
      ? Math.max(8, Math.min(r.right - width, window.innerWidth - width - 8))
      : Math.max(8, Math.min(r.left, window.innerWidth - width - 8))
    setPos(up ? { left, bottom: window.innerHeight - r.top + 8 } : { left, top: r.bottom + 8 })
  }, [anchor, up, width, align])
  return createPortal(
    <div ref={ref} role="menu" aria-label={label} className="orfeo-modal-glow app-no-drag"
      style={{
        position: 'fixed', ...pos, width, zIndex: 9500, padding: '4px 0', boxSizing: 'border-box',
        maxHeight: 'calc(100vh - 120px)', overflowY: 'auto',
        background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)', borderRadius: 'var(--radius-md)',
        '--_modal-shadow': 'var(--elevation-popover)',
      } as CSSProperties}>
      {children}
    </div>,
    document.body,
  )
}

/** A card you can move out of the way: drag it by any spot that isn't a
 *  control. Where you leave it is kept (by `key`) for as long as Orfeo runs,
 *  and part of it always stays on screen. Spread `dragProps` on the card and
 *  add `off` to its place. */
const _placed = new Map<string, { x: number; y: number }>()
const NOT_A_HANDLE = 'button, a, input, select, textarea, label, [role="slider"], [data-no-drag]'
export function useDragAnywhere(key: string) {
  const [off, setOff] = useState(() => _placed.get(key) ?? { x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number; ox: number; oy: number; r: DOMRect } | null>(null)
  const onPointerDown = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest(NOT_A_HANDLE)) return
    // the card's own scrollbar scrolls, it doesn't drag
    const el = e.currentTarget
    if (e.target === el && (e.nativeEvent.offsetX >= el.clientWidth || e.nativeEvent.offsetY >= el.clientHeight)) return
    e.preventDefault()   // no text selection while dragging
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y, r: e.currentTarget.getBoundingClientRect() }
  }
  const onPointerMove = (e: ReactPointerEvent<HTMLElement>) => {
    const d = drag.current
    if (!d) return
    const KEEP = 60   // px of the card that stay on screen
    const dx = Math.max(KEEP - d.r.right, Math.min(window.innerWidth - KEEP - d.r.left, e.clientX - d.x))
    const dy = Math.max(8 - d.r.top, Math.min(window.innerHeight - 40 - d.r.top, e.clientY - d.y))
    const next = { x: d.ox + dx, y: d.oy + dy }
    _placed.set(key, next)
    setOff(next)
  }
  const end = () => { drag.current = null }
  return { off, dragProps: { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end } }
}
