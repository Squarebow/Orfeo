import { useEffect, useState, useReducer, useRef, useCallback } from 'react'
import { useStore } from '../../store'
import { NES } from '../../utils/noteEditorState'

// ── Toolbar SVG icons ─────────────────────────────────────────────────────────
const IconPencil = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
    <path d="M10 1 L12 3 L4.5 10.5 L2 11 L2.5 8.5 Z" />
    <rect x="1" y="12" width="11" height="1" rx="0.5" />
  </svg>
)

const IconMarquee = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
    <path d="M1 2 L1 4" /><path d="M1 2 L3 2" />
    <path d="M12 2 L10 2" /><path d="M12 2 L12 4" />
    <path d="M1 11 L1 9" /><path d="M1 11 L3 11" />
    <path d="M12 11 L10 11" /><path d="M12 11 L12 9" />
    <line x1="5" y1="2" x2="8" y2="2" strokeDasharray="1.5 1.5" />
    <line x1="5" y1="11" x2="8" y2="11" strokeDasharray="1.5 1.5" />
    <line x1="1" y1="6" x2="1" y2="8" strokeDasharray="1.5 1.5" />
    <line x1="12" y1="6" x2="12" y2="8" strokeDasharray="1.5 1.5" />
  </svg>
)

const IconSnap = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
    <rect x="1.5" y="2" width="2" height="9" rx="1" />
    <rect x="5.5" y="4" width="2" height="5" rx="1" />
    <rect x="9.5" y="2" width="2" height="9" rx="1" />
  </svg>
)

const QUANT_LABELS: Record<number, string> = { 4: '1/4', 8: '1/8', 16: '1/16', 32: '1/32' }

