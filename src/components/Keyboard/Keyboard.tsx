import { useStore } from '@/store'
import { isBlackKey, getKeyLabel } from '@/utils/noteNames'
import { useSoundfont } from '@/hooks/useSoundfont'

interface KeyboardProps {
  floating?: boolean
}

// Key ranges for each keyboard size
const KEY_RANGES: Record<number, { start: number; end: number }> = {
  61: { start: 36, end: 96 },   // C2 to C7
  73: { start: 28, end: 103 },  // E1 to G7
  88: { start: 21, end: 108 },  // A0 to C8
}

export default function Keyboard({ floating = false }: KeyboardProps) {
  const { settings, activeKeys, pressKey, releaseKey } = useStore()
  const { playNote, stopNote } = useSoundfont()

  const size = settings.keyboardSize
  const { start, end } = KEY_RANGES[size] ?? KEY_RANGES[88]

  // Build key list
  const keys: number[] = []
  for (let midi = start; midi <= end; midi++) keys.push(midi)

  const whiteKeys = keys.filter(m => !isBlackKey(m))
  const totalWhite = whiteKeys.length
  const whiteW = 100 / totalWhite // percent width per white key
  const blackW = whiteW * 0.58
  const blackH = 62  // percent of keyboard height

  const getKeyState = (midi: number) => activeKeys.get(midi)
  const getKeyColor = (midi: number) => {
    const state = getKeyState(midi)
    if (state?.pressed && state.color) return state.color
    return null
  }

  const handleMouseDown = (midi: number) => {
    pressKey(midi, 'var(--accent)', 'mouse')
    playNote(midi, 80)
  }

  const handleMouseUp = (midi: number) => {
    releaseKey(midi)
    stopNote(midi)
  }

  const containerStyle: React.CSSProperties = floating ? {
    position: 'fixed',
    left: settings.keyboardPosition.x || 0,
    top: settings.keyboardPosition.y || 'auto',
    bottom: settings.keyboardPosition.y ? 'auto' : 60,
    width: '80%',
    zIndex: 100,
    background: 'var(--panel)',
    borderRadius: 8,
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
    border: '1px solid var(--border)',
  } : {
    height: 'var(--keyboard-height)',
    flexShrink: 0,
    background: '#111116',
    borderTop: '1px solid var(--border)',
  }

  return (
    <div style={containerStyle}>
      <div style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        padding: '8px 4px 4px',
      }}>
        <svg
          viewBox={`0 0 ${totalWhite * 24} 120`}
          preserveAspectRatio="none"
          style={{ width: '100%', height: '100%', display: 'block' }}
        >
          {/* White keys */}
          {whiteKeys.map((midi, i) => {
            const activeColor = getKeyColor(midi)
            const label = getKeyLabel(midi, settings.noteNaming, false)
            return (
              <g key={midi}
                 onMouseDown={() => handleMouseDown(midi)}
                 onMouseUp={() => handleMouseUp(midi)}
                 style={{ cursor: 'pointer' }}>
                <rect
                  x={i * 24 + 0.5}
                  y={0.5}
                  width={23}
                  height={119}
                  rx={3}
                  fill={activeColor ?? '#e8e8e2'}
                  stroke="#555"
                  strokeWidth={0.5}
                  style={{
                    filter: activeColor
                      ? `drop-shadow(0 0 6px ${activeColor}99)`
                      : undefined
                  }}
                />
                {label && (
                  <text
                    x={i * 24 + 12}
                    y={108}
                    textAnchor="middle"
                    fontSize={8}
                    fill={activeColor ? '#fff' : '#888'}
                    fontFamily="Inter, sans-serif"
                    style={{ pointerEvents: 'none', userSelect: 'none' }}
                  >
                    {label}
                  </text>
                )}
              </g>
            )
          })}

          {/* Black keys — rendered on top */}
          {keys.filter(isBlackKey).map((midi) => {
            const whiteIndex = getWhiteKeyIndexBefore(midi, whiteKeys)
            const activeColor = getKeyColor(midi)
            return (
              <g key={midi}
                 onMouseDown={() => handleMouseDown(midi)}
                 onMouseUp={() => handleMouseUp(midi)}
                 style={{ cursor: 'pointer' }}>
                <rect
                  x={whiteIndex * 24 + 15}
                  y={0.5}
                  width={18}
                  height={72}
                  rx={2}
                  fill={activeColor ?? '#1a1a1e'}
                  stroke="#000"
                  strokeWidth={0.5}
                  style={{
                    filter: activeColor
                      ? `drop-shadow(0 0 8px ${activeColor}bb)`
                      : undefined
                  }}
                />
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

function getWhiteKeyIndexBefore(blackMidi: number, whiteKeys: number[]): number {
  // Find the white key immediately to the left of this black key
  for (let i = whiteKeys.length - 1; i >= 0; i--) {
    if (whiteKeys[i] < blackMidi) return i
  }
  return 0
}
