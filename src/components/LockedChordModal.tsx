import React, { useState, useCallback, useMemo, useEffect, useRef, type CSSProperties } from 'react'
import { RotateCcw, X } from 'lucide-react'
import ChevronPlayIcon from './ChevronPlayIcon'
import { useStore } from '../store'
import { formatInversionDisplay, ordinalSuffix } from '../utils/chordDetection'
import { getNoteName } from '../utils/noteNames'
import { modalCloseButtonStyle, modalCloseButtonHoverColor, modalCloseButtonIdleColor } from '../utils/modalCloseButtonStyle'
import OrfeoMark from './OrfeoMark'
import { getPianoRollCenterX, getKeyboardHeaderTop } from '../utils/modalAnchors'
import { useFocusTrap } from '../hooks/useFocusTrap'

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
  const setLockedChordModalOpen = useStore((s) => s.setLockedChordModalOpen)
  // ── Mirror into the store so App.tsx's global Escape handler can exclude
  // this modal the same way it already excludes chordExplorerOpen/
  // scaleExplorerOpen — see the field's own comment in store/index.ts. ─────
  useEffect(() => { setLockedChordModalOpen(modalOpen) }, [modalOpen, setLockedChordModalOpen])
  // ── Position state — bottom edge on the keyboard header, horizontally
  // centered on the piano roll; computed on first actual open (not at app
  // mount, so the layout is settled), then left alone. ───────────────────────
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const positioned = useRef(false)
  useEffect(() => {
    if (lockedKeys.size === 0) return
    setModalOpen(true)
    if (!positioned.current) {
      positioned.current = true
      setPos({
        x: Math.round(getPianoRollCenterX() - MODAL_WIDTH / 2),
        y: Math.round(getKeyboardHeaderTop() - MODAL_HEIGHT) - 23,
      })
    }
  }, [lockedKeys.size])

  // ── Compute structured inversion display ─────────────────────────────────
  const lockedDisplay = useMemo(() => {
    if (!originalLockedChordName || lockedKeys.size === 0) return null
    const bassNoteMidi = Math.min(...lockedKeys)
    return formatInversionDisplay(
      originalLockedChordName, lockedInversionCount, lockedChordNoteCount,
      bassNoteMidi, noteNaming, accidentals, true,
    )
  }, [originalLockedChordName, lockedInversionCount, lockedChordNoteCount, lockedKeys, noteNaming, accidentals])

  // ── Partial display — 1st/2nd shift-clicked notes shown in place of their
  // dash while the chord isn't identifiable yet (needs 3+ notes); the 3rd
  // dash stays "—" until then. ──────────────────────────────────────────────
  const partialNotes = useMemo(() => {
    if (lockedDisplay || lockedKeys.size === 0) return null
    return Array.from(lockedKeys).sort((a, b) => a - b).map(m => getNoteName(m, noteNaming, accidentals))
  }, [lockedDisplay, lockedKeys, noteNaming, accidentals])

  // ── Drag ─────────────────────────────────────────────────────────────────
  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY, spx = pos.x, spy = pos.y
    const onMove = (ev: MouseEvent) =>
      // 44, not 0 — keeps the top edge clear of the 40px titleBarOverlay
      // (electron/main.ts) where Windows draws its own window controls on
      // top of everything in the DOM.
      setPos({ x: Math.max(0, spx + ev.clientX - sx), y: Math.max(44, spy + ev.clientY - sy) })
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
    lockedKeys.forEach(midi => playNote(midi, 0.75, 800, undefined, false))
  }, [lockedKeys])

  // ── Cycle inversion voicing + update inversion count in store ────────────
  const applyInversion = useCallback((fn: (n: Set<number>) => Set<number>, direction: 1 | -1) => {
    const newKeys = fn(lockedKeys)
    const newColors = new Map<number, string>()
    newKeys.forEach(k => newColors.set(k, 'var(--text-amber)'))
    setLockedKeys(newKeys, newColors)
    const s = useStore.getState()
    s.setLockedInversionCount(s.lockedInversionCount + direction)
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) newKeys.forEach(midi => playNote(midi, 0.7, 600, undefined, false))
  }, [lockedKeys, setLockedKeys])

  // ── X button — clears keys and dismisses modal ───────────────────────────
  const handleClose = useCallback(() => { clearLockedKeys(); setModalOpen(false) }, [clearLockedKeys])

  // ── Clear button — clears locked keys only; modal stays open ─────────────
  const handleClear = useCallback(() => { clearLockedKeys() }, [clearLockedKeys])

  // ── Close on Escape ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!modalOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [modalOpen, handleClose])

  const panelRef = useRef<HTMLDivElement>(null)
  useFocusTrap(panelRef, modalOpen)

  if (!modalOpen) return null

  return (
    <div ref={panelRef} role="dialog" aria-modal="true" aria-label="Lock-a-Chord" className="orfeo-modal-glow" style={{
      position: 'fixed',
      left: pos.x,
      top: pos.y,
      width: MODAL_WIDTH,
      background: 'var(--panel)',
      border: '1px solid var(--state-hover-border)',
      borderRadius: 'var(--radius-lg)',
      zIndex: 401,
      display: 'flex',
      flexDirection: 'column',
      '--_modal-shadow': 'var(--elevation-modal)',
      userSelect: 'none',
    } as CSSProperties}>

      {/* ── Header — drag handle + amber title + close. Styled exactly like
          MIDI Note Editor's header (NoteEditorToolbar.tsx): same logo size,
          same title font, no separate header background — just part of the
          panel like the Note Editor's is. ── */}
      <div
        onMouseDown={startDrag}
        style={{
          minHeight: 32,
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '0 var(--space-3)',
          cursor: 'grab',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <OrfeoMark height={16} />
        {/* ── Title in amber to distinguish from other panels ──────────────── */}
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 10, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Lock-a-Chord
        </span>
        <button
          onClick={handleClose}
          title="Close and unlock chord"
          style={modalCloseButtonStyle}
          onMouseEnter={e => (e.currentTarget.style.color = modalCloseButtonHoverColor)}
          onMouseLeave={e => (e.currentTarget.style.color = modalCloseButtonIdleColor)}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Chord name + inversion ordinal ────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 5, padding: '10px 12px 6px' }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.05em' }}>
          {lockedDisplay?.chordLabel ?? [0, 1, 2].map(i => partialNotes?.[i] ?? '—').join(' ')}
        </span>
        {lockedDisplay?.ordinal && (
          <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-dimmest)' }}>
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
          <ChevronPlayIcon size={13} mirrored />
        </button>
        {/* Play chord */}
        <button
          onClick={playLockedChord}
          title="Play this chord"
          style={{ background: 'transparent', border: '1px solid var(--text-inactive)', color: 'var(--text-dimmest)', borderRadius: 'var(--radius-sm)', padding: '2px 10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', fontFamily: 'var(--font-ui)', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', transition: 'color 0.12s, border-color 0.12s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--text-amber)'; e.currentTarget.style.color = 'var(--text-amber)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--text-inactive)'; e.currentTarget.style.color = 'var(--text-dimmest)' }}
        >
          <ChevronPlayIcon size={10} /> Play
        </button>
        {/* Next inversion — Play icon normal */}
        <button
          onClick={() => applyInversion(nextInversion, 1)}
          title="Next inversion"
          style={{ background: 'none', border: 'none', color: 'var(--text-dimmest)', cursor: 'pointer', padding: '0 2px', display: 'flex', alignItems: 'center', transition: 'color 0.12s' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-amber)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-dimmest)')}
        >
          <ChevronPlayIcon size={13} />
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
