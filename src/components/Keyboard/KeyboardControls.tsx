import { useCallback } from 'react'
import { Play, ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore } from '../../store'
import { detectChordWithInversion, localizeChord } from '../../utils/chordDetection'
import type { KeyboardSize } from '../../types'

const SIZES: KeyboardSize[] = [61, 73, 88]

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

export default function KeyboardControls() {
  const keyboardSize = useStore((s) => s.keyboardSize)
  const keyboardMode = useStore((s) => s.keyboardMode)
  const setKeyboardSize = useStore((s) => s.setKeyboardSize)
  const setKeyboardMode = useStore((s) => s.setKeyboardMode)
  const noteNaming = useStore((s) => s.noteNaming)
  const accidentals = useStore((s) => s.accidentals)
  const lockedKeys = useStore((s) => s.lockedKeys)
  const lockedColors = useStore((s) => s.lockedColors)
  const setLockedKeys = useStore((s) => s.setLockedKeys)
  const clearLockedKeys = useStore((s) => s.clearLockedKeys)

  const isDocked = keyboardMode === 'docked'
  const isLocked = lockedKeys.size > 0

  const lockedChordInfo = isLocked ? detectChordWithInversion(lockedKeys) : null
  const lockedChord = localizeChord(lockedChordInfo?.name ?? null, noteNaming, accidentals)
  const lockedInvLabel = lockedChordInfo?.invLabel ?? ''

  const playLockedChord = useCallback(() => {
    const playNote = (window as any).__orfeoPlayNote
    if (!playNote) return
    lockedKeys.forEach(midi => playNote(midi, 0.75, 800))
  }, [lockedKeys])

  const applyInversion = useCallback((fn: (n: Set<number>) => Set<number>) => {
    const newKeys = fn(lockedKeys)
    const newColors = new Map<number, string>()
    newKeys.forEach(k => newColors.set(k, '#e8a027'))
    setLockedKeys(newKeys, newColors)
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) newKeys.forEach(midi => playNote(midi, 0.7, 600))
  }, [lockedKeys, setLockedKeys])

  return (
    <div
      style={{
        height: 34,
        background: '#0d0d12',
        borderTop: '1px solid #1a1a24',
        display: 'flex',
        alignItems: 'center',
        padding: '0 16px',
        gap: 12,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Key size selector */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {SIZES.map((size) => (
          <button
            key={size}
            onClick={() => setKeyboardSize(size)}
            title={`${size}-key keyboard layout`}
            style={{
              padding: '2px 8px', borderRadius: 4,
              background: 'transparent',
              color: keyboardSize === size ? '#e8a027' : '#404055',
              border: 'none',
              fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (keyboardSize !== size) e.currentTarget.style.color = '#c0c0d0' }}
            onMouseLeave={e => { if (keyboardSize !== size) e.currentTarget.style.color = '#404055' }}
          >
            {size}
          </button>
        ))}
      </div>

      <div style={{ width: 1, height: 14, background: '#1e1e28' }} />

      {/* Dock / Float toggle */}
      <button
        onClick={() => setKeyboardMode(isDocked ? 'floating' : 'docked')}
        title={isDocked ? 'Float keyboard (detach)' : 'Dock keyboard (attach to bottom)'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: isDocked ? '#404055' : '#e8a027',
          fontSize: 11, fontFamily: 'Inter',
          padding: '2px 6px', borderRadius: 4,
          transition: 'color 0.15s',
        }}
        onMouseEnter={e => { if (isDocked) e.currentTarget.style.color = '#e8a027' }}
        onMouseLeave={e => { if (isDocked) e.currentTarget.style.color = '#404055' }}
      >
        {isDocked ? (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/>
          </svg>
        ) : (
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="5 9 2 12 5 15"/><polyline points="9 5 12 2 15 5"/>
            <polyline points="15 19 12 22 9 19"/><polyline points="19 9 22 12 19 15"/>
            <line x1="2" y1="12" x2="22" y2="12"/><line x1="12" y1="2" x2="12" y2="22"/>
          </svg>
        )}
        {isDocked ? 'Docked' : 'Floating'}
      </button>

      {/* Centre: help text or locked chord controls */}
      <div style={{
        position: 'absolute', left: '50%', transform: 'translateX(-50%)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {isLocked ? (
          <>
            <span style={{ fontSize: 9, color: '#e8a02770', fontFamily: 'Inter', letterSpacing: '0.04em', userSelect: 'none' }}>
              Locked Chord
            </span>
            {lockedChord && (
              <span style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: '#e8a027', userSelect: 'none' }}>
                {lockedChord}
              </span>
            )}
            {lockedInvLabel && (
              <span style={{ fontSize: 9, color: '#e8a02799', fontFamily: 'Inter', userSelect: 'none' }}>
                {lockedInvLabel}
              </span>
            )}
            <button onClick={playLockedChord} title="Play this chord"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#e8a027', padding: '2px 3px', borderRadius: 3, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = '#ffb84d'}
              onMouseLeave={e => e.currentTarget.style.color = '#e8a027'}
            >
              <Play size={11} fill="currentColor" />
            </button>
            <button onClick={() => applyInversion(prevInversion)} title="Previous inversion"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606080', padding: '2px 3px', borderRadius: 3, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
              onMouseLeave={e => e.currentTarget.style.color = '#606080'}
            >
              <ChevronLeft size={13} />
            </button>
            <span style={{ fontSize: 8, color: '#707088', fontFamily: 'Inter', userSelect: 'none' }}>inv</span>
            <button onClick={() => applyInversion(nextInversion)} title="Next inversion"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#606080', padding: '2px 3px', borderRadius: 3, display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
              onMouseLeave={e => e.currentTarget.style.color = '#606080'}
            >
              <ChevronRight size={13} />
            </button>
            <button onClick={clearLockedKeys} title="Clear chord lock"
              style={{ fontSize: 8, color: '#9090a8', background: '#1a1a22', border: '1px solid #3a3a4a', borderRadius: 3, padding: '1px 5px', cursor: 'pointer', fontFamily: 'Inter' }}
            >
              clear
            </button>
          </>
        ) : (
          <span style={{ fontSize: 9, color: '#707088', fontFamily: 'Inter', userSelect: 'none' }}>
            Shift+Click at least 3 keys to build &amp; lock a chord
          </span>
        )}
      </div>

      <div style={{ flex: 1 }} />

      {/* Note counter */}
      <NoteCounter />
    </div>
  )
}

function NoteCounter() {
  const midi = useStore((s) => s.midi)
  if (!midi) return null
  return (
    <span style={{ color: '#505068', fontSize: 10, fontFamily: 'JetBrains Mono' }} title="Total notes in file">
      {midi.noteCount.toLocaleString()} notes · {midi.tracks.length} tracks
    </span>
  )
}
