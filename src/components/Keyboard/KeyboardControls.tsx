import React, { useMemo, useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'
import type { KeyboardSize } from '../../types'
import {
  getWhiteKeys, noteToLeftPct, detectHandBoundaries,
  computeHandBoundaryCurve, interpolateCurve, detectPerformanceBoundary,
  computeClusterCenterCurve, lookupClusterAtTime,
} from '../../utils/handBoundaries'

const SIZES: KeyboardSize[] = [61, 73, 88]

// ── Smoothing constants ───────────────────────────────────────────────────────
// Ribbon: exponential ease toward target — reaches ~90% in ~175ms at 60fps
const SMOOTHING_FACTOR  = 0.18
// Labels: very heavy damping so labels float nearly stationary during normal playing
const CLUSTER_SMOOTHING = 0.04

// ── Exponential boundary smoother — applied once to the merged performanceBoundary ─
// Smooths in pct space (not MIDI) so motion is visually uniform across black/white
// key geometry. Null raw → immediate null (line disappears without phantom ease).
// Uses a single long-lived rAF loop with refs so raw changes never restart the loop.
function useSmoothedBoundary(
  rawBoundary: number | null,
  whiteKeys: { midi: number }[],
): number | null {
  // ── Keep refs current every render without restarting the loop ────────────
  const rawRef       = useRef(rawBoundary)
  const whiteKeysRef = useRef(whiteKeys)
  rawRef.current       = rawBoundary
  whiteKeysRef.current = whiteKeys

  const displayedPctRef = useRef<number | null>(null)
  const rafRef          = useRef<number | null>(null)

  const [ribbonPct, setRibbonPct] = useState<number | null>(null)

  useEffect(() => {
    // ── rAF tick — reads refs so raw changes never restart this loop ─────────
    function tick() {
      const raw  = rawRef.current
      const keys = whiteKeysRef.current

      // ── Exponential smoothing in pct space ────────────────────────────────
      let next: number | null
      if (raw === null) {
        displayedPctRef.current = null
        next = null
      } else {
        const targetPct = noteToLeftPct(raw, keys)
        if (displayedPctRef.current === null) {
          displayedPctRef.current = targetPct
        } else {
          displayedPctRef.current += (targetPct - displayedPctRef.current) * SMOOTHING_FACTOR
        }
        next = displayedPctRef.current
      }

      setRibbonPct(next)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, []) // empty deps — loop runs once; all reactive values accessed via refs

  return ribbonPct
}

// ── Cluster center smoother — two independent exponential smoothers ───────────
// Heavy damping (CLUSTER_SMOOTHING = 0.04) keeps labels nearly stationary during
// normal playing; they glide slowly when the hand register genuinely shifts.
// Null input → immediate null output (label hides without a phantom glide).
function useSmoothedClusterCenters(
  rawLeftPct:  number | null,
  rawRightPct: number | null,
): { clusterLeftPct: number | null; clusterRightPct: number | null } {
  // ── Keep refs current every render without restarting the loop ────────────
  const leftRef  = useRef(rawLeftPct)
  const rightRef = useRef(rawRightPct)
  leftRef.current  = rawLeftPct
  rightRef.current = rawRightPct

  const smoothedLeftRef  = useRef<number | null>(null)
  const smoothedRightRef = useRef<number | null>(null)
  const rafRef           = useRef<number | null>(null)

  const [centers, setCenters] = useState<{
    clusterLeftPct:  number | null
    clusterRightPct: number | null
  }>({ clusterLeftPct: null, clusterRightPct: null })

  useEffect(() => {
    // ── rAF tick — reads refs so raw changes never restart this loop ─────────
    function tick() {
      const rawL = leftRef.current
      const rawR = rightRef.current

      // ── Left smoother ──────────────────────────────────────────────────────
      if (rawL === null) {
        smoothedLeftRef.current = null
      } else if (smoothedLeftRef.current === null) {
        smoothedLeftRef.current = rawL
      } else {
        smoothedLeftRef.current += (rawL - smoothedLeftRef.current) * CLUSTER_SMOOTHING
      }

      // ── Right smoother ─────────────────────────────────────────────────────
      if (rawR === null) {
        smoothedRightRef.current = null
      } else if (smoothedRightRef.current === null) {
        smoothedRightRef.current = rawR
      } else {
        smoothedRightRef.current += (rawR - smoothedRightRef.current) * CLUSTER_SMOOTHING
      }

      setCenters({
        clusterLeftPct:  smoothedLeftRef.current,
        clusterRightPct: smoothedRightRef.current,
      })
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, []) // empty deps — loop runs once; all reactive values accessed via refs

  return centers
}

// ── Bottom bar: keyboard size selector, dock/float toggle, note counter ───────
export default function KeyboardControls() {
  const keyboardSize  = useStore((s) => s.keyboardSize)
  const keyboardMode  = useStore((s) => s.keyboardMode)
  const setKeyboardSize = useStore((s) => s.setKeyboardSize)
  const setKeyboardMode = useStore((s) => s.setKeyboardMode)
  const showHandLabels          = useStore((s) => s.showHandLabels)
  const handLabelMode           = useStore((s) => s.handLabelMode)
  const midi                    = useStore((s) => s.midi)
  const splitBreakpointType     = useStore((s) => s.splitBreakpointType)
  const splitBreakpointNote     = useStore((s) => s.splitBreakpointNote)
  const splitBreakpointRangeStart = useStore((s) => s.splitBreakpointRangeStart)
  const splitBreakpointRangeEnd   = useStore((s) => s.splitBreakpointRangeEnd)
  const handBoundaryCurve            = useStore((s) => s.handBoundaryCurve)
  const currentTime                  = useStore((s) => s.currentTime)
  const activeKeys                   = useStore((s) => s.activeKeys)
  const activeKeyColors              = useStore((s) => s.activeKeyColors)
  const playbackState                = useStore((s) => s.playbackState)
  const performanceSplitSensitivity  = useStore((s) => s.performanceSplitSensitivity)

  // ── White key list + practice-mode hand boundaries ───────────────────────────
  const whiteKeys = useMemo(() => getWhiteKeys(keyboardSize), [keyboardSize])
  const handBoundaries = useMemo(
    () => detectHandBoundaries(midi, splitBreakpointType, splitBreakpointNote, splitBreakpointRangeStart, splitBreakpointRangeEnd),
    [midi, splitBreakpointType, splitBreakpointNote, splitBreakpointRangeStart, splitBreakpointRangeEnd],
  )

  // ── Local cluster center curve — pre-computed on file load ───────────────────
  const [clusterCurve, setClusterCurve] = useState<{
    time: number; leftCenter: number | null; rightCenter: number | null
  }[]>([])

  // ── Compute boundary + cluster curves when file or sensitivity changes ────────
  useEffect(() => {
    const { setHandBoundaryCurve } = useStore.getState()
    if (!midi) {
      setHandBoundaryCurve([])
      setClusterCurve([])
      return
    }
    setHandBoundaryCurve(computeHandBoundaryCurve(midi, performanceSplitSensitivity))
    setClusterCurve(computeClusterCenterCurve(midi, performanceSplitSensitivity))
  }, [midi, performanceSplitSensitivity])

  // ── Live boundary from currently held keys — Performance + hardware MIDI ──────
  // Always updated (null or number) so tight single-hand clusters actively hide
  // the line rather than holding a stale boundary from a previous phrase.
  const [lastLiveBoundary, setLastLiveBoundary] = useState<number | null>(null)
  useEffect(() => {
    if (handLabelMode !== 'performance') return
    const pitches = [...activeKeys].sort((a, b) => a - b)
    setLastLiveBoundary(detectPerformanceBoundary(pitches, performanceSplitSensitivity))
  }, [activeKeys, handLabelMode, performanceSplitSensitivity])

  // ── Hardware keys have the specific amber color set by useMidiInput ───────────
  // Track playback colors come from MIDI track colors, never this exact amber.
  const hasHardwareKeys = [...activeKeyColors.values()].some(c => c === '#e8a027')

  // ── Performance boundary: hardware input takes priority over curve ────────────
  // When hardware keys are present, use live result directly — null means a tight
  // single-hand cluster and the line should hide, not fall back to the file curve.
  const curveBoundary = interpolateCurve(handBoundaryCurve, currentTime)
  const performanceBoundary: number | null = hasHardwareKeys ? lastLiveBoundary : curveBoundary

  // ── Smoothed ribbon pct — exponential ease applied to merged boundary ─────────
  const ribbonPct = useSmoothedBoundary(performanceBoundary, whiteKeys)

  // ── Raw cluster centers — hardware path takes priority over file curve ─────────
  // Hardware: split activeKeys directly at the live boundary.
  // File: binary-search nearest past sample from the pre-computed cluster curve.
  let rawLeftCenter: number | null = null
  let rawRightCenter: number | null = null
  if (hasHardwareKeys && performanceBoundary !== null) {
    const pitches = [...activeKeys].sort((a, b) => a - b)
    const left  = pitches.filter(p => p < performanceBoundary)
    const right = pitches.filter(p => p >= performanceBoundary)
    if (left.length > 0)  rawLeftCenter  = left.reduce((s, p) => s + p, 0) / left.length
    if (right.length > 0) rawRightCenter = right.reduce((s, p) => s + p, 0) / right.length
  } else {
    const { leftCenter, rightCenter } = lookupClusterAtTime(clusterCurve, currentTime)
    rawLeftCenter  = leftCenter
    rawRightCenter = rightCenter
  }

  // ── Convert raw MIDI cluster center to keyboard pct ───────────────────────────
  const rawLeftPct  = rawLeftCenter  !== null ? noteToLeftPct(Math.round(rawLeftCenter),  whiteKeys) : null
  const rawRightPct = rawRightCenter !== null ? noteToLeftPct(Math.round(rawRightCenter), whiteKeys) : null

  // ── Smoothed cluster center pct — heavy damping keeps labels nearly stationary ─
  const { clusterLeftPct, clusterRightPct } = useSmoothedClusterCenters(rawLeftPct, rawRightPct)

  // ── Silence: no keys currently active — triggers resting state in Performance mode ─
  const isSilent = activeKeys.size === 0

  // ── Frozen last-known positions for the resting midline and dimmed labels ────────
  // Mutated during render (safe — ref mutation does not trigger re-renders).
  // Defaults: ribbonPct to 50% (centered) so the midline appears before any
  // boundary has been detected this session; cluster positions start null (labels
  // stay hidden until the first two-hand texture is seen).
  const hadBoundaryRef         = useRef(false)
  const lastRibbonPctRef       = useRef<number>(50)
  const lastClusterLeftPctRef  = useRef<number | null>(null)
  const lastClusterRightPctRef = useRef<number | null>(null)
  if (ribbonPct !== null)       { hadBoundaryRef.current = true; lastRibbonPctRef.current = ribbonPct }
  if (clusterLeftPct !== null)  lastClusterLeftPctRef.current  = clusterLeftPct
  if (clusterRightPct !== null) lastClusterRightPctRef.current = clusterRightPct

  // ── Hide size buttons and note counter when performance mode is actively driving ─
  const performanceHideControls = handLabelMode === 'performance'
    && showHandLabels
    && (playbackState === 'playing' || hasHardwareKeys)

  const isDocked = keyboardMode === 'docked'

  return (
    <div
      style={{
        height: 34,
        background: '#0d0d12',
        borderTop: '1px solid #1a1a24',
        display: 'flex',
        alignItems: 'center',
        padding: '0 var(--space-4)',
        gap: 'var(--space-3)',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* ── Key size selector — hidden in performance mode while active ──────── */}
      {!performanceHideControls && (
        <>
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
                onMouseEnter={e => { if (keyboardSize !== size) e.currentTarget.style.color = '#c0c0d0' }}
                onMouseLeave={e => { if (keyboardSize !== size) e.currentTarget.style.color = 'var(--text-muted)' }}
              >
                {size}
              </button>
            ))}
          </div>
          <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
        </>
      )}

      {/* ── Dock / Float toggle — pinned to far right in performance mode ─────── */}
      <button
        onClick={() => setKeyboardMode(isDocked ? 'floating' : 'docked')}
        title={isDocked ? 'Float keyboard (detach)' : 'Dock keyboard (attach to bottom)'}
        style={{
          display: 'flex', alignItems: 'center', gap: 5,
          background: 'transparent', border: 'none', cursor: 'pointer',
          color: isDocked ? 'var(--text-muted)' : 'var(--text-amber)',
          fontSize: 'var(--text-xs)', fontFamily: 'Inter',
          padding: '2px 6px', borderRadius: 4,
          transition: 'color 0.15s',
          marginLeft: performanceHideControls ? 'auto' : undefined,
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
      </button>

      {/* ── Spacer — omitted in performance mode (marginLeft:auto on button handles it) ─ */}
      {!performanceHideControls && <div style={{ flex: 1 }} />}

      {/* ── Hand boundary visual layer — amber lines + labels in footer bar ── */}
      {showHandLabels && (() => {
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

        // ── Performance mode: two-color ribbon + cluster-anchored labels ────────
        if (handLabelMode === 'performance') {
          // ── Notes active but no detectable two-hand gap — hide everything ──────
          if (!isSilent && ribbonPct === null) return null

          const SLATE = '#4a7fff'
          // ── Resting-state positions: freeze at last known value or defaults ─────
          const activePct     = ribbonPct ?? lastRibbonPctRef.current
          const labelLeftPct  = clusterLeftPct  ?? lastClusterLeftPctRef.current
          const labelRightPct = clusterRightPct ?? lastClusterRightPctRef.current

          return (
            <>
              {/* ── Full-width gradient fill — fades to hidden during silence ────── */}
              {/* Left (bass) region: blue-indigo. Right (treble): amber. ~90% opacity. */}
              <div style={{
                position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
                background: [
                  `linear-gradient(to right,`,
                  `${SLATE}e6 0%,`,
                  `${SLATE}e6 calc(${activePct}% - 4px),`,
                  `${AMBER}e6 calc(${activePct}% + 4px),`,
                  `${AMBER}e6 100%)`,
                ].join(' '),
                opacity: isSilent ? 0 : 1,
                transition: 'opacity 0.25s ease',
                pointerEvents: 'none', zIndex: 1,
              }} />

              {/* ── Resting midline — dim marker visible only during silence ─────── */}
              {isSilent && (
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${activePct}%`,
                  width: 1,
                  background: 'var(--text-muted)',
                  pointerEvents: 'none', zIndex: 2,
                }} />
              )}

              {/* ── LEFT HAND label — floats at cluster center, dims during silence ─ */}
              {labelLeftPct !== null && (
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${labelLeftPct}%`,
                  transform: 'translateX(-50%)',
                  display: 'flex', alignItems: 'center',
                  opacity: isSilent ? 0.55 : 1,
                  transition: 'opacity 0.25s ease',
                  pointerEvents: 'none', zIndex: 2,
                }}>
                  <span style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: '0.16em',
                    color: '#ffffff', fontFamily: 'Inter', textTransform: 'uppercase',
                    userSelect: 'none',
                  }}>Left Hand</span>
                </div>
              )}

              {/* ── RIGHT HAND label — floats at cluster center, dims during silence ─ */}
              {labelRightPct !== null && (
                <div style={{
                  position: 'absolute', top: 0, bottom: 0,
                  left: `${labelRightPct}%`,
                  transform: 'translateX(-50%)',
                  display: 'flex', alignItems: 'center',
                  opacity: isSilent ? 0.55 : 1,
                  transition: 'opacity 0.25s ease',
                  pointerEvents: 'none', zIndex: 2,
                }}>
                  <span style={{
                    fontSize: 8, fontWeight: 700, letterSpacing: '0.16em',
                    color: '#ffffff', fontFamily: 'Inter', textTransform: 'uppercase',
                    userSelect: 'none',
                  }}>Right Hand</span>
                </div>
              )}
            </>
          )
        }

        // ── Practice mode: static single boundary or shaded range ────────────
        if (!handBoundaries) return null
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
              <div style={{ ...labelBase, left: `${pct}%`, right: 0, justifyContent: 'flex-start', paddingLeft: 'var(--space-2)' }}>
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
            <div style={{ ...labelBase, left: `${pct2}%`, right: 0, justifyContent: 'flex-start', paddingLeft: 'var(--space-2)' }}>
              <span style={textStyle}>Right Hand</span>
            </div>
          </>
        )
      })()}

      {/* ── Note counter — hidden in performance mode while active ─────────────── */}
      {!performanceHideControls && <NoteCounter />}
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
