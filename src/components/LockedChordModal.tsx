import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { Play, RotateCcw, X } from 'lucide-react'
import { useStore } from '../store'
import { formatInversionDisplay, ordinalSuffix } from '../utils/chordDetection'

const MODAL_WIDTH  = 220
const MODAL_HEIGHT = 100

// ── Rotate voicing one inversion up — lowest note moves up an octave ─────────
function nextInversion(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const [lowest, ...rest] = sorted
  return new Set([...rest, lowest + 12])
}

// ── Rotate voicing one inversion down — highest note moves down an octave ────
function prevInversion(notes: Set<number>): Set<number> {
  const sorted = Array.from(notes).sort((a, b) => a - b)
  const highest = sorted[sorted.length - 1]
  const rest = sorted.slice(0, -1)
  return new Set([highest - 12, ...rest])
}

// ── Floating draggable modal shown when any keys are Shift+Click locked ───────
export default function LockedChordModal() {
  const lockedKeys              = useStore((s) => s.lockedKeys)
  const lockedColors            = useStore((s) => s.lockedColors)
  const setLockedKeys           = useStore((s) => s.setLockedKeys)
  const clearLockedKeys         = useStore((s) => s.clearLockedKeys)
  const originalLockedChordName = useStore((s) => s.originalLockedChordName)
  const lockedInversionCount    = useStore((s) => s.lockedInversionCount)
  const lockedChordNoteCount    = useStore((s) => s.lockedChordNoteCount)
  const noteNaming              = useStore((s) => s.noteNaming)
  const accidentals             = useStore((s) => s.accidentals)

  // ── Derived open state — modal is visible whenever any key is locked ──────
  const isOpen = lockedKeys.size > 0

  const [pos, setPos] = useState(() => ({
    x: Math.round((window.innerWidth  - MODAL_WIDTH)  / 2),
    y: Math.round((window.innerHeight - MODAL_HEIGHT) / 2),
  }))

  const wasPlayingRef  = useRef(false)
  const prevIsOpenRef  = useRef(false)

  // ── Pause on open; resume on close — exact same mechanism as ChordExplorer ─
  useEffect(() => {
    const wasOpen = prevIsOpenRef.current
    prevIsOpenRef.current = isOpen

    if (!wasOpen && isOpen) {
      // ── Reset position to centre on every fresh open ──────────────────────
      setPos({
        x: Math.round((window.innerWidth  - MODAL_WIDTH)  / 2),
        y: Math.round((window.innerHeight - MODAL_HEIGHT) / 2),
      })
      const state = useStore.getState()
      if (state.playbackState === 'playing') {
        wasPlayingRef.current = true
        ;(window as any).__orfeoPlayer?.pause?.()
        useStore.setState({ playbackState: 'paused' })
      } else {
        wasPlayingRef.current = false
      }
    } else if (wasOpen && !isOpen) {
      // ── Resume from the position the JZZ player captured internally ───────
      if (wasPlayingRef.current) {
        wasPlayingRef.current = false
        ;(window as any).__orfeoPlayer?.play?.()
        useStore.setState({ playbackState: 'playing' })
      }
    }
  }, [isOpen])

  // ── Compute structured inversion display ─────────────────────────────────
  const lockedDisplay = useMemo(() => {
    if (!originalLockedChordName || lockedKeys.size === 0) return null
    const bassNoteMidi = Math.min(...lockedKeys)
    return formatInversionDisplay(
      originalLockedChordName, lockedInversionCount, lockedChordNoteCount,
      bassNoteMidi, noteNaming, accidentals, true,
    )
  }, [originalLockedChordName, lockedInversionCount, lockedChordNoteCount, lockedKeys, noteNaming, accidentals])

  // ── Drag ─────────────────────────────────────────────────────────────────
  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY, spx = pos.x, spy = pos.y
    const onMove = (ev: MouseEvent) =>
      setPos({ x: Math.max(0, spx + ev.clientX - sx), y: Math.max(0, spy + ev.clientY - sy) })
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  // ── Play all locked notes ─────────────────────────────────────────────────
  const playLockedChord = useCallback(() => {
    const playNote = (window as any).__orfeoPlayNote
    if (!playNote) return
    lockedKeys.forEach(midi => playNote(midi, 0.75, 800))
  }, [lockedKeys])

  // ── Cycle inversion voicing + update inversion count in store ────────────
  const applyInversion = useCallback((fn: (n: Set<number>) => Set<number>, direction: 1 | -1) => {
    const newKeys = fn(lockedKeys)
    const newColors = new Map<number, string>()
    newKeys.forEach(k => newColors.set(k, '#e8a027'))
    setLockedKeys(newKeys, newColors)
    const s = useStore.getState()
    s.setLockedInversionCount(s.lockedInversionCount + direction)
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) newKeys.forEach(midi => playNote(midi, 0.7, 600))
  }, [lockedKeys, setLockedKeys])

  // ── Close and unlock — resume is handled by the isOpen effect ────────────
  const handleClose = useCallback(() => { clearLockedKeys() }, [clearLockedKeys])

  if (!isOpen) return null

  return (
    <div style={{
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: MODAL_WIDTH,
      background: '#13131c',
      border: '1px solid #2a2a3a',
      borderRadius: 8,
      zIndex: 401,
      display: 'flex',
      flexDirection: 'column',
      boxShadow: '0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(232,160,39,0.08)',
      userSelect: 'none',
    }}>

      {/* ── Header — drag handle + title + close ──────────────────────────────── */}
      <div
        onMouseDown={startDrag}
        style={{
          height: 28,
          display: 'flex', alignItems: 'center',
          padding: '0 8px 0 10px',
          cursor: 'grab',
          borderBottom: '1px solid #1e1e28',
        }}
      >
        <span style={{ flex: 1, fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#707088', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
          Locked Chord
        </span>
        <button
          onClick={handleClose}
          title="Close and unlock chord"
          style={{ background: 'none', border: 'none', color: '#505068', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e8a027')}
          onMouseLeave={e => (e.currentTarget.style.color = '#505068')}
        >
          <X size={13} />
        </button>
      </div>

      {/* ── Chord name + inversion ordinal ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5, padding: '10px 12px 6px' }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 700, color: '#e8a027', letterSpacing: '0.05em' }}>
          {lockedDisplay?.chordLabel ?? '— — —'}
        </span>
        {lockedDisplay?.ordinal && (
          <span style={{ fontFamily: 'Inter', fontSize: 10, color: '#707088' }}>
            {lockedDisplay.ordinal}
            <span style={{ fontSize: 7, verticalAlign: 'super' }}>{ordinalSuffix(Number(lockedDisplay.ordinal))}</span>
            {' inv'}
          </span>
        )}
      </div>

      {/* ── Controls: ‹ prev | play | next › | clear ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 10px 10px' }}>
        {/* Previous inversion — Play icon mirrored */}
        <button
          onClick={() => applyInversion(prevInversion, -1)}
          title="Previous inversion"
          style={{ background: 'none', border: 'none', color: '#e8a027', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ffb84d')}
          onMouseLeave={e => (e.currentTarget.style.color = '#e8a027')}
        >
          <Play size={13} style={{ transform: 'scaleX(-1)' }} />
        </button>
        {/* Play chord */}
        <button
          onClick={playLockedChord}
          title="Play this chord"
          style={{ background: 'transparent', border: '1px solid #e8a027', color: '#e8a027', borderRadius: 3, padding: '2px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#ffb84d'; e.currentTarget.style.color = '#ffb84d' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#e8a027'; e.currentTarget.style.color = '#e8a027' }}
        >
          <Play size={10} fill="currentColor" /> Play
        </button>
        {/* Next inversion — Play icon normal */}
        <button
          onClick={() => applyInversion(nextInversion, 1)}
          title="Next inversion"
          style={{ background: 'none', border: 'none', color: '#e8a027', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#ffb84d')}
          onMouseLeave={e => (e.currentTarget.style.color = '#e8a027')}
        >
          <Play size={13} />
        </button>
        {/* Clear locked chord */}
        <button
          onClick={handleClose}
          title="Clear locked chord"
          style={{ background: 'none', border: 'none', color: '#505068', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = '#e8a027')}
          onMouseLeave={e => (e.currentTarget.style.color = '#505068')}
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  )
}
