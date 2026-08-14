// ── ConfirmDialog — themed confirm/alert modal, portal-rendered ───────────────
// Mount <ConfirmDialogHost /> once in App.tsx; it renders nothing when idle.
// Trigger via confirmDialog() from confirmController.ts (imperative API).

import { useEffect, useRef, useState, type CSSProperties } from 'react'
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

  if (!state) return null

  const safeIndex = state.buttons.length - 1

  return createPortal(
    <div
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
        className="orfeo-modal-glow"
        style={{
          background: 'var(--bg-modal)',
          border: '1px solid var(--border2)',
          borderRadius: 'var(--radius-lg)',
          padding: '20px 22px',
          minWidth: 340,
          maxWidth: 460,
          '--_modal-shadow': 'var(--elevation-modal)',
        } as CSSProperties}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {state.title && (
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
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
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
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
                  fontFamily:  "'Inter', system-ui, sans-serif",
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
