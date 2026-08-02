import { useMemo, useState, useEffect, useRef, type CSSProperties } from 'react'
import { useStore } from '../../store'
import type { KeyboardSize } from '../../types'
import { getWhiteKeys, noteToLeftPct, computeTaggedBoundaryCurve, interpolateTaggedCurve, type TaggedBoundarySample } from '../../utils/handBoundaries'

// Exponential ease toward the curve's raw target — smooths the line's motion
// between 0.25s samples instead of visibly stepping. Reaches ~90% of the way
// there in ~200ms at 60fps.
const SMOOTHING_FACTOR = 0.15

const SIZES: KeyboardSize[] = [61, 73, 88]

// ── Smooth the raw curve boundary (in keyboard-%) toward its target every
// frame — a plain per-sample lookup would visibly jump every 0.25s. Null
// target collapses immediately (no phantom glide when the line should just
// disappear because there's no two-hand texture right now).
function useSmoothedPct(rawPct: number | null): number | null {
  const rawRef = useRef(rawPct)
  rawRef.current = rawPct
  const displayedRef = useRef<number | null>(null)
  const rafRef = useRef<number | null>(null)
  const [smoothed, setSmoothed] = useState<number | null>(null)

  useEffect(() => {
    function tick() {
      const raw = rawRef.current
      if (raw === null) {
        displayedRef.current = null
      } else if (displayedRef.current === null) {
        displayedRef.current = raw
      } else {
        displayedRef.current += (raw - displayedRef.current) * SMOOTHING_FACTOR
      }
      setSmoothed(displayedRef.current)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [])

  return smoothed
}

// ── Bottom bar: keyboard size selector, dock/float toggle, note counter ───────
export default function KeyboardControls() {
  const keyboardSize  = useStore((s) => s.keyboardSize)
  const keyboardMode  = useStore((s) => s.keyboardMode)
  const setKeyboardSize = useStore((s) => s.setKeyboardSize)
  const setKeyboardMode = useStore((s) => s.setKeyboardMode)
  const presentationMode    = useStore((s) => s.presentationMode)
  const setPresentationMode = useStore((s) => s.setPresentationMode)
  const showHandLabels          = useStore((s) => s.showHandLabels)
  const handLabelMode           = useStore((s) => s.handLabelMode)
  const midi                    = useStore((s) => s.midi)
  const currentTime             = useStore((s) => s.currentTime)

  // ── Practice mode: moving boundary from stored hand tags, sliding-window
  // averaged (not one static whole-file number) — see computeTaggedBoundaryCurve.
  // (Performance mode's indicator lives on the keys themselves — Keyboard.tsx —
  // reading each active note's own tag; nothing to render in this bar for it.)
  const whiteKeys = useMemo(() => getWhiteKeys(keyboardSize), [keyboardSize])
  const [taggedCurve, setTaggedCurve] = useState<TaggedBoundarySample[]>([])
  useEffect(() => { setTaggedCurve(computeTaggedBoundaryCurve(midi)) }, [midi])
  const rawBoundary = useMemo(() => interpolateTaggedCurve(taggedCurve, currentTime), [taggedCurve, currentTime])
  const rawPct = rawBoundary !== null ? noteToLeftPct(rawBoundary, whiteKeys) : null
  const smoothedPct = useSmoothedPct(rawPct)

  const isDocked = keyboardMode === 'docked'

  return (
    <div
      style={{
        height: 34,
        background: 'var(--bg-modal-header)',
        borderTop: '1px solid var(--bg-tile)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-4)',
        gap: 'var(--space-3)',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* ── Key size selector ────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
        {SIZES.map((size) => (
          <button
            key={size}
            onClick={() => setKeyboardSize(size)}
            title={`${size}-key keyboard layout`}
            style={{
              padding: '2px var(--space-2)', borderRadius: 4,
              background: 'transparent',
              color: keyboardSize === size ? 'var(--text-amber)' : 'var(--text-muted)',
              border: 'none',
              fontFamily: 'JetBrains Mono', fontSize: 'var(--text-sm)', fontWeight: 600,
              cursor: 'pointer', transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (keyboardSize !== size) e.currentTarget.style.color = 'var(--text-key-hover)' }}
            onMouseLeave={e => { if (keyboardSize !== size) e.currentTarget.style.color = 'var(--text-muted)' }}
          >
            {size}
          </button>
        ))}
      </div>
      <div style={{ width: 1, height: 14, background: 'var(--border)' }} />

      {/* ── Dock / Float toggle — hidden in Presentation Mode ────────────────── */}
      {!presentationMode && <button
        onClick={() => setKeyboardMode(isDocked ? 'floating' : 'docked')}
        title={isDocked ? 'Float keyboard (detach)' : 'Dock keyboard (attach to bottom)'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: isDocked ? 'var(--text-muted)' : 'var(--text-amber)',
          fontSize: 'var(--text-xs)', fontFamily: 'Inter',
          padding: '2px 6px', borderRadius: 4,
          transition: 'color 0.15s',
          position: 'relative', zIndex: 3,
        }}
        onMouseEnter={e => { if (isDocked) e.currentTarget.style.color = 'var(--text-amber)' }}
        onMouseLeave={e => { if (isDocked) e.currentTarget.style.color = 'var(--text-muted)' }}
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
      </button>}

      {/* ── Spacer ─────────────────────────────────────────────────────────── */}
      {!presentationMode && <div style={{ flex: 1 }} />}

      {/* ── Practice mode: moving split line from stored hand tags ──────────── */}
      {/* (beta, needs rework — hidden in Presentation Mode) ─────────────────── */}
      {showHandLabels && handLabelMode === 'practice' && !presentationMode && smoothedPct !== null && (() => {
        const AMBER = 'var(--text-amber)'
        const pct = smoothedPct
        const lineStyle: CSSProperties = {
          position: 'absolute', top: 0, bottom: 0, width: 2,
          background: AMBER,
          boxShadow: `0 0 7px 2px ${AMBER}88`,
          pointerEvents: 'none', zIndex: 2,
        }
        const labelBase: CSSProperties = {
          position: 'absolute', top: 0, bottom: 0,
          display: 'flex', alignItems: 'center',
          pointerEvents: 'none', zIndex: 2,
        }
        const textStyle: CSSProperties = {
          fontSize: 8, fontWeight: 700, letterSpacing: '0.16em',
          color: AMBER, fontFamily: 'Inter', textTransform: 'uppercase',
          userSelect: 'none',
        }
        return (
          <>
            <div style={{ ...lineStyle, left: `${pct}%` }} />
            <div style={{ ...labelBase, left: 0, width: `${pct}%`, justifyContent: 'flex-end', paddingRight: 6 }}>
              <span style={textStyle}>Left Hand</span>
            </div>
            <div style={{ ...labelBase, left: `${pct}%`, right: 0, justifyContent: 'flex-start', paddingLeft: 'var(--space-2)' }}>
              <span style={textStyle}>Right Hand</span>
            </div>
          </>
        )
      })()}

      {/* ── Note counter ───────────────────────────────────────────────────── */}
      {!presentationMode && <NoteCounter />}

      {/* ── Presentation Mode toggle — replaces Docked/NoteCounter in PM footer ─ */}
      <button
        onClick={() => setPresentationMode(!presentationMode)}
        title={presentationMode ? 'Exit Presentation Mode (Esc)' : 'Enter Presentation Mode (F11)'}
        style={{
          display: 'flex', alignItems: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-amber)',
          padding: '2px 4px', borderRadius: 4,
          marginLeft: presentationMode ? 'auto' : undefined,
          transition: 'opacity 0.15s',
          opacity: 0.65,
          position: 'relative', zIndex: 3,
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '1' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '0.65' }}
      >
        {presentationMode ? (
          // ── Lucide Shrink — exit fullscreen ────────────────────────────────
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 15 6 6m-6-6v4.8m0-4.8h4.8"/>
            <path d="M9 19.8V15m0 0H4.2M9 15l-6 6"/>
            <path d="M15 4.2V9m0 0h4.8M15 9l6-6"/>
            <path d="M9 4.2V9m0 0H4.2M9 9 3 3"/>
          </svg>
        ) : (
          // ── Lucide Expand — enter fullscreen ───────────────────────────────
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m15 15 6 6"/>
            <path d="m15 9 6-6"/>
            <path d="M21 16v5h-5"/>
            <path d="M21 8V3h-5"/>
            <path d="M3 16v5h5"/>
            <path d="m3 21 6-6"/>
            <path d="M3 8V3h5"/>
            <path d="M9 9 3 3"/>
          </svg>
        )}
      </button>
    </div>
  )
}

// ── Shows total note + track count when a file is loaded ─────────────────────
function NoteCounter() {
  const midi = useStore((s) => s.midi)
  if (!midi) return null
  return (
    <span style={{ color: 'var(--text-inactive)', fontSize: 10, fontFamily: 'JetBrains Mono' }} title="Total notes in file">
      {midi.noteCount.toLocaleString()} notes · {midi.tracks.length} tracks
    </span>
  )
}
