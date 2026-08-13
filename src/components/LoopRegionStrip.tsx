// ── Loop Region Strip — interactive 24px timeline strip below the scrub bar ──
// Canvas-based; width matches the scrub slider via identical spacer layout.
// Draws: note density ticks, selection region with handles, live playhead.
// Drag to create a region; drag handles to adjust; click outside to clear.
// Selection endpoints snap to nearest bar boundary on release.

import React, { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { useStore } from '../store'

const STRIP_H       = 24
const HANDLE_VIS_W  = 4   // drawn width — thin enough not to hide small selections
const HANDLE_HIT_W  = 8   // mouse hit radius — wider for usability

// ── Canvas colors resolved from CSS custom properties ─────────────────────────
// Canvas2D ctx.fillStyle can't resolve a var() string directly, so these are
// resolved once from index.css tokens via getComputedStyle (called on mount) —
// index.css stays the single source of truth. Defaults here only cover the
// sliver of first render before the mount effect runs. Same pattern as
// ChannelStrip.tsx / MasterStrip.tsx / PianoRoll.tsx.
let BG_COLOR           = '#0d0d16'  // --bg-row (near-match snap)
let DENSITY_TICK_COLOR = '#b5b7bc'  // --text-dim
let SELECTION_FILL     = 'rgba(232, 160, 39, 0.15)'  // --accent-amber-strip-fill
let SELECTION_BORDER   = 'rgba(232, 160, 39, 0.85)'  // --accent-amber-strip-border
let HANDLE_COLOR       = '#e8a027'  // --text-amber
let PLAYHEAD_LINE_COLOR = '#e8e8e8' // --key-white-bg (exact match, shared with Keyboard.tsx)

function resolveLoopStripColorsFromCSS() {
  const cs = getComputedStyle(document.documentElement)
  const read = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback
  BG_COLOR            = read('--bg-row', BG_COLOR)
  DENSITY_TICK_COLOR  = read('--text-dim', DENSITY_TICK_COLOR)
  SELECTION_FILL      = read('--accent-amber-strip-fill', SELECTION_FILL)
  SELECTION_BORDER    = read('--accent-amber-strip-border', SELECTION_BORDER)
  HANDLE_COLOR        = read('--text-amber', HANDLE_COLOR)
  PLAYHEAD_LINE_COLOR = read('--key-white-bg', PLAYHEAD_LINE_COLOR)
}

// ── Long-press chevron: click = single step, hold = accelerating repeat ───────
function LongPressChevron({ children, onStep }: { children: React.ReactNode; onStep: () => void }) {
  const onStepRef = useRef(onStep)
  useEffect(() => { onStepRef.current = onStep }, [onStep])

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef  = useRef<ReturnType<typeof setTimeout>  | null>(null)
  const stepsRef    = useRef(0)

  const stop = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (timeoutRef.current)  { clearTimeout(timeoutRef.current);   timeoutRef.current  = null }
    stepsRef.current = 0
  }, [])

  const start = useCallback(() => {
    onStepRef.current()
    stepsRef.current = 0
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onStepRef.current()
        stepsRef.current++
      }, Math.max(40, 120 - stepsRef.current * 4))
    }, 400)
  }, [])

  useEffect(() => () => stop(), [stop])

  return (
    <button
      onMouseDown={start}
      onMouseUp={stop}
      onMouseLeave={stop}
      style={{ background: 'none', border: 'none', color: 'var(--text-amber)', cursor: 'pointer', padding: '1px 2px', lineHeight: 0, display: 'flex' }}
    >
      {children}
    </button>
  )
}

// ── Snap a time value to the nearest bar boundary ─────────────────────────────
function snapToBar(time: number, barStarts: number[], duration: number): number {
  const candidates = barStarts.length > 0 ? [...barStarts, duration] : [0, duration]
  let nearest = candidates[0]
  let nearestDist = Math.abs(time - nearest)
  for (const b of candidates) {
    const d = Math.abs(time - b)
    if (d < nearestDist) { nearest = b; nearestDist = d }
  }
  return nearest
}

