import React, { useMemo } from 'react'
import { useStore } from '../../store'
import type { KeyboardSize } from '../../types'
import { getWhiteKeys, noteToLeftPct, detectHandBoundaries } from '../../utils/handBoundaries'

const SIZES: KeyboardSize[] = [61, 73, 88]

// ── Bottom bar: keyboard size selector, dock/float toggle, note counter ───────
export default function KeyboardControls() {
  const keyboardSize  = useStore((s) => s.keyboardSize)
  const keyboardMode  = useStore((s) => s.keyboardMode)
  const setKeyboardSize = useStore((s) => s.setKeyboardSize)
  const setKeyboardMode = useStore((s) => s.setKeyboardMode)
  const showHandLabels          = useStore((s) => s.showHandLabels)
  const midi                    = useStore((s) => s.midi)
  const splitBreakpointType     = useStore((s) => s.splitBreakpointType)
  const splitBreakpointNote     = useStore((s) => s.splitBreakpointNote)
  const splitBreakpointRangeStart = useStore((s) => s.splitBreakpointRangeStart)
  const splitBreakpointRangeEnd   = useStore((s) => s.splitBreakpointRangeEnd)

  // ── White key list + hand boundaries, recomputed only on relevant changes ────
  const whiteKeys = useMemo(() => getWhiteKeys(keyboardSize), [keyboardSize])
  const handBoundaries = useMemo(
    () => detectHandBoundaries(midi, splitBreakpointType, splitBreakpointNote, splitBreakpointRangeStart, splitBreakpointRangeEnd),
    [midi, splitBreakpointType, splitBreakpointNote, splitBreakpointRangeStart, splitBreakpointRangeEnd],
  )

  const isDocked = keyboardMode === 'docked'

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
      {/* ── Key size selector ─────────────────────────────────────────────────── */}
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

      {/* ── Dock / Float toggle ───────────────────────────────────────────────── */}
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

      <div style={{ flex: 1 }} />

      {/* ── Hand boundary visual layer — amber lines + labels in footer bar ── */}
      {showHandLabels && handBoundaries && (() => {
        const AMBER = '#e8a027'
        const lineStyle: React.CSSProperties = {
          position: 'absolute', top: 0, bottom: 0, width: 2,
          background: AMBER,
          boxShadow: `0 0 7px 2px ${AMBER}88`,
          pointerEvents: 'none', zIndex: 2,
        }
        const labelBase: React.CSSProperties = {
          position: 'absolute', top: 0, bottom: 0,
          display: 'flex', alignItems: 'center',
          pointerEvents: 'none', zIndex: 2,
        }
        const textStyle: React.CSSProperties = {
          fontSize: 8, fontWeight: 700, letterSpacing: '0.16em',
          color: AMBER, fontFamily: 'Inter', textTransform: 'uppercase',
          userSelect: 'none',
        }
        if (handBoundaries.type === 'single') {
          const pct = noteToLeftPct(handBoundaries.note, whiteKeys)
          return (
            <>
              {/* amber line */}
              <div style={{ ...lineStyle, left: `${pct}%` }} />
              {/* LEFT HAND — right-aligned up to the line */}
              <div style={{ ...labelBase, left: 0, width: `${pct}%`, justifyContent: 'flex-end', paddingRight: 6 }}>
                <span style={textStyle}>Left Hand</span>
              </div>
              {/* RIGHT HAND — left-aligned from the line */}
              <div style={{ ...labelBase, left: `${pct}%`, right: 0, justifyContent: 'flex-start', paddingLeft: 8 }}>
                <span style={textStyle}>Right Hand</span>
              </div>
            </>
          )
        }
        const pct1 = noteToLeftPct(handBoundaries.start, whiteKeys)
        const pct2 = noteToLeftPct(handBoundaries.end, whiteKeys)
        return (
          <>
            {/* mixed zone fill */}
            <div style={{
              position: 'absolute', top: 0, bottom: 0,
              left: `${pct1}%`, width: `${pct2 - pct1}%`,
              background: `${AMBER}18`,
              pointerEvents: 'none', zIndex: 1,
            }} />
            {/* left amber line */}
            <div style={{ ...lineStyle, left: `${pct1}%` }} />
            {/* right amber line */}
            <div style={{ ...lineStyle, left: `${pct2}%` }} />
            {/* LEFT HAND — right-aligned to left line */}
            <div style={{ ...labelBase, left: 0, width: `${pct1}%`, justifyContent: 'flex-end', paddingRight: 6 }}>
              <span style={textStyle}>Left Hand</span>
            </div>
            {/* RIGHT HAND — left-aligned from right line */}
            <div style={{ ...labelBase, left: `${pct2}%`, right: 0, justifyContent: 'flex-start', paddingLeft: 8 }}>
              <span style={textStyle}>Right Hand</span>
            </div>
          </>
        )
      })()}

      {/* ── Note counter ──────────────────────────────────────────────────────── */}
      <NoteCounter />
    </div>
  )
}

// ── Shows total note + track count when a file is loaded ─────────────────────
function NoteCounter() {
  const midi = useStore((s) => s.midi)
  if (!midi) return null
  return (
    <span style={{ color: '#505068', fontSize: 10, fontFamily: 'JetBrains Mono' }} title="Total notes in file">
      {midi.noteCount.toLocaleString()} notes · {midi.tracks.length} tracks
    </span>
  )
}
