import { useEffect, useRef } from 'react'
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js'
import type { Midi } from '@tonejs/midi'
import { isBlackKey } from '../../utils/midiParser'
import {
  cmdAddNote, cmdRemoveNote, cmdRemoveNotes,
  type ToneNote,
} from '../../utils/noteEditorCommands'
import type { NoteEditorHistory } from '../../utils/noteEditorHistory'

// ── Constants — RANGES matches PianoRoll.tsx and Keyboard.tsx exactly ─────────
const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}
const NOTE_RADIUS      = 3
const MIN_NOTE_H       = 4
const DRAG_THRESHOLD   = 4
const PIXELS_PER_BEAT  = 60
const RESIZE_ZONE_PX   = 6
const MAX_BAR_LABELS   = 64
const MAX_NOTE_LABELS  = 512
const NOTE_NAME_MIN_H  = 14   // notes shorter than this get tooltip, not inline label
const SEL_COLOR        = 0x4488ee  // blue selection / marquee

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

// ── xToMidi ───────────────────────────────────────────────────────────────────
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

// ── hitTest ───────────────────────────────────────────────────────────────────
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

// ── DragState ─────────────────────────────────────────────────────────────────
interface DragState {
  mode:               'note-move' | 'note-resize' | 'selection-move'
  note:               ToneNote
  origTicks:          number
  origMidi:           number
  origDurationTicks:  number
  origNoteX:          number
  startClientX:       number
  startClientY:       number
  axis:               'time' | 'pitch' | null
  selectionSnapshot?: Array<{ note: ToneNote; origTicks: number }>
}

interface MarqueeState {
  startX: number; startY: number
  endX:   number; endY:   number
  additive: boolean
}

export interface NoteEditorCanvasProps {
  midi:               Midi
  trackIndex:         number
  trackColor:         string
  keyboardSize:       61 | 73 | 88
  history:            NoteEditorHistory
  onHistoryChange:    () => void
  toolModeRef:        { current: 'pencil' | 'select' }
  snapRef:            { current: boolean }
  quantizeDivisorRef: { current: 4 | 8 | 16 | 32 }
  redrawRef:          { current: (() => void) | null }
  showNoteNamesRef:   { current: boolean }
  noteNameRef:        { current: (midi: number) => string }
  hoverInfoRef:       { current: ((note: ToneNote | null, clientX: number, clientY: number) => void) | null }
}

