import { useMemo, useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { useStore } from '../../store'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { stepEvents } from '../../utils/stepThrough'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
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
  // ── Undocking is blocked while any bottom-anchored modal is open (they all
  // share the keyboard-header anchor, so floating the keyboard out from under
  // them would be visually broken) — LockedChordModal is excluded, it's small
  // and doesn't compete for that space. Re-docking is always allowed. ────────
  const chordExplorerOpen = useStore((s) => s.chordExplorerOpen)
  const scaleExplorerOpen = useStore((s) => s.scaleExplorerOpen)
  const mixerOpen         = useStore((s) => s.mixerOpen)
  const midiEditorOpen    = useStore((s) => s.midiEditorOpen)
  const undockBlocked = chordExplorerOpen || scaleExplorerOpen || mixerOpen || midiEditorOpen

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

  // ── Practice-mode line and the shift+click hint share the same center
  // spot — moving line wins when it's actually rendering (stored hand
  // tags present), otherwise the hint occupies that space instead. ────────
  const practiceLineActive = showHandLabels && handLabelMode === 'practice' && !presentationMode && smoothedPct !== null

  // ── Shift+click hint sits in the middle of the whole Orfeo window, not of
  // this bar — the bar narrows when a side panel opens, which used to slide
  // the hint sideways. Its centre cell is shifted by the difference, never so
  // far that it runs into the controls on either side. Floating keyboard: no
  // shift (it's not tied to the window's width). ─────────────────────────
  const rowRef = useRef<HTMLDivElement>(null)
  const hintCellRef = useRef<HTMLDivElement>(null)
  const hintRef = useRef<HTMLSpanElement>(null)
  const [hintShift, setHintShift] = useState(0)
  const stepThroughEnabled = useStore(s => s.stepThroughEnabled)
  const hasSong = useStore(s => !!s.midi)
  useLayoutEffect(() => {
    const row = rowRef.current, cell = hintCellRef.current
    if (!row || !cell) return
    const measure = () => {
      const hint = hintRef.current
      if (!isDocked || !hint) { setHintShift(0); return }
      const c = cell.getBoundingClientRect()
      const w = hint.getBoundingClientRect().width
      const left = (cell.previousElementSibling as HTMLElement | null)?.getBoundingClientRect().right ?? c.left
      const right = (cell.nextElementSibling as HTMLElement | null)?.getBoundingClientRect().left ?? c.right
      const want = window.innerWidth / 2 - (c.left + c.width / 2)
      const gap = 16
      const min = left + gap + w / 2 - (c.left + c.width / 2)
      const max = right - gap - w / 2 - (c.left + c.width / 2)
      setHintShift(Math.round(Math.max(min, Math.min(max, want))))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(row)
    window.addEventListener('resize', measure)
    return () => { ro.disconnect(); window.removeEventListener('resize', measure) }
  }, [isDocked, practiceLineActive, presentationMode, stepThroughEnabled])

  return (
    <div
      ref={rowRef}
      style={{
        height: 34,
        background: 'var(--bg-modal-header)',
        borderTop: '1px solid var(--bg-tile)',
        display: 'grid',
        gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)',
        alignItems: 'center',
        padding: '0 var(--space-4)',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* ── Left: key size selector + dock/float toggle ──────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', justifySelf: 'start', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          {SIZES.map((size) => (
            <Tooltip key={size} title={`Switch to ${size}-key layout`} oneLine>
            <button
              onClick={() => setKeyboardSize(size)}
              style={{
                padding: '2px var(--space-2)', borderRadius: 4,
                background: 'transparent',
                color: keyboardSize === size ? 'var(--text-amber)' : 'var(--text-muted)',
                border: 'none',
                fontFamily: 'var(--font-mono)', fontSize: 'var(--text-sm)', fontWeight: 600,
                cursor: 'pointer', transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (keyboardSize !== size) e.currentTarget.style.color = 'var(--text-key-hover)' }}
              onMouseLeave={e => { if (keyboardSize !== size) e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              {size}
            </button>
            </Tooltip>
          ))}
        </div>
        <div style={{ width: 1, height: 14, background: 'var(--border)' }} />

        {/* ── Dock / Float toggle — hidden in Presentation Mode ────────────────── */}
        {!presentationMode && <Tooltip
          title={isDocked ? (undockBlocked ? "Can't float yet" : 'Float keyboard') : 'Dock keyboard'}
          description={isDocked
            ? (undockBlocked ? 'Close the open modal first — it shares the keyboard\'s anchor point.' : 'Detaches the keyboard so it can be moved and resized independently.')
            : 'Reattaches the keyboard to the bottom of the window.'}
        >
        <button
          onClick={() => { if (isDocked && undockBlocked) return; setKeyboardMode(isDocked ? 'floating' : 'docked') }}
          disabled={isDocked && undockBlocked}
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            background: 'transparent', border: 'none',
            cursor: isDocked && undockBlocked ? 'default' : 'pointer',
            opacity: isDocked && undockBlocked ? 0.35 : 1,
            color: isDocked ? 'var(--text-muted)' : 'var(--text-amber)',
            fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)',
            padding: '2px 6px', borderRadius: 4,
            transition: 'color 0.15s',
            position: 'relative', zIndex: 3,
          }}
          onMouseEnter={e => { if (isDocked && !undockBlocked) e.currentTarget.style.color = 'var(--text-amber)' }}
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
        </button>
        </Tooltip>}
      </div>

      {/* ── Center: shift+click hint — hidden while the practice-mode split
          line (below) is actively rendering; the line takes this spot instead. ── */}
      <div ref={hintCellRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', justifySelf: 'center', minWidth: 0 }}>
        {!practiceLineActive && !presentationMode && (
          <span ref={hintRef} style={{ display: 'inline-flex', alignItems: 'center', gap: 28, transform: `translateX(${hintShift}px)` }}>
            {stepThroughEnabled && <StepArrow dir={-1} enabled={hasSong} />}
            <span style={{ fontSize: 11, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', userSelect: 'none', whiteSpace: 'nowrap' }}>
              Shift+Click three keys or more to build &amp; lock a chord
            </span>
            {stepThroughEnabled && <StepArrow dir={1} enabled={hasSong} />}
          </span>
        )}
      </div>

      {/* ── Right: note counter + Presentation Mode toggle ───────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', justifySelf: 'end', minWidth: 0 }}>

      {/* ── Practice mode: moving split line from stored hand tags ──────────── */}
      {/* (beta, needs rework — hidden in Presentation Mode) ─────────────────── */}
      {practiceLineActive && (() => {
        const AMBER = 'var(--text-amber)'
        const pct = smoothedPct
        const lineStyle: CSSProperties = {
          position: 'absolute', top: 0, bottom: 0, width: 2,
          background: AMBER,
          boxShadow: `0 0 8px 2px ${AMBER}88`,
          pointerEvents: 'none', zIndex: 2,
        }
        const labelBase: CSSProperties = {
          position: 'absolute', top: 0, bottom: 0,
          display: 'flex', alignItems: 'center',
          pointerEvents: 'none', zIndex: 2,
        }
        const textStyle: CSSProperties = {
          fontSize: 8, fontWeight: 700, letterSpacing: '0.16em',
          color: AMBER, fontFamily: 'var(--font-ui)', textTransform: 'uppercase',
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
      <Tooltip
        title={presentationMode ? 'Exit Presentation Mode' : 'Presentation Mode'}
        description={presentationMode ? 'Press Esc to leave, or click here.' : 'Distraction-free fullscreen view.\nF11 to open, Esc to close.'}
      >
      <button
        onClick={() => setPresentationMode(!presentationMode)}
        style={{
          display: 'flex', alignItems: 'center',
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: 'var(--text-amber)',
          padding: '2px 4px', borderRadius: 4,
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
      </Tooltip>
      </div>
    </div>
  )
}

// ── Shows total note + track count when a file is loaded ─────────────────────
function NoteCounter() {
  const midi = useStore((s) => s.midi)
  if (!midi) return null
  return (
    <span style={{ color: 'var(--text-inactive)', fontSize: 10, fontFamily: 'var(--font-mono)' }}>
      {midi.noteCount.toLocaleString()} notes · {midi.tracks.length} tracks
    </span>
  )
}

// ── Step Through arrows either side of the hint: same as ← / → (Shift: a bar) ──
function StepArrow({ dir, enabled }: { dir: 1 | -1; enabled: boolean }) {
  const [hover, setHover] = useState(false)
  const Icon = dir === 1 ? ArrowRight : ArrowLeft
  return (
    <Tooltip title={dir === 1 ? t`Next note or chord (Shift+→ next bar)` : t`Previous note or chord (Shift+← previous bar)`} oneLine>
      <button
        type="button"
        aria-label={dir === 1 ? t`Next note or chord` : t`Previous note or chord`}
        disabled={!enabled}
        onClick={(e) => { stepEvents(dir, e.shiftKey); e.currentTarget.blur() }}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 18, padding: 0,
          background: 'none', border: 'none', borderRadius: 'var(--radius-sm, 3px)',
          cursor: enabled ? 'pointer' : 'default',
          color: enabled ? 'var(--text-amber)' : 'var(--state-disabled)',
          opacity: enabled && !hover ? 0.6 : 1,
          transition: 'opacity 0.12s',
        }}
      >
        <Icon size={14} strokeWidth={1.8} />
      </button>
    </Tooltip>
  )
}
