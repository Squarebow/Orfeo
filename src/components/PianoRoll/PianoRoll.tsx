import React, { useEffect, useRef, useState } from 'react'
import { Application, Graphics } from 'pixi.js'
import type { Track } from '@tonejs/midi'
import { useStore } from '../../store'
import { isBlackKey } from '../../utils/midiParser'
import { buildKeyLayout, PIANO_RANGES as RANGES, type KeyLayout } from '../../utils/keyLayout'
import { NES } from '../../utils/noteEditorState'
import {
  cmdAddNote, cmdRemoveNote, cmdRemoveNotes,
  type ToneNote,
} from '../../utils/noteEditorCommands'

const VISIBLE_SECONDS  = 6
const NOTE_RADIUS      = 3
const MIN_NOTE_H       = 4
const PLAYHEAD_RATIO   = 0.80
const RESIZE_ZONE_PX   = 6
const DRAG_THRESHOLD   = 4
const SEL_COLOR        = 0x4488ee

// ── FlatNote — used for the main render O(log N) binary search ────────────────
interface FlatNote { midi: number; time: number; duration: number; trackIndex: number }

// ── EditFlatNote — actual @tonejs/midi Note references for edit hit-testing ───
interface EditFlatNote {
  note:       ToneNote
  track:      Track
  key:        KeyLayout
  topY:       number   // screen Y of the note's visual top (= note END time)
  botY:       number   // screen Y of the note's visual bottom (= note START time)
  noteH:      number   // clamped height
  trackIndex: number
  color:      number   // track color as hex int
}

// ── EditDragState ─────────────────────────────────────────────────────────────
interface EditDragState {
  mode:              'note-move' | 'note-resize-end' | 'note-resize-start' | 'selection-move'
  note:              ToneNote
  track:             Track
  origTime:          number
  origDuration:      number
  origTicks:         number
  origDurationTicks: number
  origMidi:          number
  origNoteX:         number
  startClientX:      number
  startClientY:      number
  axis:              'time' | 'pitch' | null
  selectionSnapshot?: Array<{ note: ToneNote; origTime: number; origTicks: number }>
}

interface EditMarqueeState {
  startX: number; startY: number; endX: number; endY: number; additive: boolean
}

function lowerBound(notes: FlatNote[], target: number): number {
  let lo = 0, hi = notes.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (notes[mid].time < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

// ── xToMidi — screen X → MIDI pitch via key layout ───────────────────────────
function xToMidi(x: number, layout: KeyLayout[], midiMin: number, midiMax: number): number {
  for (let m = midiMax; m >= midiMin; m--) {
    if (!isBlackKey(m)) continue
    const k = layout[m - midiMin]
    if (k && x >= k.x && x < k.x + k.width) return m
  }
  for (let m = midiMin; m <= midiMax; m++) {
    if (isBlackKey(m)) continue
    const k = layout[m - midiMin]
    if (k && x >= k.x && x < k.x + k.width) return m
  }
  return midiMin
}

// ── LoopOverlay — amber band + draggable boundary lines over the waterfall ────
function LoopOverlay() {
  const loopStart        = useStore(s => s.loopStart)
  const loopEnd          = useStore(s => s.loopEnd)
  const loopRegionActive = useStore(s => s.loopRegionActive)
  const currentTime      = useStore(s => s.currentTime)
  const zoomLevel        = useStore(s => s.zoomLevel)
  const noteEditorActive = useStore(s => s.noteEditorActive)

  const overlayRef  = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<'start' | 'end' | null>(null)
  const newDragRef  = useRef<{ anchorTime: number } | null>(null)
  const [altDown, setAltDown] = useState(false)

  // ── Track Alt key — enables waterfall draw mode ────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Alt') { e.preventDefault(); setAltDown(true) }
    }
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Alt') { setAltDown(false); newDragRef.current = null }
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup',   up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // ── Global mouse handlers ─────────────────────────────────────────────────
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
      const st  = useStore.getState()
      const dur = st.midi?.duration ?? Infinity
      const which = draggingRef.current
      if (which) {
        const t  = Math.max(0, Math.min(dur, yToTime(e.clientY)))
        const ls = st.loopStart ?? 0
        const le = st.loopEnd   ?? 0
        if (which === 'end') st.setLoopRegion(ls, Math.max(t, ls + 0.01))
        else                 st.setLoopRegion(Math.min(t, le - 0.01), le)
        return
      }
      const nd = newDragRef.current
      if (nd) {
        const t     = Math.max(0, Math.min(dur, yToTime(e.clientY)))
        const start = Math.min(nd.anchorTime, t)
        const end   = Math.max(nd.anchorTime, t)
        if (end - start > 0.01) st.setLoopRegion(start, end)
      }
    }
    const onUp = () => { draggingRef.current = null; newDragRef.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup',   onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  const handleOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!e.altKey) return
    e.preventDefault()
    const el = overlayRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const pct  = Math.max(0, Math.min(100, (e.clientY - rect.top) / rect.height * 100))
    const s    = useStore.getState()
    const vs   = VISIBLE_SECONDS / (s.zoomLevel ?? 1)
    newDragRef.current = { anchorTime: s.currentTime + vs * (1 - pct / (PLAYHEAD_RATIO * 100)) }
  }

  const handleWrap = (pct: number): React.CSSProperties => ({
    position: 'absolute', left: 0, right: 0,
    top: `${pct}%`, height: 12,
    transform: 'translateY(-6px)',
    cursor: 'ns-resize', pointerEvents: 'auto',
    display: 'flex', alignItems: 'center',
  })

  const hasSelection = loopStart !== null && loopEnd !== null
  const visibleSecs  = VISIBLE_SECONDS / (zoomLevel ?? 1)
  const timeToPct    = (t: number) =>
    PLAYHEAD_RATIO * 100 - ((t - currentTime) / visibleSecs) * (PLAYHEAD_RATIO * 100)

  const topPct    = hasSelection ? Math.max(0, Math.min(100, timeToPct(loopEnd!)))   : 0
  const botPct    = hasSelection ? Math.max(0, Math.min(100, timeToPct(loopStart!))) : 0
  const heightPct = botPct - topPct

  const amber     = loopRegionActive ? 'rgba(232,160,39,0.55)' : 'rgba(232,160,39,0.30)'
  const amberFill = loopRegionActive ? 'rgba(232,160,39,0.07)' : 'rgba(232,160,39,0.04)'

  // Edit mode disables loop overlay pointer events to pass them to PixiJS
  if (noteEditorActive) return null

  return (
    <div
      ref={overlayRef}
      onMouseDown={handleOverlayMouseDown}
      onDoubleClick={() => useStore.getState().clearLoopRegion()}
      title={altDown ? 'Drag to select loop region · Double-click to reset' : undefined}
      style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        pointerEvents: altDown ? 'auto' : 'none',
        cursor: altDown ? 'crosshair' : 'default',
      }}
    >
      {hasSelection && heightPct > 0 && (<>
        <div style={{
          position: 'absolute', left: 0, right: 0,
          top: `${topPct}%`, height: `${heightPct}%`,
          background: amberFill, pointerEvents: 'none',
        }} />
        <div
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); draggingRef.current = 'end' }}
          onDoubleClick={e => { e.stopPropagation(); useStore.getState().clearLoopRegion() }}
          title="Drag to adjust · Double-click to reset"
          style={handleWrap(topPct)}
        >
          <div style={{ width: '100%', height: 2, background: amber }} />
        </div>
        <div
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); draggingRef.current = 'start' }}
          onDoubleClick={e => { e.stopPropagation(); useStore.getState().clearLoopRegion() }}
          title="Drag to adjust · Double-click to reset"
          style={handleWrap(botPct)}
        >
          <div style={{ width: '100%', height: 2, background: amber }} />
        </div>
      </>)}
    </div>
  )
}

