import { useEffect, useRef } from 'react'
import { Application, Graphics } from 'pixi.js'
import { useStore } from '../../store'
import { isBlackKey } from '../../utils/midiParser'

const MIDI_MIN = 21
const MIDI_MAX = 108
const TOTAL_KEYS = MIDI_MAX - MIDI_MIN + 1
const VISIBLE_SECONDS = 6
const NOTE_RADIUS = 3
const MIN_NOTE_H = 4
const PLAYHEAD_RATIO = 0.80

interface KeyLayout { x: number; width: number }

function buildKeyLayout(W: number): KeyLayout[] {
  const whites: number[] = []
  for (let m = MIDI_MIN; m <= MIDI_MAX; m++) if (!isBlackKey(m)) whites.push(m)
  const ww = W / whites.length
  const bw = ww * 0.6
  const layout: KeyLayout[] = new Array(TOTAL_KEYS)
  let wi = 0
  for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
    const idx = m - MIDI_MIN
    if (!isBlackKey(m)) { layout[idx] = { x: wi * ww, width: ww }; wi++ }
    else layout[idx] = { x: wi * ww - bw / 2, width: bw }
  }
  return layout
}

export default function PianoRoll() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const gridRef = useRef<Graphics | null>(null)
  const notesRef = useRef<Graphics | null>(null)
  const playheadRef = useRef<Graphics | null>(null)
  const keyLayoutRef = useRef<KeyLayout[]>([])
  const storeRef = useRef(useStore.getState())

  // Keep storeRef current without causing re-renders
  useEffect(() => useStore.subscribe((s) => { storeRef.current = s }), [])

  // Wheel to scrub — native listener with passive:false so we can preventDefault
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

      const grid = new Graphics()
      const notes = new Graphics()
      const playhead = new Graphics()
      app.stage.addChild(grid)
      app.stage.addChild(notes)
      app.stage.addChild(playhead)
      gridRef.current = grid
      notesRef.current = notes
      playheadRef.current = playhead

      const drawGrid = (W: number, H: number) => {
        grid.clear()
        keyLayoutRef.current = buildKeyLayout(W)
        for (let m = MIDI_MIN; m <= MIDI_MAX; m++) {
          const key = keyLayoutRef.current[m - MIDI_MIN]
          if (!key) continue
          const isC = m % 12 === 0
          grid.rect(key.x, 0, 1, H)
          grid.fill({ color: isC ? 0x3a3a50 : 0x1e1e2a, alpha: 1 })
        }
      }

      const drawFrame = () => {
        const { midi, currentTime, tracks, detectedKey } = storeRef.current
        const transpose = (detectedKey as any)?.transpose ?? 0
        const W = app.screen.width
        const H = app.screen.height
        const py = H * PLAYHEAD_RATIO
        const pps = py / VISIBLE_SECONDS

        // Playhead
        playhead.clear()
        playhead.rect(0, py, W, 1)
        playhead.fill({ color: 0xe8a027, alpha: 0.6 })

        // Notes
        notes.clear()
        if (!midi) return

        const visStart = currentTime - VISIBLE_SECONDS * (1 - PLAYHEAD_RATIO)
        const visEnd = currentTime + VISIBLE_SECONDS * PLAYHEAD_RATIO

        for (const track of midi.tracks) {
          const ts = tracks.find((t) => t.index === track.index)
          if (ts && (!ts.visible || ts.muted)) continue
          const color = parseInt((ts?.color ?? track.color).replace('#', ''), 16)

          for (const note of track.notes) {
            if (note.time + note.duration < visStart || note.time > visEnd) continue
            const idx = (note.midi + (transpose ?? 0)) - MIDI_MIN
            if (idx < 0 || idx >= TOTAL_KEYS) continue
            const key = keyLayoutRef.current[idx]
            if (!key) continue

            // Distance from playhead: positive = above (future), negative = below (past)
            const topY = py - (note.time + note.duration - currentTime) * pps
            const botY = py - (note.time - currentTime) * pps
            const noteH = Math.max(botY - topY, MIN_NOTE_H)

            notes.roundRect(key.x + 1, topY, Math.max(key.width - 2, 1), noteH, NOTE_RADIUS)
            notes.fill({ color, alpha: 0.9 })
            // Bright top cap
            notes.rect(key.x + 1, topY, Math.max(key.width - 2, 1), 2)
            notes.fill({ color: 0xffffff, alpha: 0.25 })
          }
        }
      }

      // Initial grid draw
      drawGrid(app.screen.width, app.screen.height)

      // Ticker — runs every frame
      app.ticker.add(() => drawFrame())

      // Resize
      roInstance = new ResizeObserver(() => {
        if (!appRef.current) return
        const w = el.clientWidth
        const h = el.clientHeight
        appRef.current.renderer.resize(w, h)
        drawGrid(w, h)
      })
      roInstance.observe(el)
    })

    return () => {
      roInstance?.disconnect()
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
      style={{ width: '100%', height: '100%', background: '#0f0f12', overflow: 'hidden' }}
    />
  )
}
// Note: wheel scrub added below
