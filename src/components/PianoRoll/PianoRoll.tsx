import { useEffect, useRef } from 'react'
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

export default function PianoRoll() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const gridRef = useRef<Graphics | null>(null)
  const notesRef = useRef<Graphics | null>(null)
  const playheadRef = useRef<Graphics | null>(null)
  const keyLayoutRef = useRef<KeyLayout[]>([])
  const storeRef = useRef(useStore.getState())
  // Track last drawn keyboard size so we redraw grid on change
  const lastKeySizeRef = useRef<number>(0)
  const lastMidiRef    = useRef<any>(null)
  const flatNotesRef   = useRef<FlatNote[]>([])

  useEffect(() => useStore.subscribe((s) => { storeRef.current = s }), [])

  // Wheel to scrub
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

      const drawGrid = (W: number, H: number, midiMin: number, midiMax: number) => {
        grid.clear()
        keyLayoutRef.current = buildKeyLayout(W, midiMin, midiMax)
        const totalKeys = midiMax - midiMin + 1

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

      const drawFrame = () => {
        const { midi, currentTime, tracks, detectedKey, zoomLevel, appTheme, keyboardSize } = storeRef.current
        const transpose = (detectedKey as any)?.transpose ?? 0
        const W = app.screen.width
        const H = app.screen.height
        const py = H * PLAYHEAD_RATIO
        const visibleSecs = VISIBLE_SECONDS / (zoomLevel ?? 1)
        const pps = py / visibleSecs

        const { min: midiMin, max: midiMax } = RANGES[keyboardSize] ?? RANGES[88]
        const totalKeys = midiMax - midiMin + 1

        // Redraw grid if keyboard size changed
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
        if (!midi) return

        const visStart = currentTime - visibleSecs * (1 - PLAYHEAD_RATIO)
        const visEnd   = currentTime + visibleSecs * PLAYHEAD_RATIO

        // Rebuild flat sorted array once per midi file load
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
      style={{ width: '100%', height: '100%', background: 'var(--bg, #0f0f12)', overflow: 'hidden' }}
    />
  )
}
