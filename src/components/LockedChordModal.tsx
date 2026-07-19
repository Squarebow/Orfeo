import React, { useState, useCallback, useMemo, useEffect } from 'react'
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

  // ── Modal visibility — auto-opens when keys are locked; only closes via X ──
  // Clearing the chord (RotateCcw) keeps the modal open showing "— — —".
  const [modalOpen, setModalOpen] = useState(false)
  useEffect(() => { if (lockedKeys.size > 0) setModalOpen(true) }, [lockedKeys.size])

  // ── Position state — draggable float position, initialised to viewport centre
  const [pos, setPos] = useState(() => ({
    x: Math.round((window.innerWidth  - MODAL_WIDTH)  / 2),
    y: Math.round((window.innerHeight - MODAL_HEIGHT) / 2),
  }))

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

  // ── X button — clears keys and dismisses modal ───────────────────────────
  const handleClose = useCallback(() => { clearLockedKeys(); setModalOpen(false) }, [clearLockedKeys])

  // ── Clear button — clears locked keys only; modal stays open ─────────────
  const handleClear = useCallback(() => { clearLockedKeys() }, [clearLockedKeys])

  if (!modalOpen) return null

  return (
    <div style={{
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: MODAL_WIDTH,
      background: 'var(--bg-modal)',
      border: '1px solid var(--state-hover-bg)',
      borderRadius: 'var(--radius-lg)',
      zIndex: 401,
      display: 'flex',
      flexDirection: 'column',
      // ── Amber glow to distinguish from other floating panels ─────────────
      boxShadow: '0 8px 40px rgba(0,0,0,0.8), 0 0 0 1px rgba(232,160,39,0.25), 0 0 18px rgba(232,160,39,0.12)',
      userSelect: 'none',
    }}>

      {/* ── Header — drag handle + amber title + close ────────────────────────── */}
      <div
        onMouseDown={startDrag}
        style={{
          height: 28,
          display: 'flex', alignItems: 'center',
          padding: '0 8px 0 10px',
          cursor: 'grab',
          borderBottom: '1px solid var(--border)',
        }}
      >
        {/* ── Title in amber to distinguish from other panels ──────────────── */}
        <span style={{ flex: 1, fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
          Locked Chord
        </span>
        <button
          onClick={handleClose}
          title="Close and unlock chord"
          style={{ background: 'none', border: 'none', color: 'var(--text-inactive)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-amber)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-inactive)')}
        >
          <X size={13} />
        </button>
      </div>

      {/* ── Chord name + inversion ordinal ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5, padding: '10px 12px 6px' }}>
        <span style={{ fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.05em' }}>
          {lockedDisplay?.chordLabel ?? '— — —'}
        </span>
        {lockedDisplay?.ordinal && (
          <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'var(--text-dimmest)' }}>
            {lockedDisplay.ordinal}
            <span style={{ fontSize: 7, verticalAlign: 'super' }}>{ordinalSuffix(Number(lockedDisplay.ordinal))}</span>
            {' inv'}
          </span>
        )}
      </div>

      {/* ── Controls: ‹ prev | play | next › | clear — grey idle, amber hover ─── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-2)', padding: '0 10px 10px' }}>
        {/* Previous inversion — Play icon mirrored */}
        <button
          onClick={() => applyInversion(prevInversion, -1)}
          title="Previous inversion"
          style={{ background: 'none', border: 'none', color: 'var(--text-dimmest)', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', transition: 'color 0.12s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-amber)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dimmest)')}
        >
          <Play size={13} style={{ transform: 'scaleX(-1)' }} />
        </button>
        {/* Play chord */}
        <button
          onClick={playLockedChord}
          title="Play this chord"
          style={{ background: 'transparent', border: '1px solid var(--text-inactive)', color: 'var(--text-dimmest)', borderRadius: 'var(--radius-sm)', padding: '2px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', transition: 'color 0.12s, border-color 0.12s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-amber)'; e.currentTarget.style.color = 'var(--text-amber)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--text-inactive)'; e.currentTarget.style.color = 'var(--text-dimmest)' }}
        >
          <Play size={10} fill="currentColor" /> Play
        </button>
        {/* Next inversion — Play icon normal */}
        <button
          onClick={() => applyInversion(nextInversion, 1)}
          title="Next inversion"
          style={{ background: 'none', border: 'none', color: 'var(--text-dimmest)', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', transition: 'color 0.12s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-amber)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dimmest)')}
        >
          <Play size={13} />
        </button>
        {/* Clear locked chord — removes highlighted keys, modal stays open */}
        <button
          onClick={handleClear}
          title="Clear locked chord"
          style={{ background: 'none', border: 'none', color: 'var(--text-inactive)', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', transition: 'color 0.12s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-amber)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-inactive)')}
        >
          <RotateCcw size={13} />
        </button>
      </div>
    </div>
  )
}
