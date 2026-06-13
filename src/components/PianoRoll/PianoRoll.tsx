import { useEffect, useRef } from 'react'
import { Application, Graphics, Container } from 'pixi.js'
import { useStore } from '@/store'
import { hexToPixi } from '@/utils/colors'

const NOTE_SPEED = 200

export default function PianoRoll() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const notesContainerRef = useRef<Container | null>(null)
  const gridRef = useRef<Graphics | null>(null)
  const playheadRef = useRef<Graphics | null>(null)
  const initializedRef = useRef(false)

  const { midiFile, tracks, position, tempo } = useStore()

  useEffect(() => {
    if (!containerRef.current || initializedRef.current) return
    initializedRef.current = true
    const container = containerRef.current

    const app = new Application()
    app.init({
      width: container.clientWidth || 800,
      height: container.clientHeight || 400,
      background: 0x0f0f12,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio || 1,
    }).then(() => {
      container.appendChild(app.canvas)
      appRef.current = app

      const grid = new Graphics()
      app.stage.addChild(grid)
      gridRef.current = grid

      const notesContainer = new Container()
      app.stage.addChild(notesContainer)
      notesContainerRef.current = notesContainer

      const playhead = new Graphics()
      app.stage.addChild(playhead)
      playheadRef.current = playhead

      redrawGrid()

      const ro = new ResizeObserver(() => {
        app.renderer.resize(container.clientWidth, container.clientHeight)
        redrawGrid()
      })
      ro.observe(container)
    })

    function redrawGrid() {
      const grid = gridRef.current
      const playhead = playheadRef.current
      if (!appRef.current || !grid || !playhead) return
      const { width, height } = appRef.current.screen

      grid.clear()
      const blackKeyIndices = [1, 3, 6, 8, 10]
      for (let midi = 21; midi <= 108; midi++) {
        if (blackKeyIndices.includes(midi % 12)) {
          grid.rect(midiToX(midi, width), 0, getLaneWidth(width), height)
          grid.fill({ color: 0x13131a })
        }
      }
      for (let midi = 21; midi <= 108; midi++) {
        grid.moveTo(midiToX(midi, width), 0)
        grid.lineTo(midiToX(midi, width), height)
        grid.stroke({ color: 0x2a2a36, alpha: 0.5, width: 1 })
      }

      playhead.clear()
      playhead.moveTo(0, height - 164)
      playhead.lineTo(width, height - 164)
      playhead.stroke({ color: 0xe8a027, alpha: 0.8, width: 2 })
    }

    return () => {
      appRef.current?.destroy(true)
      appRef.current = null
      initializedRef.current = false
    }
  }, [])

  useEffect(() => {
    const app = appRef.current
    const notesContainer = notesContainerRef.current
    if (!app || !notesContainer || !midiFile) return

    notesContainer.removeChildren()
    const { width, height } = app.screen
    const keyboardY = height - 164
    const tempoRatio = tempo / midiFile.bpm

    tracks.forEach(track => {
      if (track.muted || !track.visible) return
      const color = hexToPixi(track.color)
      track.notes.forEach(note => {
        const secondsFromNow = note.time - position.seconds
        const y = keyboardY - secondsFromNow * NOTE_SPEED * tempoRatio
        const h = Math.max(4, note.duration * NOTE_SPEED * tempoRatio)
        if (y < -h || y > height + h) return
        const block = new Graphics()
        block.roundRect(midiToX(note.midi, width) + 1, y - h, getLaneWidth(width) - 2, h - 1, 2)
        block.fill({ color, alpha: 0.85 })
        notesContainer.addChild(block)
      })
    })
  }, [midiFile, tracks, position, tempo])

  return (
    <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', background: '#0f0f12' }}>
      {!midiFile && (
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 12,
          color: '#4a4a60', pointerEvents: 'none'
        }}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
            <path d="M9 18V5l12-2v13"/>
            <circle cx="6" cy="18" r="3"/>
            <circle cx="18" cy="16" r="3"/>
          </svg>
          <div style={{ fontSize: 14 }}>Open a MIDI file to begin</div>
          <div style={{ fontSize: 11, opacity: 0.6 }}>Click the folder icon in the top bar</div>
        </div>
      )}
    </div>
  )
}

function midiToX(midi: number, totalWidth: number): number {
  return getWhiteKeyPosition(midi) * (totalWidth / 52)
}
function getLaneWidth(totalWidth: number): number {
  return totalWidth / 88
}
function getWhiteKeyPosition(midi: number): number {
  const octave = Math.floor((midi - 21) / 12)
  const noteInOctave = (midi - 21) % 12
  const whitePositions = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
  return octave * 7 + whitePositions[noteInOctave]
}
