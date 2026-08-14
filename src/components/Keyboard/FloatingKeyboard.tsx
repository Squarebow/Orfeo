/**
 * FloatingKeyboard — horizontally resizable, draggable panel.
 * Height auto-fits to keyboard content — no fixed height, no empty space.
 * Width-only resize; keyboard height follows proportionally via its own ResizeObserver.
 */
import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react'
import { X, Pin } from 'lucide-react'
import { useStore } from '../../store'
import Keyboard from './Keyboard'
import KeyboardControls from './KeyboardControls'
import OrfeoMark from '../OrfeoMark'
import { getPianoRollCenterX, getPlaybarY } from '../../utils/modalAnchors'
import { modalCloseButtonStyle, modalCloseButtonHoverColor, modalCloseButtonIdleColor } from '../../utils/modalCloseButtonStyle'
import { useFocusTrap } from '../../hooks/useFocusTrap'

const DEFAULT_W = 860
const MIN_W = 650
const MAX_W = 1200
const HANDLE_PX = 8

export default function FloatingKeyboard() {
  const setKeyboardMode = useStore((s) => s.setKeyboardMode)

  // ── Default position: horizontally centered on the piano roll, bottom
  // edge aligned to the (fixed-ratio) playbar line — set once at open time,
  // never recalculated on side-panel toggle. y is finalized once height is
  // known (below); x can be computed immediately from the known default width. ──
  const [pos, setPos] = useState({ x: Math.round(getPianoRollCenterX() - DEFAULT_W / 2), y: -1 })
  const [w, setW]     = useState(DEFAULT_W)
  const panelRef      = useRef<HTMLDivElement>(null)
  const initialised   = useRef(false)
  // ── Mounted only while keyboardMode === 'floating' (see App.tsx) — always
  // active while this component exists. ─────────────────────────────────────
  useFocusTrap(panelRef, true)

  const dragState = useRef<{
    type: 'move' | 'resize-e' | 'resize-w'
    startX: number
    startY: number
    startW: number
    startPosX: number
    startPosY: number
  } | null>(null)

  // Set initial Y on first render so panel's bottom edge sits on the playbar line
  useEffect(() => {
    if (initialised.current) return
    initialised.current = true
    const h = panelRef.current?.offsetHeight ?? 220
    setPos(p => ({ ...p, y: Math.max(44, getPlaybarY() - h) }))
  }, [])

  const onMouseMove = useCallback((e: MouseEvent) => {
    const ds = dragState.current
    if (!ds) return

    if (ds.type === 'move') {
      const panelW = panelRef.current?.offsetWidth ?? w
      const panelH = panelRef.current?.offsetHeight ?? 220
      setPos({
        x: Math.max(0, Math.min(window.innerWidth - panelW, ds.startPosX + (e.clientX - ds.startX))),
        // 44, not 0 — keeps the top edge clear of the 40px titleBarOverlay
        // (electron/main.ts) where Windows draws its own window controls on
        // top of everything in the DOM.
        y: Math.max(44, Math.min(window.innerHeight - panelH, ds.startPosY + (e.clientY - ds.startY))),
      })
      return
    }

    const dx = e.clientX - ds.startX
    if (ds.type === 'resize-e') {
      setW(Math.max(MIN_W, Math.min(MAX_W, ds.startW + dx)))
    } else if (ds.type === 'resize-w') {
      const newW = Math.max(MIN_W, Math.min(MAX_W, ds.startW - dx))
      setW(newW)
      setPos(p => ({ ...p, x: ds.startPosX + (ds.startW - newW) }))
    }
  }, [])

  const onMouseUp = useCallback(() => { dragState.current = null }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  const startMove = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    e.preventDefault()
    dragState.current = { type: 'move', startX: e.clientX, startY: e.clientY, startW: w, startPosX: pos.x, startPosY: pos.y }
  }

  const startResizeE = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragState.current = { type: 'resize-e', startX: e.clientX, startY: e.clientY, startW: w, startPosX: pos.x, startPosY: pos.y }
  }

  const startResizeW = (e: React.MouseEvent) => {
    e.preventDefault(); e.stopPropagation()
    dragState.current = { type: 'resize-w', startX: e.clientX, startY: e.clientY, startW: w, startPosX: pos.x, startPosY: pos.y }
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="On-screen keyboard"
      className="orfeo-modal-glow"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: w,
        // NO fixed height — shrinks to content
        zIndex: 200,
        background: 'var(--bg-modal-header)',
        border: '1px solid var(--state-hover-bg)',
        borderRadius: 10,
        overflow: 'hidden',
        userSelect: dragState.current ? 'none' : 'auto',
        display: 'flex',
        flexDirection: 'column',
        '--_modal-shadow': 'var(--elevation-floating-light)',
      } as CSSProperties}
    >
      {/* Left resize handle */}
      <div onMouseDown={startResizeW} style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: HANDLE_PX, cursor: 'ew-resize', zIndex: 10 }} />
      {/* Right resize handle */}
      <div onMouseDown={startResizeE} style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: HANDLE_PX, cursor: 'ew-resize', zIndex: 10 }} />

      {/* Title bar */}
      <div
        onMouseDown={startMove}
        style={{
          height: 36,
          background: 'var(--bg-modal-header)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 var(--space-3)',
          cursor: 'grab',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <OrfeoMark height={22} />
          <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            Keyboard
          </span>
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)' }} data-no-drag="true">
          <button
            onClick={() => setKeyboardMode('docked')}
            title="Dock keyboard"
            data-no-drag="true"
            style={{ width: 18, height: 18, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 'var(--radius-sm)', transition: 'color 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            <Pin size={10} strokeWidth={1.8} />
          </button>
          <button
            onClick={() => setKeyboardMode('docked')}
            title="Close floating keyboard"
            data-no-drag="true"
            style={modalCloseButtonStyle}
            onMouseEnter={e => e.currentTarget.style.color = modalCloseButtonHoverColor}
            onMouseLeave={e => e.currentTarget.style.color = modalCloseButtonIdleColor}
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {/* Content — height determined by children, no flex-grow */}
      <div data-no-drag="true">
        <Keyboard />
        <KeyboardControls />
      </div>
    </div>
  )
}
