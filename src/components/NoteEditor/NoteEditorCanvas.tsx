import { useEffect, useRef } from 'react'
import { Application, Graphics } from 'pixi.js'
import type { Midi } from '@tonejs/midi'
import { isBlackKey } from '../../utils/midiParser'
import { cmdAddNote, cmdRemoveNote, type ToneNote } from '../../utils/noteEditorCommands'
import type { NoteEditorHistory } from '../../utils/noteEditorHistory'

// ── Constants — RANGES matches PianoRoll.tsx and Keyboard.tsx exactly ─────────
const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}
const NOTE_RADIUS     = 3
const MIN_NOTE_H      = 4
const DRAG_THRESHOLD  = 4       // px of movement before axis locks
const PIXELS_PER_BEAT = 60      // px per quarter note at default zoom

interface KeyLayout { x: number; width: number }

// ── buildKeyLayout — identical to PianoRoll.tsx ───────────────────────────────
function buildKeyLayout(W: number, midiMin: number, midiMax: number): KeyLayout[] {
  const whites: number[] = []
  for (let m = midiMin; m <= midiMax; m++) if (!isBlackKey(m)) whites.push(m)
  const ww  = W / whites.length
  const bw  = ww * 0.6
  const len = midiMax - midiMin + 1
  const out = new Array<KeyLayout>(len)
  let wi = 0
  for (let m = midiMin; m <= midiMax; m++) {
    const i = m - midiMin
    if (!isBlackKey(m)) { out[i] = { x: wi * ww, width: ww }; wi++ }
    else                  out[i] = { x: wi * ww - bw / 2, width: bw }
  }
  return out
}

// ── xToMidi — black keys take priority over white keys ───────────────────────
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

// ── hitTest — note under canvas coords (cx, cy) with +2px padding per edge ───
function hitTest(
  cx: number, cy: number,
  notes: ToneNote[], layout: KeyLayout[], midiMin: number,
  ppt: number, scrollY: number,
): ToneNote | null {
  for (const note of notes) {
    const key = layout[note.midi - midiMin]
    if (!key) continue
    const top = note.ticks * ppt - scrollY
    const bot = (note.ticks + note.durationTicks) * ppt - scrollY
    if (cx >= key.x - 2 && cx < key.x + key.width + 2 &&
        cy >= top  - 2 && cy < bot + 2) return note
  }
  return null
}

interface DragState {
  note:         ToneNote
  origTicks:    number
  origMidi:     number
  origNoteX:    number   // canvas X of note centre at drag start
  startClientX: number
  startClientY: number
  axis:         'time' | 'pitch' | null
}

export interface NoteEditorCanvasProps {
  midi:            Midi
  trackIndex:      number
  trackColor:      string
  keyboardSize:    61 | 73 | 88
  history:         NoteEditorHistory
  onHistoryChange: () => void
}

