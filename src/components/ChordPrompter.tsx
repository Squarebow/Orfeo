// ── ChordPrompter ─────────────────────────────────────────────────────────────
// Floating teleprompter that shows the chord sequence during playback.
// Past 3 chords fade left, current chord is large and amber centred, next 3
// chords fade right. Current chord advances immediately to stay in sync with
// the keyboard display; past chords persist naturally in the history column.

import React, { useState, useMemo, useRef } from 'react'
import { useStore } from '../store'
import type { ChordEvent } from '../types'

const PANEL_WIDTH = 500
const PANEL_HEIGHT = 110
const HEADER_H = 24
const FOOTER_H = 28

// ── Design tokens ─────────────────────────────────────────────────────────────
const C = {
  bg:        '#0d0d12',
  border:    '#1e1e2a',
  amber:     '#e8a027',
  inactive:  '#b0b0cc',
  dim:       '#707088',
  dimmer:    '#404055',
  chevron:   '#303048',
  header:    '#0a0a0e',
}

// ── Opacity ramp for past / next chords, index 0 = closest to centre ─────────
const FADE_OPACITY = [0.85, 0.55, 0.28]

// ── Find the current chord: last event whose time <= currentTime ───────────────
// No minimum hold — advances immediately so the centre stays in sync with the
// keyboard display. Past chords persist naturally in the history column.
function resolveCurrentIndex(seq: ChordEvent[], currentTime: number): number {
  if (seq.length === 0) return -1
  let lo = 0, hi = seq.length - 1
  let idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (seq[mid].time <= currentTime) { idx = mid; lo = mid + 1 }
    else hi = mid - 1
  }
  return idx
}