// ── NoteEditorCanvas ──────────────────────────────────────────────────────────
export default function NoteEditorCanvas({
  midi, trackIndex, trackColor, keyboardSize, history, onHistoryChange,
  toolModeRef, snapRef, quantizeDivisorRef, redrawRef,
  showNoteNamesRef, noteNameRef, hoverInfoRef,
}: NoteEditorCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const track = midi.tracks[trackIndex] ?? null
    const ppq   = (midi.header as any).ppq ?? 480

    let layout:        KeyLayout[] = []
    let scrollY        = 0
    let ppt            = PIXELS_PER_BEAT / ppq
    let totalTicks     = track
      ? track.notes.reduce((mx, n) => Math.max(mx, n.ticks + n.durationTicks), 0) + ppq * 8
      : ppq * 32
    let hoverNote:     ToneNote | null = null
    let drag:          DragState | null = null
    let marquee:       MarqueeState | null = null
    let selectedNotes: Set<ToneNote> = new Set()

    const { min: midiMin, max: midiMax } = RANGES[keyboardSize] ?? RANGES[88]
    const noteColorHex = parseInt(trackColor.replace('#', ''), 16)
    const timeSig      = midi.header.timeSignatures[0]?.timeSignature ?? [4, 4]
    const ticksPerBar  = ppq * timeSig[0]

    // ── snapTick ──────────────────────────────────────────────────────────────
    const snapTick = (tick: number): number => {
      if (!snapRef.current) return Math.max(0, tick)
      const unit = ppq / (quantizeDivisorRef.current ?? 8)
      return Math.max(0, Math.round(tick / unit) * unit)
    }

    const app = new Application()
    let gridG:            Graphics
    let notesG:           Graphics
    let selectG:          Graphics
    let barNumsContainer: Container
    let noteNamesContainer: Container
    let barLabels:        Text[] = []
    let noteNameLabels:   Text[] = []
    let ro:               ResizeObserver
    let cleanupListeners: (() => void) | null = null

    // ── redraw ────────────────────────────────────────────────────────────────
    const redraw = () => {
      if (!gridG || !notesG || !selectG || !track) return
      const W = app.screen.width
      const H = app.screen.height

      // ── Background grid: black key columns + octave lines + bar lines ──────
      gridG.clear()
      for (let m = midiMin; m <= midiMax; m++) {
        const key = layout[m - midiMin]
        if (!key || !isBlackKey(m)) continue
        gridG.rect(key.x, 0, key.width, H)
        gridG.fill({ color: 0x161620, alpha: 1 })
      }
      for (let m = midiMin; m <= midiMax; m++) {
        if (m % 12 !== 0) continue
        const key = layout[m - midiMin]
        if (!key) continue
        gridG.rect(Math.round(key.x), 0, 1, H)
        gridG.fill({ color: 0x2e2e48, alpha: 1 })
      }
      const firstBarIdx = Math.floor(scrollY / ppt / ticksPerBar)
      for (let bi = firstBarIdx; ; bi++) {
        const y = Math.round(bi * ticksPerBar * ppt - scrollY)
        if (y > H + 4) break
        if (y >= -1) {
          gridG.rect(0, y, W, 1)
          gridG.fill({ color: 0x2e2e3a, alpha: 0.75 })
        }
      }

      // ── Bar number labels ─────────────────────────────────────────────────
      barLabels.forEach(t => { t.visible = false })
      let li = 0
      for (let bi = firstBarIdx; li < MAX_BAR_LABELS; bi++) {
        const y = Math.round(bi * ticksPerBar * ppt - scrollY)
        if (y > H + 4) break
        if (y >= -4) {
          const t = barLabels[li++]
          t.text = String(bi + 1)
          t.position.set(4, y + 3)
          t.visible = true
        }
      }

      // ── Note bodies — white key notes drawn first, black key notes on top ──
      notesG.clear()
      const drawNote = (note: ToneNote) => {
        const key  = layout[note.midi - midiMin]
        if (!key) return
        const topY  = Math.round(note.ticks * ppt - scrollY)
        const noteH = Math.max(note.durationTicks * ppt, MIN_NOTE_H)
        if (topY + noteH < 0 || topY > H) return
        const isHov  = note === hoverNote
        const isDrag = note === drag?.note
        if (isHov || isDrag) {
          const hw = isDrag ? 2 : 1
          notesG.roundRect(key.x + 1 - hw, topY - hw, Math.max(key.width - 2, 1) + hw * 2, noteH + hw * 2, NOTE_RADIUS + 1)
          notesG.fill({ color: 0xe8a027, alpha: isDrag ? 0.9 : 0.6 })
        }
        notesG.roundRect(key.x + 1, topY, Math.max(key.width - 2, 1), noteH, NOTE_RADIUS)
        notesG.fill({ color: noteColorHex, alpha: 0.9 })
        notesG.rect(key.x + 1, topY, Math.max(key.width - 2, 1), 2)
        notesG.fill({ color: 0xffffff, alpha: 0.22 })
      }
      for (const note of track.notes) if (!isBlackKey(note.midi)) drawNote(note)
      for (const note of track.notes) if (isBlackKey(note.midi))  drawNote(note)

      // ── Selection highlights + marquee ────────────────────────────────────
      selectG.clear()
      for (const note of selectedNotes) {
        const key  = layout[note.midi - midiMin]
        if (!key) continue
        const topY  = Math.round(note.ticks * ppt - scrollY)
        const noteH = Math.max(note.durationTicks * ppt, MIN_NOTE_H)
        if (topY + noteH < 0 || topY > H) continue
        selectG.roundRect(key.x + 1, topY - 1, Math.max(key.width - 2, 1), noteH + 2, NOTE_RADIUS)
        selectG.stroke({ color: SEL_COLOR, width: 2, alpha: 0.85 })
      }
      if (marquee) {
        const mx = Math.min(marquee.startX, marquee.endX)
        const my = Math.min(marquee.startY, marquee.endY)
        const mw = Math.abs(marquee.endX - marquee.startX)
        const mh = Math.abs(marquee.endY - marquee.startY)
        selectG.rect(mx, my, mw, mh)
        selectG.fill({ color: SEL_COLOR, alpha: 0.07 })
        selectG.rect(mx, my, mw, mh)
        selectG.stroke({ color: SEL_COLOR, width: 1, alpha: 0.45 })
      }

      // ── Inline note name labels (PixiJS Text pool, same pipeline as notes) ─
      noteNameLabels.forEach(t => { t.visible = false })
      if (showNoteNamesRef.current) {
        let ni = 0
        for (const note of track.notes) {
          if (ni >= noteNameLabels.length) break
          const key  = layout[note.midi - midiMin]
          if (!key) continue
          const topY  = Math.round(note.ticks * ppt - scrollY)
          const noteH = Math.max(note.durationTicks * ppt, MIN_NOTE_H)
          if (topY + noteH < 0 || topY > H) continue
          if (noteH < NOTE_NAME_MIN_H) continue
          const t = noteNameLabels[ni++]
          t.text = noteNameRef.current(note.midi)
          t.position.set(key.x + key.width / 2, topY + noteH / 2)
          t.visible = true
        }
      }
    }

    // ── updateMarqueeSelection ────────────────────────────────────────────────
    const updateMarqueeSelection = () => {
      if (!marquee || !track) return
      const x1 = Math.min(marquee.startX, marquee.endX)
      const x2 = Math.max(marquee.startX, marquee.endX)
      const y1 = Math.min(marquee.startY, marquee.endY)
      const y2 = Math.max(marquee.startY, marquee.endY)
      if (!marquee.additive) selectedNotes.clear()
      for (const note of track.notes) {
        const key = layout[note.midi - midiMin]
        if (!key) continue
        const topY = note.ticks * ppt - scrollY
        const botY = (note.ticks + note.durationTicks) * ppt - scrollY
        if (key.x + key.width > x1 && key.x < x2 && botY > y1 && topY < y2) {
          selectedNotes.add(note)
        }
      }
    }

    app.init({
      background:  0x0f0f12,
      width:       el.clientWidth  || 800,
      height:      el.clientHeight || 600,
      antialias:   true,
      resolution:  window.devicePixelRatio || 1,
      autoDensity: true,
    }).then(() => {
      if (!containerRef.current) { app.destroy(false); return }

      el.appendChild(app.canvas)

      gridG            = new Graphics()
      notesG           = new Graphics()
      selectG          = new Graphics()
      barNumsContainer = new Container()
      noteNamesContainer = new Container()
      app.stage.addChild(gridG)
      app.stage.addChild(notesG)
      app.stage.addChild(selectG)
      app.stage.addChild(noteNamesContainer)
      app.stage.addChild(barNumsContainer)

      // ── Bar number text pool ──────────────────────────────────────────────
      const barStyle = new TextStyle({
        fontSize:   10,
        fill:       '#505570',
        fontFamily: "'JetBrains Mono', monospace",
      })
      for (let i = 0; i < MAX_BAR_LABELS; i++) {
        const t = new Text({ text: '', style: barStyle })
        t.visible = false
        barNumsContainer.addChild(t)
        barLabels.push(t)
      }

      // ── Note name text pool (dark text on amber note bodies) ──────────────
      const nameStyle = new TextStyle({
        fontSize:   9,
        fill:       '#111008',
        fontFamily: "'JetBrains Mono', monospace",
      })
      for (let i = 0; i < MAX_NOTE_LABELS; i++) {
        const t = new Text({ text: '', style: nameStyle })
        t.visible = false
        t.anchor.set(0.5, 0.5)
        noteNamesContainer.addChild(t)
        noteNameLabels.push(t)
      }

      layout     = buildKeyLayout(app.screen.width, midiMin, midiMax)
      ppt        = PIXELS_PER_BEAT / ppq
      totalTicks = track
        ? track.notes.reduce((mx, n) => Math.max(mx, n.ticks + n.durationTicks), 0) + ppq * 8
        : ppq * 32

      redrawRef.current = redraw
      redraw()

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

      const toCanvas = (clientX: number, clientY: number) => {
        const r = app.canvas.getBoundingClientRect()
        return { cx: clientX - r.left, cy: clientY - r.top }
      }

      const updateHoverCursor = (cx: number, cy: number, note: ToneNote | null, altKey: boolean) => {
        if ((toolModeRef.current ?? 'pencil') === 'pencil') {
          if (note) {
            const botY = (note.ticks + note.durationTicks) * ppt - scrollY
            app.canvas.style.cursor = cy >= botY - RESIZE_ZONE_PX ? 'ns-resize' : 'move'
          } else {
            app.canvas.style.cursor = altKey ? 'crosshair' : 'default'
          }
        } else {
          app.canvas.style.cursor = note ? 'move' : 'crosshair'
        }
      }

      // ── onDown ────────────────────────────────────────────────────────────
      const onDown = (e: PointerEvent) => {
        if (e.button !== 0 || !track) return
        hoverInfoRef.current?.(null, 0, 0)
        const { cx, cy } = toCanvas(e.clientX, e.clientY)
        const tool = toolModeRef.current ?? 'pencil'
        const note = hitTest(cx, cy, track.notes, layout, midiMin, ppt, scrollY)

        if (tool === 'pencil') {
          if (note) {
            const botY     = (note.ticks + note.durationTicks) * ppt - scrollY
            const isResize = cy >= botY - RESIZE_ZONE_PX
            const key      = layout[note.midi - midiMin]
            drag = {
              mode:              isResize ? 'note-resize' : 'note-move',
              note,
              origTicks:         note.ticks,
              origMidi:          note.midi,
              origDurationTicks: note.durationTicks,
              origNoteX:         key ? key.x + key.width / 2 : cx,
              startClientX:      e.clientX,
              startClientY:      e.clientY,
              axis:              null,
            }
            app.canvas.setPointerCapture(e.pointerId)
            app.canvas.style.cursor = isResize ? 'ns-resize' : 'move'
          } else if (e.altKey) {
            const midiNum   = xToMidi(cx, layout, midiMin, midiMax)
            const startTick = snapTick(Math.max(0, Math.round((cy + scrollY) / ppt)))
            const cmd = cmdAddNote(track, {
              midi: midiNum, ticks: startTick, durationTicks: ppq, velocity: 0.8,
            })
            cmd.apply()
            history.push(cmd)
            totalTicks = Math.max(totalTicks, startTick + ppq + ppq * 4)
            redraw()
            onHistoryChange()
          }
        } else {
          if (note) {
            if (!e.shiftKey && !selectedNotes.has(note)) selectedNotes.clear()
            selectedNotes.add(note)
            const key = layout[note.midi - midiMin]
            drag = {
              mode:              'selection-move',
              note,
              origTicks:         note.ticks,
              origMidi:          note.midi,
              origDurationTicks: note.durationTicks,
              origNoteX:         key ? key.x + key.width / 2 : cx,
              startClientX:      e.clientX,
              startClientY:      e.clientY,
              axis:              'time',
              selectionSnapshot: [...selectedNotes].map(n => ({ note: n, origTicks: n.ticks })),
            }
            app.canvas.setPointerCapture(e.pointerId)
            app.canvas.style.cursor = 'move'
          } else {
            marquee = { startX: cx, startY: cy, endX: cx, endY: cy, additive: e.shiftKey }
            if (!e.shiftKey) selectedNotes.clear()
          }
          redraw()
        }
      }

      // ── onMove ────────────────────────────────────────────────────────────
      const onMove = (e: PointerEvent) => {
        const { cx, cy } = toCanvas(e.clientX, e.clientY)

        if (!drag && !marquee) {
          if (!track) return
          const hit = hitTest(cx, cy, track.notes, layout, midiMin, ppt, scrollY)
          if (hit !== hoverNote) { hoverNote = hit; redraw() }
          updateHoverCursor(cx, cy, hit, e.altKey)
          if (hit) {
            const noteH = Math.max(hit.durationTicks * ppt, MIN_NOTE_H)
            hoverInfoRef.current?.(noteH < NOTE_NAME_MIN_H ? hit : null, e.clientX, e.clientY)
          } else {
            hoverInfoRef.current?.(null, e.clientX, e.clientY)
          }
          return
        }

        if (marquee) {
          marquee = { ...marquee, endX: cx, endY: cy }
          updateMarqueeSelection()
          redraw()
          return
        }

        if (!drag) return

        if (drag.mode === 'note-resize') {
          const dy = e.clientY - drag.startClientY
          const rawEnd     = drag.origTicks + drag.origDurationTicks + Math.round(dy / ppt)
          const snappedEnd = snapTick(rawEnd)
          drag.note.durationTicks = Math.max(Math.round(ppq / 16), snappedEnd - drag.origTicks)
          redraw()
          return
        }

        const dx = e.clientX - drag.startClientX
        const dy = e.clientY - drag.startClientY

        if (drag.mode === 'note-move') {
          if (drag.axis === null &&
              (Math.abs(dx) > DRAG_THRESHOLD || Math.abs(dy) > DRAG_THRESHOLD)) {
            drag.axis = Math.abs(dy) >= Math.abs(dx) ? 'time' : 'pitch'
            app.canvas.style.cursor = drag.axis === 'time' ? 'ns-resize' : 'ew-resize'
          }
          if (drag.axis === null) return
          if (drag.axis === 'time') {
            drag.note.ticks = snapTick(Math.max(0, drag.origTicks + Math.round(dy / ppt)))
            track.notes.sort((a, b) => a.ticks - b.ticks)
          } else {
            drag.note.midi = Math.max(midiMin, Math.min(midiMax,
              xToMidi(drag.origNoteX + dx, layout, midiMin, midiMax)))
          }
        } else {
          for (const snap of drag.selectionSnapshot!) {
            snap.note.ticks = snapTick(Math.max(0, snap.origTicks + Math.round(dy / ppt)))
          }
          track.notes.sort((a, b) => a.ticks - b.ticks)
        }
        redraw()
      }

      // ── onUp ──────────────────────────────────────────────────────────────
      const onUp = (e: PointerEvent) => {
        if (marquee) {
          updateMarqueeSelection()
          marquee = null
          redraw()
          return
        }

        if (!drag || !track) { drag = null; return }

        if (drag.mode === 'note-resize') {
          const note = drag.note
          const fDur = note.durationTicks
          const oDur = drag.origDurationTicks
          if (fDur !== oDur) {
            history.push({
              description: `Resize note midi=${note.midi}: ${oDur} → ${fDur} ticks`,
              apply()  { note.durationTicks = fDur },
              revert() { note.durationTicks = oDur },
            })
            onHistoryChange()
          } else {
            note.durationTicks = oDur
          }
          app.canvas.releasePointerCapture(e.pointerId)
          drag = null
          redraw()
          return
        }

        if (drag.mode === 'selection-move') {
          const snapshot = drag.selectionSnapshot!
          const anyMoved = snapshot.some(s => s.note.ticks !== s.origTicks)
          if (anyMoved) {
            const finalTicks = snapshot.map(s => s.note.ticks)
            history.push({
              description: `Move ${snapshot.length} note${snapshot.length > 1 ? 's' : ''}`,
              apply()  {
                snapshot.forEach((s, i) => { s.note.ticks = finalTicks[i] })
                track!.notes.sort((a, b) => a.ticks - b.ticks)
              },
              revert() {
                snapshot.forEach(s => { s.note.ticks = s.origTicks })
                track!.notes.sort((a, b) => a.ticks - b.ticks)
              },
            })
            onHistoryChange()
          } else {
            snapshot.forEach(s => { s.note.ticks = s.origTicks })
          }
          app.canvas.releasePointerCapture(e.pointerId)
          drag = null
          redraw()
          return
        }

        const movedTime  = drag.axis === 'time'  && drag.note.ticks !== drag.origTicks
        const movedPitch = drag.axis === 'pitch' && drag.note.midi  !== drag.origMidi

        if (movedTime) {
          const note = drag.note, ft = note.ticks, ot = drag.origTicks
          history.push({
            description: `Move note midi=${note.midi}: tick ${ot} → ${ft}`,
            apply()  { note.ticks = ft; track!.notes.sort((a, b) => a.ticks - b.ticks) },
            revert() { note.ticks = ot; track!.notes.sort((a, b) => a.ticks - b.ticks) },
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

      // ── onContext ─────────────────────────────────────────────────────────
      const onContext = (e: MouseEvent) => {
        e.preventDefault()
        if (!track || (toolModeRef.current ?? 'pencil') !== 'pencil') return
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

      // ── onWheel ───────────────────────────────────────────────────────────
      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const maxScroll = Math.max(0, totalTicks * ppt - app.screen.height)
        scrollY = Math.max(0, Math.min(maxScroll, scrollY + e.deltaY))
        redraw()
      }

      // ── onKey ─────────────────────────────────────────────────────────────
      const onKey = (e: KeyboardEvent) => {
        if (e.target instanceof HTMLInputElement) return
        // Block spacebar — prevent it reaching the global playback toggle
        if (e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); return }
        const tool = toolModeRef.current ?? 'pencil'

        if (e.ctrlKey && !e.shiftKey && e.key === 'z') {
          e.preventDefault()
          if (history.undo()) { redraw(); onHistoryChange() }
        } else if (e.ctrlKey && (e.key === 'y' || (e.shiftKey && e.key === 'Z'))) {
          e.preventDefault()
          if (history.redo()) { redraw(); onHistoryChange() }
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && track) {
          e.preventDefault()
          if (tool === 'select' && selectedNotes.size > 0) {
            const notes = [...selectedNotes]
            const cmd = cmdRemoveNotes(track, notes)
            cmd.apply()
            history.push(cmd)
            selectedNotes.clear()
            hoverNote = null
            redraw()
            onHistoryChange()
          } else if (tool === 'pencil' && hoverNote) {
            const cmd = cmdRemoveNote(track, hoverNote)
            cmd.apply()
            history.push(cmd)
            hoverNote = null
            redraw()
            onHistoryChange()
          }
        }
      }

      // Register onKey in capture phase so spacebar block fires before window bubble listeners
      app.canvas.addEventListener('pointerdown',   onDown)
      app.canvas.addEventListener('pointermove',   onMove)
      app.canvas.addEventListener('pointerup',     onUp)
      app.canvas.addEventListener('pointercancel', onUp)
      app.canvas.addEventListener('contextmenu',   onContext)
      app.canvas.addEventListener('wheel',         onWheel, { passive: false })
      window.addEventListener('keydown', onKey, { capture: true })

      cleanupListeners = () => {
        app.canvas.removeEventListener('pointerdown',   onDown)
        app.canvas.removeEventListener('pointermove',   onMove)
        app.canvas.removeEventListener('pointerup',     onUp)
        app.canvas.removeEventListener('pointercancel', onUp)
        app.canvas.removeEventListener('contextmenu',   onContext)
        app.canvas.removeEventListener('wheel',         onWheel)
        window.removeEventListener('keydown', onKey, { capture: true })
      }
    })

    return () => {
      redrawRef.current = null
      cleanupListeners?.()
      ro?.disconnect()
      try { app.canvas?.remove()  } catch {}
      try { app.destroy(false)    } catch {}
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={containerRef}
      style={{
        width: '100%', height: '100%',
        position: 'relative',
        background: '#0f0f12',
        touchAction: 'none',
        userSelect: 'none',
        overflow: 'hidden',
      }}
    />
  )
}
