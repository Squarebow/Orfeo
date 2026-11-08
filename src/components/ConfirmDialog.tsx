// ── ConfirmDialog — themed confirm/alert modal, portal-rendered ───────────────
// Mount <ConfirmDialogHost /> once in App.tsx; it renders nothing when idle.
// Trigger via confirmDialog() from confirmController.ts (imperative API).

import { useCallback, useEffect, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { subscribeConfirm, type ConfirmState } from '../utils/confirmController'
import { useFocusTrap } from '../hooks/useFocusTrap'

// ── ConfirmDialogHost ─────────────────────────────────────────────────────────
// Always-mounted; renders a modal only when a confirmDialog() call is pending.
export function ConfirmDialogHost() {
  const [state, setState] = useState<ConfirmState | null>(null)

  useEffect(() => subscribeConfirm(setState), [])

  // ── Escape key dismisses as the safe (last) button ───────────────────────
  useEffect(() => {
    if (!state) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') state.resolve(state.buttons.length - 1)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [state])

  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, !!state)
  useEffect(() => {
    if (state?.startOnSafe) [...(panelRef.current?.querySelectorAll('button') ?? [])].at(-1)?.focus()
  }, [state])

  // ── Draggable anywhere but its buttons, so it can be moved to see the song
  // behind it — starts centred; once dragged, a fixed position, until the next one
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const drag = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null)
  useEffect(() => { setPos(null) }, [state])
  const startDrag = (e: ReactMouseEvent) => {
    e.stopPropagation()
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const r = panelRef.current?.getBoundingClientRect()
    const from = pos ?? { x: r?.left ?? 0, y: r?.top ?? 0 }
    if (!pos) setPos(from)
    drag.current = { startX: e.clientX, startY: e.clientY, posX: from.x, posY: from.y }
  }
  const onDragMove = useCallback((e: MouseEvent) => {
    const d = drag.current
    if (!d) return
    // the top stays below the window's own title bar (40 px of Windows controls)
    setPos({ x: d.posX + (e.clientX - d.startX), y: Math.max(44, d.posY + (e.clientY - d.startY)) })
  }, [])
  const onDragEnd = useCallback(() => { drag.current = null }, [])
  useEffect(() => {
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    return () => { window.removeEventListener('mousemove', onDragMove); window.removeEventListener('mouseup', onDragEnd) }
  }, [onDragMove, onDragEnd])

  if (!state) return null

  const safeIndex = state.buttons.length - 1

  return createPortal(
    <div
      className="app-no-drag"
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) state.resolve(safeIndex) }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={state.title || 'Confirm'}
        className="orfeo-modal-glow app-no-drag"
        style={{
          cursor: 'grab',
          ...(pos ? { position: 'fixed', left: pos.x, top: pos.y } : {}),
          background: 'var(--bg-modal)',
          border: '1px solid var(--border2)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 22px',
          minWidth: 340,
          maxWidth: 460,
          '--_modal-shadow': 'var(--elevation-modal)',
        } as CSSProperties}
        onMouseDown={startDrag}
      >
        {state.title && (
          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-sm)',
            color: 'var(--text-amber)',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            {state.title}
          </div>
        )}
        <div style={{ color: 'var(--text-default)', fontSize: 'var(--text-base)', lineHeight: 1.5 }}>
          {state.message}
        </div>
        {state.detail && (
          <div style={{
            marginTop: 8,
            color: 'var(--text-muted)',
            fontSize: 'var(--text-sm)',
            lineHeight: 1.5,
            whiteSpace: 'pre-line',
          }}>
            {state.detail}
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 8, marginTop: 20 }}>
          {state.buttons.map((label, i) => {
            const isPrimary    = i === 0
            const isDestructive = i === state.destructiveIndex
            return (
              <button
                key={i}
                onClick={() => state.resolve(i)}
                style={{
                  padding: '8px 16px',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-sm)',
                  cursor: 'pointer',
                  border:      isPrimary ? 'none' : '1px solid var(--text-inactive)',
                  background:  isPrimary ? 'var(--text-amber)' : 'transparent',
                  color:       isPrimary ? 'var(--bg-modal-header)' : isDestructive ? 'var(--color-input-error)' : 'var(--text-default)',
                  fontWeight:  isPrimary ? 600 : 400,
                  fontFamily:  'var(--font-ui)',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>
    </div>,
    document.body
  )
}
