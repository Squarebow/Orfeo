import React, { useEffect, useRef, useState } from 'react'
import { Application, Graphics } from 'pixi.js'
import type { Track } from '@tonejs/midi'
import { useStore } from '../../store'
import { isBlackKey } from '../../utils/midiParser'
import { buildKeyLayout, PIANO_RANGES as RANGES, type KeyLayout } from '../../utils/keyLayout'
import { NES } from '../../utils/noteEditorState'
import {
  cmdAddNote, cmdRemoveNote, cmdRemoveNotes, midiToEditableCopy,
  type ToneNote,
} from '../../utils/noteEditorCommands'
import { getNoteLabel } from '../../utils/noteNames'
import { PENCIL_CURSOR } from '../../utils/cursors'
import type { Hand } from '../../types'
import { HitEffectsRenderer } from './HitEffects'
import { drainHitEffects } from '../../utils/hitEffectQueue'

const VISIBLE_SECONDS  = 6
const NOTE_RADIUS      = 3
const MIN_NOTE_H       = 4
const PLAYHEAD_RATIO   = 0.80
const RESIZE_ZONE_PX   = 6
const DRAG_THRESHOLD   = 4
// ── Velocity lane (edit mode, toggled on demand) — one thin bar per note of
// whichever track is currently soloed for edit, aligned to the same X/pitch
// position as the falling notes and keyboard (one continuous vertical line
// through keyboard key → note → velocity bar). Height is computed live each
// frame as the piano-roll canvas height minus the playhead Y — it covers the
// whole area below the playhead, not a fixed strip; that's the area that's
// visually "spent" once a note has fallen through anyway, and playback is
// paused while editing regardless. Bars only reflect whatever's in the same
// live time-window the falling view already computes — no independent pan/
// zoom to browse the rest of a soloed track's notes while paused; a real
// secondary time-axis mini-editor (closer to Signal/Ableton/Logic's lane)
// is the flagged upgrade if that's ever wanted. ───────────────────────────
const VELOCITY_BAR_W   = 5

// ── Canvas/PixiJS colors resolved from CSS custom properties ─────────────────
// PixiJS Graphics.fill({color}) needs a numeric 0xRRGGBB and Canvas2D ctx.fillStyle
// needs a literal color string — neither can resolve a var() string directly, so
// these are resolved once from index.css tokens via getComputedStyle (see
// resolvePianoRollColorsFromCSS, called on mount) — index.css stays the single
// source of truth; these are just its canvas-usable cache. Defaults here only
// cover the sliver of first render before the mount effect runs. Same pattern as
// ChannelStrip.tsx / MasterStrip.tsx.
let HAND_LH_COLOR       = 0x6270a5   // --hand-lh
let HAND_RH_COLOR       = 0xcb636c   // --hand-rh
let SEL_NOTE_COLOR       = 0xdd2244   // --note-select-red — actively selected/dragged notes
let SEL_MARQUEE_COLOR    = 0x7788aa   // --note-marquee-blue — drag-select rectangle
let KEY_ROW_COLOR        = 0x171720   // --pianoroll-key-row — white-key row shading
let KEY_ROW_DARK_COLOR   = 0x0d0d10   // --bg-modal-header (near-match snap) — black-key row shading
let OCTAVE_DIVIDER_COLOR = 0x2e2e48   // --pianoroll-octave-divider
let PLAYHEAD_COLOR       = 0xc6c8c8   // --text-default
let NOTE_HIGHLIGHT_COLOR = 0xffffff   // --text-white (near-match snap) — note top-edge highlight strip
let CANVAS_BG_COLOR      = 0x0f0f12   // --bg-modal-header (near-match snap) — non-warm PixiJS floor
let CANVAS_BG_WARM_COLOR = 0x12100e   // --bg-warm — warm-theme PixiJS floor

let HAND_AMBER_HEX_STR         = '#e8a027'   // --text-amber (string form, for Canvas2D fillStyle)
let BARLINE_COLOR             = '#1e1e38'   // --pianoroll-barline
let BAR_PILL_BG_COLOR         = '#0d0d18'   // --bg-row (near-match snap)
let BAR_PILL_TEXT_DARK_COLOR  = '#0f0f12'   // --bg-modal-header (near-match snap)
let NOTE_LABEL_COLOR          = 'rgba(255,255,255,0.85)'   // --text-canvas-label
let VELOCITY_BAR_HEX_STR      = '#8080cc'   // --merge-badge-text (same blue as MidiEditor's Undo-merge icon)

function hexVarToNumber(raw: string, fallback: number): number {
  const h = raw.trim().replace('#', '')
  if (h.length !== 6 && h.length !== 3) return fallback
  const full = h.length === 3 ? h.split('').map(c => c + c).join('') : h
  const n = parseInt(full, 16)
  return Number.isNaN(n) ? fallback : n
}

function resolvePianoRollColorsFromCSS() {
  const cs = getComputedStyle(document.documentElement)
  const readNum = (name: string, fallback: number) => {
    const raw = cs.getPropertyValue(name).trim()
    return raw ? hexVarToNumber(raw, fallback) : fallback
  }
  const readStr = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback

  HAND_LH_COLOR        = readNum('--hand-lh', HAND_LH_COLOR)
  HAND_RH_COLOR        = readNum('--hand-rh', HAND_RH_COLOR)
  SEL_NOTE_COLOR       = readNum('--note-select-red', SEL_NOTE_COLOR)
  SEL_MARQUEE_COLOR    = readNum('--note-marquee-blue', SEL_MARQUEE_COLOR)
  KEY_ROW_COLOR        = readNum('--pianoroll-key-row', KEY_ROW_COLOR)
  KEY_ROW_DARK_COLOR   = readNum('--bg-modal-header', KEY_ROW_DARK_COLOR)
  OCTAVE_DIVIDER_COLOR = readNum('--pianoroll-octave-divider', OCTAVE_DIVIDER_COLOR)
  PLAYHEAD_COLOR       = readNum('--text-default', PLAYHEAD_COLOR)
  NOTE_HIGHLIGHT_COLOR = readNum('--text-white', NOTE_HIGHLIGHT_COLOR)
  CANVAS_BG_COLOR      = readNum('--bg-modal-header', CANVAS_BG_COLOR)
  CANVAS_BG_WARM_COLOR = readNum('--bg-warm', CANVAS_BG_WARM_COLOR)

  HAND_AMBER_HEX_STR       = readStr('--text-amber', HAND_AMBER_HEX_STR)
  BARLINE_COLOR            = readStr('--pianoroll-barline', BARLINE_COLOR)
  BAR_PILL_BG_COLOR        = readStr('--bg-row', BAR_PILL_BG_COLOR)
  BAR_PILL_TEXT_DARK_COLOR = readStr('--bg-modal-header', BAR_PILL_TEXT_DARK_COLOR)
  NOTE_LABEL_COLOR         = readStr('--text-canvas-label', NOTE_LABEL_COLOR)
  VELOCITY_BAR_HEX_STR     = readStr('--merge-badge-text', VELOCITY_BAR_HEX_STR)
}