// ── Bar index (1-based) for a time value ──────────────────────────────────────
function timeToBar(time: number, barStarts: number[]): number {
  let bar = 1
  for (let i = 0; i < barStarts.length; i++) {
    if (barStarts[i] <= time) bar = i + 1
  }
  return bar
}

// ── Displayed end bar: loopEnd snaps to a bar START, so subtract 1 unless
//    we're at the very end of the file (past the last bar start) ──────────────
function displayEndBar(endTime: number, barStarts: number[], startBar: number): number {
  const rawEnd = timeToBar(endTime, barStarts)
  const pastLastBarStart = barStarts.length === 0 || endTime > barStarts[barStarts.length - 1] + 0.001
  return Math.max(startBar, pastLastBarStart ? rawEnd : rawEnd - 1)
}

type DragMode = 'new' | 'left' | 'right'

interface DragState {
  mode: DragMode
  anchorX: number
  anchorTime: number
  startedDragging: boolean
  freeSnap: boolean  // true when Alt held at drag start → skip bar snapping on release
}

// ── LoopRegionStrip — canvas timeline for drag-to-select loop sections ───────
export default function LoopRegionStrip() {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const storeRef     = useRef(useStore.getState())
  const densityRef   = useRef<number[]>([])
  const dragRef      = useRef<DragState | null>(null)
  const previewRef   = useRef<{ start: number; end: number } | null>(null)
  const iconBtnRef   = useRef<HTMLButtonElement>(null)
  const popupRef     = useRef<HTMLDivElement>(null)

  const [popupOpen, setPopupOpen] = useState(false)
  const [fromBar, setFromBar]     = useState(1)
  const [toBar, setToBar]         = useState(4)

  // ── Keep storeRef current ──────────────────────────────────────────────────
  useEffect(() => useStore.subscribe(s => { storeRef.current = s }), [])

  // ── Recompute density positions whenever midi changes ─────────────────────
  // Also runs immediately on mount so ticks are populated after a re-toggle
  // (component unmounts when loopRegionEnabled is off; subscribe alone won't
  // fire on remount because midi itself hasn't changed).
  useEffect(() => {
    const computeDensity = (s: ReturnType<typeof useStore.getState>) => {
      if (!s.midi) { densityRef.current = []; return }
      const positions: number[] = []
      for (const t of s.midi.tracks) {
        for (const n of t.notes) {
          if (s.midi.duration > 0) positions.push(n.time / s.midi.duration)
        }
      }
      densityRef.current = positions
    }
    computeDensity(useStore.getState())
    return useStore.subscribe(computeDensity)
  }, [])

  // ── rAF draw loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    let animId: number
    resolveLoopStripColorsFromCSS()

    const draw = () => {
      const canvas = canvasRef.current
      if (!canvas) { animId = requestAnimationFrame(draw); return }
      const ctx = canvas.getContext('2d')
      if (!ctx) { animId = requestAnimationFrame(draw); return }

      const W = canvas.offsetWidth
      const H = STRIP_H
      if (W === 0) { animId = requestAnimationFrame(draw); return }

      // ── Resize canvas to physical pixels (DPR) ────────────────────────────
      const dpr   = window.devicePixelRatio || 1
      const physW = Math.round(W * dpr)
      const physH = Math.round(H * dpr)
      if (canvas.width !== physW || canvas.height !== physH) {
        canvas.width  = physW
        canvas.height = physH
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      const { midi, currentTime, loopStart, loopEnd, barStarts } = storeRef.current
      const duration = midi?.duration ?? 0

      const preview      = previewRef.current
      const displayStart = preview?.start ?? loopStart
      const displayEnd   = preview?.end   ?? loopEnd

      // ── Background ────────────────────────────────────────────────────────
      ctx.fillStyle = BG_COLOR
      ctx.fillRect(0, 0, W, H)

      // ── Note density ticks ────────────────────────────────────────────────
      if (duration > 0 && densityRef.current.length > 0) {
        const BUCKET_PX = 2
        const numBuckets = Math.max(1, Math.ceil(W / BUCKET_PX))
        const counts = new Array(numBuckets).fill(0)
        for (const pos of densityRef.current) {
          const bi = Math.floor(pos * numBuckets)
          if (bi >= 0 && bi < numBuckets) counts[bi]++
        }
        const maxCount = Math.max(1, ...counts)
        ctx.fillStyle = DENSITY_TICK_COLOR
        for (let i = 0; i < numBuckets; i++) {
          if (counts[i] === 0) continue
          const norm  = counts[i] / maxCount
          const tickH = 4 + norm * 8
          ctx.fillRect(i * BUCKET_PX, (H - tickH) / 2, BUCKET_PX - 1, tickH)
        }
      }

      // ── Loop selection region ─────────────────────────────────────────────
      if (displayStart !== null && displayEnd !== null && duration > 0) {
        const x1 = (displayStart / duration) * W
        const x2 = (displayEnd   / duration) * W

        // Amber fill
        ctx.fillStyle = SELECTION_FILL
        ctx.fillRect(x1, 0, x2 - x1, H)

        // Top + bottom amber border
        ctx.fillStyle = SELECTION_BORDER
        ctx.fillRect(x1, 0, x2 - x1, 2)
        ctx.fillRect(x1, H - 2, x2 - x1, 2)

        // Left handle — thin vertical bar centered on boundary
        ctx.fillStyle = HANDLE_COLOR
        ctx.fillRect(x1 - HANDLE_VIS_W / 2, 0, HANDLE_VIS_W, H)

        // Right handle
        ctx.fillStyle = HANDLE_COLOR
        ctx.fillRect(x2 - HANDLE_VIS_W / 2, 0, HANDLE_VIS_W, H)

      }

      // ── Playhead — white line + amber triangle pointer at top ─────────────
      if (duration > 0 && midi) {
        const px = (currentTime / duration) * W
        ctx.fillStyle = PLAYHEAD_LINE_COLOR
        ctx.fillRect(Math.round(px), 0, 2, H)
        ctx.fillStyle = HANDLE_COLOR
        ctx.beginPath()
        ctx.moveTo(px - 4, 0)
        ctx.lineTo(px + 5, 0)
        ctx.lineTo(px + 1, 5)
        ctx.lineTo(px,     5)
        ctx.closePath()
        ctx.fill()
      }

      animId = requestAnimationFrame(draw)
    }

    animId = requestAnimationFrame(draw)
    return () => cancelAnimationFrame(animId)
  }, [])

  // ── Global mouse move / up (defined once in useEffect, access refs only) ──
  useEffect(() => {
    const xToTime = (clientX: number): number => {
      const canvas = canvasRef.current
      if (!canvas) return 0
      const rect = canvas.getBoundingClientRect()
      return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) * (storeRef.current.midi?.duration ?? 0)
    }

    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left

      if (!drag.startedDragging && Math.abs(x - drag.anchorX) > 3) drag.startedDragging = true
      if (!drag.startedDragging) return

      const duration = storeRef.current.midi?.duration ?? 0
      if (duration === 0) return
      const time = Math.max(0, Math.min(duration, xToTime(e.clientX)))

      if (drag.mode === 'new') {
        previewRef.current = {
          start: Math.min(drag.anchorTime, time),
          end:   Math.max(drag.anchorTime, time),
        }
      } else if (drag.mode === 'left') {
        const prev = previewRef.current!
        previewRef.current = { start: Math.min(time, prev.end - 0.01), end: prev.end }
      } else {
        const prev = previewRef.current!
        previewRef.current = { start: prev.start, end: Math.max(time, prev.start + 0.01) }
      }
    }

    const onUp = (e: MouseEvent) => {
      const drag = dragRef.current
      dragRef.current = null
      if (!drag) return

      const { midi, barStarts, loopStart, loopEnd } = storeRef.current
      if (!midi) { previewRef.current = null; return }

      if (!drag.startedDragging) {
        // ── Click (no drag): clear if outside current selection ─────────────
        if (loopStart !== null && loopEnd !== null) {
          const canvas = canvasRef.current
          if (canvas) {
            const rect = canvas.getBoundingClientRect()
            const x = e.clientX - rect.left
            const W = rect.width
            const x1 = (loopStart / midi.duration) * W
            const x2 = (loopEnd   / midi.duration) * W
            if (x < x1 - HANDLE_HIT_W || x > x2 + HANDLE_HIT_W) {
              useStore.getState().clearLoopRegion()
            }
          }
        }
        previewRef.current = null
        return
      }

      // ── Finalize with bar snapping ─────────────────────────────────────────
      const preview = previewRef.current
      previewRef.current = null
      if (!preview) return

      const snappedStart = drag.freeSnap ? preview.start : snapToBar(preview.start, barStarts, midi.duration)
      const snappedEnd   = drag.freeSnap ? preview.end   : snapToBar(preview.end,   barStarts, midi.duration)

      if (Math.abs(snappedStart - snappedEnd) < 0.01) {
        useStore.getState().clearLoopRegion()
        return
      }

      useStore.getState().setLoopRegion(
        Math.min(snappedStart, snappedEnd),
        Math.max(snappedStart, snappedEnd),
      )
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  // ── Close popup when clicking outside it ──────────────────────────────────
  // Attaching this listener is deferred by one tick (setTimeout 0) instead of
  // happening synchronously in the same effect flush that opens the popup —
  // without the defer, the SAME mousedown that opened it (via handleIconClick
  // on the button's onClick, which fires after mousedown) can end up caught
  // by this listener the instant it attaches, since effects run before the
  // browser has fully finished that event's dispatch in some cases. That's
  // what made this intermittent: sometimes the listener attached late enough
  // to miss it, sometimes not — the popup would open and immediately close
  // again, or not visibly open at all. Deferring one tick guarantees the
  // opening interaction has completely finished before this can fire at all.
  useEffect(() => {
    if (!popupOpen) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popupRef.current && !popupRef.current.contains(target) &&
        iconBtnRef.current && !iconBtnRef.current.contains(target)
      ) {
        setPopupOpen(false)
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler) }
  }, [popupOpen])

  // ── Open popup and sync inputs from current selection ─────────────────────
  const handleIconClick = () => {
    if (popupOpen) { setPopupOpen(false); return }
    const { loopStart, loopEnd, barStarts } = storeRef.current
    const totalBars = barStarts.length
    if (loopStart !== null && loopEnd !== null && barStarts.length > 0) {
      const sBar = timeToBar(loopStart, barStarts)
      const eBar = displayEndBar(loopEnd, barStarts, sBar)
      setFromBar(sBar)
      setToBar(eBar)
    } else {
      setFromBar(1)
      setToBar(Math.min(4, totalBars || 4))
    }
    setPopupOpen(true)
  }

  // ── Apply manual bar range selection ──────────────────────────────────────
  const applyBarRange = () => {
    const { barStarts, midi } = storeRef.current
    if (!midi || barStarts.length === 0) return
    const totalBars = barStarts.length
    const from = Math.max(1, Math.min(fromBar, totalBars))
    const to   = Math.max(from, Math.min(toBar, totalBars))
    const startTime = barStarts[from - 1]
    // loopEnd = start of bar (to+1); if to is the last bar, use midi.duration
    const endTime   = to < totalBars ? barStarts[to] : midi.duration
    useStore.getState().setLoopRegion(startTime, endTime)
    setPopupOpen(false)
  }

  // ── Canvas mousedown — determine drag mode ─────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { loopStart, loopEnd, midi } = storeRef.current
    if (!midi) return
    e.preventDefault()

    const canvas = canvasRef.current!
    const rect   = canvas.getBoundingClientRect()
    const x      = e.clientX - rect.left
    const W      = rect.width
    const dur    = midi.duration
    const time   = Math.max(0, Math.min(dur, (x / W) * dur))

    let mode: DragMode = 'new'

    if (loopStart !== null && loopEnd !== null) {
      const lx = (loopStart / dur) * W
      const rx = (loopEnd   / dur) * W
      if (Math.abs(x - lx) <= HANDLE_HIT_W) {
        mode = 'left'
        previewRef.current = { start: loopStart, end: loopEnd }
      } else if (Math.abs(x - rx) <= HANDLE_HIT_W) {
        mode = 'right'
        previewRef.current = { start: loopStart, end: loopEnd }
      }
    }

    dragRef.current = { mode, anchorX: x, anchorTime: time, startedDragging: false, freeSnap: e.altKey }
  }

  // ── Cursor feedback over handles ──────────────────────────────────────────
  const handleMouseMoveCanvas = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const { loopStart, loopEnd, midi } = storeRef.current
    if (!midi || loopStart === null || loopEnd === null) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x    = e.clientX - rect.left
    const W    = rect.width
    const lx   = (loopStart / midi.duration) * W
    const rx   = (loopEnd   / midi.duration) * W
    const near = Math.abs(x - lx) <= HANDLE_HIT_W || Math.abs(x - rx) <= HANDLE_HIT_W
    e.currentTarget.style.cursor = near ? 'ew-resize' : 'crosshair'
  }

  // ── Reactive selection state: icon color + bars label DOM element ────────
  // All selectors return primitives or stable refs — never new objects.
  // A selector returning `{ startBar, endBar }` breaks useSyncExternalStore
  // (new reference each call → React detects snapshot inconsistency → crash).
  const hasSelection   = useStore(s => s.loopStart !== null)
  const totalBars      = useStore(s => s.barStarts.length) || 999
  const loopStartLabel = useStore(s => s.loopStart)
  const loopEndLabel   = useStore(s => s.loopEnd)
  const barStartsLabel = useStore(s => s.barStarts)

  // Derived in render body — safe since it's not passed through useStore
  const loopBarRange = (loopStartLabel !== null && loopEndLabel !== null)
    ? (() => {
        const sb = timeToBar(loopStartLabel, barStartsLabel)
        const eb = displayEndBar(loopEndLabel, barStartsLabel, sb)
        return { startBar: sb, endBar: eb }
      })()
    : null

  return (
    <>
      {/* ── Canvas — fills the shared 400px wrapper in TopBar ─────────────── */}
      <canvas
        ref={canvasRef}
        className="app-no-drag"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMoveCanvas}
        onDoubleClick={() => useStore.getState().clearLoopRegion()}
        onDragStart={e => e.preventDefault()}
        draggable={false}
        title={hasSelection
          ? 'Click outside selection to reset · Drag handles to adjust'
          : 'Drag to select a bar range · Alt+drag on waterfall for precise timing'}
        style={{ display: 'block', width: '100%', height: STRIP_H, cursor: 'crosshair' }}
      />

      {/* ── Icon + bars + popup — anchored outside the wrapper's right edge ── */}
      {/* app-no-drag: this whole strip sits inside TopBar's app-drag-region
          (Electron -webkit-app-region: drag, for native window dragging).
          Without this class, real OS-level mouse clicks on the icon are
          intercepted as a window-drag gesture before React ever sees them —
          the button still LOOKS clickable and synthetic JS-dispatched click
          events still fire (they bypass the native OS interception), which
          is what made this so easy to falsely "verify" as working. ────────── */}
      <div className="app-no-drag" style={{ position: 'absolute', left: 'calc(100% + 8px)', top: 0, height: STRIP_H, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            ref={iconBtnRef}
            onClick={handleIconClick}
            title="Select bar range manually"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 20, height: STRIP_H,
              background: 'transparent', border: 'none', cursor: 'pointer', padding: 0,
              color: hasSelection || popupOpen ? 'var(--text-amber)' : 'var(--text-inactive)',
              transition: 'color 0.12s',
            }}
            onMouseEnter={e => { if (!hasSelection && !popupOpen) e.currentTarget.style.color = 'var(--text-muted)' }}
            onMouseLeave={e => { if (!hasSelection && !popupOpen) e.currentTarget.style.color = 'var(--text-inactive)' }}
          >
            {/* ArrowUp01 icon — ascending numeric sort */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m3 8 4-4 4 4"/>
              <path d="M7 4v16"/>
              <rect x="15" y="4" width="4" height="6" ry="2"/>
              <path d="M17 20v-6h-2"/>
              <path d="M15 20h4"/>
            </svg>
          </button>

          {/* Bars range label — visible only when selection exists, always amber */}
          {loopBarRange && (
            <span style={{
              color: 'var(--text-amber)',
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 10,
              whiteSpace: 'nowrap',
              letterSpacing: '0.02em',
            }}>
              bars {loopBarRange.startBar}–{loopBarRange.endBar}
            </span>
          )}

        {/* ── Bar range popup ──────────────────────────────────────────────── */}
        {/* Portaled to document.body, position: fixed off the icon button's
            real screen rect — the popup used to be position:absolute inside
            TopBar, which clipped/buried it behind the piano roll (a later,
            higher-painting sibling in the DOM) instead of floating above
            everything. Same escape-the-parent-stacking-context pattern as
            every other floating panel in the app (ScaleExplorer, FileInfoModal). */}
        {popupOpen && createPortal(
          <div
            ref={popupRef}
            className="orfeo-modal-glow"
            style={{
              position: 'fixed',
              top: (iconBtnRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
              left: iconBtnRef.current?.getBoundingClientRect().left ?? 0,
              background: 'var(--bg-tile)',
              border: '1px solid var(--border-popup)',
              borderRadius: 6,
              padding: '10px 12px',
              zIndex: 200,
              width: 158,
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              '--_modal-shadow': 'var(--elevation-strip)',
            } as CSSProperties}
          >
            {/* Header */}
            <div style={{
              fontSize: 9,
              color: 'var(--text-muted)',
              fontFamily: 'Inter, sans-serif',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
            }}>
              Bar Range
            </div>

            {/* From row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dimmest)', fontFamily: 'Inter, sans-serif', minWidth: 28 }}>From</span>
              <input
                type="text"
                inputMode="numeric"
                value={fromBar}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  if (!raw) return
                  const v = Math.max(1, Math.min(totalBars, parseInt(raw, 10)))
                  setFromBar(v)
                  if (toBar < v) setToBar(v)
                }}
                style={{
                  width: 48, background: 'var(--bg-row)', border: '1px solid var(--border-popup)',
                  borderRadius: 4, color: 'var(--text-dim)', fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 'var(--text-sm)', padding: '3px 6px', outline: 'none', textAlign: 'center',
                  flexShrink: 0,
                }}
              />
              {/* Amber chevron steppers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <LongPressChevron onStep={() => { setFromBar(v => { const n = Math.min(totalBars, v + 1); if (toBar < n) setToBar(n); return n }) }}>
                  <ChevronUp size={11} strokeWidth={2.5} />
                </LongPressChevron>
                <LongPressChevron onStep={() => setFromBar(v => Math.max(1, v - 1))}>
                  <ChevronDown size={11} strokeWidth={2.5} />
                </LongPressChevron>
              </div>
            </div>

            {/* To row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 10, color: 'var(--text-dimmest)', fontFamily: 'Inter, sans-serif', minWidth: 28 }}>To</span>
              <input
                type="text"
                inputMode="numeric"
                value={toBar}
                onChange={e => {
                  const raw = e.target.value.replace(/[^0-9]/g, '')
                  if (!raw) return
                  const v = Math.max(fromBar, Math.min(totalBars, parseInt(raw, 10)))
                  setToBar(v)
                }}
                style={{
                  width: 48, background: 'var(--bg-row)', border: '1px solid var(--border-popup)',
                  borderRadius: 4, color: 'var(--text-dim)', fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 'var(--text-sm)', padding: '3px 6px', outline: 'none', textAlign: 'center',
                  flexShrink: 0,
                }}
              />
              {/* Amber chevron steppers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <LongPressChevron onStep={() => setToBar(v => Math.min(totalBars, v + 1))}>
                  <ChevronUp size={11} strokeWidth={2.5} />
                </LongPressChevron>
                <LongPressChevron onStep={() => setToBar(v => Math.max(fromBar, v - 1))}>
                  <ChevronDown size={11} strokeWidth={2.5} />
                </LongPressChevron>
              </div>
            </div>

            {/* Apply */}
            <button
              onClick={applyBarRange}
              style={{
                background: 'var(--accent-amber-strip-apply-bg)', border: '1px solid var(--accent-amber-strong)',
                borderRadius: 4, color: 'var(--text-amber)', fontFamily: '"JetBrains Mono", monospace',
                fontSize: 'var(--text-xs)', padding: '4px 0', cursor: 'pointer',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-amber-strip-apply-bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'var(--accent-amber-strip-apply-bg)'}
            >
              Apply
            </button>
          </div>,
          document.body,
        )}
        </div>
      </div>
    </>
  )
}