export default function ChordPrompter() {
  const chordPrompterEnabled = useStore((s) => s.chordPrompterEnabled)
  const chordPrompterOpen = useStore((s) => s.chordPrompterOpen)
  const setChordPrompterOpen = useStore((s) => s.setChordPrompterOpen)
  const chordSequence = useStore((s) => s.chordSequence)
  const currentTime = useStore((s) => s.currentTime)
  const playbackState = useStore((s) => s.playbackState)
  const midi = useStore((s) => s.midi)

  // ── Drag position — default top-right, above keyboard ────────────────────
  const [pos, setPos] = useState(() => ({
    x: window.innerWidth - PANEL_WIDTH - 16,
    y: window.innerHeight - 320,
  }))

  // ── Freeze display at last known index on pause/stop ─────────────────────
  const frozenIndexRef = useRef<number>(-1)

  const liveIndex = useMemo(
    () => resolveCurrentIndex(chordSequence, currentTime),
    [chordSequence, currentTime],
  )

  // Update frozen index only while playing
  if (playbackState === 'playing') frozenIndexRef.current = liveIndex
  const currentIndex = playbackState === 'playing' ? liveIndex : frozenIndexRef.current

  if (!chordPrompterEnabled || !chordPrompterOpen) return null

  // ── Draggable header ──────────────────────────────────────────────────────
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

  // ── Determine which state to render ──────────────────────────────────────
  const noFile = !midi
  const noChords = midi && chordSequence.length === 0
  // Show the waiting state until the first chord is reached (covers stopped, paused, and early in playback)
  const notStarted = midi && chordSequence.length > 0 && currentIndex < 0

  const current = currentIndex >= 0 ? chordSequence[currentIndex] : null
  const past = currentIndex > 0
    ? chordSequence.slice(Math.max(0, currentIndex - 3), currentIndex).reverse()
    : []
  const next = currentIndex >= 0
    ? chordSequence.slice(currentIndex + 1, currentIndex + 4)
    : []

  return (
    <div
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: PANEL_WIDTH,
        height: PANEL_HEIGHT,
        background: C.bg,
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        zIndex: 402,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        userSelect: 'none',
      }}
    >
      {/* ── Header (drag handle) ── */}
      <div
        onMouseDown={startDrag}
        style={{
          height: HEADER_H,
          flexShrink: 0,
          background: C.header,
          borderBottom: `1px solid ${C.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 8px 0 10px',
          cursor: 'grab',
        }}
      >
        <span style={{ fontSize: 9, color: C.amber, fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700 }}>
          Chord Prompter
        </span>
        <button
          onMouseDown={e => e.stopPropagation()}
          onClick={() => setChordPrompterOpen(false)}
          title="Close"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: C.dimmer, padding: '2px 3px',
            display: 'flex', alignItems: 'center', lineHeight: 1,
            fontSize: 14, transition: 'color 0.12s',
          }}
          onMouseEnter={e => e.currentTarget.style.color = C.inactive}
          onMouseLeave={e => e.currentTarget.style.color = C.dimmer}
        >
          ×
        </button>
      </div>

      {/* ── Chord display area ── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', minHeight: 0, overflow: 'hidden' }}>

        {/* Empty states */}
        {(noFile || noChords || notStarted) && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 11, color: C.dimmer, fontFamily: 'Inter' }}>
              {noFile ? 'Open a MIDI file to see chords'
                : noChords ? 'No chords detected in this file'
                : 'Press play to see chords'}
            </span>
          </div>
        )}

        {!noFile && !noChords && !notStarted && (
          <>
            {/* ── Left column: past 3 chords, oldest-left, dot-separated ── */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4, padding: '0 4px 0 10px', minWidth: 0 }}>
              {past.slice(0, 3).reverse().map((ev, i, arr) => {
                // i=arr.length-1 is the most recent (rightmost, closest to centre) → opacity[0]=0.85
                const op = FADE_OPACITY[arr.length - 1 - i] ?? 0.28
                return (
                  <React.Fragment key={`${ev.time}-${ev.name}`}>
                    {i > 0 && (
                      <span style={{ color: C.inactive, opacity: FADE_OPACITY[arr.length - i] ?? 0.28, fontSize: 10, lineHeight: 1, flexShrink: 0 }}>·</span>
                    )}
                    <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono', color: C.inactive, opacity: op, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 56 }}>
                      {ev.name}
                    </span>
                  </React.Fragment>
                )
              })}
            </div>

            {/* ── Left chevron ── */}
            <span style={{ color: C.chevron, fontSize: 14, flexShrink: 0, lineHeight: 1 }}>‹</span>

            {/* ── Centre: current chord ── */}
            <div style={{
              flexShrink: 0,
              width: 130,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 6px',
              boxShadow: '0 0 20px rgba(232,160,39,0.08)',
            }}>
              <span style={{
                fontFamily: 'JetBrains Mono',
                fontSize: 22,
                fontWeight: 700,
                color: C.amber,
                lineHeight: 1,
                whiteSpace: 'nowrap',
                maxWidth: 120,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {current?.name ?? '—'}
              </span>
              <span style={{
                fontSize: 10,
                fontFamily: 'Inter',
                color: C.dim,
                marginTop: 4,
                letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                maxWidth: 120,
              }}>
                {current?.notes.join('  ') ?? ''}
              </span>
            </div>

            {/* ── Right chevron ── */}
            <span style={{ color: C.chevron, fontSize: 14, flexShrink: 0, lineHeight: 1 }}>›</span>

            {/* ── Right column: next 3 chords, dot-separated, fading right ── */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 4, padding: '0 10px 0 4px', minWidth: 0 }}>
              {next.slice(0, 3).map((ev, i) => (
                <React.Fragment key={`${ev.time}-${ev.name}`}>
                  {i > 0 && (
                    <span style={{ color: C.inactive, opacity: FADE_OPACITY[i - 1] ?? 0.28, fontSize: 10, lineHeight: 1, flexShrink: 0 }}>·</span>
                  )}
                  <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono', color: C.inactive, opacity: FADE_OPACITY[i] ?? 0.28, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 56 }}>
                    {ev.name}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Footer ── */}
      <div style={{
        height: FOOTER_H,
        flexShrink: 0,
        borderTop: `1px solid ${C.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <button
          title="Coming soon — full chord transcript with bar grid and keyboard diagrams"
          style={{
            background: 'none',
            border: `1px solid ${C.amber}`,
            borderRadius: 4,
            padding: '2px 10px',
            fontSize: 9,
            fontFamily: 'Inter',
            color: C.dim,
            cursor: 'not-allowed',
            opacity: 0.4,
            letterSpacing: '0.04em',
          }}
        >
          Transcribe &amp; Save PDF
        </button>
      </div>
    </div>
  )
}
