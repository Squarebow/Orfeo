import React, { useState, useEffect, useCallback, useRef, type CSSProperties } from 'react'
import { RotateCcw, Volume2, ArrowRight, Check, Music } from 'lucide-react'
import { useStore } from '../store'
import { getPianoRollCenterX, getKeyboardHeaderTop } from '../utils/modalAnchors'
import { useKeepBottomOnScreen } from '../hooks/useKeepBottomOnScreen'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { useClampPositionOnZoom } from '../hooks/useClampPositionOnZoom'
import { modalCloseButtonStyle, modalCloseButtonHoverColor, modalCloseButtonIdleColor } from '../utils/modalCloseButtonStyle'
import Tooltip from './Tooltip'
import OrfeoMark from './OrfeoMark'
import {
  type ClefSelection,
  type TrainerRange,
  type AccidentalMode,
  type TrainerNote,
  getRandomTrainerNote,
  computeNotePlacement,
  formatTrainerNoteName,
  midiToTrainerNote,
  SMUFL_GLYPHS,
} from '../utils/staffTrainerUtils'
import { getNoteName } from '../utils/noteNames'
import { t } from '../utils/i18n'

const MODAL_WIDTH = 660
const MODAL_HEIGHT = 390

// ── Typography & styling constants ───────────────────────────────────────────
const ROW_LABEL: CSSProperties = {
  fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 700,
  color: 'var(--text-dimmest)', letterSpacing: '0.10em',
  textTransform: 'uppercase', flexShrink: 0, userSelect: 'none',
}

const PILL_BUTTON = (active: boolean): CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '3px 10px', borderRadius: 4,
  background: active ? 'var(--text-amber)' : 'rgba(255,255,255,0.05)',
  color: active ? 'var(--text-near-black)' : 'var(--text-muted)',
  border: active ? '1px solid var(--text-amber)' : '1px solid var(--border)',
  fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: active ? 700 : 500,
  cursor: 'pointer', transition: 'all 0.15s ease',
  userSelect: 'none',
})