// ── NoteEditorToolbar ─────────────────────────────────────────────────────────
// Floating draggable toolbar — appears when noteEditorActive is true.
// Reads/writes NES.* directly; subscribes to NES.onHistoryChange for re-renders.
export default function NoteEditorToolbar() {
  const noteEditorActive = useStore(s => s.noteEditorActive)
  const setNoteEditorActive = useStore(s => s.setNoteEditorActive)

  // ── Force re-render on history changes (push/undo/redo) ───────────────────
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // ── Local display state — mirrors NES refs so React re-renders on change ──
  const [toolMode,        setToolModeDisplay] = useState(NES.toolModeRef.current)
  const [snapEnabled,     setSnapDisplay]     = useState(NES.snapRef.current)
  const [quantize,        setQuantizeDisplay] = useState(NES.quantizeDivisorRef.current)
  const [showNoteNames,   setNoteNamesDisplay] = useState(NES.showNoteNamesRef.current)
  const [quantizeOpen,    setQuantizeOpen]    = useState(false)
  const [quantizePos,     setQuantizePos]     = useState({ top: 0, left: 0 })
  const quantizeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    NES.onHistoryChange = () => forceUpdate()
    return () => { if (NES.onHistoryChange === forceUpdate as unknown as (() => void)) NES.onHistoryChange = null }
  }, [])

  // ── Drag state ────────────────────────────────────────────────────────────
  const [pos, setPos]   = useState({ x: 24, y: 80 })
  const panelRef        = useRef<HTMLDivElement>(null)
  const dragState       = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)

  const onMouseMove = useCallback((e: MouseEvent) => {
    const ds = dragState.current
    if (!ds) return
    const panelW = panelRef.current?.offsetWidth ?? 400
    const panelH = panelRef.current?.offsetHeight ?? 44
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - panelW, ds.startPosX + (e.clientX - ds.startX))),
      y: Math.max(0, Math.min(window.innerHeight - panelH, ds.startPosY + (e.clientY - ds.startY))),
    })
  }, [])
  const onMouseUp = useCallback(() => { dragState.current = null }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // ── Close quantize dropdown on outside click ───────────────────────────────
  useEffect(() => {
    if (!quantizeOpen) return
    const handle = (e: MouseEvent) => {
      if (quantizeBtnRef.current && !quantizeBtnRef.current.contains(e.target as Node)) {
        setQuantizeOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [quantizeOpen])

  if (!noteEditorActive) return null

  // ── Setters — update NES ref AND local display state ──────────────────────
  const setTool = (m: typeof NES.toolModeRef.current) => {
    NES.toolModeRef.current = m
    setToolModeDisplay(m)
  }
  const setSnap = (v: boolean) => {
    NES.snapRef.current = v
    setSnapDisplay(v)
  }
  const setQuantize = (d: typeof NES.quantizeDivisorRef.current) => {
    NES.quantizeDivisorRef.current = d
    setQuantizeDisplay(d)
    setQuantizeOpen(false)
  }
  const toggleNoteNames = () => {
    const next = !NES.showNoteNamesRef.current
    NES.showNoteNamesRef.current = next
    setNoteNamesDisplay(next)
  }
  const doUndo = () => {
    if (NES.history.undo()) { NES.needsFlatRebuild = true; NES.onHistoryChange?.() }
  }
  const doRedo = () => {
    if (NES.history.redo()) { NES.needsFlatRebuild = true; NES.onHistoryChange?.() }
  }
  const doClose = () => {
    setNoteEditorActive(false)
    NES.reset()
  }

  const openQuantize = () => {
    if (quantizeBtnRef.current) {
      const r = quantizeBtnRef.current.getBoundingClientRect()
      setQuantizePos({ top: r.bottom + 4, left: r.left })
    }
    setQuantizeOpen(v => !v)
  }

  const canUndo = NES.history.canUndo
  const canRedo = NES.history.canRedo
  const dirty   = NES.dirty

  return (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: pos.x, top: pos.y,
        zIndex: 9700,
        background: 'var(--panel, #1e1e1e)',
        border: '1px solid #3a3a4c',
        borderRadius: 'var(--radius-md, 5px)',
        boxShadow: '0 4px 20px rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        height: 38,
        padding: '0 6px',
        gap: 3,
        userSelect: 'none',
        cursor: 'default',
      }}
    >
      {/* ── Drag handle ──────────────────────────────────────────────────── */}
      <div
        onMouseDown={e => {
          e.preventDefault()
          dragState.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y }
        }}
        title="Drag to move"
        style={{
          width: 16, height: 28,
          display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
          cursor: 'grab', flexShrink: 0, padding: '0 2px',
        }}
      >
        {[0,1,2].map(i => (
          <div key={i} style={{ width: 12, height: 2, borderRadius: 1, background: '#404055' }} />
        ))}
      </div>

      {/* ── Edit label ───────────────────────────────────────────────────── */}
      <span style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
        color: 'var(--text-amber, #e8a027)', textTransform: 'uppercase',
        paddingRight: 4, flexShrink: 0,
      }}>
        EDIT{dirty ? ' ●' : ''}
      </span>

      <VSep />

      {/* ── Pencil tool ──────────────────────────────────────────────────── */}
      <ToolBtn active={toolMode === 'pencil'} onClick={() => setTool('pencil')} title="Pencil tool — click to move/resize, Alt+click to add, right-click to delete">
        <IconPencil />
      </ToolBtn>

      {/* ── Select tool ──────────────────────────────────────────────────── */}
      <ToolBtn active={toolMode === 'select'} onClick={() => setTool('select')} title="Select tool — click to select, drag to marquee, Del to remove">
        <IconMarquee />
      </ToolBtn>

      <VSep />

      {/* ── Snap toggle ──────────────────────────────────────────────────── */}
      <button
        onClick={() => setSnap(!snapEnabled)}
        title={snapEnabled ? 'Snap: ON — click to disable' : 'Snap: OFF — click to enable'}
        style={{
          ...btnBase,
          gap: 4, paddingLeft: 7, paddingRight: 7,
          color:       snapEnabled ? 'var(--text-amber, #e8a027)' : 'var(--text-muted, #94979e)',
          borderColor: snapEnabled ? 'rgba(232,160,39,0.35)'      : '#2e2e3c',
        }}
      >
        <IconSnap />
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>SNAP</span>
      </button>

      {/* ── Quantize dropdown ────────────────────────────────────────────── */}
      <div style={{ position: 'relative' }}>
        <button
          ref={quantizeBtnRef}
          onClick={openQuantize}
          title="Quantize grid"
          style={{ ...btnBase, minWidth: 44, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
        >
          {QUANT_LABELS[quantize]} ▾
        </button>
        {quantizeOpen && (
          <div
            onMouseDown={e => e.stopPropagation()}
            style={{
              position: 'fixed',
              top: quantizePos.top, left: quantizePos.left,
              zIndex: 50001,
              background: '#1e1e1e', border: '1px solid #3a3a4c',
              borderRadius: 4, overflow: 'hidden', minWidth: 64,
              boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
            }}
          >
            {([4, 8, 16, 32] as const).map(d => (
              <div
                key={d}
                onClick={() => setQuantize(d)}
                style={{
                  padding: '6px 14px', cursor: 'pointer', fontSize: 12,
                  fontFamily: "'JetBrains Mono', monospace",
                  color:      d === quantize ? 'var(--text-amber, #e8a027)' : 'var(--text-default, #c6c8c8)',
                  background: d === quantize ? 'rgba(232,160,39,0.08)' : 'transparent',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = d === quantize ? 'rgba(232,160,39,0.08)' : 'transparent' }}
              >
                1/{d}
              </div>
            ))}
          </div>
        )}
      </div>

      <VSep />

      {/* ── Undo / Redo ──────────────────────────────────────────────────── */}
      <button onClick={doUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={iconBtnStyle(!canUndo)}>↺</button>
      <button onClick={doRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={iconBtnStyle(!canRedo)}>↻</button>

      <VSep />

      {/* ── Note names toggle ────────────────────────────────────────────── */}
      <ToolBtn active={showNoteNames} onClick={toggleNoteNames} title="Show note names on notes" wide>
        <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: '0.03em' }}>
          Note names
        </span>
      </ToolBtn>

      <VSep />

      {/* ── Close ────────────────────────────────────────────────────────── */}
      <button
        onClick={doClose}
        title="Exit edit mode"
        style={{ ...btnBase, paddingLeft: 10, paddingRight: 10, color: 'var(--text-muted, #94979e)' }}
      >
        ✕
      </button>
    </div>
  )
}

