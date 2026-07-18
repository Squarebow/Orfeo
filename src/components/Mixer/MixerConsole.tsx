import { useRef, useState, useEffect, useMemo, useCallback } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../../store'
import ChannelStrip from './ChannelStrip'
import MasterStrip from './MasterStrip'

// ── MixerConsole — full modal shell for Stage 4 ──────────────────────────────
// Triggered via Ctrl+Shift+M (dev shortcut). Real trigger wiring is Stage 5/6.
// Layout: fixed backdrop → modal → header + body row (scrollable strips + master).

interface MixerConsoleProps {
  open: boolean
  onClose: () => void
}

// ── MixerConsole ──────────────────────────────────────────────────────────────
export default function MixerConsole({ open, onClose }: MixerConsoleProps) {
  const tracks = useStore(s => s.tracks)

  // ── Sort: unmuted tracks left, muted tracks right; stable within each group ──
  const sortedTracks = useMemo(() =>
    [...tracks].sort((a, b) => {
      if (a.muted === b.muted) return a.index - b.index
      return a.muted ? 1 : -1
    }),
  [tracks])

  // ── Drag-to-pan state ─────────────────────────────────────────────────────
  const scrollRef   = useRef<HTMLDivElement>(null)
  const dragStartX  = useRef(0)
  const dragStartSL = useRef(0)
  const [panning, setPanning] = useState(false)

  // ── Attach document-level move/up during pan so pointer can leave the row ──
  useEffect(() => {
    if (!panning) return
    const onMove = (e: MouseEvent) => {
      if (!scrollRef.current) return
      scrollRef.current.scrollLeft = dragStartSL.current + (dragStartX.current - e.clientX)
    }
    const onUp = () => setPanning(false)
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [panning])

  // ── Start drag-to-pan ─────────────────────────────────────────────────────
  const handleScrollMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return
    dragStartX.current  = e.clientX
    dragStartSL.current = scrollRef.current.scrollLeft
    setPanning(true)
  }, [])

  // ── Horizontal scroll via vertical wheel ──────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!scrollRef.current) return
    e.preventDefault()
    scrollRef.current.scrollLeft += e.deltaY
  }, [])

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9990,
      }}
      onClick={onClose}
    >
      {/* ── Modal container ─────────────────────────────────────────────── */}
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(90vw, 1400px)',
          background: 'var(--bg-modal)',
          border: '1px solid var(--border2)',
          borderRadius: 10,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(232,160,39,0.06)',
          userSelect: 'none',
        }}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          height: 40, flexShrink: 0,
          background: 'var(--bg-modal-header)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 var(--space-4)',
        }}>
          <span style={{
            fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
            color: 'var(--text-amber)', letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            Mixer Console
          </span>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#505068', fontSize: 16, lineHeight: 1,
              padding: '0 2px', display: 'flex', alignItems: 'center',
            }}
          >
            <X size={16} />
          </button>
        </div>

        {/* ── Body — strip row + master ────────────────────────────────────── */}
        <div style={{
          display: 'flex', gap: 8,
          padding: 16,
          alignItems: 'flex-start',
        }}>

          {/* ── Scrollable channel strip row ─────────────────────────────── */}
          <div
            ref={scrollRef}
            className="mixer-scroll"
            onMouseDown={handleScrollMouseDown}
            onWheel={handleWheel}
            style={{
              flex: 1, minWidth: 0,
              display: 'flex', gap: 8,
              overflowX: 'auto',
              paddingBottom: 8,
              cursor: panning ? 'grabbing' : 'grab',
            }}
          >
            {sortedTracks.length === 0 ? (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                height: 574, flex: 1,
                color: 'var(--text-dimmest)', fontSize: 12, fontFamily: 'JetBrains Mono',
                letterSpacing: '0.08em', textTransform: 'uppercase',
              }}>
                No tracks — load a MIDI file
              </div>
            ) : (
              sortedTracks.map(t => (
                <ChannelStrip key={t.index} trackIndex={t.index} />
              ))
            )}
          </div>

          {/* ── Master strip — always visible, never scrolls ─────────────── */}
          <div style={{ flexShrink: 0 }}>
            <MasterStrip />
          </div>

        </div>
      </div>
    </div>
  )
}