export default function StaffTrainer() {
  const staffTrainerOpen       = useStore(s => s.staffTrainerOpen)
  const staffTrainerMinimized  = useStore(s => s.staffTrainerMinimized)
  const setStaffTrainerOpen    = useStore(s => s.setStaffTrainerOpen)
  const setStaffTrainerMinimized = useStore(s => s.setStaffTrainerMinimized)
  const lastLivePlayedNote     = useStore(s => s.lastLivePlayedNote)
  const setExplorerKeys        = useStore(s => s.setExplorerKeys)
  const clearExplorerKeys      = useStore(s => s.clearExplorerKeys)
  const noteNaming             = useStore(s => s.noteNaming)
  const accidentalsStyle       = useStore(s => s.accidentals)

  // ── Configuration State ───────────────────────────────────────────────────
  const [clefChoice, setClefChoice]     = useState<ClefSelection>('treble')
  const [range, setRange]               = useState<TrainerRange>('standard')
  const [accidentalMode, setAccidentals] = useState<AccidentalMode>('naturals')
  const [highlightPiano, setHighlightPiano] = useState(false)

  // ── Training Session State ────────────────────────────────────────────────
  const [currentNote, setCurrentNote] = useState<TrainerNote>(() =>
    getRandomTrainerNote('treble', 'standard', 'naturals')
  )
  const [wrongNote, setWrongNote] = useState<TrainerNote | null>(null)
  const [feedback, setFeedback] = useState<{
    status: 'idle' | 'correct' | 'wrong'
    message: string
  }>({ status: 'idle', message: t`Play the note shown on the staff` })

  const [streak, setStreak] = useState(0)
  const [bestStreak, setBestStreak] = useState(0)
  const [score, setScore] = useState({ correct: 0, total: 0 })

  // ── Modal Positioning & Dragging ──────────────────────────────────────────
  const [pos, setPos] = useState(() => ({
    x: Math.round(getPianoRollCenterX() - MODAL_WIDTH / 2),
    y: Math.max(44, Math.round(getKeyboardHeaderTop() - MODAL_HEIGHT) - 50),
  }))

  const panelRef = useRef<HTMLDivElement>(null)
  useKeepBottomOnScreen(panelRef, setPos, staffTrainerOpen && !staffTrainerMinimized, 44)
  useFocusTrap(panelRef, staffTrainerOpen && !staffTrainerMinimized)
  useClampPositionOnZoom(pos, setPos, panelRef)

  // ── Reset position on open ────────────────────────────────────────────────
  useEffect(() => {
    if (staffTrainerOpen) {
      setPos({
        x: Math.round(getPianoRollCenterX() - MODAL_WIDTH / 2),
        y: Math.max(44, Math.round(getKeyboardHeaderTop() - MODAL_HEIGHT) - 50),
      })
    }
  }, [staffTrainerOpen])

  // ── Piano Key Highlighting ────────────────────────────────────────────────
  useEffect(() => {
    if (!staffTrainerOpen || staffTrainerMinimized) {
      clearExplorerKeys()
      return
    }
    if (highlightPiano && currentNote) {
      const colors = new Map([[currentNote.midi, 'var(--text-amber)']])
      setExplorerKeys(new Set([currentNote.midi]), colors)
    } else {
      clearExplorerKeys()
    }
    return () => clearExplorerKeys()
  }, [staffTrainerOpen, staffTrainerMinimized, highlightPiano, currentNote, setExplorerKeys, clearExplorerKeys])

  // ── Next Note Generator ───────────────────────────────────────────────────
  const nextNote = useCallback(() => {
    const next = getRandomTrainerNote(clefChoice, range, accidentalMode, currentNote?.midi)
    setCurrentNote(next)
    setWrongNote(null)
    setFeedback({ status: 'idle', message: t`Play the note shown on the staff` })
  }, [clefChoice, range, accidentalMode, currentNote])

  // When config changes, pick fresh note and clear any wrong note
  const prevConfigRef = useRef({ clefChoice, range, accidentalMode })
  useEffect(() => {
    const p = prevConfigRef.current
    if (p.clefChoice !== clefChoice || p.range !== range || p.accidentalMode !== accidentalMode) {
      prevConfigRef.current = { clefChoice, range, accidentalMode }
      setWrongNote(null)
      nextNote()
    }
  }, [clefChoice, range, accidentalMode, nextNote])

  // ── Play sound of note (visual=false leaves virtual piano unlit) ──────────
  const playNoteAudio = useCallback((midiToPlay: number, visual = false) => {
    const playNote = (window as any).__orfeoPlayNote
    if (playNote) {
      playNote(midiToPlay, 0.75, 600, undefined, visual)
    }
  }, [])

  // ── Handle incoming note attempt ──────────────────────────────────────────
  const verifyAttempt = useCallback((playedMidi: number) => {
    if (!currentNote) return
    const isMatch = playedMidi === currentNote.midi
    const targetLabel = formatTrainerNoteName(currentNote)
    const playedName = getNoteName(playedMidi, noteNaming, accidentalsStyle)
    const playedOctave = Math.floor(playedMidi / 12) - 1
    const playedLabel = `${playedName}${playedOctave}`

    if (isMatch) {
      playNoteAudio(playedMidi, true)
      setWrongNote(null)
      setFeedback({
        status: 'correct',
        message: `${t`Correct!`} ${targetLabel}`,
      })
      setStreak(s => {
        const next = s + 1
        setBestStreak(b => Math.max(b, next))
        return next
      })
      setScore(sc => ({ correct: sc.correct + 1, total: sc.total + 1 }))

      // Smooth advance to next note after brief pause
      setTimeout(() => {
        nextNote()
      }, 420)
    } else {
      playNoteAudio(playedMidi, true)
      // Display the wrongly played note as red on the staff
      const wn = midiToTrainerNote(playedMidi, clefChoice, accidentalsStyle === 'sharp')
      setWrongNote(wn)
      setStreak(0)
      setScore(sc => ({ ...sc, total: sc.total + 1 }))
      setFeedback({
        status: 'wrong',
        message: `${t`You played`} ${playedLabel} · ${t`Target is`} ${targetLabel}`,
      })
    }
  }, [currentNote, clefChoice, noteNaming, accidentalsStyle, playNoteAudio, nextNote])

  // ── Subscribe to live played notes from hardware MIDI or virtual keys ─────
  const lastProcessedStamp = useRef<number>(0)
  useEffect(() => {
    if (!staffTrainerOpen || staffTrainerMinimized || !lastLivePlayedNote) return
    if (lastLivePlayedNote.timestamp === lastProcessedStamp.current) return
    lastProcessedStamp.current = lastLivePlayedNote.timestamp

    verifyAttempt(lastLivePlayedNote.midi)
  }, [lastLivePlayedNote, staffTrainerOpen, staffTrainerMinimized, verifyAttempt])

  // ── Close on Escape ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!staffTrainerOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setStaffTrainerOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [staffTrainerOpen, setStaffTrainerOpen])

  // ── Draggable Window Handler ──────────────────────────────────────────────
  const startDrag = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY, spx = pos.x, spy = pos.y
    const onMove = (ev: MouseEvent) =>
      setPos({ x: Math.max(0, spx + ev.clientX - sx), y: Math.max(44, spy + ev.clientY - sy) })
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!staffTrainerOpen) return null

  // ── Minimized Floating Bar ────────────────────────────────────────────────
  if (staffTrainerMinimized) {
    return (
      <div
        role="dialog"
        aria-label="Staff Trainer"
        style={{
          position: 'fixed', bottom: 12, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--bg-modal)', border: '1px solid var(--text-amber)',
          borderRadius: 6, padding: '4px 14px', zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 10,
          boxShadow: '0 4px 16px rgba(0,0,0,0.6)',
        }}
      >
        <span style={{ fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          {t`Staff Trainer`}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {t`Streak`}: {streak}
        </span>
        <button
          onClick={() => setStaffTrainerMinimized(false)}
          style={{ background: 'none', border: 'none', color: 'var(--text-amber)', cursor: 'pointer', fontSize: 11, fontWeight: 600 }}
        >
          {t`Restore`}
        </button>
        <button
          onClick={() => setStaffTrainerOpen(false)}
          title={t`Close`}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14 }}
        >
          ×
        </button>
      </div>
    )
  }

  // ── Staff Geometry Calculations ───────────────────────────────────────────
  const isGrandStaff = clefChoice === 'both'
  const svgWidth = 600
  const svgHeight = isGrandStaff ? 260 : 170
  const lineSpacing = 14
  const staffLeft = 40
  const staffRight = 560
  const staffWidth = staffRight - staffLeft

  // Clef placement & staff lines
  const trebleBottomY = isGrandStaff ? 95 : 115
  const bassBottomY   = isGrandStaff ? 200 : 115

  // Target note placement
  const activeStaffBottomY = currentNote.clef === 'treble' ? trebleBottomY : bassBottomY
  const placement = computeNotePlacement(
    currentNote,
    currentNote.clef,
    activeStaffBottomY,
    lineSpacing
  )

  // Target note horizontal position (shifts left slightly when a wrong note is shown)
  const targetNoteX = wrongNote ? (staffLeft + staffWidth * 0.44) : (staffLeft + staffWidth * 0.54)
  const targetNoteY = placement.y
  const noteScale = (lineSpacing / 250) * 1.05

  // Target Accidental glyph
  const accidentalGlyph = currentNote.accidental === 'sharp'
    ? SMUFL_GLYPHS.sharp
    : currentNote.accidental === 'flat'
    ? SMUFL_GLYPHS.flat
    : null

  // Wrong note placement (if currently displayed)
  let wrongPlacement: ReturnType<typeof computeNotePlacement> | null = null
  let wrongNoteX = 0
  let wrongAccidentalGlyph: string | null = null

  if (wrongNote) {
    const wrongStaffBottomY = wrongNote.clef === 'treble' ? trebleBottomY : bassBottomY
    wrongPlacement = computeNotePlacement(
      wrongNote,
      wrongNote.clef,
      wrongStaffBottomY,
      lineSpacing
    )
    wrongNoteX = staffLeft + staffWidth * 0.65
    wrongAccidentalGlyph = wrongNote.accidental === 'sharp'
      ? SMUFL_GLYPHS.sharp
      : wrongNote.accidental === 'flat'
      ? SMUFL_GLYPHS.flat
      : null
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Staff Trainer"
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: MODAL_WIDTH,
        background: 'var(--bg-modal)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        boxShadow: '0 12px 40px rgba(0,0,0,0.65)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        color: 'var(--text-default)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {/* ── Modal Header (Draggable) ────────────────────────────────────────── */}
      <div
        onMouseDown={startDrag}
        style={{
          height: 38,
          background: 'var(--bg-modal-header)',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 12px',
          cursor: 'grab',
          userSelect: 'none',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <OrfeoMark height={14} />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-amber)', letterSpacing: '0.10em', textTransform: 'uppercase' }}>
            {t`Staff Trainer`}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text-dimmest)', fontWeight: 600 }}>
            · {t`SIGHT READING`}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {/* Minimize button */}
          <button
            onClick={() => setStaffTrainerMinimized(true)}
            title={t`Minimize`}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 6px',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-default)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
          >
            −
          </button>
          {/* Close button */}
          <button
            onClick={() => setStaffTrainerOpen(false)}
            title={t`Close`}
            style={{ ...modalCloseButtonStyle, fontSize: 18, lineHeight: 1 }}
            onMouseEnter={e => e.currentTarget.style.color = modalCloseButtonHoverColor}
            onMouseLeave={e => e.currentTarget.style.color = modalCloseButtonIdleColor}
          >
            ×
          </button>
        </div>
      </div>

      {/* ── Configuration Bar ──────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 14px',
          background: 'rgba(0,0,0,0.2)',
          borderBottom: '1px solid var(--border)',
          gap: 12,
          flexWrap: 'wrap',
          flexShrink: 0,
        }}
      >
        {/* Clef selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={ROW_LABEL}>{t`Clef`}</span>
          <button
            type="button"
            onClick={() => setClefChoice('treble')}
            style={PILL_BUTTON(clefChoice === 'treble')}
          >
            𝄞 {t`Treble`}
          </button>
          <button
            type="button"
            onClick={() => setClefChoice('bass')}
            style={PILL_BUTTON(clefChoice === 'bass')}
          >
            𝄢 {t`Bass`}
          </button>
          <button
            type="button"
            onClick={() => setClefChoice('both')}
            style={PILL_BUTTON(clefChoice === 'both')}
          >
            {t`Both (Grand)`}
          </button>
        </div>

        {/* Range selection */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={ROW_LABEL}>{t`Range`}</span>
          <button
            type="button"
            onClick={() => setRange('standard')}
            style={PILL_BUTTON(range === 'standard')}
            title={t`Standard range with 1 ledger line (includes Middle C)`}
          >
            {t`Standard`}
          </button>
          <button
            type="button"
            onClick={() => setRange('extended')}
            style={PILL_BUTTON(range === 'extended')}
            title={t`Extended range with 2 ledger lines`}
          >
            {t`Extended`}
          </button>
        </div>

        {/* Accidentals */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={ROW_LABEL}>{t`Notes`}</span>
          <button
            type="button"
            onClick={() => setAccidentals('naturals')}
            style={PILL_BUTTON(accidentalMode === 'naturals')}
          >
            {t`Naturals`}
          </button>
          <button
            type="button"
            onClick={() => setAccidentals('accidentals')}
            style={PILL_BUTTON(accidentalMode === 'accidentals')}
          >
            ♯ / ♭
          </button>
        </div>
      </div>

      {/* ── Main Musical Staff Display ─────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '12px 14px',
          position: 'relative',
        }}
      >
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{
            background: 'var(--bg-tile)',
            borderRadius: 6,
            border: '1px solid var(--border)',
            boxShadow: 'inset 0 2px 10px rgba(0,0,0,0.5)',
          }}
        >
          <rect x="0" y="0" width={svgWidth} height={svgHeight} fill="none" rx={6} />

          {/* ── Render Treble Staff (if active or both) ──────────────────────── */}
          {(clefChoice === 'treble' || isGrandStaff) && (
            <g>
              {/* 5 Staff Lines */}
              {[0, 1, 2, 3, 4].map(line => {
                const y = trebleBottomY - line * lineSpacing
                return (
                  <line
                    key={`treble-line-${line}`}
                    x1={staffLeft}
                    y1={y}
                    x2={staffRight}
                    y2={y}
                    stroke="rgba(255,255,255,0.22)"
                    strokeWidth={1.2}
                  />
                )
              })}

              {/* Start & End vertical bar lines */}
              <line x1={staffLeft} y1={trebleBottomY - 4 * lineSpacing} x2={staffLeft} y2={trebleBottomY} stroke="rgba(255,255,255,0.3)" strokeWidth={1.4} />
              <line x1={staffRight} y1={trebleBottomY - 4 * lineSpacing} x2={staffRight} y2={trebleBottomY} stroke="rgba(255,255,255,0.3)" strokeWidth={1.4} />

              {/* Treble Clef Symbol (centered on G4 Line 2: bottomY - lineSpacing) */}
              <g
                transform={`translate(${staffLeft + 18}, ${trebleBottomY - lineSpacing}) scale(${noteScale * 0.95}, -${noteScale * 0.95})`}
                fill={currentNote.clef === 'treble' ? 'var(--text-amber)' : 'rgba(255,255,255,0.45)'}
              >
                <path d={SMUFL_GLYPHS.gClef} />
              </g>
            </g>
          )}

          {/* ── Render Bass Staff (if active or both) ────────────────────────── */}
          {(clefChoice === 'bass' || isGrandStaff) && (
            <g>
              {/* 5 Staff Lines */}
              {[0, 1, 2, 3, 4].map(line => {
                const y = bassBottomY - line * lineSpacing
                return (
                  <line
                    key={`bass-line-${line}`}
                    x1={staffLeft}
                    y1={y}
                    x2={staffRight}
                    y2={y}
                    stroke="rgba(255,255,255,0.22)"
                    strokeWidth={1.2}
                  />
                )
              })}

              {/* Start & End vertical bar lines */}
              <line x1={staffLeft} y1={bassBottomY - 4 * lineSpacing} x2={staffLeft} y2={bassBottomY} stroke="rgba(255,255,255,0.3)" strokeWidth={1.4} />
              <line x1={staffRight} y1={bassBottomY - 4 * lineSpacing} x2={staffRight} y2={bassBottomY} stroke="rgba(255,255,255,0.3)" strokeWidth={1.4} />

              {/* Bass Clef Symbol (centered on F3 Line 4: bottomY - 3 * lineSpacing) */}
              <g
                transform={`translate(${staffLeft + 18}, ${bassBottomY - 3 * lineSpacing}) scale(${noteScale * 0.95}, -${noteScale * 0.95})`}
                fill={currentNote.clef === 'bass' ? 'var(--text-amber)' : 'rgba(255,255,255,0.45)'}
              >
                <path d={SMUFL_GLYPHS.fClef} />
              </g>
            </g>
          )}

          {/* Grand Staff Left Connecting Bracket & Bar */}
          {isGrandStaff && (
            <g>
              <line
                x1={staffLeft - 4}
                y1={trebleBottomY - 4 * lineSpacing}
                x2={staffLeft - 4}
                y2={bassBottomY}
                stroke="rgba(255,255,255,0.4)"
                strokeWidth={2}
              />
              <path
                d={`M ${staffLeft - 10} ${trebleBottomY - 4 * lineSpacing} Q ${staffLeft - 16} ${(trebleBottomY - 4 * lineSpacing + bassBottomY) / 2} ${staffLeft - 22} ${(trebleBottomY - 4 * lineSpacing + bassBottomY) / 2} Q ${staffLeft - 16} ${(trebleBottomY - 4 * lineSpacing + bassBottomY) / 2} ${staffLeft - 10} ${bassBottomY}`}
                fill="none"
                stroke="rgba(255,255,255,0.3)"
                strokeWidth={1.5}
              />
            </g>
          )}

          {/* ── Target Note Ledger Lines ────────────────────────────────────── */}
          {placement.ledgerLines.map((ly, idx) => (
            <line
              key={`target-ledger-${idx}`}
              x1={targetNoteX - 16}
              y1={ly}
              x2={targetNoteX + 16}
              y2={ly}
              stroke={feedback.status === 'correct' ? 'var(--status-success-text)' : 'rgba(255,255,255,0.6)'}
              strokeWidth={1.5}
            />
          ))}

          {/* ── Target Accidental Symbol ────────────────────────────────────── */}
          {accidentalGlyph && (
            <g
              transform={`translate(${targetNoteX - 22}, ${targetNoteY}) scale(${noteScale * 0.9}, -${noteScale * 0.9})`}
              fill={feedback.status === 'correct' ? 'var(--status-success-text)' : 'var(--text-amber)'}
            >
              <path d={accidentalGlyph} />
            </g>
          )}

          {/* ── Target Notehead (Always amber, or green when correct) ────────── */}
          <g
            transform={`translate(${targetNoteX - 11}, ${targetNoteY}) scale(${noteScale}, -${noteScale})`}
            fill={feedback.status === 'correct' ? 'var(--status-success-text)' : 'var(--text-amber)'}
            style={{
              transition: 'fill 0.15s ease',
              filter: feedback.status === 'correct'
                ? 'drop-shadow(0 0 6px rgba(96, 192, 96, 0.85))'
                : 'drop-shadow(0 0 4px rgba(245, 158, 11, 0.45))',
            }}
          >
            <path d={SMUFL_GLYPHS.noteWhole} />
          </g>

          {/* ── Wrongly Played Note (Rendered in RED if played) ──────────────── */}
          {wrongNote && wrongPlacement && (
            <g>
              {/* Ledger Lines for wrong note */}
              {wrongPlacement.ledgerLines.map((ly, idx) => (
                <line
                  key={`wrong-ledger-${idx}`}
                  x1={wrongNoteX - 16}
                  y1={ly}
                  x2={wrongNoteX + 16}
                  y2={ly}
                  stroke="var(--status-error-hover)"
                  strokeWidth={1.5}
                />
              ))}

              {/* Accidental for wrong note */}
              {wrongAccidentalGlyph && (
                <g
                  transform={`translate(${wrongNoteX - 22}, ${wrongPlacement.y}) scale(${noteScale * 0.9}, -${noteScale * 0.9})`}
                  fill="var(--status-error-hover)"
                >
                  <path d={wrongAccidentalGlyph} />
                </g>
              )}

              {/* Red Notehead */}
              <g
                transform={`translate(${wrongNoteX - 11}, ${wrongPlacement.y}) scale(${noteScale}, -${noteScale})`}
                fill="var(--status-error-hover)"
                style={{
                  filter: 'drop-shadow(0 0 7px rgba(231, 76, 60, 0.9))',
                }}
              >
                <path d={SMUFL_GLYPHS.noteWhole} />
              </g>
            </g>
          )}
        </svg>

        {/* ── Feedback Message Strip ───────────────────────────────────────── */}
        <div
          style={{
            marginTop: 10,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            minHeight: 22,
          }}
        >
          {feedback.status === 'correct' ? (
            <span style={{ color: 'var(--status-success-text)', fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', gap: 5 }}>
              <Check size={16} strokeWidth={2.5} /> {feedback.message}
            </span>
          ) : feedback.status === 'wrong' ? (
            <span style={{ color: 'var(--status-error-hover)', fontWeight: 600, fontSize: 13 }}>
              {feedback.message}
            </span>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              {feedback.message}
            </span>
          )}
        </div>
      </div>

      {/* ── Footer Bar: Listen, Show on Piano, Stats & Skip ─────────────────── */}
      <div
        style={{
          height: 42,
          background: 'var(--bg-modal-header)',
          borderTop: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 14px',
          flexShrink: 0,
        }}
      >
        {/* Left: Audition & Piano Highlight */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Listen: sound only, no visual highlighting on piano */}
          <Tooltip title={t`Hear Target Note`} description={t`Plays the target note without displaying it on the piano keys.`}>
            <button
              type="button"
              onClick={() => playNoteAudio(currentNote.midi, false)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', padding: 0,
                color: 'var(--text-inactive)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-inactive)'}
            >
              <Volume2 size={13} />
              {t`Listen`}
            </button>
          </Tooltip>

          <Tooltip title={t`Highlight on Piano`} description={t`Lights up the target key on the piano keyboard below.`}>
            <button
              type="button"
              onClick={() => setHighlightPiano(!highlightPiano)}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'none', border: 'none', padding: 0,
                color: highlightPiano ? 'var(--text-amber)' : 'var(--text-inactive)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <Music size={13} />
              {t`Show on Piano`}
            </button>
          </Tooltip>
        </div>

        {/* Center: Session Stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <span style={{ fontSize: 11, color: streak > 0 ? 'var(--text-amber)' : 'var(--text-muted)', fontWeight: 600 }}>
            🔥 {t`Streak`}: {streak}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t`Best`}: {bestStreak}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {t`Accuracy`}: {score.total > 0 ? Math.round((score.correct / score.total) * 100) : 100}% ({score.correct}/{score.total})
          </span>
          {score.total > 0 && (
            <Tooltip title={t`Reset Statistics`} oneLine>
              <button
                type="button"
                onClick={() => { setStreak(0); setScore({ correct: 0, total: 0 }); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-dimmest)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-muted)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
              >
                <RotateCcw size={11} />
              </button>
            </Tooltip>
          )}
        </div>

        {/* Right: Skip / Next */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button
            type="button"
            onClick={nextNote}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 4,
              padding: '3px 10px',
              color: 'var(--text-default)',
              fontSize: 11, fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = 'var(--text-amber)'
              e.currentTarget.style.color = 'var(--text-amber)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'var(--border)'
              e.currentTarget.style.color = 'var(--text-default)'
            }}
          >
            {t`Skip`} <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </div>
  )
}
