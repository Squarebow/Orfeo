import { useMemo } from 'react'
import { useStore } from '../../store'
import { isBlackKey } from '../../utils/midiParser'
import { getNoteLabel } from '../../utils/noteNames'

// ─── Key range definitions ────────────────────────────────────────────────────

const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },  // C2–C7
  73: { min: 28, max: 103 }, // E1–G7
  88: { min: 21, max: 108 }, // A0–C8
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Keyboard() {
  const keyboardSize = useStore((s) => s.keyboardSize)
  const activeKeys = useStore((s) => s.activeKeys)
  const tracks = useStore((s) => s.tracks)
  const noteNaming = useStore((s) => s.noteNaming)
  const midi = useStore((s) => s.midi)

  const { min, max } = RANGES[keyboardSize]

  // Collect note colors from tracks (for active key coloring)
  const trackColors = useMemo(() => {
    const map = new Map<number, string>()
    if (!midi) return map
    for (const track of midi.tracks) {
      const state = tracks.find((t) => t.index === track.index)
      if (state && !state.muted && state.visible) {
        map.set(track.index, state.color)
      }
    }
    return map
  }, [midi, tracks])

  // Get the color for an active key (use first matching track)
  const getKeyColor = (midi: number): string | null => {
    if (!activeKeys.has(midi)) return null
    // Return the color of the first active track
    const color = trackColors.values().next().value
    return color ?? '#e8a027'
  }

  // Build key list
  const keys = useMemo(() => {
    const list: { midi: number; isBlack: boolean }[] = []
    for (let m = min; m <= max; m++) {
      list.push({ midi: m, isBlack: isBlackKey(m) })
    }
    return list
  }, [min, max])

  const whiteKeys = keys.filter((k) => !k.isBlack)
  const blackKeys = keys.filter((k) => k.isBlack)

  return (
    <div
      className="relative w-full select-none"
      style={{ height: 120, background: '#0f0f12', borderTop: '1px solid #252530' }}
    >
      {/* White keys */}
      <div className="absolute inset-0 flex">
        {whiteKeys.map((k) => {
          const activeColor = getKeyColor(k.midi)
          const isC = k.midi % 12 === 0
          const label = isC ? getNoteLabel(k.midi, noteNaming) : null

          return (
            <div
              key={k.midi}
              className="relative flex-1 border-r border-[#252530] cursor-pointer flex flex-col justify-end items-center pb-1"
              style={{
                background: activeColor
                  ? activeColor
                  : '#e8e8e8',
                boxShadow: activeColor
                  ? `0 0 12px 2px ${activeColor}88`
                  : 'none',
                transition: 'background 0.04s, box-shadow 0.04s',
                minWidth: 0,
              }}
            >
              {label && (
                <span
                  className="text-[9px] font-mono font-semibold leading-none pointer-events-none"
                  style={{
                    color: activeColor ? '#fff' : '#555',
                    fontFamily: "'JetBrains Mono', monospace",
                  }}
                >
                  {label}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Black keys — positioned absolutely over white keys */}
      <BlackKeyLayer
        whiteKeys={whiteKeys}
        blackKeys={keys.filter((k) => k.isBlack)}
        getKeyColor={getKeyColor}
        min={min}
        max={max}
      />
    </div>
  )
}

// ─── Black key layer ─────────────────────────────────────────────────────────

function BlackKeyLayer({
  whiteKeys,
  blackKeys,
  getKeyColor,
  min,
  max,
}: {
  whiteKeys: { midi: number; isBlack: boolean }[]
  blackKeys: { midi: number; isBlack: boolean }[]
  getKeyColor: (midi: number) => string | null
  min: number
  max: number
}) {
  const totalWhite = whiteKeys.length

  return (
    <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
      {blackKeys.map((k) => {
        // Find the white key index to the left of this black key
        const whiteIdx = whiteKeys.findIndex((w) => w.midi > k.midi) - 1
        if (whiteIdx < 0) return null

        const leftPct = ((whiteIdx + 0.65) / totalWhite) * 100
        const widthPct = (0.6 / totalWhite) * 100
        const activeColor = getKeyColor(k.midi)

        return (
          <div
            key={k.midi}
            className="absolute top-0 cursor-pointer pointer-events-auto"
            style={{
              left: `${leftPct}%`,
              width: `${widthPct}%`,
              height: '65%',
              background: activeColor ?? '#1a1a22',
              borderRadius: '0 0 3px 3px',
              border: '1px solid #0f0f12',
              borderTop: 'none',
              boxShadow: activeColor
                ? `0 0 10px 2px ${activeColor}99`
                : '0 4px 6px rgba(0,0,0,0.5)',
              transition: 'background 0.04s, box-shadow 0.04s',
              zIndex: 2,
            }}
          />
        )
      })}
    </div>
  )
}
