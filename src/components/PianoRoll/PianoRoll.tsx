import React, { useEffect, useRef } from 'react'
import { Application, Graphics } from 'pixi.js'
import { useStore } from '../../store'
import { isBlackKey } from '../../utils/midiParser'

// These match Keyboard.tsx exactly
const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

const VISIBLE_SECONDS = 6
const NOTE_RADIUS = 3
const MIN_NOTE_H = 4
const PLAYHEAD_RATIO = 0.80

interface KeyLayout { x: number; width: number }

interface FlatNote { midi: number; time: number; duration: number; trackIndex: number }

function lowerBound(notes: FlatNote[], target: number): number {
  let lo = 0, hi = notes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (notes[mid].time < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

// Build layout for only the visible key range, spanning full canvas width W
function buildKeyLayout(W: number, midiMin: number, midiMax: number): KeyLayout[] {
  const totalKeys = midiMax - midiMin + 1
  const whites: number[] = []
  for (let m = midiMin; m <= midiMax; m++) if (!isBlackKey(m)) whites.push(m)
  const ww = W / whites.length
  const bw = ww * 0.6
  const layout: KeyLayout[] = new Array(totalKeys)
  let wi = 0
  for (let m = midiMin; m <= midiMax; m++) {
    const idx = m - midiMin
    if (!isBlackKey(m)) { layout[idx] = { x: wi * ww, width: ww }; wi++ }
    else layout[idx] = { x: wi * ww - bw / 2, width: bw }
  }
  return layout
}

// ── LoopOverlay — amber band + draggable boundary lines over the waterfall ────
// Rendered as an HTML layer (not PixiJS) so it never touches the canvas internals.
// Uses the same time→Y formula as the PixiJS render loop.
// The two boundary lines have a 12px hit area and can be dragged up/down to
// adjust loopEnd (top line) and loopStart (bottom line) independently.
function LoopOverlay() {
  const loopStart        = useStore(s => s.loopStart)
  const loopEnd          = useStore(s => s.loopEnd)
  const loopRegionActive = useStore(s => s.loopRegionActive)
  const currentTime      = useStore(s => s.currentTime)
  const zoomLevel        = useStore(s => s.zoomLevel)

  const overlayRef  = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<'start' | 'end' | null>(null)

  // ── Global drag handlers — read everything from store so values are never stale ─
  useEffect(() => {
    const yToTime = (clientY: number): number => {
      const el = overlayRef.current
      if (!el) return 0
      const rect = el.getBoundingClientRect()
      const pct  = Math.max(0, Math.min(100, (clientY - rect.top) / rect.height * 100))
      const s    = useStore.getState()
      const vs   = VISIBLE_SECONDS / (s.zoomLevel ?? 1)
      return s.currentTime + vs * (1 - pct / (PLAYHEAD_RATIO * 100))
    }

    const onMove = (e: MouseEvent) => {
      const which = draggingRef.current
      if (!which) return
      const st  = useStore.getState()
      const dur = st.midi?.duration ?? Infinity
      const t   = Math.max(0, Math.min(dur, yToTime(e.clientY)))
      const ls  = st.loopStart ?? 0
      const le  = st.loopEnd   ?? 0
      if (which === 'end')   st.setLoopRegion(ls, Math.max(t, ls + 0.01))
      else                   st.setLoopRegion(Math.min(t, le - 0.01), le)
    }

    const onUp = () => { draggingRef.current = null }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup',   onUp)
    }
  }, [])

  if (loopStart === null || loopEnd === null) return null

  const visibleSecs = VISIBLE_SECONDS / (zoomLevel ?? 1)
  const timeToPct   = (t: number) =>
    PLAYHEAD_RATIO * 100 - ((t - currentTime) / visibleSecs) * (PLAYHEAD_RATIO * 100)

  const topPct    = Math.max(0, Math.min(100, timeToPct(loopEnd)))
  const botPct    = Math.max(0, Math.min(100, timeToPct(loopStart)))
  const heightPct = botPct - topPct
  if (heightPct <= 0) return null

  const amber     = loopRegionActive ? 'rgba(232,160,39,0.55)' : 'rgba(232,160,39,0.30)'
  const amberFill = loopRegionActive ? 'rgba(232,160,39,0.07)' : 'rgba(232,160,39,0.04)'

  // ── Shared style for draggable handle: 12px hit area centered on 2px visual line ─
  const handleWrap = (topPct: number): React.CSSProperties => ({
    position: 'absolute', left: 0, right: 0,
    top: `${topPct}%`, height: 12,
    transform: 'translateY(-6px)',
    cursor: 'ns-resize', pointerEvents: 'auto',
    display: 'flex', alignItems: 'center',
  })

  return (
    <div ref={overlayRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
      {/* Tinted band */}
      <div style={{
        position: 'absolute', left: 0, right: 0,
        top: `${topPct}%`, height: `${heightPct}%`,
        background: amberFill,
      }} />
      {/* Top boundary line — controls loopEnd */}
      <div
        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); draggingRef.current = 'end' }}
        style={handleWrap(topPct)}
      >
        <div style={{ width: '100%', height: 2, background: amber }} />
      </div>
      {/* Bottom boundary line — controls loopStart */}
      <div
        onMouseDown={e => { e.preventDefault(); e.stopPropagation(); draggingRef.current = 'start' }}
        style={handleWrap(botPct)}
      >
        <div style={{ width: '100%', height: 2, background: amber }} />
      </div>
    </div>
  )
}