// ── Shared style atoms ────────────────────────────────────────────────────────
const btnBase: React.CSSProperties = {
  height: 26, padding: '0 8px', fontSize: 11,
  fontFamily: "'Inter', system-ui, sans-serif",
  background: 'transparent', border: '1px solid #2e2e3c',
  borderRadius: 'var(--radius-sm, 3px)',
  color: 'var(--text-default, #c6c8c8)',
  cursor: 'pointer', display: 'flex', alignItems: 'center',
  transition: 'border-color 0.1s, color 0.1s', flexShrink: 0,
}

function iconBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 26, padding: 0, fontSize: 16, lineHeight: 1,
    fontFamily: 'system-ui, sans-serif',
    background: 'transparent', border: '1px solid #2e2e3c',
    borderRadius: 'var(--radius-sm, 3px)',
    color:   disabled ? '#666688' : 'var(--text-default, #c6c8c8)',
    cursor:  disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.65 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }
}

function ToolBtn({ active, onClick, title, children, wide }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode; wide?: boolean
}) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        ...btnBase,
        width: wide ? 'auto' : 28, padding: wide ? '0 8px' : 0, justifyContent: 'center',
        color:       active ? 'var(--text-amber, #e8a027)' : 'var(--text-muted, #94979e)',
        borderColor: active ? 'rgba(232,160,39,0.45)'      : '#2e2e3c',
        background:  active ? 'rgba(232,160,39,0.07)'      : 'transparent',
      }}
    >
      {children}
    </button>
  )
}

function VSep() {
  return <div style={{ width: 1, height: 20, background: '#2e2e3c', margin: '0 3px', flexShrink: 0 }} />
}