export default function PianoRoll() {
  const containerRef      = useRef<HTMLDivElement>(null)
  const appRef            = useRef<Application | null>(null)
  const gridRef           = useRef<Graphics | null>(null)
  const notesRef          = useRef<Graphics | null>(null)
  const playheadRef       = useRef<Graphics | null>(null)
  const overlayCanvasRef  = useRef<HTMLCanvasElement | null>(null)
  const overlayCtxRef     = useRef<CanvasRenderingContext2D | null>(null)
  const keyLayoutRef      = useRef<KeyLayout[]>([])
  const storeRef          = useRef(useStore.getState())
  const lastKeySizeRef    = useRef<number>(0)
  const lastMidiRef       = useRef<any>(null)
  const flatNotesRef      = useRef<FlatNote[]>([])
  const barStartsRef      = useRef<number[]>([])

  useEffect(() => useStore.subscribe((s) => { storeRef.current = s }), [])

  // ── Wheel to scrub — disabled in edit mode ───────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (storeRef.current.noteEditorActive) return
      const { midi, currentTime, playbackState } = useStore.getState()
      if (!midi) return
      const step  = e.shiftKey ? 10 : 2
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
      width:  el.clientWidth  || 800,
      height: el.clientHeight || 600,
      antialias:   true,
      resolution:  window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (!containerRef.current) { app.destroy(false); return }
      el.appendChild(app.canvas)
      appRef.current = app

      // ── Canvas2D overlay for bar number labels ────────────────────────────
      const overlay = document.createElement('canvas')
      overlay.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none'
      overlay.width  = el.clientWidth  || 800
      overlay.height = el.clientHeight || 600
      el.appendChild(overlay)
      overlayCanvasRef.current = overlay
      overlayCtxRef.current    = overlay.getContext('2d')

      const grid     = new Graphics()
      const notes    = new Graphics()
      const playhead = new Graphics()
      const editG    = new Graphics()   // edit overlay — must be last (on top)
      app.stage.addChild(grid)
      app.stage.addChild(notes)
      app.stage.addChild(playhead)
      app.stage.addChild(editG)
      gridRef.current     = grid
      notesRef.current    = notes
      playheadRef.current = playhead

      // ── Edit mode state — lives in closure, shared by drawFrame + pointer handlers ──
      let editFlatNotes:     EditFlatNote[]  = []
      let editSelectedNotes: Set<ToneNote>   = new Set()
      let editNewNotes:      Set<ToneNote>   = NES.newNotes   // reference to singleton set
      let editDrag:          EditDragState | null   = null
      let editMarquee:       EditMarqueeState | null = null
      let lastGlissandoMidi: number | null   = null

      // ── snapTick — quantize a tick value to the grid ──────────────────────
      const snapTick = (tick: number): number => {
        if (!NES.snapRef.current) return Math.max(0, tick)
        const ppq  = (storeRef.current.midi as any)?.header?.ppq ?? 480
        const unit = ppq / (NES.quantizeDivisorRef.current ?? 8)
        return Math.max(0, Math.round(tick / unit) * unit)
      }

      // ── syncNoteTimes — update note.time and note.duration from ticks ─────
      // @tonejs/midi does NOT auto-sync these; we must update them explicitly.
      const syncNoteTimes = (note: ToneNote) => {
        const header = (storeRef.current.midi as any)?.header
        if (!header) return
        note.time     = header.ticksToSeconds(note.ticks)
        note.duration = header.ticksToSeconds(note.ticks + note.durationTicks) - note.time
      }

      // ── buildEditFlatNotes — rebuild hit-testable note list for current viewport ──
      // Applies the same visibility gate as drawFrame (visible && !muted),
      // so tracks hidden via "hide in roll" are automatically excluded.
      const buildEditFlatNotes = (
        midi: any, py: number, pps: number, currentTime: number,
        midiMin: number, midiMax: number, transpose: number,
      ) => {
        editFlatNotes = []
        if (!midi) return

        const { tracks } = storeRef.current
        const trackMap = new Map<number, { visible: boolean; muted: boolean; color: string }>()
        for (const t of tracks) trackMap.set(t.index, t)

        const visStart = currentTime - (VISIBLE_SECONDS / (storeRef.current.zoomLevel ?? 1)) * (1 - PLAYHEAD_RATIO)
        const visEnd   = currentTime + (VISIBLE_SECONDS / (storeRef.current.zoomLevel ?? 1)) * PLAYHEAD_RATIO
        const totalKeys = midiMax - midiMin + 1

        for (const track of midi.tracks) {
          const ts = trackMap.get(track.index)
          if (!ts || !ts.visible || ts.muted) continue   // ← same gate as drawFrame
          const color = parseInt((ts.color ?? '#e8a027').replace('#', ''), 16)

          for (const note of track.notes) {
            if (note.time + note.duration < visStart) continue
            if (note.time > visEnd) break

            const idx = (note.midi + transpose) - midiMin
            if (idx < 0 || idx >= totalKeys) continue
            const key = keyLayoutRef.current[idx]
            if (!key) continue

            const topY  = py - (note.time + note.duration - currentTime) * pps
            const botY  = py - (note.time - currentTime) * pps
            const noteH = Math.max(botY - topY, MIN_NOTE_H)

            // Prune stale newNotes entries
            if (!track.notes.includes(note)) editNewNotes.delete(note)

            editFlatNotes.push({ note, track, key, topY, botY, noteH, trackIndex: track.index, color })
          }
        }
      }

      // ── editHitTest — find top-most note under pointer ────────────────────
      const editHitTest = (cx: number, cy: number): EditFlatNote | null => {
        for (let i = editFlatNotes.length - 1; i >= 0; i--) {
          const ef = editFlatNotes[i]
          const { key, topY, botY, noteH } = ef
          const actualBot = topY + noteH
          if (cx >= key.x - 2 && cx < key.x + key.width + 2 &&
              cy >= topY - 2 && cy < actualBot + 2) return ef
        }
        return null
      }

      // ── drawDashedRect — dashed outline for new/unsaved notes ────────────
      // PixiJS v8 does not expose CSS-style line dash; draw as short rect segments.
      const drawDashedRect = (
        g: Graphics, x: number, y: number, w: number, h: number,
        color: number, alpha: number,
      ) => {
        const DASH = 4, GAP = 3, UNIT = DASH + GAP
        const right = x + w, bottom = y + h
        // Top + bottom edges
        for (let px = x; px < right; px += UNIT) {
          const segW = Math.min(DASH, right - px)
          g.rect(px, y, segW, 1); g.fill({ color, alpha })
          g.rect(px, bottom - 1, segW, 1); g.fill({ color, alpha })
        }
        // Left + right edges
        for (let py = y; py < bottom; py += UNIT) {
          const segH = Math.min(DASH, bottom - py)
          g.rect(x, py, 1, segH); g.fill({ color, alpha })
          g.rect(right - 1, py, 1, segH); g.fill({ color, alpha })
        }
      }

      // ── drawEditOverlay — selection highlights + new-note dashed borders ──
      const drawEditOverlay = (
        midi: any, py: number, pps: number, currentTime: number,
        midiMin: number, midiMax: number, transpose: number,
      ) => {
        editG.clear()
        if (!storeRef.current.noteEditorActive || !midi) return

        // Rebuild flat notes every frame (positions are stable since scroll is frozen;
        // rebuilding every frame ensures drag-move preview is always current).
        buildEditFlatNotes(midi, py, pps, currentTime, midiMin, midiMax, transpose)

        for (const ef of editFlatNotes) {
          const { note, key, topY, noteH } = ef
          const isSelected = editSelectedNotes.has(note)
          const isNew      = editNewNotes.has(note)
          const isDragged  = note === editDrag?.note

          if (isSelected || isDragged) {
            editG.roundRect(key.x + 1, topY - 1, Math.max(key.width - 2, 1), noteH + 2, NOTE_RADIUS)
            editG.stroke({ color: SEL_COLOR, width: 2, alpha: 0.85 })
          }
          if (isNew) {
            drawDashedRect(
              editG, key.x + 1, topY, Math.max(key.width - 2, 1), noteH,
              0xdddddd, 0.80,
            )
          }
        }

        // ── Marquee selection rectangle ──────────────────────────────────────
        if (editMarquee) {
          const mx = Math.min(editMarquee.startX, editMarquee.endX)
          const my = Math.min(editMarquee.startY, editMarquee.endY)
          const mw = Math.abs(editMarquee.endX - editMarquee.startX)
          const mh = Math.abs(editMarquee.endY - editMarquee.startY)
          editG.rect(mx, my, mw, mh)
          editG.fill({ color: SEL_COLOR, alpha: 0.07 })
          editG.rect(mx, my, mw, mh)
          editG.stroke({ color: SEL_COLOR, width: 1, alpha: 0.45 })
        }
      }

      // ── Static grid: black key shading + octave dividers ──────────────────
      const drawGrid = (W: number, H: number, midiMin: number, midiMax: number) => {
        grid.clear()
        keyLayoutRef.current = buildKeyLayout(W, midiMin, midiMax)
        const kl = keyLayoutRef.current

        for (let m = midiMin; m <= midiMax; m++) {
          if (isBlackKey(m)) continue
          const key = kl[m - midiMin]
          if (!key) continue
          grid.rect(key.x, 0, key.width, H)
          grid.fill({ color: 0x171720, alpha: 1 })
        }
        for (let m = midiMin; m <= midiMax; m++) {
          if (!isBlackKey(m)) continue
          const key = kl[m - midiMin]
          if (!key) continue
          grid.rect(Math.round(key.x), 0, Math.round(key.width), H)
          grid.fill({ color: 0x0d0d10, alpha: 1 })
        }
        for (let m = midiMin; m <= midiMax; m++) {
          if (m % 12 !== 0) continue
          const key = kl[m - midiMin]
          if (!key) continue
          grid.rect(Math.round(key.x), 0, 1, H)
          grid.fill({ color: 0x2e2e48, alpha: 1 })
        }
      }

      // ── Main render loop ──────────────────────────────────────────────────
      const drawFrame = () => {
        const cw = el.clientWidth, ch = el.clientHeight
        if (cw > 0 && ch > 0 && (app.screen.width !== cw || app.screen.height !== ch)) {
          app.renderer.resize(cw, ch)
          const { keyboardSize: ks } = storeRef.current
          const { min: syncMin, max: syncMax } = RANGES[ks] ?? RANGES[88]
          drawGrid(cw, ch, syncMin, syncMax)
          if (overlayCanvasRef.current) {
            overlayCanvasRef.current.width = cw
            overlayCanvasRef.current.height = ch
          }
          return
        }

        const { midi, currentTime, tracks, detectedKey, zoomLevel, appTheme, keyboardSize, showBarNumbers, barStarts: storeBars, noteEditorActive } = storeRef.current
        const transpose   = (detectedKey as any)?.transpose ?? 0
        const W = app.screen.width, H = app.screen.height
        const py          = H * PLAYHEAD_RATIO
        const visibleSecs = VISIBLE_SECONDS / (zoomLevel ?? 1)
        const pps         = py / visibleSecs
        const { min: midiMin, max: midiMax } = RANGES[keyboardSize] ?? RANGES[88]
        const totalKeys   = midiMax - midiMin + 1

        if (keyboardSize !== lastKeySizeRef.current) {
          lastKeySizeRef.current = keyboardSize
          drawGrid(W, H, midiMin, midiMax)
        }

        // ── After edit commands: force flat-notes rebuild next frame ─────────
        if (noteEditorActive && NES.needsFlatRebuild) {
          NES.needsFlatRebuild = false
          lastMidiRef.current  = null
        }

        app.renderer.background.color = appTheme === 'warm' ? 0x12100e : 0x0f0f12

        playhead.clear()
        playhead.rect(0, py, W + 1, 2)
        playhead.fill({ color: 0xc6c8c8, alpha: 0.90 })

        notes.clear()

        const ctx = overlayCtxRef.current
        const ov  = overlayCanvasRef.current
        if (ctx && ov) ctx.clearRect(0, 0, ov.width, ov.height)

        if (!midi) { editG.clear(); return }

        const visStart = currentTime - visibleSecs * (1 - PLAYHEAD_RATIO)
        const visEnd   = currentTime + visibleSecs * PLAYHEAD_RATIO

        // ── Rebuild flat note array once per MIDI file load (or after edit) ──
        if (midi !== lastMidiRef.current) {
          lastMidiRef.current = midi
          const flat: FlatNote[] = []
          for (const track of midi.tracks) {
            for (const note of track.notes) {
              flat.push({ midi: note.midi, time: note.time, duration: note.duration, trackIndex: track.index })
            }
          }
          flat.sort((a, b) => a.time - b.time)
          flatNotesRef.current = flat
        }

        barStartsRef.current = storeBars

        const trackMap = new Map<number, { visible: boolean; muted: boolean; color: string }>()
        for (const t of tracks) trackMap.set(t.index, t)

        const flat     = flatNotesRef.current
        const startIdx = lowerBound(flat, visStart - visibleSecs)
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

        // ── Edit overlay (drawn after notes so it renders on top) ─────────────
        drawEditOverlay(midi, py, pps, currentTime, midiMin, midiMax, transpose)

        // ── Bar lines + bar number labels ─────────────────────────────────────
        if (!showBarNumbers || !ctx) return
        const bStarts = barStartsRef.current
        if (bStarts.length === 0) return

        let currentBarIdx = 0
        for (let i = 0; i < bStarts.length; i++) {
          if (bStarts[i] <= currentTime) currentBarIdx = i
        }

        ctx.font = 'bold 11px "JetBrains Mono", monospace'
        ctx.textBaseline = 'alphabetic'

        for (let bi = 0; bi < bStarts.length; bi++) {
          const barY = py - (bStarts[bi] - currentTime) * pps
          if (barY > H + 20) continue
          if (barY < -20) break

          ctx.globalAlpha = 0.5
          ctx.fillStyle = '#1e1e38'
          ctx.fillRect(0, Math.round(barY), W, 1)

          const isCurrent = bi === currentBarIdx
          const label = String(bi + 1)
          const tw = ctx.measureText(label).width
          const pillX = 4, pillY = Math.round(barY) - 18, pillW = tw + 8, pillH = 16

          ctx.globalAlpha = isCurrent ? 1 : 0.8
          ctx.fillStyle = isCurrent ? '#e8a027' : '#0d0d18'
          ctx.beginPath()
          if ((ctx as any).roundRect) { ;(ctx as any).roundRect(pillX, pillY, pillW, pillH, 3) }
          else { ctx.rect(pillX, pillY, pillW, pillH) }
          ctx.fill()

          ctx.globalAlpha = 1
          ctx.fillStyle = isCurrent ? '#0f0f12' : '#e8a027'
          ctx.fillText(label, pillX + 4, Math.round(barY) - 5)
        }

        ctx.globalAlpha = 1
      }

      // ── Edit pointer handlers ─────────────────────────────────────────────
      // Checked via storeRef.current.noteEditorActive — only active in edit mode.

      const toCanvas = (clientX: number, clientY: number) => {
        const r = app.canvas.getBoundingClientRect()
        return { cx: clientX - r.left, cy: clientY - r.top }
      }

      const getViewParams = () => {
        const { currentTime, zoomLevel, keyboardSize, detectedKey } = storeRef.current
        const H = app.screen.height
        const py = H * PLAYHEAD_RATIO
        const visibleSecs = VISIBLE_SECONDS / (zoomLevel ?? 1)
        const pps = py / visibleSecs
        const { min: midiMin, max: midiMax } = RANGES[keyboardSize] ?? RANGES[88]
        const transpose = (detectedKey as any)?.transpose ?? 0
        return { currentTime, py, pps, midiMin, midiMax, transpose }
      }

      const updateHoverCursor = (cx: number, cy: number, ef: EditFlatNote | null) => {
        if (!storeRef.current.noteEditorActive) { app.canvas.style.cursor = 'default'; return }
        const tool = NES.toolModeRef.current
        if (tool === 'pencil') {
          if (ef) {
            const atEnd   = cy <= ef.topY + RESIZE_ZONE_PX
            const atStart = cy >= ef.topY + ef.noteH - RESIZE_ZONE_PX
            app.canvas.style.cursor = (atEnd || atStart) ? 'ns-resize' : 'move'
          } else {
            app.canvas.style.cursor = 'crosshair'
          }
        } else {
          app.canvas.style.cursor = ef ? 'move' : 'crosshair'
        }
      }

      // ── updateMarqueeSelection ────────────────────────────────────────────
      const updateMarqueeSelection = () => {
        if (!editMarquee) return
        const x1 = Math.min(editMarquee.startX, editMarquee.endX)
        const x2 = Math.max(editMarquee.startX, editMarquee.endX)
        const y1 = Math.min(editMarquee.startY, editMarquee.endY)
        const y2 = Math.max(editMarquee.startY, editMarquee.endY)
        if (!editMarquee.additive) editSelectedNotes.clear()
        for (const ef of editFlatNotes) {
          const { note, key, topY, noteH } = ef
          const botY = topY + noteH
          if (key.x + key.width > x1 && key.x < x2 && botY > y1 && topY < y2) {
            editSelectedNotes.add(note)
          }
        }
      }

      const onEditDown = (e: PointerEvent) => {
        if (!storeRef.current.noteEditorActive) return
        if (e.button !== 0) return
        const { cx, cy } = toCanvas(e.clientX, e.clientY)
        const { py, pps, midiMin, midiMax, currentTime } = getViewParams()
        const tool = NES.toolModeRef.current
        const ef   = editHitTest(cx, cy)

        if (tool === 'pencil') {
          if (ef) {
            const { note, track, key, topY, noteH } = ef
            ;(window as any).__orfeoPlayNote?.(note.midi)
            const atEnd   = cy <= topY + RESIZE_ZONE_PX
            const atStart = cy >= topY + noteH - RESIZE_ZONE_PX
            const mode: EditDragState['mode'] = atEnd   ? 'note-resize-end'
                                              : atStart ? 'note-resize-start'
                                              : 'note-move'
            editDrag = {
              mode, note, track,
              origTime: note.time, origDuration: note.duration,
              origTicks: note.ticks, origDurationTicks: note.durationTicks,
              origMidi: note.midi,
              origNoteX: key.x + key.width / 2,
              startClientX: e.clientX, startClientY: e.clientY,
              axis: null,
            }
            app.canvas.setPointerCapture(e.pointerId)
            app.canvas.style.cursor = (atEnd || atStart) ? 'ns-resize' : 'move'
          } else if (e.altKey) {
            // ── Alt+click: add a new note ──────────────────────────────────
            const midi = storeRef.current.midi
            if (!midi) return
            const clickTime = currentTime + (py - cy) / pps
            const header    = (midi as any).header
            const rawTick   = Math.round(header.secondsToTicks(Math.max(0, clickTime)))
            const startTick = snapTick(rawTick)
            const ppq       = header.ppq ?? 480
            const dur       = ppq

            // Find the first editable track (visible, not muted)
            const { tracks } = storeRef.current
            const trackMap   = new Map(tracks.map(t => [t.index, t]))
            const editTrack  = midi.tracks.find((t: any) => {
              const ts = trackMap.get(t.index)
              return ts && ts.visible && !ts.muted
            })
            if (!editTrack) return

            const midiNum = xToMidi(cx, keyLayoutRef.current, midiMin, midiMax)
            ;(window as any).__orfeoPlayNote?.(midiNum)

            const beforeSet = new Set((editTrack as any).notes)
            const cmd = cmdAddNote(editTrack as any, { midi: midiNum, ticks: startTick, durationTicks: dur, velocity: 0.8 })
            cmd.apply()
            const addedNote = (editTrack as any).notes.find((n: ToneNote) => !beforeSet.has(n)) as ToneNote | undefined
            if (addedNote) {
              syncNoteTimes(addedNote)
              editNewNotes.add(addedNote)
            }
            NES.history.push(cmd)
            NES.dirty              = true
            NES.needsFlatRebuild   = true
            NES.onHistoryChange?.()
          } else {
            if (editSelectedNotes.size > 0) editSelectedNotes.clear()
          }
        } else {
          // ── Select tool ───────────────────────────────────────────────────
          if (ef) {
            const { note, track, key } = ef
            ;(window as any).__orfeoPlayNote?.(note.midi)
            if (!e.shiftKey && !editSelectedNotes.has(note)) editSelectedNotes.clear()
            editSelectedNotes.add(note)
            editDrag = {
              mode: 'selection-move', note, track,
              origTime: note.time, origDuration: note.duration,
              origTicks: note.ticks, origDurationTicks: note.durationTicks,
              origMidi: note.midi,
              origNoteX: key.x + key.width / 2,
              startClientX: e.clientX, startClientY: e.clientY,
              axis: 'time',
              selectionSnapshot: [...editSelectedNotes].map(n => ({ note: n, origTime: n.time, origTicks: n.ticks })),
            }
            app.canvas.setPointerCapture(e.pointerId)
            app.canvas.style.cursor = 'move'
          } else {
            editMarquee = { startX: cx, startY: cy, endX: cx, endY: cy, additive: e.shiftKey }
            if (!e.shiftKey) editSelectedNotes.clear()
          }
        }
      }

      const onEditMove = (e: PointerEvent) => {
        if (!storeRef.current.noteEditorActive) return
        const { cx, cy } = toCanvas(e.clientX, e.clientY)
        const { py, pps } = getViewParams()

        if (!editDrag && !editMarquee) {
          const ef = editHitTest(cx, cy)
          updateHoverCursor(cx, cy, ef)
          return
        }

        if (editMarquee) {
          editMarquee = { ...editMarquee, endX: cx, endY: cy }
          updateMarqueeSelection()
          return
        }

        if (!editDrag) return

        // ── In PianoRoll, Y increases downward; moving a note DOWN = earlier (smaller time) ──
        const dy = e.clientY - editDrag.startClientY
        const dx = e.clientX - editDrag.startClientX

        if (editDrag.mode === 'note-resize-end') {
          // Top edge of note = note END time. Moving up (dy<0) = later end = longer duration.
          const newDuration = Math.max(0.02, editDrag.origDuration + (-dy / pps))
          editDrag.note.duration      = newDuration
          editDrag.note.durationTicks = Math.max(1, Math.round(
            (storeRef.current.midi as any)?.header?.secondsToTicks(newDuration) ?? newDuration * 480
          ))
          return
        }

        if (editDrag.mode === 'note-resize-start') {
          // Bottom edge of note = note START time. Moving down (dy>0) = earlier start.
          const origEnd     = editDrag.origTime + editDrag.origDuration
          const newTime     = Math.max(0, editDrag.origTime + (-dy / pps))
          const newDuration = Math.max(0.02, origEnd - newTime)
          editDrag.note.time     = newTime
          editDrag.note.duration = newDuration
          return
        }

        if (editDrag.mode === 'note-move') {
          if (editDrag.axis === null &&
              (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            editDrag.axis = Math.abs(dy) >= Math.abs(dx) ? 'time' : 'pitch'
            app.canvas.style.cursor = editDrag.axis === 'time' ? 'ns-resize' : 'ew-resize'
          }
          if (editDrag.axis === null) return

          if (editDrag.axis === 'time') {
            // Moving UP (dy<0) = later time in PianoRoll coordinates
            editDrag.note.time = Math.max(0, editDrag.origTime + (-dy / pps))
            editDrag.note.duration = editDrag.origDuration
          } else {
            const { midiMin, midiMax } = getViewParams()
            const newMidi = Math.max(midiMin, Math.min(midiMax,
              xToMidi(editDrag.origNoteX + dx, keyLayoutRef.current, midiMin, midiMax)))
            if (newMidi !== lastGlissandoMidi) {
              ;(window as any).__orfeoPlayNote?.(newMidi)
              lastGlissandoMidi = newMidi
            }
            editDrag.note.midi = newMidi
          }
        }

        if (editDrag.mode === 'selection-move') {
          for (const snap of editDrag.selectionSnapshot!) {
            snap.note.time = Math.max(0, snap.origTime + (-dy / pps))
          }
        }
      }

      const onEditUp = (e: PointerEvent) => {
        if (!storeRef.current.noteEditorActive) return

        if (editMarquee) {
          updateMarqueeSelection()
          editMarquee = null
          return
        }

        if (!editDrag) return
        const { note, track } = editDrag
        const header = (storeRef.current.midi as any)?.header

        // ── Convert live note.time back to snapped ticks ───────────────────
        const timeToSnappedTick = (t: number) => {
          if (!header) return snapTick(Math.round(t * 480))
          return snapTick(Math.round(header.secondsToTicks(Math.max(0, t))))
        }
        const durToTicks = (dur: number, startTick: number) => {
          if (!header) return Math.max(1, Math.round(dur * 480))
          return Math.max(1, Math.round(header.secondsToTicks(note.time + dur) - startTick))
        }

        if (editDrag.mode === 'note-resize-end') {
          const fDur   = note.durationTicks
          const oDur   = editDrag.origDurationTicks
          if (fDur !== oDur) {
            note.durationTicks = Math.max(1, snapTick(fDur) || fDur)
            const fSnapped = note.durationTicks
            history_push({ note, track,
              apply()  { note.durationTicks = fSnapped; syncNoteTimes(note) },
              revert() { note.durationTicks = oDur;     syncNoteTimes(note) },
              description: `Resize end midi=${note.midi}`,
            })
          } else {
            note.durationTicks = oDur
          }
          syncNoteTimes(note)
        }

        else if (editDrag.mode === 'note-resize-start') {
          const origEnd    = editDrag.origTicks + editDrag.origDurationTicks
          const newTick    = timeToSnappedTick(note.time)
          const newDurTick = Math.max(1, origEnd - newTick)
          const oTicks     = editDrag.origTicks
          const oDur       = editDrag.origDurationTicks
          if (newTick !== oTicks) {
            note.ticks = newTick; note.durationTicks = newDurTick
            syncNoteTimes(note)
            history_push({ note, track,
              apply()  { note.ticks = newTick;  note.durationTicks = newDurTick;  syncNoteTimes(note); track.notes.sort((a: any, b: any) => a.ticks - b.ticks) },
              revert() { note.ticks = oTicks;   note.durationTicks = oDur;         syncNoteTimes(note); track.notes.sort((a: any, b: any) => a.ticks - b.ticks) },
              description: `Resize start midi=${note.midi}`,
            })
          } else {
            note.ticks = oTicks; note.durationTicks = oDur; syncNoteTimes(note)
          }
        }

        else if (editDrag.mode === 'note-move') {
          if (editDrag.axis === 'time') {
            const newTick  = timeToSnappedTick(note.time)
            const origTick = editDrag.origTicks
            if (newTick !== origTick) {
              note.ticks = newTick; syncNoteTimes(note)
              track.notes.sort((a: any, b: any) => a.ticks - b.ticks)
              history_push({ note, track,
                apply()  { note.ticks = newTick;  syncNoteTimes(note); track.notes.sort((a: any, b: any) => a.ticks - b.ticks) },
                revert() { note.ticks = origTick; syncNoteTimes(note); track.notes.sort((a: any, b: any) => a.ticks - b.ticks) },
                description: `Move note time midi=${note.midi}`,
              })
            } else {
              note.ticks = origTick; syncNoteTimes(note)
            }
          } else if (editDrag.axis === 'pitch') {
            const om = editDrag.origMidi
            if (note.midi !== om) {
              const fm = note.midi
              history_push({ note, track,
                apply()  { note.midi = fm },
                revert() { note.midi = om },
                description: `Repitch midi ${om} → ${fm}`,
              })
            } else {
              note.midi = om
            }
          }
        }

        else if (editDrag.mode === 'selection-move') {
          const snapshot  = editDrag.selectionSnapshot!
          const anyMoved  = snapshot.some(s => s.note.time !== s.origTime)
          if (anyMoved) {
            const finalTicks = snapshot.map(s => timeToSnappedTick(s.note.time))
            snapshot.forEach((s, i) => { s.note.ticks = finalTicks[i]; syncNoteTimes(s.note) })
            editDrag.track.notes.sort((a: any, b: any) => a.ticks - b.ticks)
            history_push({ note, track,
              apply()  {
                snapshot.forEach((s, i) => { s.note.ticks = finalTicks[i]; syncNoteTimes(s.note) })
                editDrag!.track.notes.sort((a: any, b: any) => a.ticks - b.ticks)
              },
              revert() {
                snapshot.forEach(s => { s.note.ticks = s.origTicks; syncNoteTimes(s.note) })
                editDrag!.track.notes.sort((a: any, b: any) => a.ticks - b.ticks)
              },
              description: `Move ${snapshot.length} notes`,
            })
          } else {
            snapshot.forEach(s => { s.note.time = s.origTime })
          }
        }

        app.canvas.releasePointerCapture(e.pointerId)
        app.canvas.style.cursor = 'crosshair'
        editDrag          = null
        lastGlissandoMidi = null
        NES.needsFlatRebuild = true
      }

      const onEditContext = (e: MouseEvent) => {
        if (!storeRef.current.noteEditorActive) return
        e.preventDefault()
        if (NES.toolModeRef.current !== 'pencil') return
        const { cx, cy } = toCanvas(e.clientX, e.clientY)
        const ef = editHitTest(cx, cy)
        if (!ef) return
        const { note, track } = ef
        editSelectedNotes.delete(note)
        editNewNotes.delete(note)
        const cmd = cmdRemoveNote(track, note)
        cmd.apply()
        NES.history.push(cmd)
        NES.dirty            = true
        NES.needsFlatRebuild = true
        NES.onHistoryChange?.()
      }

      // ── onEditKey — Ctrl+Z/Y undo/redo, Delete to remove ─────────────────
      const onEditKey = (e: KeyboardEvent) => {
        if (!storeRef.current.noteEditorActive) return
        if (e.target instanceof HTMLInputElement) return

        if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
          e.preventDefault()
          if (NES.history.undo()) { NES.needsFlatRebuild = true; NES.onHistoryChange?.() }
        } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
          e.preventDefault()
          if (NES.history.redo()) { NES.needsFlatRebuild = true; NES.onHistoryChange?.() }
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && editSelectedNotes.size > 0) {
          e.preventDefault()
          const notesToDel = [...editSelectedNotes]
          // Group by track for cmdRemoveNotes per-track
          const byTrack = new Map<Track, ToneNote[]>()
          for (const ef of editFlatNotes) {
            if (editSelectedNotes.has(ef.note)) {
              const arr = byTrack.get(ef.track) ?? []
              arr.push(ef.note)
              byTrack.set(ef.track, arr)
            }
          }
          for (const [t, ns] of byTrack) {
            const cmd = cmdRemoveNotes(t, ns)
            cmd.apply()
            NES.history.push(cmd)
          }
          for (const n of notesToDel) { editSelectedNotes.delete(n); editNewNotes.delete(n) }
          NES.dirty            = true
          NES.needsFlatRebuild = true
          NES.onHistoryChange?.()
        }
      }

      // ── history_push helper (avoids repeating boilerplate) ────────────────
      const history_push = (cmd: { apply(): void; revert(): void; description: string; note?: ToneNote; track?: Track }) => {
        NES.history.push(cmd)
        NES.dirty            = true
        NES.needsFlatRebuild = true
        NES.onHistoryChange?.()
      }

      // ── Register edit handlers ────────────────────────────────────────────
      app.canvas.addEventListener('pointerdown',   onEditDown)
      app.canvas.addEventListener('pointermove',   onEditMove)
      app.canvas.addEventListener('pointerup',     onEditUp)
      app.canvas.addEventListener('pointercancel', onEditUp)
      app.canvas.addEventListener('contextmenu',   onEditContext)
      window.addEventListener('keydown', onEditKey, { capture: true })

      // ── Initial draw ──────────────────────────────────────────────────────
      const { keyboardSize } = useStore.getState()
      const { min: initMin, max: initMax } = RANGES[keyboardSize] ?? RANGES[88]
      lastKeySizeRef.current = keyboardSize
      drawGrid(app.screen.width, app.screen.height, initMin, initMax)
      app.ticker.add(() => drawFrame())

      roInstance = new ResizeObserver(() => {
        if (!appRef.current) return
        const w = el.clientWidth, h = el.clientHeight
        appRef.current.renderer.resize(w, h)
        const { keyboardSize } = useStore.getState()
        const { min, max } = RANGES[keyboardSize] ?? RANGES[88]
        drawGrid(w, h, min, max)
        if (overlayCanvasRef.current) {
          overlayCanvasRef.current.width  = w
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
        overlayCtxRef.current    = null
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