// ── NoteEditorCanvas ──────────────────────────────────────────────────────────
// All PixiJS setup AND all event listeners are wired inside a single useEffect
// so listeners go directly onto app.canvas — avoiding bubbling/capture-phase
// conflicts with PixiJS's own pointer event system.
export default function NoteEditorCanvas({
  midi, trackIndex, trackColor, keyboardSize, history, onHistoryChange,
}: NoteEditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const track = midi.tracks[trackIndex] ?? null
    const ppq   = (midi.header as any).ppq ?? 480

    // ── Mutable session state — held in plain vars, accessed via closure ──────
    let layout:    KeyLayout[] = []
    let scrollY    = 0
    let ppt        = PIXELS_PER_BEAT / ppq
    let totalTicks = track
      ? track.notes.reduce((mx, n) => Math.max(mx, n.ticks + n.durationTicks), 0) + ppq * 8
      : ppq * 32
    let hoverNote: ToneNote | null = null
    let drag:      DragState | null = null

    const { min: midiMin, max: midiMax } = RANGES[keyboardSize] ?? RANGES[88]
    const noteColorHex = parseInt(trackColor.replace('#', ''), 16)
    const timeSig      = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
    const ticksPerBar  = ppq * timeSig[0]

    // ── PixiJS Application ────────────────────────────────────────────────────
    const app = new Application()
    let gridG:   Graphics
    let notesG:  Graphics
    let ro:      ResizeObserver
    let cleanupListeners: (() => void) | null = null

    // ── redraw — reads from closed-over vars ──────────────────────────────────
    const redraw = () => {
      if (!gridG || !notesG || !track) return
      const W = app.screen.width
      const H = app.screen.height

      gridG.clear()

      // Black key column shading
      for (let m = midiMin; m <= midiMax; m++) {
        const key = layout[m - midiMin]
        if (!key || !isBlackKey(m)) continue
        gridG.rect(key.x, 0, key.width, H)
        gridG.fill({ color: 0x161620, alpha: 1 })
      }
      // C-note octave dividers
      for (let m = midiMin; m <= midiMax; m++) {
        if (m % 12 !== 0) continue
        const key = layout[m - midiMin]
        if (!key) continue
        gridG.rect(Math.round(key.x), 0, 1, H)
        gridG.fill({ color: 0x2e2e48, alpha: 1 })
      }
      // Horizontal bar lines
      const firstBar = Math.floor(scrollY / ppt / ticksPerBar) * ticksPerBar
      for (let tick = firstBar; ; tick += ticksPerBar) {
        const y = Math.round(tick * ppt - scrollY)
        if (y > H + 4) break
        if (y >= -1) {
          gridG.rect(0, y, W, 1)
          gridG.fill({ color: 0x2e2e3a, alpha: 0.75 })
        }
      }

      // Notes
      notesG.clear()
      for (const note of track.notes) {
        const key   = layout[note.midi - midiMin]
        if (!key) continue
        const topY  = Math.round(note.ticks * ppt - scrollY)
        const noteH = Math.max(note.durationTicks * ppt, MIN_NOTE_H)
        if (topY + noteH < 0 || topY > H) continue

        const isHov  = note === hoverNote
        const isDrag = note === drag?.note

        // Amber halo for hover / active drag
        if (isHov || isDrag) {
          const hw = isDrag ? 2 : 1
          notesG.roundRect(key.x + 1 - hw, topY - hw, Math.max(key.width - 2, 1) + hw * 2, noteH + hw * 2, NOTE_RADIUS + 1)
          notesG.fill({ color: 0xe8a027, alpha: isDrag ? 0.9 : 0.6 })
        }

        // Note body
        notesG.roundRect(key.x + 1, topY, Math.max(key.width - 2, 1), noteH, NOTE_RADIUS)
        notesG.fill({ color: noteColorHex, alpha: isDrag || isHov ? 1.0 : 0.85 })

        // Top highlight stripe — matches PianoRoll style
        notesG.rect(key.x + 1, topY, Math.max(key.width - 2, 1), 2)
        notesG.fill({ color: 0xffffff, alpha: 0.22 })
      }
    }

    // ── Wire up all events on app.canvas after PixiJS init resolves ──────────
    app.init({
      background: 0x0f0f12,
      width:  el.clientWidth  || 800,
      height: el.clientHeight || 600,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (!containerRef.current) { app.destroy(false); return }

      el.appendChild(app.canvas)

      gridG  = new Graphics()
      notesG = new Graphics()
      app.stage.addChild(gridG)
      app.stage.addChild(notesG)

      layout     = buildKeyLayout(app.screen.width, midiMin, midiMax)
      ppt        = PIXELS_PER_BEAT / ppq
      totalTicks = track
        ? track.notes.reduce((mx, n) => Math.max(mx, n.ticks + n.durationTicks), 0) + ppq * 8
        : ppq * 32

      redraw()

      // ── ResizeObserver ────────────────────────────────────────────────────
      ro = new ResizeObserver(() => {
        const w = el.clientWidth
        const h = el.clientHeight
        if (w > 0 && h > 0) {
          app.renderer.resize(w, h)
          layout = buildKeyLayout(w, midiMin, midiMax)
          redraw()
        }
      })
      ro.observe(el)

      // ── Canvas coordinate helper ──────────────────────────────────────────
      const toCanvas = (clientX: number, clientY: number) => {
        const r = app.canvas.getBoundingClientRect()
        return { cx: clientX - r.left, cy: clientY - r.top }
      }

      // ── Pointer: down ─────────────────────────────────────────────────────
      const onDown = (e: PointerEvent) => {
        if (e.button !== 0 || !track) return
        const { cx, cy } = toCanvas(e.clientX, e.clientY)
        const note = hitTest(cx, cy, track.notes, layout, midiMin, ppt, scrollY)

        if (note) {
          const key = layout[note.midi - midiMin]
          drag = {
            note,
            origTicks:    note.ticks,
            origMidi:     note.midi,
            origNoteX:    key ? key.x + key.width / 2 : cx,
            startClientX: e.clientX,
            startClientY: e.clientY,
            axis: null,
          }
          app.canvas.setPointerCapture(e.pointerId)
          app.canvas.style.cursor = 'move'
        } else {
          // Add note at click position
          const midi_num   = xToMidi(cx, layout, midiMin, midiMax)
          const startTick  = Math.max(0, Math.round((cy + scrollY) / ppt))
          const cmd = cmdAddNote(track, {
            midi: midi_num, ticks: startTick,
            durationTicks: ppq, velocity: 0.8,
          })
          cmd.apply()
          history.push(cmd)
          redraw()
          onHistoryChange()
        }
      }

      // ── Pointer: move ─────────────────────────────────────────────────────
      const onMove = (e: PointerEvent) => {
        const { cx, cy } = toCanvas(e.clientX, e.clientY)

        if (!drag) {
          if (!track) return
          const hit = hitTest(cx, cy, track.notes, layout, midiMin, ppt, scrollY)
          if (hit !== hoverNote) {
            hoverNote = hit
            app.canvas.style.cursor = hit ? 'move' : 'crosshair'
            redraw()
          }
          return
        }

        const dx = e.clientX - drag.startClientX
        const dy = e.clientY - drag.startClientY

        if (drag.axis === null &&
            (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
          drag.axis = Math.abs(dy) >= Math.abs(dx) ? 'time' : 'pitch'
          app.canvas.style.cursor = drag.axis === 'time' ? 'ns-resize' : 'ew-resize'
        }
        if (drag.axis === null) return

        if (drag.axis === 'time') {
          drag.note.ticks = Math.max(0, drag.origTicks + Math.round(dy / ppt))
          if (track) track.notes.sort((a, b) => a.ticks - b.ticks)
        } else {
          const targetX = drag.origNoteX + dx
          drag.note.midi = Math.max(midiMin, Math.min(midiMax,
            xToMidi(targetX, layout, midiMin, midiMax)))
        }
        redraw()
      }

      // ── Pointer: up ───────────────────────────────────────────────────────
      const onUp = (e: PointerEvent) => {
        if (!drag || !track) { drag = null; return }

        const movedTime  = drag.axis === 'time'  && drag.note.ticks !== drag.origTicks
        const movedPitch = drag.axis === 'pitch' && drag.note.midi  !== drag.origMidi

        if (movedTime) {
          const note = drag.note, ft = note.ticks, ot = drag.origTicks
          history.push({
            description: `Move note midi=${note.midi}: tick ${ot} → ${ft}`,
            apply()  { note.ticks = ft; track.notes.sort((a, b) => a.ticks - b.ticks) },
            revert() { note.ticks = ot; track.notes.sort((a, b) => a.ticks - b.ticks) },
          })
          onHistoryChange()
        } else if (movedPitch) {
          const note = drag.note, fm = note.midi, om = drag.origMidi
          history.push({
            description: `Repitch note: midi ${om} → ${fm}`,
            apply()  { note.midi = fm },
            revert() { note.midi = om },
          })
          onHistoryChange()
        }

        app.canvas.releasePointerCapture(e.pointerId)
        app.canvas.style.cursor = 'crosshair'
        drag = null
        redraw()
      }

      // ── Context menu (right-click) → delete ──────────────────────────────
      const onContext = (e: MouseEvent) => {
        e.preventDefault()
        if (!track) return
        const { cx, cy } = toCanvas(e.clientX, e.clientY)
        const note = hitTest(cx, cy, track.notes, layout, midiMin, ppt, scrollY)
        if (!note) return
        const cmd = cmdRemoveNote(track, note)
        cmd.apply()
        history.push(cmd)
        if (hoverNote === note) hoverNote = null
        redraw()
        onHistoryChange()
      }

      // ── Mouse wheel → scroll ──────────────────────────────────────────────
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const maxScroll = Math.max(0, totalTicks * ppt - app.screen.height)
        scrollY = Math.max(0, Math.min(maxScroll, scrollY + e.deltaY))
        redraw()
      }

      // ── Keyboard shortcuts ────────────────────────────────────────────────
      const onKey = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return
        if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
          e.preventDefault()
          if (history.undo()) { redraw(); onHistoryChange() }
        } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
          e.preventDefault()
          if (history.redo()) { redraw(); onHistoryChange() }
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && hoverNote && track) {
          e.preventDefault()
          const cmd = cmdRemoveNote(track, hoverNote)
          cmd.apply()
          history.push(cmd)
          hoverNote = null
          redraw()
          onHistoryChange()
        }
      }

      app.canvas.addEventListener('pointerdown',   onDown)
      app.canvas.addEventListener('pointermove',   onMove)
      app.canvas.addEventListener('pointerup',     onUp)
      app.canvas.addEventListener('pointercancel', onUp)
      app.canvas.addEventListener('contextmenu',   onContext)
      app.canvas.addEventListener('wheel',         onWheel, { passive: false })
      window.addEventListener('keydown', onKey)

      cleanupListeners = () => {
        app.canvas.removeEventListener('pointerdown',   onDown)
        app.canvas.removeEventListener('pointermove',   onMove)
        app.canvas.removeEventListener('pointerup',     onUp)
        app.canvas.removeEventListener('pointercancel', onUp)
        app.canvas.removeEventListener('contextmenu',   onContext)
        app.canvas.removeEventListener('wheel',         onWheel)
        window.removeEventListener('keydown', onKey)
      }
    })

    return () => {
      cleanupListeners?.()
      ro?.disconnect()
      try { app.canvas?.remove()  } catch {}
      try { app.destroy(false)    } catch {}
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps — all values are stable for a Phase 1 session

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%',
        background: '#0f0f12',
        overflow: 'hidden',
        position: 'relative',
        touchAction: 'none',
        userSelect: 'none',
      }}
    />
  )
}
