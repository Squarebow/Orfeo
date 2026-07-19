import { useRef, useState, useEffect, useMemo, useCallback, type CSSProperties } from 'react'
import { X, Minus } from 'lucide-react'
import { useStore } from '../../store'
import ChannelStrip from './ChannelStrip'
import MasterStrip from './MasterStrip'
import OrfeoMark from '../OrfeoMark'

// ── MixerConsole — floating draggable modal ───────────────────────────────────
// Opened via Ctrl+Shift+M or the Console (SlidersVertical) icon in the TrackPanel.
// Minimize hides the window without unmounting, preserving all internal state.
// Width locked to show exactly 8 channel strips + master.

// ── Modal dimensions — derived from strip geometry ────────────────────────────
// n strips × 120px + (n−1) inter-strip gaps × 8px + body-gap 8px + master 160px + padding 2×16px
const STRIP_W   = 120
const STRIP_GAP = 8
const MASTER_W  = 160
const BODY_PAD  = 16
const MAX_STRIPS = 8

// ── Track sort order — matches TrackPanel GROUP_ORDER ────────────────────────
const GROUP_ORDER = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass',
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic',
  'percussive', 'sfx', 'drums',
]

const MODAL_H_APPROX = 650  // header 40 + body-pad 16*2 + strip 574 + scrollbar ~4

