import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import { isBlackKey } from '../../utils/midiParser'
import { getNoteLabel } from '../../utils/noteNames'
import { detectChord, localizeChord } from '../../utils/chordDetection'

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

  // Shift-lock chord state — notes held down manually
  const [lockedKeys, setLockedKeys] = useState<Set<number>>(new Set())
  const [lockedColors, setLockedColors] = useState<Map<number, string>>(new Map())
  const shiftHeldRef = useRef(false)

  // Track shift key
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = true }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  const { min, max } = RANGES[keyboardSize]

  const keys = useMemo(() => {
    const list: { midi: number; isBlack: boolean }[] = []
    for (let m = min; m <= max; m++) list.push({ midi: m, isBlack: isBlackKey(m) })
    return list
  }, [min, max])

  const whiteKeys = keys.filter(k => !k.isBlack)

  // Merge active (from MIDI playback) + locked (from shift-click)
  const allActiveKeys = useMemo(() => {
    const merged = new Set(activeKeys)
    lockedKeys.forEach(k => merged.add(k))
    return merged
  }, [activeKeys, lockedKeys])

  const allActiveColors = useMemo(() => {
    const merged = new Map(activeKeyColors)
    lockedColors.forEach((c, k) => merged.set(k, c))
    return merged
  }, [activeKeyColors, lockedColors])

  const getColor = (midi: number): string | null => {
    if (!allActiveKeys.has(midi)) return null
    return allActiveColors.get(midi) ?? '#e8a027'
  }

  // Chord from locked keys (shift mode) or from playback
  const displayKeys = lockedKeys.size > 0 ? lockedKeys : activeKeys
  const rawChord = detectChord(displayKeys)
  const chord = localizeChord(rawChord, noteNaming)

  const handleKeyClick = useCallback((midi: number) => {
    if (shiftHeldRef.current) {
      // Shift held: toggle this key in the locked chord
      setLockedKeys(prev => {
        const next = new Set(prev)
        if (next.has(midi)) {
          next.delete(midi)
          setLockedColors(c => { const nc = new Map(c); nc.delete(midi); return nc })
        } else {
          next.add(midi)
          setLockedColors(c => { const nc = new Map(c); nc.set(midi, '#e8a027'); return nc })
          // Still play the note
          const playNote = (window as any).__orfeoPlayNote
          if (playNote) playNote(midi, 0.7, 600)
        }
        return next
      })
    } else {
      // Normal click: clear lock, play note
      if (lockedKeys.size > 0) {
        setLockedKeys(new Set())
        setLockedColors(new Map())
      }
      const playNote = (window as any).__orfeoPlayNote
      if (playNote) playNote(midi, 0.7, 500)
    }
  }, [lockedKeys])

  const isLocked = lockedKeys.size > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Chord + hint bar */}
      <div style={{
        height: 28,
        background: '#0d0d12',
        borderTop: '1px solid #1e1e28',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        position: 'relative',
      }}>
        {/* Chord display */}
        <span style={{
          fontFamily: 'JetBrains Mono',
          fontSize: chord ? 14 : 11,
          fontWeight: chord ? 700 : 400,
          color: chord ? '#e8a027' : '#2a2a3a',
          letterSpacing: chord ? '0.05em' : '0.03em',
          transition: 'all 0.15s',
          minWidth: 80,
          textAlign: 'center',
        }}>
          {chord ?? (isLocked ? '—' : 'no chord')}
        </span>

        {/* Lock indicator */}
        {isLocked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 10, color: '#e8a02788',
              fontFamily: 'Inter', letterSpacing: '0.04em'
            }}>
              CHORD LOCK
            </span>
            <button
              onClick={() => { setLockedKeys(new Set()); setLockedColors(new Map()) }}
              title="Clear chord lock"
              style={{
                fontSize: 9, color: '#404055',
                background: '#1a1a22', border: '1px solid #2a2a35',
                borderRadius: 3, padding: '1px 5px', cursor: 'pointer',
                fontFamily: 'Inter',
              }}
            >
              clear
            </button>
          </div>
        )}

        {/* Shift hint when not locked */}
        {!isLocked && (
          <span style={{
            position: 'absolute', right: 10,
            fontSize: 9, color: '#252535',
            fontFamily: 'Inter', letterSpacing: '0.03em',
          }}>
            Shift+click to lock chord
          </span>
        )}
      </div>

      {/* Piano keys */}
      <div
        className="relative w-full select-none"
        style={{ height: 130, background: '#111116', borderTop: '1px solid #2a2a35' }}
      >
        {/* White keys */}
        <div className="absolute inset-0 flex">
          {whiteKeys.map((k) => {
            const color = getColor(k.midi)
            const locked = lockedKeys.has(k.midi)
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
                  boxShadow: color
                    ? `0 0 ${locked ? 18 : 12}px ${locked ? 6 : 4}px ${color}${locked ? 'cc' : '88'}`
                    : 'inset 0 -3px 6px rgba(0,0,0,0.1)',
                  transition: 'background 0.04s, box-shadow 0.04s',
                  minWidth: 0,
                  outline: locked ? `2px solid ${color}` : 'none',
                  outlineOffset: -2,
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
            const locked = lockedKeys.has(k.midi)
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
                  border: locked ? `2px solid ${color}` : '1px solid #0a0a0f',
                  borderTop: 'none',
                  boxShadow: color
                    ? `0 0 ${locked ? 14 : 10}px ${locked ? 4 : 3}px ${color}${locked ? 'bb' : '99'}`
                    : '0 4px 8px rgba(0,0,0,0.7)',
                  transition: 'background 0.04s, box-shadow 0.04s',
                  zIndex: 2,
                }}
              />
            )
          })}
        </div>
      </div>
    </div>
  )
}
