import { useEffect, useState, useReducer, useCallback, useRef } from 'react'
import { Midi } from '@tonejs/midi'
import { useStore } from '../../store'
import { midiToEditableCopy } from '../../utils/noteEditorCommands'
import { createNoteEditorHistory } from '../../utils/noteEditorHistory'
import type { NoteEditorHistory } from '../../utils/noteEditorHistory'
import { getNoteName } from '../../utils/noteNames'
import NoteEditorCanvas from './NoteEditorCanvas'
import type { ToneNote } from '../../utils/noteEditorCommands'

// ── Session ───────────────────────────────────────────────────────────────────
interface EditorSession {
  midiCopy:   Midi
  history:    NoteEditorHistory
  trackIndex: number
}

function buildSession(rawBuffer: ArrayBuffer): EditorSession | null {
  const midiCopy   = midiToEditableCopy(rawBuffer)
  const trackIndex = midiCopy.tracks.findIndex(t => t.notes.length > 0)
  if (trackIndex === -1) return null
  return { midiCopy, history: createNoteEditorHistory(), trackIndex }
}

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

// ── Types ─────────────────────────────────────────────────────────────────────
interface Props {
  open:    boolean
  onClose: () => void
}

interface HoverTooltip {
  note: ToneNote
  x:    number
  y:    number
}

const QUANT_LABELS: Record<number, string> = { 4: '1/4', 8: '1/8', 16: '1/16', 32: '1/32' }

const PENCIL_HINTS = [
  'Alt+Click → add note',
  'Drag up/down → retime',
  'Drag left/right → repitch',
  'Drag bottom edge → resize',
  'Right-click / Del → remove',
]
const SELECT_HINTS = [
  'Click → select note',
  'Shift+click → add to selection',
  'Drag empty → marquee',
  'Drag selection → move',
  'Del → remove selected',
]

