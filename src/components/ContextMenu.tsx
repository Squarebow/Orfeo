import { forwardRef, useEffect, useState, type ReactNode, type RefObject } from 'react'

// ── ContextMenu — shared shell for right-click popups (Library's file/folder
// menus). Previously copy-pasted per call site with a muted `--drag-handle-
// dot`/`--border-popover` border; unified here on the same dark-panel +
// amber-border + `orfeo-modal-glow` language as Tooltip.tsx/ConfirmDialog.tsx,
// so every floating popup in the app now reads as one family. Click-anchored
// and dismissed by the caller (outside-click/Escape) — that logic stays with
// the caller since it already owns the open/closed state. ───────────────────

export interface ContextMenuProps {
  x: number
  y: number
  minWidth?: number
  ariaLabel: string
  children: ReactNode
  /** Extra class on the menu's own (fixed-position) box — e.g. "app-no-drag"
   * when the caller sits inside an Electron `app-drag-region`. Applied here
   * rather than via a wrapping element so the menu, which is `position:
   * fixed` and therefore out of normal flow, stays out of flow — a wrapping
   * block div would re-enter flow and could shift a parent's layout (e.g.
   * a CSS Grid parent's track sizing/auto-placement). */
  className?: string
}

export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(function ContextMenu(
  { x, y, minWidth = 160, ariaLabel, children, className }, ref,
) {
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      className={className ? `orfeo-modal-glow ${className}` : 'orfeo-modal-glow'}
      style={{
        position: 'fixed', top: y, left: x,
        background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)',
        borderRadius: 'var(--radius-md)',
        zIndex: 9500, minWidth, overflow: 'hidden', padding: '4px 0',
        '--_modal-shadow': 'var(--elevation-popover)',
      } as React.CSSProperties}
    >
      {children}
    </div>
  )
})

// ── ContextMenuItem — replaces the old MENU_ITEM_STYLE + a hand-written
// onMouseEnter/onMouseLeave pair on every single button (both call sites
// mutated DOM style directly, identically, per item). Hover is real React
// state here instead, and `danger` swaps the hover color to the same red
// Delete already used, without every caller needing to know that token. ────
export function ContextMenuItem({ onClick, disabled, danger, title, children }: {
  onClick: () => void
  disabled?: boolean
  danger?: boolean
  title?: string
  children: ReactNode
}) {
  const [hover, setHover] = useState(false)
  const active = hover && !disabled
  return (
    <button
      role="menuitem"
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', padding: '8px 14px',
        background: active ? 'var(--bg-tile)' : 'none',
        border: 'none',
        color: active ? (danger ? 'var(--status-protected)' : 'var(--text-amber)') : 'var(--text-default)',
        fontSize: 'var(--text-xs)',
        textAlign: 'left', cursor: disabled ? 'default' : 'pointer',
        display: 'flex', alignItems: 'center', gap: 8,
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.1s, color 0.1s',
      }}
    >
      {children}
    </button>
  )
}

// ── Dismissal for menus that live in the top bar — clicks on its window-drag
// area never reach the page at all, so besides outside-click / Esc / focus
// loss the menu also closes shortly after the pointer leaves it. ─────────
export function useMenuDismiss(open: boolean, ref: RefObject<HTMLElement | null>, close: () => void) {
  useEffect(() => {
    if (!open) return
    let leaveTimer: ReturnType<typeof setTimeout> | null = null
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onMove = (e: PointerEvent) => {
      if (ref.current?.contains(e.target as Node)) { if (leaveTimer) { clearTimeout(leaveTimer); leaveTimer = null } }
      else if (!leaveTimer) leaveTimer = setTimeout(close, 900)
    }
    const id = setTimeout(() => {
      window.addEventListener('pointerdown', onDown, true)
      window.addEventListener('pointermove', onMove, true)
      window.addEventListener('keydown', onKey, true)
      window.addEventListener('blur', close)
    }, 0)
    return () => {
      clearTimeout(id); if (leaveTimer) clearTimeout(leaveTimer)
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('blur', close)
    }
  // close is expected to be stable in intent; re-binding on identity is harmless
  }, [open, ref, close])
}

export function ContextMenuDivider() {
  return <div style={{ borderTop: '1px solid var(--border2)', margin: '4px 0' }} />
}

export function ContextMenuLabel({ children }: { children: ReactNode }) {
  return (
    <div style={{ padding: '6px 14px 2px', fontSize: 9, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
      {children}
    </div>
  )
}
