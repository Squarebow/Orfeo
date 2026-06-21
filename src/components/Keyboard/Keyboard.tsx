import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight, Play } from 'lucide-react'
import { useStore } from '../../store'
import { isBlackKey } from '../../utils/midiParser'
import { getNoteLabel } from '../../utils/noteNames'
import { detectChord, detectChordWithInversion, localizeChord } from '../../utils/chordDetection'

const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

const CHORD_MIN_NOTES = 3
const CHORD_DEBOUNCE_MS = 320
const CHORD_HOLD_MS = 1600

// Build inversion of a set of MIDI notes (rotate lowest note up an octave)
function nextInversion(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const [lowest, ...rest] = sorted
  return new Set([...rest, lowest + 12])
}

function prevInversion(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const highest = sorted[sorted.length - 1]
  const rest = sorted.slice(0, -1)
  return new Set([highest - 12, ...rest])
}

export default function Keyboard() {
  const keyboardSize = useStore((s) => s.keyboardSize)
  const activeKeys = useStore((s) => s.activeKeys)
  const activeKeyColors = useStore((s) => s.activeKeyColors)
  const noteNaming = useStore((s) => s.noteNaming)
  const playbackState = useStore((s) => s.playbackState)

  const [lockedKeys, setLockedKeys] = useState<Set<number>>(new Set())
  const [lockedColors, setLockedColors] = useState<Map<number, string>>(new Map())
  const shiftHeldRef = useRef(false)

  // Smart chord display
  const [displayedChord, setDisplayedChord] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [showTooltip, setShowTooltip] = useState(false)

  // Clear chord when playback stops
  useEffect(() => {
    if (playbackState === 'stopped') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (holdRef.current) clearTimeout(holdRef.current)
      setDisplayedChord(null)
    }
  }, [playbackState])

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

  // Smart playback chord detection
  useEffect(() => {
    if (lockedKeys.size > 0) return
    if (activeKeys.size >= CHORD_MIN_NOTES) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (holdRef.current) clearTimeout(holdRef.current)
      debounceRef.current = setTimeout(() => {
        const raw = detectChord(activeKeys)
        const localized = localizeChord(raw, noteNaming)
        if (localized) {
          setDisplayedChord(localized)
          holdRef.current = setTimeout(() => setDisplayedChord(null), CHORD_HOLD_MS)
        }
      }, CHORD_DEBOUNCE_MS)
    } else {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    }
  }, [activeKeys, lockedKeys.size, noteNaming])

  const lockedChordInfo = lockedKeys.size > 0 ? detectChordWithInversion(lockedKeys) : null
  const rawLockedChord = lockedChordInfo?.name ?? null
  const lockedChord = localizeChord(rawLockedChord, noteNaming)
  const lockedInvLabel = lockedChordInfo?.invLabel ?? ''
  const shownChord = lockedKeys.size > 0 ? lockedChord : displayedChord
  const shownInvLabel = lockedKeys.size > 0 ? lockedInvLabel : ''
  const isLocked = lockedKeys.size > 0

  // Play locked chord
  const playLockedChord = useCallback(() => {
    const playNote = (window as any).__orfeoPlayNote
    if (!playNote) return
    lockedKeys.forEach(midi => playNote(midi, 0.75, 800))
  }, [lockedKeys])

  // Inversion controls
  const applyInversion = useCallback((fn: (n: Set<number>) => Set<number>) => {
    const newKeys = fn(lockedKeys)
    const newColors = new Map<number, string>()
    newKeys.forEach(k => newColors.set(k, '#e8a027'))
    setLockedKeys(newKeys)
    setLockedColors(newColors)
    // Auto-play the new inversion
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) newKeys.forEach(midi => playNote(midi, 0.7, 600))
  }, [lockedKeys])

  const handleKeyClick = useCallback((midi: number) => {
    if (shiftHeldRef.current) {
      setLockedKeys(prev => {
        const next = new Set(prev)
        if (next.has(midi)) {
          next.delete(midi)
          setLockedColors(c => { const nc = new Map(c); nc.delete(midi); return nc })
        } else {
          next.add(midi)
          setLockedColors(c => { const nc = new Map(c); nc.set(midi, '#e8a027'); return nc })
          const playNote = (window as any).__orfeoPlayNote
          if (playNote) playNote(midi, 0.7, 600)
        }
        return next
      })
    } else {
      if (lockedKeys.size > 0) {
        setLockedKeys(new Set())
        setLockedColors(new Map())
      }
      const playNote = (window as any).__orfeoPlayNote
      if (playNote) playNote(midi, 0.7, 500)
    }
  }, [lockedKeys])

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Chord bar */}
      <div style={{
        height: 30,
        background: '#0d0d12',
        borderTop: '1px solid #1e1e28',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '0 12px',
        position: 'relative',
      }}>
        {/* CHORDS label + info icon — fixed left, amber */}
        <div style={{ position: 'absolute', left: 10, display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#707088', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Chords
          </span>
          {/* Info icon right of CHORDS label */}
          <div
            style={{ display: 'flex', alignItems: 'center' }}
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            <span style={{
              width: 13, height: 13, borderRadius: '50%',
              border: '1px solid #e8a02750', color: '#e8a027', fontSize: 7,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'default', fontFamily: 'Inter', fontWeight: 700, userSelect: 'none',
            }}>i</span>
            {showTooltip && (
              <div style={{
                position: 'absolute', left: 72, bottom: 0,
                background: '#1a1a2e', border: '1px solid #2a2a40',
                borderRadius: 6, padding: '7px 10px',
                whiteSpace: 'nowrap', zIndex: 100,
                fontSize: 10, color: '#8080a8', fontFamily: 'Inter',
                lineHeight: 1.6, pointerEvents: 'none',
                boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
              }}>
                Chord name appears here during playback (3+ notes)<br />
                <span style={{ color: '#404060' }}>
                  Shift+click keys to build &amp; lock a chord<br />
                  Use ‹ › to cycle inversions · ▶ to hear it
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Chord name — always centred */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 80, justifyContent: 'center' }}>
          <span style={{
            fontFamily: 'JetBrains Mono',
            fontSize: shownChord ? 14 : 10,
            fontWeight: shownChord ? 700 : 400,
            color: shownChord ? '#e8a027' : '#222235',
            letterSpacing: shownChord ? '0.05em' : '0.03em',
            transition: 'color 0.2s, font-size 0.15s',
            textAlign: 'center',
          }}>
            {shownChord ?? '— — —'}
          </span>
          {shownInvLabel && (
            <span style={{ fontSize: 9, color: '#e8a02799', fontFamily: 'Inter', whiteSpace: 'nowrap' }}>
              {shownInvLabel}
            </span>
          )}
        </div>

        {/* Lock controls — shown when locked */}
        {isLocked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            {/* Prev inversion */}
            <button onClick={() => applyInversion(prevInversion)} title="Previous inversion"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606080', padding: '2px 3px', borderRadius: 3, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
              onMouseLeave={e => e.currentTarget.style.color = '#606080'}
            >
              <ChevronLeft size={13} />
            </button>

            <span style={{ fontSize: 9, color: '#e8a02770', fontFamily: 'Inter', letterSpacing: '0.04em' }}>
              CHORD LOCK
            </span>

            {/* Play button */}
            <button onClick={playLockedChord} title="Play this chord"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606080', padding: '2px 3px', borderRadius: 3, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
              onMouseLeave={e => e.currentTarget.style.color = '#606080'}
            >
              <Play size={11} fill="currentColor" />
            </button>

            {/* Next inversion */}
            <button onClick={() => applyInversion(nextInversion)} title="Next inversion"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606080', padding: '2px 3px', borderRadius: 3, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
              onMouseLeave={e => e.currentTarget.style.color = '#606080'}
            >
              <ChevronRight size={13} />
            </button>

            <button onClick={() => { setLockedKeys(new Set()); setLockedColors(new Map()) }}
              title="Clear chord lock"
              style={{ fontSize: 8, color: '#40404e', background: '#1a1a22', border: '1px solid #2a2a35', borderRadius: 3, padding: '1px 5px', cursor: 'pointer', fontFamily: 'Inter' }}
            >
              clear
            </button>
          </div>
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
                  <span className="text-[9px] font-semibold pointer-events-none"
                    style={{ color: color ? '#fff' : '#888', fontFamily: 'JetBrains Mono' }}>
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
                  left: `${leftPct}%`, width: `${widthPct}%`, height: '65%',
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
