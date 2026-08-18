import { forwardRef, useState, type ReactNode } from 'react'

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
}

export const ContextMenu = forwardRef<HTMLDivElement, ContextMenuProps>(function ContextMenu(
  { x, y, minWidth = 160, ariaLabel, children }, ref,
) {
  return (
    <div
      ref={ref}
      role="menu"
      aria-label={ariaLabel}
      className="orfeo-modal-glow"
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