export default function PianoRoll() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const gridRef = useRef<Graphics | null>(null)
  const notesRef = useRef<Graphics | null>(null)
  const playheadRef = useRef<Graphics | null>(null)
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const overlayCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const keyLayoutRef = useRef<KeyLayout[]>([])
  const storeRef = useRef(useStore.getState())
  // Track last drawn keyboard size so we redraw grid on change
  const lastKeySizeRef = useRef<number>(0)
  const lastMidiRef    = useRef<any>(null)
  const flatNotesRef   = useRef<FlatNote[]>([])
  const barStartsRef   = useRef<number[]>([])

  useEffect(() => useStore.subscribe((s) => { storeRef.current = s }), [])

  // ── Wheel to scrub ───────────────────────────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const { midi, currentTime, playbackState } = useStore.getState()
      if (!midi) return
      const step = e.shiftKey ? 10 : 2
      const delta = e.deltaY > 0 ? -step : step
      const newTime = Math.max(0, Math.min(midi.duration, currentTime + delta))
      if (playbackState === 'playing') {
        useStore.setState({ playbackState: 'paused' })
        setTimeout(() => useStore.setState({ currentTime: newTime, playbackState: 'playing' }), 20)
      } else {
        useStore.setState({ currentTime: newTime })
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // ── PixiJS canvas init ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return
    const el = containerRef.current
    const app = new Application()
    let roInstance: ResizeObserver

    app.init({
      background: 0x0f0f12,
      width: el.clientWidth || 800,
      height: el.clientHeight || 600,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (!containerRef.current) { app.destroy(false); return }
      el.appendChild(app.canvas)
      appRef.current = app

      // ── Canvas2D overlay for bar number labels (pointer-events: none) ────────
      const overlay = document.createElement('canvas')
      overlay.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none'
      overlay.width = el.clientWidth || 800
      overlay.height = el.clientHeight || 600
      el.appendChild(overlay)
      overlayCanvasRef.current = overlay
      overlayCtxRef.current = overlay.getContext('2d')

      const grid = new Graphics()
      const notes = new Graphics()
      const playhead = new Graphics()
      app.stage.addChild(grid)
      app.stage.addChild(notes)
      app.stage.addChild(playhead)
      gridRef.current = grid
      notesRef.current = notes
      playheadRef.current = playhead

      // ── Static grid: black key shading + octave dividers ──────────────────
      const drawGrid = (W: number, H: number, midiMin: number, midiMax: number) => {
        grid.clear()
        keyLayoutRef.current = buildKeyLayout(W, midiMin, midiMax)

        // Black key column shading — subtle, shows piano structure
        for (let m = midiMin; m <= midiMax; m++) {
          const key = keyLayoutRef.current[m - midiMin]
          if (!key) continue
          if (isBlackKey(m)) {
            grid.rect(key.x, 0, key.width, H)
            grid.fill({ color: 0x161620, alpha: 1 })
          }
        }

        // C-note octave dividers — one per octave boundary
        for (let m = midiMin; m <= midiMax; m++) {
          if (m % 12 !== 0) continue  // C notes only
          const key = keyLayoutRef.current[m - midiMin]
          if (!key) continue
          grid.rect(Math.round(key.x), 0, 1, H)
          grid.fill({ color: 0x2e2e48, alpha: 1 })
        }
      }

      // ── Main render loop (runs every animation frame) ──────────────────────
      const drawFrame = () => {
        // ── Defensive size sync — catches ResizeObserver timing gaps caused by ─
        // 60fps rAF loops in sibling components (e.g. KeyboardControls smoothing
        // hooks) that can produce transient layout changes between observer fires.
        const cw = el.clientWidth
        const ch = el.clientHeight
        if (cw > 0 && ch > 0 && (app.screen.width !== cw || app.screen.height !== ch)) {
          app.renderer.resize(cw, ch)
          const { keyboardSize: ks } = storeRef.current
          const { min: syncMin, max: syncMax } = RANGES[ks] ?? RANGES[88]
          drawGrid(cw, ch, syncMin, syncMax)
          if (overlayCanvasRef.current) {
            overlayCanvasRef.current.width = cw
            overlayCanvasRef.current.height = ch
          }
          return  // redraw with correct dimensions next frame
        }

        const { midi, currentTime, tracks, detectedKey, zoomLevel, appTheme, keyboardSize, showBarNumbers, barStarts: storeBars } = storeRef.current
        const transpose = (detectedKey as any)?.transpose ?? 0
        const W = app.screen.width
        const H = app.screen.height
        const py = H * PLAYHEAD_RATIO
        const visibleSecs = VISIBLE_SECONDS / (zoomLevel ?? 1)
        const pps = py / visibleSecs

        const { min: midiMin, max: midiMax } = RANGES[keyboardSize] ?? RANGES[88]
        const totalKeys = midiMax - midiMin + 1

        // Redraw static grid if keyboard size changed
        if (keyboardSize !== lastKeySizeRef.current) {
          lastKeySizeRef.current = keyboardSize
          drawGrid(W, H, midiMin, midiMax)
        }

        app.renderer.background.color = appTheme === 'warm' ? 0x12100e : 0x0f0f12

        // Playhead — full width
        playhead.clear()
        playhead.rect(0, py, W + 1, 2)
        playhead.fill({ color: 0xe8a027, alpha: 0.85 })

        // Notes
        notes.clear()

        // ── Clear bar label overlay every frame ───────────────────────────────
        const ctx = overlayCtxRef.current
        const ov = overlayCanvasRef.current
        if (ctx && ov) ctx.clearRect(0, 0, ov.width, ov.height)

        if (!midi) return

        const visStart = currentTime - visibleSecs * (1 - PLAYHEAD_RATIO)
        const visEnd   = currentTime + visibleSecs * PLAYHEAD_RATIO

        // ── Rebuild flat note array once per MIDI file load ──────────────────
        if (midi !== lastMidiRef.current) {
          lastMidiRef.current = midi

          // Flat sorted note array for O(log N) binary search per frame
          const flat: FlatNote[] = []
          for (const track of midi.tracks) {
            for (const note of track.notes) {
              flat.push({ midi: note.midi, time: note.time, duration: note.duration, trackIndex: track.index })
            }
          }
          flat.sort((a, b) => a.time - b.time)
          flatNotesRef.current = flat
        }

        // ── Bar starts come from the store (computed once in parseMidiBuffer) ─
        barStartsRef.current = storeBars

        // O(1) track state + color lookup for this frame
        const trackMap = new Map<number, { visible: boolean; muted: boolean; color: string }>()
        for (const t of tracks) trackMap.set(t.index, t)

        // Binary search to window start — O(log N) entry, then O(visible notes) only
        const flat     = flatNotesRef.current
        const startIdx = lowerBound(flat, visStart - visibleSecs) // one extra window back catches long sustained notes
        for (let i = startIdx; i < flat.length; i++) {
          const note = flat[i]
          if (note.time > visEnd) break
          if (note.time + note.duration < visStart) continue

          const ts = trackMap.get(note.trackIndex)
          if (ts && (!ts.visible || ts.muted)) continue

          const idx = (note.midi + transpose) - midiMin
          if (idx < 0 || idx >= totalKeys) continue
          const key = keyLayoutRef.current[idx]
          if (!key) continue

          const color  = parseInt((ts?.color ?? '#e8a027').replace('#', ''), 16)
          const topY   = py - (note.time + note.duration - currentTime) * pps
          const botY   = py - (note.time - currentTime) * pps
          const noteH  = Math.max(botY - topY, MIN_NOTE_H)

          notes.roundRect(key.x + 1, topY, Math.max(key.width - 2, 1), noteH, NOTE_RADIUS)
          notes.fill({ color, alpha: 0.9 })
          notes.rect(key.x + 1, topY, Math.max(key.width - 2, 1), 2)
          notes.fill({ color: 0xffffff, alpha: 0.25 })
        }

        // ── Bar lines + bar number labels ────────────────────────────────────
        if (!showBarNumbers || !ctx) return
        const bStarts = barStartsRef.current
        if (bStarts.length === 0) return

        // Find which bar currentTime is in (scan all — no early break since times are ascending)
        let currentBarIdx = 0
        for (let i = 0; i < bStarts.length; i++) {
          if (bStarts[i] <= currentTime) currentBarIdx = i
        }

        // Find first visible bar: last bar whose start is <= visEnd (bottom of viewport)
        // then walk back until barY > H to find the first one in range
        ctx.font = 'bold 11px "JetBrains Mono", monospace'
        ctx.textBaseline = 'alphabetic'

        for (let bi = 0; bi < bStarts.length; bi++) {
          const barY = py - (bStarts[bi] - currentTime) * pps

          // Skip bars whose line is below the visible area
          if (barY > H + 20) continue
          // Stop once we've gone past the top of the viewport
          if (barY < -20) break

          // ── Horizontal bar line ──────────────────────────────────────────
          ctx.globalAlpha = 0.5
          ctx.fillStyle = '#1e1e38'
          ctx.fillRect(0, Math.round(barY), W, 1)

          // ── Pill + label ─────────────────────────────────────────────────
          const isCurrent = bi === currentBarIdx
          const label = String(bi + 1)
          const tw = ctx.measureText(label).width
          const pillX = 4, pillY = Math.round(barY) - 18, pillW = tw + 8, pillH = 16

          ctx.globalAlpha = isCurrent ? 1 : 0.8
          ctx.fillStyle = isCurrent ? '#e8a027' : '#0d0d18'
          ctx.beginPath()
          if ((ctx as any).roundRect) {
            ;(ctx as any).roundRect(pillX, pillY, pillW, pillH, 3)
          } else {
            ctx.rect(pillX, pillY, pillW, pillH)
          }
          ctx.fill()

          ctx.globalAlpha = 1
          ctx.fillStyle = isCurrent ? '#0f0f12' : '#e8a027'
          ctx.fillText(label, pillX + 4, Math.round(barY) - 5)
        }

        ctx.globalAlpha = 1
      }

      // Initial draw using current keyboard size
      const { keyboardSize } = useStore.getState()
      const { min: initMin, max: initMax } = RANGES[keyboardSize] ?? RANGES[88]
      lastKeySizeRef.current = keyboardSize
      drawGrid(app.screen.width, app.screen.height, initMin, initMax)

      app.ticker.add(() => drawFrame())

      roInstance = new ResizeObserver(() => {
        if (!appRef.current) return
        const w = el.clientWidth
        const h = el.clientHeight
        appRef.current.renderer.resize(w, h)
        const { keyboardSize } = useStore.getState()
        const { min, max } = RANGES[keyboardSize] ?? RANGES[88]
        drawGrid(w, h, min, max)
        // Resize overlay canvas to match
        if (overlayCanvasRef.current) {
          overlayCanvasRef.current.width = w
          overlayCanvasRef.current.height = h
        }
      })
      roInstance.observe(el)
    })

    return () => {
      roInstance?.disconnect()
      if (overlayCanvasRef.current) {
        try { overlayCanvasRef.current.remove() } catch {}
        overlayCanvasRef.current = null
        overlayCtxRef.current = null
      }
      if (appRef.current) {
        try { appRef.current.canvas.remove() } catch {}
        try { appRef.current.destroy(false) } catch {}
        appRef.current = null
      }
    }
  }, [])

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', background: 'var(--bg, #0f0f12)', overflow: 'hidden', position: 'relative' }}
    >
      <LoopOverlay />
    </div>
  )
}
