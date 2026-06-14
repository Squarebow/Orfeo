import { useMemo, useCallback } from 'react'
import { useStore } from '../../store'
import { isBlackKey } from '../../utils/midiParser'
import { getNoteLabel } from '../../utils/noteNames'

const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

export default function Keyboard() {
  const keyboardSize = useStore((s) => s.keyboardSize)
  const activeKeys = useStore((s) => s.activeKeys)
  const activeKeyColors = useStore((s) => s.activeKeyColors)
  const noteNaming = useStore((s) => s.noteNaming)

  const { min, max } = RANGES[keyboardSize]

  const keys = useMemo(() => {
    const list: { midi: number; isBlack: boolean }[] = []
    for (let m = min; m <= max; m++) list.push({ midi: m, isBlack: isBlackKey(m) })
    return list
  }, [min, max])

  const whiteKeys = keys.filter(k => !k.isBlack)

  const getColor = (midi: number): string | null => {
    if (!activeKeys.has(midi)) return null
    return activeKeyColors.get(midi) ?? '#e8a027'
  }

  const handleKeyClick = useCallback((midi: number) => {
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) playNote(midi, 90, 400)
  }, [])

  return (
    <div
      className="relative w-full select-none"
      style={{ height: 130, background: '#111116', borderTop: '1px solid #2a2a35' }}
    >
      {/* White keys */}
      <div className="absolute inset-0 flex">
        {whiteKeys.map((k) => {
          const color = getColor(k.midi)
          const isC = k.midi % 12 === 0
          const label = isC ? getNoteLabel(k.midi, noteNaming) : null
          return (
            <div
              key={k.midi}
              onMouseDown={() => handleKeyClick(k.midi)}
              title={getNoteLabel(k.midi, noteNaming) || undefined}
              className="relative flex-1 flex flex-col justify-end items-center pb-1 cursor-pointer"
              style={{
                background: color ?? '#e8e8e8',
                borderRight: '1px solid #b0b0b0',
                boxShadow: color ? `0 0 14px 4px ${color}99` : 'inset 0 -3px 6px rgba(0,0,0,0.1)',
                transition: 'background 0.04s, box-shadow 0.04s',
                minWidth: 0,
              }}
            >
              {label && (
                <span
                  className="text-[9px] font-semibold pointer-events-none"
                  style={{ color: color ? '#fff' : '#888', fontFamily: 'JetBrains Mono' }}
                >
                  {label}
                </span>
              )}
            </div>
          )
        })}
      </div>

      {/* Black keys */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
        {keys.filter(k => k.isBlack).map((k) => {
          const whiteIdx = whiteKeys.findIndex(w => w.midi > k.midi) - 1
          if (whiteIdx < 0) return null
          const leftPct = ((whiteIdx + 0.65) / whiteKeys.length) * 100
          const widthPct = (0.6 / whiteKeys.length) * 100
          const color = getColor(k.midi)
          return (
            <div
              key={k.midi}
              onMouseDown={() => handleKeyClick(k.midi)}
              title={getNoteLabel(k.midi, noteNaming) || undefined}
              className="absolute top-0 cursor-pointer pointer-events-auto"
              style={{
                left: `${leftPct}%`,
                width: `${widthPct}%`,
                height: '65%',
                background: color ?? '#1a1a22',
                borderRadius: '0 0 4px 4px',
                border: '1px solid #0a0a0f',
                borderTop: 'none',
                boxShadow: color ? `0 0 12px 3px ${color}aa` : '0 4px 8px rgba(0,0,0,0.7)',
                transition: 'background 0.04s, box-shadow 0.04s',
                zIndex: 2,
              }}
            />
          )
        })}
      </div>
    </div>
  )
}