// ── NoteEditorOverlay ─────────────────────────────────────────────────────────
export default function NoteEditorOverlay({ open, onClose }: Props) {
  const midi         = useStore(s => s.midi)
  const tracks       = useStore(s => s.tracks)
  const keyboardSize = useStore(s => s.keyboardSize)
  const noteNaming   = useStore(s => s.noteNaming)
  const accidentals  = useStore(s => s.accidentals)

  const [session, setSession]               = useState<EditorSession | null>(null)
  const [toolMode,        setToolModeState] = useState<'pencil' | 'select'>('pencil')
  const [snapEnabled,     setSnapState]     = useState(true)
  const [quantizeDivisor, setQuantizeState] = useState<4 | 8 | 16 | 32>(8)
  const [quantizeOpen,    setQuantizeOpen]  = useState(false)
  const [quantizePos,     setQuantizePos]   = useState({ top: 0, left: 0 })
  const [showNoteNames,   setShowNoteNames] = useState(false)
  const [hoverTooltip,    setHoverTooltip]  = useState<HoverTooltip | null>(null)

  const toolModeRef        = useRef<'pencil' | 'select'>('pencil')
  const snapRef            = useRef(true)
  const quantizeDivisorRef = useRef<4 | 8 | 16 | 32>(8)
  const showNoteNamesRef   = useRef(false)
  const redrawRef          = useRef<(() => void) | null>(null)
  const quantizeBtnRef     = useRef<HTMLButtonElement>(null)
  const noteNameRef        = useRef<(midi: number) => string>(() => '')
  const hoverInfoRef       = useRef<((note: ToneNote | null, clientX: number, clientY: number) => void) | null>(null)

  // Update refs and callbacks in render body so canvas always reads fresh values
  noteNameRef.current = (midi: number) => {
    const naming = noteNaming === 'hidden' ? 'english' : noteNaming
    return getNoteName(midi, naming, accidentals)
  }
  hoverInfoRef.current = (note, clientX, clientY) => {
    setHoverTooltip(note && showNoteNamesRef.current ? { note, x: clientX, y: clientY } : null)
  }

  const setTool = (m: 'pencil' | 'select') => { toolModeRef.current = m; setToolModeState(m) }
  const setSnap = (v: boolean)             => { snapRef.current = v;      setSnapState(v) }
  const setQuantize = (d: 4 | 8 | 16 | 32) => {
    quantizeDivisorRef.current = d
    setQuantizeState(d)
    setQuantizeOpen(false)
  }
  const toggleNoteNames = () => {
    const next = !showNoteNames
    showNoteNamesRef.current = next
    setShowNoteNames(next)
    setHoverTooltip(null)
    redrawRef.current?.()
  }
  const openQuantize = () => {
    if (quantizeBtnRef.current) {
      const r = quantizeBtnRef.current.getBoundingClientRect()
      setQuantizePos({ top: r.bottom + 2, left: r.left })
    }
    setQuantizeOpen(v => !v)
  }

  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const handleHistoryChange = useCallback(() => forceUpdate(), [])

  useEffect(() => {
    if (open && midi) {
      const raw = (midi as any)._raw as ArrayBuffer | undefined
      if (!raw) return
      setSession(buildSession(raw))
    } else {
      setSession(null)
      setHoverTooltip(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Close quantize dropdown on outside click
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

  if (!open || !session) return null

  const { midiCopy, history, trackIndex } = session
  const trackColor = tracks[0]?.color ?? '#e8a027'
  const editTrack  = midiCopy.tracks[trackIndex]
  const trackLabel = editTrack
    ? (editTrack.name || tracks[trackIndex]?.gmName || `Track ${trackIndex + 1}`)
    : '—'
  const noteCount = editTrack?.notes.length ?? 0
  const canUndo   = history.canUndo
  const canRedo   = history.canRedo
  const hints     = toolMode === 'pencil' ? PENCIL_HINTS : SELECT_HINTS

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9600,
        background: 'rgba(8,8,12,0.92)',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
      onKeyDown={e => e.stopPropagation()}
    >

      {/* ── Toolbar ─────────────────────────────────────────────────────────
          position:relative + zIndex:2 ensures it stacks above the PixiJS canvas
          regardless of what stacking context PixiJS creates inside the canvas wrapper. */}
      <div style={{
        height: 44, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 10px',
        background: 'var(--panel, #1e1e1e)',
        borderBottom: '1px solid #2e2e3c',
        position: 'relative',
        zIndex: 2,
      }}>

        {/* Left: title + track info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
          <span style={{
            fontSize: 11, fontWeight: 700,
            color: 'var(--text-amber, #e8a027)',
            letterSpacing: '0.08em', textTransform: 'uppercase',
            whiteSpace: 'nowrap',
          }}>
            Note Editor
          </span>
          <span style={{ color: '#404055', fontSize: 11 }}>·</span>
          <span style={{
            fontSize: 11,
            color: 'var(--text-default, #c6c8c8)',
            fontFamily: "'JetBrains Mono', monospace",
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {trackLabel}
          </span>
          <span style={{ color: '#505060', fontSize: 11, flexShrink: 0 }}>({noteCount})</span>
        </div>

        {/* Center: all tool controls — naturally centred between two flex:1 sides */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}>

          {/* Pencil tool */}
          <ToolBtn
            active={toolMode === 'pencil'}
            onClick={() => setTool('pencil')}
            title="Pencil tool"
          >
            <IconPencil />
          </ToolBtn>

          {/* Select tool */}
          <ToolBtn
            active={toolMode === 'select'}
            onClick={() => setTool('select')}
            title="Select tool"
          >
            <IconMarquee />
          </ToolBtn>

          <VSep />

          {/* Snap toggle */}
          <button
            onClick={() => setSnap(!snapEnabled)}
            title={snapEnabled ? 'Snap: ON — click to disable' : 'Snap: OFF — click to enable'}
            style={{
              ...btnBase,
              gap: 4,
              paddingLeft: 7, paddingRight: 7,
              color:       snapEnabled ? 'var(--text-amber, #e8a027)' : 'var(--text-muted, #94979e)',
              borderColor: snapEnabled ? 'rgba(232,160,39,0.35)' : '#2e2e3c',
            }}
          >
            <IconSnap />
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>SNAP</span>
          </button>

          {/* Quantize dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              ref={quantizeBtnRef}
              onClick={openQuantize}
              title="Quantize grid value"
              style={{
                ...btnBase,
                minWidth: 44,
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 11,
                letterSpacing: '0.02em',
              }}
            >
              {QUANT_LABELS[quantizeDivisor]} ▾
            </button>
            {quantizeOpen && (
              <div
                onMouseDown={e => e.stopPropagation()}
                style={{
                  position: 'fixed',
                  top:  quantizePos.top,
                  left: quantizePos.left,
                  zIndex: 50001,
                  background: '#1e1e1e',
                  border: '1px solid #3a3a4c',
                  borderRadius: 4,
                  overflow: 'hidden',
                  minWidth: 64,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
                }}
              >
                {([4, 8, 16, 32] as const).map(d => (
                  <div
                    key={d}
                    onClick={() => setQuantize(d)}
                    style={{
                      padding: '6px 14px',
                      cursor: 'pointer',
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: d === quantizeDivisor
                        ? 'var(--text-amber, #e8a027)'
                        : 'var(--text-default, #c6c8c8)',
                      background: d === quantizeDivisor ? 'rgba(232,160,39,0.08)' : 'transparent',
                    }}
                    onMouseEnter={e => {
                      (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)'
                    }}
                    onMouseLeave={e => {
                      (e.currentTarget as HTMLElement).style.background =
                        d === quantizeDivisor ? 'rgba(232,160,39,0.08)' : 'transparent'
                    }}
                  >
                    1/{d}
                  </div>
                ))}
              </div>
            )}
          </div>

          <VSep />

          {/* Undo */}
          <button
            onClick={() => { if (history.undo()) { redrawRef.current?.(); handleHistoryChange() } }}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            style={iconBtnStyle(!canUndo)}
          >
            ↺
          </button>

          {/* Redo */}
          <button
            onClick={() => { if (history.redo()) { redrawRef.current?.(); handleHistoryChange() } }}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            style={iconBtnStyle(!canRedo)}
          >
            ↻
          </button>

          <VSep />

          {/* Note names toggle */}
          <ToolBtn
            active={showNoteNames}
            onClick={toggleNoteNames}
            title="Show note names"
            wide
          >
            <span style={{
              fontSize: 10,
              fontFamily: "'JetBrains Mono', monospace",
              fontWeight: 700,
              letterSpacing: '0.03em',
            }}>
              Note names
            </span>
          </ToolBtn>
        </div>

        {/* Right: close */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            title="Close Note Editor (Ctrl+Shift+N)"
            style={{ ...btnBase, paddingLeft: 10, paddingRight: 10, color: 'var(--text-muted, #94979e)' }}
          >
            ✕ Close
          </button>
        </div>
      </div>

      {/* ── Hint bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        height: 24, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '0 12px',
        background: '#131318',
        borderBottom: '1px solid #1e1e28',
        gap: 16,
      }}>
        {hints.map(h => (
          <span key={h} style={{ fontSize: 11, color: '#504a4a' }}>{h}</span>
        ))}
      </div>

      {/* ── Canvas area
          isolation:isolate creates a new stacking context that contains the
          PixiJS canvas, preventing it from escaping and overlapping the toolbar. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative', isolation: 'isolate' }}>
        <NoteEditorCanvas
          midi={midiCopy}
          trackIndex={trackIndex}
          trackColor={trackColor}
          keyboardSize={keyboardSize}
          history={history}
          onHistoryChange={handleHistoryChange}
          toolModeRef={toolModeRef}
          snapRef={snapRef}
          quantizeDivisorRef={quantizeDivisorRef}
          redrawRef={redrawRef}
          showNoteNamesRef={showNoteNamesRef}
          noteNameRef={noteNameRef}
          hoverInfoRef={hoverInfoRef}
        />
      </div>

      {/* ── Hover tooltip for notes too short to show label inline ───────────── */}
      {hoverTooltip && (
        <div
          style={{
            position: 'fixed',
            left: hoverTooltip.x + 14,
            top:  hoverTooltip.y - 10,
            zIndex: 50002,
            background: '#1e1e1e',
            border: '1px solid #3a3a4c',
            borderRadius: 3,
            padding: '2px 7px',
            fontSize: 11,
            fontFamily: "'JetBrains Mono', monospace",
            color: 'var(--text-amber, #e8a027)',
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
            whiteSpace: 'nowrap',
          }}
        >
          {noteNameRef.current(hoverTooltip.note.midi)}
        </div>
      )}
    </div>
  )
}

// ── Shared style atoms ────────────────────────────────────────────────────────
const btnBase: React.CSSProperties = {
  height: 26,
  padding: '0 8px',
  fontSize: 11,
  fontFamily: "'Inter', system-ui, sans-serif",
  background: 'transparent',
  border: '1px solid #2e2e3c',
  borderRadius: 'var(--radius-sm, 3px)',
  color: 'var(--text-default, #c6c8c8)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center',
  transition: 'border-color 0.1s, color 0.1s',
  flexShrink: 0,
}

function iconBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 26,
    padding: 0,
    fontSize: 16,
    lineHeight: 1,
    fontFamily: 'system-ui, sans-serif',
    background: 'transparent',
    border: '1px solid #2e2e3c',
    borderRadius: 'var(--radius-sm, 3px)',
    color:   disabled ? '#404055' : 'var(--text-default, #c6c8c8)',
    cursor:  disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.45 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0,
  }
}

function ToolBtn({
  active, onClick, title, children, wide,
}: {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
  wide?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        ...btnBase,
        width:       wide ? 'auto' : 28,
        padding:     wide ? '0 8px' : 0,
        justifyContent: 'center',
        color:       active ? 'var(--text-amber, #e8a027)' : 'var(--text-muted, #94979e)',
        borderColor: active ? 'rgba(232,160,39,0.45)' : '#2e2e3c',
        background:  active ? 'rgba(232,160,39,0.07)' : 'transparent',
      }}
    >
      {children}
    </button>
  )
}

function VSep() {
  return (
    <div style={{
      width: 1, height: 20,
      background: '#2e2e3c',
      margin: '0 3px',
      flexShrink: 0,
    }} />
  )
}