// ── MixerConsole ──────────────────────────────────────────────────────────────
export default function MixerConsole() {
  const mixerOpen       = useStore(s => s.mixerOpen)
  const mixerMinimized  = useStore(s => s.mixerMinimized)
  const setMixerOpen    = useStore(s => s.setMixerOpen)
  const setMixerMinimized = useStore(s => s.setMixerMinimized)
  const tracks          = useStore(s => s.tracks)

  // ── Mount guard — don't render until first open ───────────────────────────
  // everOpened keeps the component mounted after first open so all internal state
  // (pos, knob values, scroll) survives hide/show cycles.
  const [everOpened, setEverOpened] = useState(false)

  // ── Mark ever-opened on first open ───────────────────────────────────────
  useEffect(() => {
    if (mixerOpen) setEverOpened(true)
  }, [mixerOpen])

  // ── Sort by GROUP_ORDER — matches TrackPanel display order ──────────────────
  const sortedTracks = useMemo(() =>
    [...tracks].sort((a, b) => {
      const ai = GROUP_ORDER.indexOf(a.group ?? '')
      const bi = GROUP_ORDER.indexOf(b.group ?? '')
      const ao = ai === -1 ? GROUP_ORDER.length : ai
      const bo = bi === -1 ? GROUP_ORDER.length : bi
      return ao !== bo ? ao - bo : a.index - b.index
    }),
  [tracks])

  // ── Modal width — adapts to track count, capped at MAX_STRIPS ────────────
  const modalW = useMemo(() => {
    const n = Math.min(Math.max(sortedTracks.length, 1), MAX_STRIPS)
    return BODY_PAD * 2 + n * STRIP_W + (n - 1) * STRIP_GAP + STRIP_GAP + MASTER_W
  }, [sortedTracks.length])

  // ── Drag position — initialized to viewport center on first render ────────
  const [pos, setPos] = useState(() => {
    const n = Math.min(Math.max(useStore.getState().tracks.length, 1), MAX_STRIPS)
    const w = BODY_PAD * 2 + n * STRIP_W + (n - 1) * STRIP_GAP + STRIP_GAP + MASTER_W
    return {
      x: Math.max(0, Math.round((window.innerWidth  - w) / 2)),
      y: Math.max(0, Math.round((window.innerHeight - MODAL_H_APPROX) / 2)),
    }
  })

  // ── Drag-to-pan state for the channel strip row ───────────────────────────
  const scrollRef    = useRef<HTMLDivElement>(null)
  const dragStartX   = useRef(0)
  const dragStartSL  = useRef(0)
  const [panning, setPanning] = useState(false)

  // ── Document-level move/up for strip-row pan drag ─────────────────────────
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

  // ── Start strip-row pan drag ──────────────────────────────────────────────
  const handleScrollMouseDown = useCallback((e: React.MouseEvent) => {
    if (!scrollRef.current) return
    dragStartX.current  = e.clientX
    dragStartSL.current = scrollRef.current.scrollLeft
    setPanning(true)
  }, [])

  // ── Horizontal scroll via vertical wheel on strip row ────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    if (!scrollRef.current) return
    e.preventDefault()
    scrollRef.current.scrollLeft += e.deltaY
  }, [])

  // ── Header drag — moves the whole modal ──────────────────────────────────
  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY
    const spx = pos.x, spy = pos.y
    const onMove = (ev: MouseEvent) =>
      setPos({ x: Math.max(0, spx + ev.clientX - sx), y: Math.max(0, spy + ev.clientY - sy) })
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
  }

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!mixerOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMixerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mixerOpen, setMixerOpen])

  // ── Do not mount until first open ────────────────────────────────────────
  if (!everOpened) return null

  return (
    <div
      className="orfeo-modal-glow"
      style={{
        position: 'fixed',
        left: pos.x, top: pos.y,
        width: modalW,
        background: 'var(--bg-modal)',
        border: '1px solid var(--border2)',
        borderRadius: 10,
        display: mixerOpen ? 'flex' : 'none',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
        zIndex: 9990,
        '--_modal-shadow': '0 8px 40px rgba(0,0,0,0.8)',
      } as CSSProperties}
    >

      {/* ── Header — drag handle; double-click restores when minimized ─────── */}
      <div
        onMouseDown={startDrag}
        onDoubleClick={() => { if (mixerMinimized) setMixerMinimized(false) }}
        style={{
          height: 40, flexShrink: 0,
          background: 'var(--bg-modal-header)',
          borderBottom: mixerMinimized ? 'none' : '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '0 var(--space-3)',
          cursor: 'grab',
        }}
      >
        {/* ── Logo mark ──────────────────────────────────────────────────── */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', marginRight: 10 }}>
          <OrfeoMark height={22} />
        </div>

        {/* ── Title ──────────────────────────────────────────────────────── */}
        <span style={{
          fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
          color: 'var(--text-amber)', letterSpacing: '0.14em', textTransform: 'uppercase',
          flex: 1,
        }}>
          Console
        </span>

        {/* ── Minimize + Close buttons — bottom-aligned so the dash sits at X level ── */}
        <div
          style={{ display: 'flex', alignItems: 'flex-end', gap: 2, paddingBottom: 2 }}
          onMouseDown={e => e.stopPropagation()}
        >
          <button
            onClick={() => setMixerMinimized(!mixerMinimized)}
            title={mixerMinimized ? 'Restore' : 'Minimize'}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#505068', lineHeight: 1,
              padding: '0 4px 2px', display: 'flex', alignItems: 'flex-end',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-default)'}
            onMouseLeave={e => e.currentTarget.style.color = '#505068'}
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => setMixerOpen(false)}
            title="Close"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#505068', lineHeight: 1,
              padding: '0 2px', display: 'flex', alignItems: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-default)'}
            onMouseLeave={e => e.currentTarget.style.color = '#505068'}
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Body — hidden when minimized; only header bar remains visible ───── */}
      <div style={{
        display: mixerMinimized ? 'none' : 'flex', gap: STRIP_GAP,
        padding: BODY_PAD,
        alignItems: 'flex-start',
      }}>

        {/* ── Scrollable channel strip row ────────────────────────────────── */}
        <div
          ref={scrollRef}
          className="mixer-scroll"
          onMouseDown={handleScrollMouseDown}
          onWheel={handleWheel}
          style={{
            flex: 1, minWidth: 0,
            display: 'flex', gap: STRIP_GAP,
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

        {/* ── Master strip — always visible, never scrolls ────────────────── */}
        <div style={{ flexShrink: 0 }}>
          <MasterStrip />
        </div>

      </div>
    </div>
  )
}