// ── FlatNote — used for the main render O(log N) binary search ────────────────
interface FlatNote { midi: number; time: number; duration: number; trackIndex: number; hand?: Hand }

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
  trackIndex:        number   // parsedTrack.index — for per-channel audio preview
  origTime:          number
  origDuration:      number
  origTicks:         number
  origDurationTicks: number
  origMidi:          number
  origNoteX:         number
  startClientX:      number
  startClientY:      number
  axis:              'time' | 'pitch' | null
  selectionSnapshot?: Array<{ note: ToneNote; origTime: number; origTicks: number; origMidi: number }>
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
  const loopStart          = useStore(s => s.loopStart)
  const loopEnd            = useStore(s => s.loopEnd)
  const loopRegionActive   = useStore(s => s.loopRegionActive)
  const currentTime        = useStore(s => s.currentTime)
  const zoomLevel          = useStore(s => s.zoomLevel)
  const noteEditorActive   = useStore(s => s.noteEditorActive)
  const midi               = useStore(s => s.midi)

  const overlayRef  = useRef<HTMLDivElement>(null)
  const draggingRef = useRef<'start' | 'end' | null>(null)
  const newDragRef  = useRef<{ anchorTime: number } | null>(null)
  const [altDown,   setAltDown]   = useState(false)
  const [mousePos,  setMousePos]  = useState<{ x: number; y: number } | null>(null)

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

  // ── Global mouse handlers — drag logic + cursor tooltip tracking ──────────
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
        return
      }
      // Track position for cursor tooltip (only when inside overlay bounds)
      const el = overlayRef.current
      if (el) {
        const rect = el.getBoundingClientRect()
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top  && e.clientY <= rect.bottom) {
          setMousePos({ x: e.clientX, y: e.clientY })
        } else {
          setMousePos(null)
        }
      }
    }
    const onUp = () => { draggingRef.current = null; newDragRef.current = null }
    // Right-click anywhere over the overlay clears the loop region
    const onContextMenu = (e: MouseEvent) => {
      const el = overlayRef.current
      if (!el) return
      const rect = el.getBoundingClientRect()
      if (e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top  && e.clientY <= rect.bottom) {
        e.preventDefault()
        useStore.getState().clearLoopRegion()
      }
    }
    window.addEventListener('mousemove',   onMove)
    window.addEventListener('mouseup',     onUp)
    window.addEventListener('contextmenu', onContextMenu)
    return () => {
      window.removeEventListener('mousemove',   onMove)
      window.removeEventListener('mouseup',     onUp)
      window.removeEventListener('contextmenu', onContextMenu)
    }
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

  const amber     = loopRegionActive ? 'var(--accent-amber-loop-border)' : 'var(--accent-amber-loop-border-dim)'
  const amberFill = loopRegionActive ? 'var(--accent-amber-active-bg)'   : 'var(--accent-amber-loop-fill-dim)'

  // Tooltip visibility: only while a file is loaded AND Alt is actually held
  // down — otherwise it's just a normal pointer, no persistent hint. (Not a
  // discovery hint shown on plain hover anymore — that read as a stray
  // tooltip appearing on app open with no file loaded, which is wrong.)
  const showTooltip = !!midi && !noteEditorActive && altDown && mousePos !== null

  // Edit mode disables loop overlay pointer events to pass them to PixiJS
  if (noteEditorActive) return null

  return (
    <div
      ref={overlayRef}
      onMouseDown={handleOverlayMouseDown}
      onDoubleClick={() => useStore.getState().clearLoopRegion()}
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
          style={handleWrap(topPct)}
        >
          <div style={{ width: '100%', height: 2, background: amber }} />
        </div>
        <div
          onMouseDown={e => { e.preventDefault(); e.stopPropagation(); draggingRef.current = 'start' }}
          onDoubleClick={e => { e.stopPropagation(); useStore.getState().clearLoopRegion() }}
          style={handleWrap(botPct)}
        >
          <div style={{ width: '100%', height: 2, background: amber }} />
        </div>
      </>)}

      {/* ── Cursor tooltip — hints Alt+drag and right-click when loop strip is on ── */}
      {showTooltip && mousePos && (
        <div style={{
          position: 'fixed',
          left: mousePos.x + 14,
          top:  mousePos.y + 14,
          pointerEvents: 'none',
          zIndex: 99999,
          background: 'var(--bg-tooltip)',
          border: '1px solid var(--accent-amber-strong)',
          borderRadius: 4,
          padding: '4px 8px',
          display: 'flex', flexDirection: 'column', gap: 2,
          whiteSpace: 'nowrap',
        }}>
          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--accent-amber-tooltip-text)' }}>
            Alt+drag · set loop region
          </span>
          {hasSelection && (
            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'var(--text-tooltip-secondary)' }}>
              Right-click · clear
            </span>
          )}
        </div>
      )}
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
  const velocityCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const velocityCtxRef    = useRef<CanvasRenderingContext2D | null>(null)
  const keyLayoutRef      = useRef<KeyLayout[]>([])
  const hitEffectsRef     = useRef<HitEffectsRenderer | null>(null)
  const storeRef          = useRef(useStore.getState())
  const lastKeySizeRef    = useRef<number>(0)
  const lastMidiRef       = useRef<any>(null)
  const flatNotesRef      = useRef<FlatNote[]>([])
  // ── Tracks whose notes are ALL the same hand — i.e. a genuine "split into
  // two tracks" output (Piano LH / Piano RH). These always render in the
  // fixed hand colors regardless of the Left/Right Hand setting; a single
  // mixed-hand track only does that when the setting is on. ─────────────────
  const homogeneousHandTracksRef = useRef<Set<number>>(new Set())
  const barStartsRef      = useRef<number[]>([])
  // ── Shared between wheel-handler effect and PixiJS-closure drag handlers ──────
  const editDragActiveRef = useRef(false)

  // ── Note-name tooltip for notes too small to show inline text ────────────────
  const [editTooltip, setEditTooltip] = useState<{ x: number; y: number; label: string } | null>(null)

  useEffect(() => useStore.subscribe((s) => { storeRef.current = s }), [])

  // ── Wheel to scrub — disabled in edit mode ───────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      if (editDragActiveRef.current) return
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
    resolvePianoRollColorsFromCSS()
    if (!containerRef.current) return
    const el = containerRef.current
    const app = new Application()
    let roInstance: ResizeObserver

    app.init({
      background: CANVAS_BG_COLOR,
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

      // ── Canvas2D velocity lane — edit-mode only, hidden otherwise ─────────
      const velCanvas = document.createElement('canvas')
      velCanvas.style.cssText = 'position:absolute;left:0;bottom:0;display:none'
      velCanvas.width  = el.clientWidth || 800
      velCanvas.height = Math.round((el.clientHeight || 600) * (1 - PLAYHEAD_RATIO))
      el.appendChild(velCanvas)
      velocityCanvasRef.current = velCanvas
      velocityCtxRef.current    = velCanvas.getContext('2d')

      const grid     = new Graphics()
      const barLines = new Graphics()   // bar dividers — behind notes, above key grid
      const notes    = new Graphics()
      const playhead = new Graphics()
      const editG    = new Graphics()   // edit overlay — must be last (on top)
      app.stage.addChild(grid)
      app.stage.addChild(barLines)
      app.stage.addChild(notes)
      app.stage.addChild(playhead)
      const hitEffects = new HitEffectsRenderer(app.stage)   // above playhead, below edit overlay
      hitEffectsRef.current = hitEffects
      app.stage.addChild(editG)
      gridRef.current     = grid
      notesRef.current    = notes
      playheadRef.current = playhead

      // ── Edit mode state — lives in closure, shared by drawFrame + pointer handlers ──
      let editFlatNotes:        EditFlatNote[]  = []
      let editSelectedNotes:    Set<ToneNote>   = new Set()
      let editNewNotes:         Set<ToneNote>   = NES.newNotes   // reference to singleton set
      let editDrag:             EditDragState | null   = null
      let editMarquee:          EditMarqueeState | null = null
      let lastGlissandoMidi:    number | null   = null
      let prevNoteEditorActive: boolean         = false

      // ── Velocity lane state — bars rebuilt each draw from the current
      // selection; drag state tracks which note (if any) is being adjusted. ──
      let velBars: { note: ToneNote; x: number; w: number }[] = []
      let velDragNote:      ToneNote | null = null
      let velDragStartY     = 0
      let velDragStartVel   = 0

      // ── snapTick — quantize a tick value to the grid ──────────────────────
      const snapTick = (tick: number): number => {
        if (!NES.snapRef.current) return Math.max(0, tick)
        const ppq  = (NES.editMidi as any)?.header?.ppq ?? 480
        const unit = ppq / (NES.quantizeDivisorRef.current ?? 8)
        return Math.max(0, Math.round(tick / unit) * unit)
      }

      // ── syncNoteTimes — update note.time and note.duration from ticks ─────
      // @tonejs/midi does NOT auto-sync these; we must update them explicitly.
      // Uses NES.editMidi.header (not ParsedMidi which has no header).
      const syncNoteTimes = (note: ToneNote) => {
        const header = (NES.editMidi as any)?.header
        if (!header) return
        note.time     = header.ticksToSeconds(note.ticks)
        note.duration = header.ticksToSeconds(note.ticks + note.durationTicks) - note.time
      }

      // ── buildEditFlatNotes — rebuild hit-testable note list from NES.editMidi ──
      // Uses NES.editMidi (real @tonejs/midi Tracks/Notes) for edit operations.
      // Position-based mapping: NES.editMidi.tracks[i] ↔ parsedMidi.tracks[i].
      const buildEditFlatNotes = (
        py: number, pps: number, currentTime: number,
        midiMin: number, midiMax: number, transpose: number,
      ) => {
        editFlatNotes = []
        const editMidi = NES.editMidi as any
        if (!editMidi) return

        const { tracks } = storeRef.current
        const parsedMidi = storeRef.current.midi as any
        const trackMap = new Map<number, { visible: boolean; muted: boolean; color: string }>()
        for (const t of tracks) trackMap.set(t.index, t)

        const visStart  = currentTime - (VISIBLE_SECONDS / (storeRef.current.zoomLevel ?? 1)) * (1 - PLAYHEAD_RATIO)
        const visEnd    = currentTime + (VISIBLE_SECONDS / (storeRef.current.zoomLevel ?? 1)) * PLAYHEAD_RATIO
        const totalKeys = midiMax - midiMin + 1

        // Mirror parseMidiBuffer's empty-track filter so position-based index mapping stays in sync
        const nonEmptyEditTracks = (editMidi.tracks as any[]).filter((t: any) => t.notes.length > 0)
        for (let i = 0; i < nonEmptyEditTracks.length; i++) {
          const track    = nonEmptyEditTracks[i]
          const parsedIdx = parsedMidi?.tracks?.[i]?.index ?? i
          const ts = trackMap.get(parsedIdx)
          if (!ts || !ts.visible || ts.muted) continue   // same gate as drawFrame
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

            // Prune stale newNotes entries (e.g. after undo of add)
            if (!track.notes.includes(note)) editNewNotes.delete(note)

            editFlatNotes.push({ note, track, key, topY, botY, noteH, trackIndex: parsedIdx, color })
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
        py: number, pps: number, currentTime: number,
        midiMin: number, midiMax: number, transpose: number,
      ) => {
        editG.clear()
        if (!storeRef.current.noteEditorActive || !NES.editMidi) return

        // Rebuild flat notes every frame — ensures drag-move preview is always current.
        buildEditFlatNotes(py, pps, currentTime, midiMin, midiMax, transpose)

        // Pulsate selected-note border via sine wave — driven purely by wall-clock time,
        // no extra state needed since drawFrame already runs on rAF every frame.
        const pulse = 0.55 + 0.30 * Math.sin(Date.now() / 250)

        for (const ef of editFlatNotes) {
          const { note, key, topY, noteH } = ef
          const isSelected = editSelectedNotes.has(note)
          const isNew      = editNewNotes.has(note)
          const isDragged  = note === editDrag?.note

          if (isSelected || isDragged) {
            editG.roundRect(key.x + 1, topY - 1, Math.max(key.width - 2, 1), noteH + 2, NOTE_RADIUS)
            editG.stroke({ color: SEL_NOTE_COLOR, width: 2, alpha: pulse })
          }
          if (isNew) {
            drawDashedRect(
              editG, key.x + 1, topY, Math.max(key.width - 2, 1), noteH,
              SEL_NOTE_COLOR, 0.80,
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
          editG.fill({ color: SEL_MARQUEE_COLOR, alpha: 0.07 })
          editG.rect(mx, my, mw, mh)
          editG.stroke({ color: SEL_MARQUEE_COLOR, width: 1, alpha: 0.45 })
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
          grid.fill({ color: KEY_ROW_COLOR, alpha: 1 })
        }
        for (let m = midiMin; m <= midiMax; m++) {
          if (!isBlackKey(m)) continue
          const key = kl[m - midiMin]
          if (!key) continue
          grid.rect(Math.round(key.x), 0, Math.round(key.width), H)
          grid.fill({ color: KEY_ROW_DARK_COLOR, alpha: 1 })
        }
        for (let m = midiMin; m <= midiMax; m++) {
          if (m % 12 !== 0) continue
          const key = kl[m - midiMin]
          if (!key) continue
          grid.rect(Math.round(key.x), 0, 1, H)
          grid.fill({ color: OCTAVE_DIVIDER_COLOR, alpha: 1 })
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

        const { midi, currentTime, tracks, detectedKey, zoomLevel, appTheme, keyboardSize, showBarNumbers, barStarts: storeBars, noteEditorActive, showHandLabels, playbarVisible, keyboardTopY, hitEffectsEnabled, hitEffectPattern, hitEffectBloomThreshold, hitEffectBloomIntensity, hitEffectBloomSpread, hitEffectColor } = storeRef.current
        const transpose   = (detectedKey as any)?.transpose ?? 0
        const W = app.screen.width, H = app.screen.height
        // ── Hit-line Y position — fixed 80% line by default (unchanged), or the
        // live keyboard top edge when the playbar is hidden. `pps` (pixels per
        // second, i.e. how fast/compressed notes fall) always derives from the
        // FIXED ratio regardless — only where the line/notes visually land
        // moves, per the feature's own scope ("only where the trigger
        // threshold is read from", not how notes are drawn or fall).
        const staticPy    = H * PLAYHEAD_RATIO
        const visibleSecs = VISIBLE_SECONDS / (zoomLevel ?? 1)
        const pps         = staticPy / visibleSecs
        let py = staticPy
        if (!playbarVisible && keyboardTopY !== null) {
          const rect = el.getBoundingClientRect()
          py = Math.max(20, Math.min(H - 4, keyboardTopY - rect.top))
        }
        const { min: midiMin, max: midiMax } = RANGES[keyboardSize] ?? RANGES[88]
        const totalKeys   = midiMax - midiMin + 1

        if (keyboardSize !== lastKeySizeRef.current) {
          lastKeySizeRef.current = keyboardSize
          drawGrid(W, H, midiMin, midiMax)
        }

        // ── Note-hit visual effects (Phase 2) — spawn from the same trigger as
        // the key glow (drained queue, see utils/hitEffectQueue.ts), positioned
        // at the hit note's key X and the CURRENT hit line's Y (playbar or
        // keyboard-derived, per Phase 1 above) — so the effect always lands
        // exactly where the glow itself is. Skipped entirely when the setting
        // is off. Each spawned effect drives its own lifecycle via GSAP from
        // here on — nothing to poll per-frame from this loop.
        if (hitEffectsEnabled) {
          hitEffects.setBloomParams({ threshold: hitEffectBloomThreshold, intensity: hitEffectBloomIntensity, spread: hitEffectBloomSpread })
          const hits = drainHitEffects()
          // hitEffectColor overrides the particle color only — leaves the queued
          // per-track color (and the key glow, a separate render path) untouched.
          const overrideHex = hitEffectColor ? parseInt(hitEffectColor.replace('#', ''), 16) : null
          for (const hit of hits) {
            const idx = hit.midi - midiMin
            if (idx < 0 || idx >= totalKeys) continue
            const key = keyLayoutRef.current[idx]
            if (!key) continue
            const colorHex = overrideHex ?? parseInt(hit.color.replace('#', ''), 16)
            hitEffects.spawn(hitEffectPattern, key.x + key.width / 2, py, colorHex)
          }
        }

        // ── Edit mode enter/exit — create or destroy NES.editMidi ────────────
        if (noteEditorActive && !prevNoteEditorActive) {
          const rawBuffer = (midi as any)?._raw
          if (rawBuffer && !NES.editMidi) {
            NES.editMidi = midiToEditableCopy(rawBuffer)
          }
          NES.needsFlatRebuild = true
          // Prime GM channel programs via a silent SMF player so notes preview
          // on the correct instrument before the user presses Play for the first time.
          ;(window as any).__orfeoWarmupEditChannels?.()
        }
        if (!noteEditorActive && prevNoteEditorActive) {
          NES.editMidi = null
          lastMidiRef.current = null   // force rebuild from ParsedMidi on exit
          app.canvas.style.cursor = 'default'
        }
        prevNoteEditorActive = noteEditorActive

        // ── After edit commands: rebuild flatNotesRef from NES.editMidi ──────
        if (noteEditorActive && NES.needsFlatRebuild) {
          NES.needsFlatRebuild = false
          if (NES.editMidi) {
            const parsedMidi = storeRef.current.midi as any
            const flat: FlatNote[] = []
            // Mirror parseMidiBuffer's empty-track filter so position-based index mapping stays in sync
            const nonEmpty = ((NES.editMidi as any).tracks as any[]).filter((t: any) => t.notes.length > 0)
            for (let i = 0; i < nonEmpty.length; i++) {
              const et = nonEmpty[i]
              const parsedIdx = parsedMidi?.tracks?.[i]?.index ?? i
              for (const note of et.notes) {
                flat.push({ midi: note.midi, time: note.time, duration: note.duration, trackIndex: parsedIdx })
              }
            }
            flat.sort((a, b) => a.time - b.time)
            flatNotesRef.current = flat
          } else {
            lastMidiRef.current = null   // fallback: let the normal path rebuild
          }
        }

        app.renderer.background.color = appTheme === 'warm' ? CANVAS_BG_WARM_COLOR : CANVAS_BG_COLOR

        playhead.clear()
        if (playbarVisible) {
          playhead.rect(0, py, W + 1, 2)
          playhead.fill({ color: PLAYHEAD_COLOR, alpha: 0.90 })
        }

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
          const homogeneous = new Set<number>()
          for (const track of midi.tracks) {
            let allSameHand: Hand | null | undefined = undefined
            for (const note of track.notes) {
              flat.push({ midi: note.midi, time: note.time, duration: note.duration, trackIndex: track.index, hand: note.hand })
              if (allSameHand === null) continue
              if (!note.hand) { allSameHand = null; continue }
              if (allSameHand === undefined) allSameHand = note.hand
              else if (allSameHand !== note.hand) allSameHand = null
            }
            if (track.notes.length > 0 && allSameHand) homogeneous.add(track.index)
          }
          flat.sort((a, b) => a.time - b.time)
          flatNotesRef.current = flat
          homogeneousHandTracksRef.current = homogeneous
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

          // ── Hand coloring — fixed LH/RH tokens, not per-track palette. A track
          // that's a genuine split output (every note same hand — Piano LH/RH)
          // always renders in these colors. A single mixed-hand track only does
          // when Left/Right Hand mode is on; off, it falls back to the track's
          // own color — same contract as resolveHandAwareColor() (handColors.ts),
          // which Keyboard.tsx calls directly; this is a numeric-color PixiJS
          // reimplementation of the same rule, not an independent one. Non-piano
          // notes (no hand tag) keep their normal per-track palette color throughout.
          const isSplitTrack = homogeneousHandTracksRef.current.has(note.trackIndex)
          const trackColorNum = parseInt((ts?.color ?? '#e8a027').replace('#', ''), 16)
          const color = !note.hand
            ? trackColorNum
            : (isSplitTrack || showHandLabels)
              ? (note.hand === 'L' ? HAND_LH_COLOR : HAND_RH_COLOR)
              : trackColorNum
          const topY   = py - (note.time + note.duration - currentTime) * pps
          const botY   = py - (note.time - currentTime) * pps
          const noteH  = Math.max(botY - topY, MIN_NOTE_H)

          notes.roundRect(key.x + 1, topY, Math.max(key.width - 2, 1), noteH, NOTE_RADIUS)
          notes.fill({ color, alpha: 0.9 })
          notes.rect(key.x + 1, topY, Math.max(key.width - 2, 1), 2)
          notes.fill({ color: NOTE_HIGHLIGHT_COLOR, alpha: 0.25 })
        }

        // ── Edit overlay (drawn after notes so it renders on top) ─────────────
        drawEditOverlay(py, pps, currentTime, midiMin, midiMax, transpose)

        // ── Note names in edit mode (Canvas2D over the PixiJS canvas) ───────
        if (noteEditorActive && NES.showNoteNamesRef.current && ctx && ov) {
          const { noteNaming, accidentals } = storeRef.current
          ctx.save()
          ctx.font = '9px "JetBrains Mono", monospace'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillStyle = NOTE_LABEL_COLOR
          for (const ef of editFlatNotes) {
            if (ef.noteH < 14) continue
            const label = getNoteLabel(ef.note.midi, noteNaming, accidentals).replace(/\d+$/, '')
            if (!label) continue
            ctx.fillText(label, ef.key.x + ef.key.width / 2, ef.topY + ef.noteH / 2)
          }
          ctx.restore()
        }

        // ── Bar lines + bar number labels ─────────────────────────────────────
        // The line itself is drawn in Pixi (barLines, behind the notes layer) —
        // it used to be drawn on the 2D overlay canvas, which sits visually
        // above the whole Pixi canvas, so it always rendered on top of falling
        // notes (looked like a dark line splitting notes in two). Number pills
        // stay on the overlay — small text drawn on the overlay canvas needing
        // font metrics, and not the thing that was actually reported as broken.
        barLines.clear()
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

          barLines.rect(0, Math.round(barY), W, 1)
          barLines.fill({ color: BARLINE_COLOR, alpha: 0.5 })

          const isCurrent = bi === currentBarIdx
          const label = String(bi + 1)
          const tw = ctx.measureText(label).width
          const pillX = 4, pillY = Math.round(barY) - 18, pillW = tw + 8, pillH = 16

          ctx.globalAlpha = isCurrent ? 1 : 0.8
          ctx.fillStyle = isCurrent ? HAND_AMBER_HEX_STR : BAR_PILL_BG_COLOR
          ctx.beginPath()
          if ((ctx as any).roundRect) { ;(ctx as any).roundRect(pillX, pillY, pillW, pillH, 3) }
          else { ctx.rect(pillX, pillY, pillW, pillH) }
          ctx.fill()

          ctx.globalAlpha = 1
          ctx.fillStyle = isCurrent ? BAR_PILL_TEXT_DARK_COLOR : HAND_AMBER_HEX_STR
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

      const updateHoverState = (cx: number, cy: number, ef: EditFlatNote | null, clientX?: number, clientY?: number) => {
        if (!storeRef.current.noteEditorActive) { app.canvas.style.cursor = 'default'; setEditTooltip(null); return }
        let hint: string
        if (ef) {
          const canResize = ef.noteH >= RESIZE_ZONE_PX * 2
          const atEnd   = canResize && cy <= ef.topY + RESIZE_ZONE_PX
          const atStart = canResize && cy >= ef.topY + ef.noteH - RESIZE_ZONE_PX
          if (atEnd || atStart) {
            app.canvas.style.cursor = 'ns-resize'
            hint = 'Drag to resize'
            setEditTooltip(null)
          } else {
            app.canvas.style.cursor = 'move'
            hint = editNewNotes.has(ef.note)
              ? 'Drag to move · Right-click to delete'
              : 'Drag to move · Select + Delete key to remove'
            // Show tooltip when note is too small for inline text (respects note-names toggle)
            if (NES.showNoteNamesRef.current && ef.noteH < 14 && clientX !== undefined && clientY !== undefined) {
              const { noteNaming, accidentals } = storeRef.current
              const naming = noteNaming === 'hidden' ? 'english' : noteNaming
              const label  = getNoteLabel(ef.note.midi, naming, accidentals).replace(/\d+$/, '')
              setEditTooltip({ x: clientX, y: clientY, label })
            } else {
              setEditTooltip(null)
            }
          }
        } else {
          app.canvas.style.cursor = PENCIL_CURSOR
          hint = 'Alt+click to add note · Drag to select'
          setEditTooltip(null)
        }
        if (NES.hoverHint !== hint) {
          NES.hoverHint = hint
          NES.onHintChange?.()
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

      // ── getTrackChannel — MIDI channel for a parsedTrack.index, for audio preview ──
      const getTrackChannel = (parsedIdx: number): number | undefined => {
        const parsedMidi = storeRef.current.midi as any
        return parsedMidi?.tracks?.find((t: any) => t.index === parsedIdx)?.channel
      }

      const onEditDown = (e: PointerEvent) => {
        if (!storeRef.current.noteEditorActive) return
        if (e.button !== 0) return
        setEditTooltip(null)
        const { cx, cy } = toCanvas(e.clientX, e.clientY)
        const { py, pps, midiMin, midiMax, currentTime } = getViewParams()
        const ef = editHitTest(cx, cy)

        if (ef) {
          const { note, track, key, topY, noteH } = ef
          ;(window as any).__orfeoPlayNote?.(note.midi, 90, 500, getTrackChannel(ef.trackIndex))
          const canResize = noteH >= RESIZE_ZONE_PX * 2
          const atEnd   = canResize && cy <= topY + RESIZE_ZONE_PX
          const atStart = canResize && cy >= topY + noteH - RESIZE_ZONE_PX

          if (atEnd || atStart) {
            // ── Resize drag ───────────────────────────────────────────────
            const mode: EditDragState['mode'] = atEnd ? 'note-resize-end' : 'note-resize-start'
            editDrag = {
              mode, note, track, trackIndex: ef.trackIndex,
              origTime: note.time, origDuration: note.duration,
              origTicks: note.ticks, origDurationTicks: note.durationTicks,
              origMidi: note.midi,
              origNoteX: key.x + key.width / 2,
              startClientX: e.clientX, startClientY: e.clientY,
              axis: null,
            }
            editDragActiveRef.current = true
            app.canvas.setPointerCapture(e.pointerId)
            app.canvas.style.cursor = 'ns-resize'
          } else if (e.shiftKey) {
            // ── Shift+click: toggle selection membership, no drag ─────────
            if (editSelectedNotes.has(note)) editSelectedNotes.delete(note)
            else editSelectedNotes.add(note)
          } else if (editSelectedNotes.has(note) && editSelectedNotes.size > 1) {
            // ── Already in multi-selection: move the whole selection ───────
            editDrag = {
              mode: 'selection-move', note, track, trackIndex: ef.trackIndex,
              origTime: note.time, origDuration: note.duration,
              origTicks: note.ticks, origDurationTicks: note.durationTicks,
              origMidi: note.midi,
              origNoteX: key.x + key.width / 2,
              startClientX: e.clientX, startClientY: e.clientY,
              axis: null,
              selectionSnapshot: [...editSelectedNotes].map(n => ({ note: n, origTime: n.time, origTicks: n.ticks, origMidi: n.midi })),
            }
            editDragActiveRef.current = true
            app.canvas.setPointerCapture(e.pointerId)
            app.canvas.style.cursor = 'move'
          } else {
            // ── Click: select this note, move it ──────────────────────────
            editSelectedNotes.clear()
            editSelectedNotes.add(note)
            editDrag = {
              mode: 'note-move', note, track, trackIndex: ef.trackIndex,
              origTime: note.time, origDuration: note.duration,
              origTicks: note.ticks, origDurationTicks: note.durationTicks,
              origMidi: note.midi,
              origNoteX: key.x + key.width / 2,
              startClientX: e.clientX, startClientY: e.clientY,
              axis: null,
            }
            editDragActiveRef.current = true
            app.canvas.setPointerCapture(e.pointerId)
            app.canvas.style.cursor = 'move'
          }
        } else if (e.altKey) {
          // ── Alt+click empty: add a new note to NES.editMidi ──────────────
          const editMidi = NES.editMidi as any
          if (!editMidi) return
          const clickTime = currentTime + (py - cy) / pps
          const header    = editMidi.header
          const rawTick   = Math.round(header.secondsToTicks(Math.max(0, clickTime)))
          const startTick = snapTick(rawTick)
          const ppq       = header.ppq ?? 480
          const dur       = ppq

          // Find the first editable track (visible, not muted) in editMidi.
          // Must filter to non-empty tracks first — same as buildEditFlatNotes — so
          // position-based index mapping stays in sync with parsedMidi.tracks[i].
          const { tracks } = storeRef.current
          const parsedMidi = storeRef.current.midi as any
          const trackMap   = new Map(tracks.map((t: any) => [t.index, t]))
          const nonEmptyForAdd = (editMidi.tracks as any[]).filter((t: any) => t.notes.length > 0)
          const editTrack  = nonEmptyForAdd.find((_t: any, i: number) => {
            const parsedIdx = parsedMidi?.tracks?.[i]?.index ?? i
            const ts = trackMap.get(parsedIdx)
            return ts && ts.visible && !ts.muted
          })
          if (!editTrack) return

          const midiNum = xToMidi(cx, keyLayoutRef.current, midiMin, midiMax)
          ;(window as any).__orfeoPlayNote?.(midiNum)

          const beforeSet = new Set(editTrack.notes)
          const cmd = cmdAddNote(editTrack as any, { midi: midiNum, ticks: startTick, durationTicks: dur, velocity: 0.8 })
          cmd.apply()
          const addedNote = editTrack.notes.find((n: ToneNote) => !beforeSet.has(n)) as ToneNote | undefined
          if (addedNote) {
            syncNoteTimes(addedNote)
            editNewNotes.add(addedNote)
          }
          NES.history.push(cmd)
          NES.dirty              = true
          NES.needsFlatRebuild   = true
          NES.onHistoryChange?.()
        } else {
          // ── Click empty: start marquee, clear selection ───────────────────
          editMarquee = { startX: cx, startY: cy, endX: cx, endY: cy, additive: e.shiftKey }
          if (!e.shiftKey) editSelectedNotes.clear()
        }
      }

      const onEditMove = (e: PointerEvent) => {
        if (!storeRef.current.noteEditorActive) return
        const { cx, cy } = toCanvas(e.clientX, e.clientY)
        const { py, pps } = getViewParams()

        if (!editDrag && !editMarquee) {
          const ef = editHitTest(cx, cy)
          updateHoverState(cx, cy, ef, e.clientX, e.clientY)
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
          // Update both pitch and time simultaneously — no axis lock
          const { midiMin, midiMax } = getViewParams()
          editDrag.note.time = Math.max(0, editDrag.origTime + (-dy / pps))
          const newMidi = Math.max(midiMin, Math.min(midiMax,
            xToMidi(editDrag.origNoteX + dx, keyLayoutRef.current, midiMin, midiMax)))
          if (newMidi !== lastGlissandoMidi) {
            ;(window as any).__orfeoPlayNote?.(newMidi, 90, 500, getTrackChannel(editDrag.trackIndex))
            lastGlissandoMidi = newMidi
          }
          editDrag.note.midi = newMidi
        }

        if (editDrag.mode === 'selection-move') {
          const { midiMin, midiMax } = getViewParams()
          for (const snap of editDrag.selectionSnapshot!) {
            snap.note.time = Math.max(0, snap.origTime + (-dy / pps))
          }
          const newPrimaryMidi = Math.max(midiMin, Math.min(midiMax,
            xToMidi(editDrag.origNoteX + dx, keyLayoutRef.current, midiMin, midiMax)))
          const deltaMidi = newPrimaryMidi - editDrag.origMidi
          if (deltaMidi !== 0) {
            for (const snap of editDrag.selectionSnapshot!) {
              snap.note.midi = Math.max(midiMin, Math.min(midiMax, snap.origMidi + deltaMidi))
            }
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
        // Use NES.editMidi.header — ParsedMidi has no header property
        const header = (NES.editMidi as any)?.header

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
          const newTick      = timeToSnappedTick(note.time)
          const origTick     = editDrag.origTicks
          const origMidi     = editDrag.origMidi
          const newMidi      = note.midi
          const timeChanged  = newTick !== origTick
          const pitchChanged = newMidi !== origMidi
          if (timeChanged || pitchChanged) {
            note.ticks = timeChanged ? newTick : origTick
            syncNoteTimes(note)
            if (timeChanged) track.notes.sort((a: any, b: any) => a.ticks - b.ticks)
            history_push({ note, track,
              apply()  {
                note.ticks = timeChanged  ? newTick  : origTick
                note.midi  = pitchChanged ? newMidi  : origMidi
                syncNoteTimes(note)
                if (timeChanged) track.notes.sort((a: any, b: any) => a.ticks - b.ticks)
              },
              revert() {
                note.ticks = origTick
                note.midi  = origMidi
                syncNoteTimes(note)
                if (timeChanged) track.notes.sort((a: any, b: any) => a.ticks - b.ticks)
              },
              description: `Move note midi=${origMidi}→${newMidi} tick=${origTick}→${newTick}`,
            })
          } else {
            note.ticks = origTick
            note.midi  = origMidi
            syncNoteTimes(note)
          }
        }

        else if (editDrag.mode === 'selection-move') {
          const snapshot    = editDrag.selectionSnapshot!
          const finalTicks  = snapshot.map(s => timeToSnappedTick(s.note.time))
          const finalMidis  = snapshot.map(s => s.note.midi)
          const anyTimeMoved  = finalTicks.some((t, i) => t !== snapshot[i].origTicks)
          const anyPitchMoved = finalMidis.some((m, i) => m !== snapshot[i].origMidi)
          if (anyTimeMoved || anyPitchMoved) {
            snapshot.forEach((s, i) => { s.note.ticks = finalTicks[i]; s.note.midi = finalMidis[i]; syncNoteTimes(s.note) })
            track.notes.sort((a: any, b: any) => a.ticks - b.ticks)
            history_push({ note, track,
              apply()  {
                snapshot.forEach((s, i) => { s.note.ticks = finalTicks[i]; s.note.midi = finalMidis[i]; syncNoteTimes(s.note) })
                track.notes.sort((a: any, b: any) => a.ticks - b.ticks)
              },
              revert() {
                snapshot.forEach(s => { s.note.ticks = s.origTicks; s.note.midi = s.origMidi; syncNoteTimes(s.note) })
                track.notes.sort((a: any, b: any) => a.ticks - b.ticks)
              },
              description: `Move ${snapshot.length} notes`,
            })
          } else {
            snapshot.forEach(s => { s.note.time = s.origTime; s.note.midi = s.origMidi })
          }
        }

        app.canvas.releasePointerCapture(e.pointerId)
        app.canvas.style.cursor = PENCIL_CURSOR
        editDrag                  = null
        editDragActiveRef.current = false
        lastGlissandoMidi         = null
        NES.needsFlatRebuild      = true
      }

      const onEditContext = (e: MouseEvent) => {
        if (!storeRef.current.noteEditorActive) return
        e.preventDefault()
        const { cx, cy } = toCanvas(e.clientX, e.clientY)
        const ef = editHitTest(cx, cy)
        if (!ef) {
          // Right-click empty space: clear selection
          editSelectedNotes.clear()
          return
        }
        const { note, track } = ef
        // Right-click deletes only newly added notes; Alt+right-click deletes any note
        if (!editNewNotes.has(note) && !e.altKey) return
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

      // ── Velocity lane — advanced technique, toggled on demand (toolbar icon),
      // only meaningful while a track is soloed for edit. Bars align to the
      // SAME pitch/X position as the falling notes and keyboard above/below —
      // one continuous vertical line through keyboard key → note → velocity
      // bar, matching this roll's vertical (Y=time, X=pitch) orientation
      // rather than porting a horizontal-DAW-style time-axis lane. Scoped to
      // one soloed track at a time — with large files (many tracks, thousands
      // of notes) editing velocity across everything at once isn't
      // practically usable anyway. Notes shown are whatever's in the same
      // visible time-window the falling view already computes (editFlatNotes)
      // — bars scroll/update live with playback; there's no independent
      // pan/zoom to browse the rest of the track while paused (that's the
      // flagged upgrade — a real secondary time-axis mini-editor, closer to
      // Signal/Ableton/Logic's lane, if ever wanted). ───────────────────────
      const drawVelocityLane = () => {
        const canvas = velocityCanvasRef.current
        const ctx    = velocityCtxRef.current
        if (!canvas || !ctx) return
        const { noteEditorActive, velocityPanelOpen, noteEditorSoloTrackIndex } = storeRef.current
        const visible = noteEditorActive && velocityPanelOpen
        canvas.style.display = visible ? 'block' : 'none'
        canvas.title = visible ? 'Drag up/down to edit velocity' : ''
        if (!visible) { velBars = []; return }

        const W = canvas.width, H = canvas.height
        ctx.clearRect(0, 0, W, H)
        ctx.fillStyle = BAR_PILL_BG_COLOR
        ctx.fillRect(0, 0, W, H)
        ctx.strokeStyle = BARLINE_COLOR
        ctx.beginPath(); ctx.moveTo(0, 0.5); ctx.lineTo(W, 0.5); ctx.stroke()

        // ── Label — top center, amber caps, no icon ────────────────────────
        ctx.fillStyle = HAND_AMBER_HEX_STR
        ctx.font = 'bold 9px Inter, sans-serif'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'alphabetic'
        ctx.save()
        ctx.letterSpacing = '0.1em' as any
        ctx.fillText('VELOCITY EDITOR', W / 2, 14)
        ctx.restore()

        if (noteEditorSoloTrackIndex === null) {
          velBars = []
          ctx.fillStyle = NOTE_LABEL_COLOR
          ctx.font = '10px Inter, sans-serif'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText('Solo a track to edit its velocity', W / 2, H / 2)
          return
        }

        velBars = []
        const trackTop = 20, trackH = H - trackTop - 6

        // ── Guideline gridlines — 0/32/64/96/127, barely-visible horizontal
        // lines + value markers on both edges, same idea as the main roll's
        // bar-number lines but much subtler (this is a background reference,
        // not a primary UI element). ────────────────────────────────────────
        ctx.font = '8px "JetBrains Mono", monospace'
        ctx.textBaseline = 'middle'
        for (const v of [0, 32, 64, 96, 127]) {
          const gy = trackTop + trackH - (v / 127) * trackH
          ctx.globalAlpha = 0.25
          ctx.strokeStyle = BARLINE_COLOR
          ctx.beginPath(); ctx.moveTo(0, Math.round(gy) + 0.5); ctx.lineTo(W, Math.round(gy) + 0.5); ctx.stroke()
          ctx.globalAlpha = 0.4
          ctx.fillStyle = NOTE_LABEL_COLOR
          ctx.textAlign = 'left'
          ctx.fillText(String(v), 4, gy)
          ctx.textAlign = 'right'
          ctx.fillText(String(v), W - 4, gy)
        }
        ctx.globalAlpha = 1

        // editFlatNotes already excludes every track except the soloed one —
        // soloTrackForEdit hides all others (ts.visible=false), and
        // buildEditFlatNotes gates on ts.visible the same way the main
        // falling view does. No extra track filtering needed here.
        for (const ef of editFlatNotes) {
          const note = ef.note
          const vel  = Math.max(0, Math.min(1, note.velocity))
          const barW = VELOCITY_BAR_W
          const x    = ef.key.x + (ef.key.width - barW) / 2
          const barH = Math.max(2, Math.round(vel * trackH))
          const y    = trackTop + (trackH - barH)
          const isDragging = note === velDragNote

          ctx.fillStyle = isDragging ? VELOCITY_BAR_HEX_STR : `${VELOCITY_BAR_HEX_STR}bb`
          ctx.fillRect(x, y, barW, barH)

          // Numeric readout only for the bar actively being dragged — with a
          // whole track's worth of bars packed key-width apart, labeling
          // every single one would be unreadable clutter.
          if (isDragging) {
            ctx.fillStyle = NOTE_LABEL_COLOR
            ctx.font = '9px "JetBrains Mono", monospace'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'alphabetic'
            ctx.fillText(String(Math.round(vel * 127)), x + barW / 2, Math.max(10, y - 4))
          }

          velBars.push({ note, x, w: barW })
        }
      }

      const onVelPointerDown = (e: PointerEvent) => {
        if (!storeRef.current.noteEditorActive) return
        const canvas = velocityCanvasRef.current
        if (!canvas) return
        const r  = canvas.getBoundingClientRect()
        const cx = e.clientX - r.left
        // Last match wins (matches draw order — later entries render on top).
        let hit: { note: ToneNote; x: number; w: number } | undefined
        for (const b of velBars) { if (cx >= b.x && cx <= b.x + b.w) hit = b }
        if (!hit) return
        velDragNote    = hit.note
        velDragStartY  = e.clientY
        velDragStartVel = hit.note.velocity
        canvas.style.cursor = 'grabbing'
        canvas.setPointerCapture(e.pointerId)
      }
      const onVelPointerMove = (e: PointerEvent) => {
        const canvas = velocityCanvasRef.current
        if (!canvas) return
        if (!velDragNote) {
          // Not dragging — just update the hover cursor (grab over a bar).
          const r  = canvas.getBoundingClientRect()
          const cx = e.clientX - r.left
          let hovering = false
          for (const b of velBars) { if (cx >= b.x && cx <= b.x + b.w) hovering = true }
          canvas.style.cursor = hovering ? 'grab' : 'default'
          return
        }
        const trackH = canvas.height - 20 - 6
        const delta  = (velDragStartY - e.clientY) / trackH
        velDragNote.velocity = Math.max(0, Math.min(1, velDragStartVel + delta))
      }
      const onVelPointerUp = (e: PointerEvent) => {
        if (!velDragNote) return
        const note        = velDragNote
        const originalVel = velDragStartVel
        const finalVel    = note.velocity
        velDragNote = null
        if (velocityCanvasRef.current) velocityCanvasRef.current.style.cursor = 'default'
        try { velocityCanvasRef.current?.releasePointerCapture(e.pointerId) } catch {}
        if (Math.abs(finalVel - originalVel) < 0.001) return
        history_push({
          note,
          description: `Velocity note midi=${note.midi}: ${originalVel.toFixed(2)} → ${finalVel.toFixed(2)}`,
          apply()  { note.velocity = finalVel },
          revert() { note.velocity = originalVel },
        })
      }

      // ── Register reset handler — toolbar Reset button rebuilds editMidi from _raw ──
      NES.onResetRequest = () => {
        const raw = (storeRef.current.midi as any)?._raw as ArrayBuffer | undefined
        if (!raw) return
        NES.editMidi         = midiToEditableCopy(raw)
        NES.history.clear()
        NES.dirty            = false
        NES.newNotes.clear()
        NES.needsFlatRebuild = true
        NES.hoverHint        = NES.defaultHint
        NES.onHistoryChange?.()
        NES.onHintChange?.()
      }

      // ── Reset hint when cursor leaves the canvas ──────────────────────────
      const onCanvasLeave = () => {
        if (!storeRef.current.noteEditorActive) return
        setEditTooltip(null)
        if (NES.hoverHint !== NES.defaultHint) {
          NES.hoverHint = NES.defaultHint
          NES.onHintChange?.()
        }
      }

      // ── Register edit handlers ────────────────────────────────────────────
      app.canvas.addEventListener('pointerdown',   onEditDown)
      app.canvas.addEventListener('pointermove',   onEditMove)
      app.canvas.addEventListener('pointerup',     onEditUp)
      app.canvas.addEventListener('pointercancel', onEditUp)
      app.canvas.addEventListener('contextmenu',   onEditContext)
      app.canvas.addEventListener('mouseleave',    onCanvasLeave)
      window.addEventListener('keydown', onEditKey, { capture: true })
      velCanvas.addEventListener('pointerdown',   onVelPointerDown)
      velCanvas.addEventListener('pointermove',   onVelPointerMove)
      velCanvas.addEventListener('pointerup',     onVelPointerUp)
      velCanvas.addEventListener('pointercancel', onVelPointerUp)

      // ── Initial draw ──────────────────────────────────────────────────────
      const { keyboardSize } = useStore.getState()
      const { min: initMin, max: initMax } = RANGES[keyboardSize] ?? RANGES[88]
      lastKeySizeRef.current = keyboardSize
      drawGrid(app.screen.width, app.screen.height, initMin, initMax)
      app.ticker.add(() => { drawFrame(); drawVelocityLane() })

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
        if (velocityCanvasRef.current) {
          velocityCanvasRef.current.width  = w
          velocityCanvasRef.current.height = Math.round(h * (1 - PLAYHEAD_RATIO))
        }
      })
      roInstance.observe(el)
    })

    return () => {
      roInstance?.disconnect()
      NES.onResetRequest = null
      if (overlayCanvasRef.current) {
        try { overlayCanvasRef.current.remove() } catch {}
        overlayCanvasRef.current = null
        overlayCtxRef.current    = null
      }
      if (velocityCanvasRef.current) {
        try { velocityCanvasRef.current.remove() } catch {}
        velocityCanvasRef.current = null
        velocityCtxRef.current    = null
      }
      try { hitEffectsRef.current?.destroy() } catch {}
      hitEffectsRef.current = null
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
      style={{ width: '100%', height: '100%', background: 'var(--bg)', overflow: 'hidden', position: 'relative' }}
    >
      <LoopOverlay />
      {/* ── Note-name tooltip — shown in edit mode when note is too small for inline text ── */}
      {editTooltip && (
        <div style={{
          position: 'fixed',
          left: editTooltip.x + 14,
          top:  editTooltip.y - 28,
          zIndex: 9500,
          background: 'var(--pianoroll-tooltip-bg)',
          border: '1px solid var(--state-hover-border)',
          borderRadius: 'var(--radius-sm)',
          padding: '2px 8px',
          fontSize: 'var(--text-xs)',
          fontFamily: "'JetBrains Mono', monospace",
          color: 'var(--text-default)',
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.5)',
        }}>
          {editTooltip.label}
        </div>
      )}
    </div>
  )
}
