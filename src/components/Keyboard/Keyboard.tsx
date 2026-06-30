import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { FileText, ScrollText } from 'lucide-react'
import { useStore } from '../../store'
import type { TranscriptEntry } from '../../types'

// ── Inject spin keyframe once for transcript loading animation ─────────────────
if (typeof document !== 'undefined' && !document.getElementById('orfeo-transcript-anim')) {
  const s = document.createElement('style')
  s.id = 'orfeo-transcript-anim'
  s.textContent = '@keyframes orfeo-transcript-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'
  document.head.appendChild(s)
}
import { isBlackKey } from '../../utils/midiParser'
import { getNoteLabel, getNoteName } from '../../utils/noteNames'
import { detectChord, detectChordWithInversion, formatInversionDisplay, localizeChord, ordinalSuffix } from '../../utils/chordDetection'

const RANGES: Record<number, { min: number; max: number }> = {
  61: { min: 36, max: 96 },
  73: { min: 28, max: 103 },
  88: { min: 21, max: 108 },
}

const CHORD_MIN_NOTES = 3
const CHORD_DEBOUNCE_MS = 320
const CHORD_HOLD_MS = 1600

// ── Resolve current chord index: last event whose time <= currentTime ─────────
function resolveCurrentIndex(seq: { time: number }[], currentTime: number): number {
  if (seq.length === 0) return -1
  let lo = 0, hi = seq.length - 1, idx = -1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    if (seq[mid].time <= currentTime) { idx = mid; lo = mid + 1 }
    else hi = mid - 1
  }
  return idx
}

export default function Keyboard() {
  const keyboardSize = useStore((s) => s.keyboardSize)
  const activeKeys = useStore((s) => s.activeKeys)
  const activeKeyColors = useStore((s) => s.activeKeyColors)
  const noteNaming = useStore((s) => s.noteNaming)
  const accidentals = useStore((s) => s.accidentals)
  const playbackState = useStore((s) => s.playbackState)
  const explorerKeys = useStore((s) => s.explorerKeys)
  const explorerKeyColors = useStore((s) => s.explorerKeyColors)
  const chordExplorerOpen = useStore((s) => s.chordExplorerOpen)
  const setChordExplorerOpen = useStore((s) => s.setChordExplorerOpen)
  const scaleExplorerOpen = useStore((s) => s.scaleExplorerOpen)
  const setScaleExplorerOpen = useStore((s) => s.setScaleExplorerOpen)
  const displayedChord = useStore((s) => s.displayedChord)
  const lockedKeys = useStore((s) => s.lockedKeys)
  const lockedColors = useStore((s) => s.lockedColors)
  const setLockedKeysStore = useStore((s) => s.setLockedKeys)
  const clearLockedKeys = useStore((s) => s.clearLockedKeys)
  // ── Chord identity preserved across inversion cycling ─────────────────────
  const originalLockedChordName = useStore((s) => s.originalLockedChordName)
  const lockedInversionCount    = useStore((s) => s.lockedInversionCount)
  const lockedChordNoteCount    = useStore((s) => s.lockedChordNoteCount)
  // ── Explorer chord display — computed name + count from ChordExplorer/ScaleExplorer
  const explorerChordDisplay    = useStore((s) => s.explorerChordDisplay)
  // ── Chord sequence + prompter state ──────────────────────────────────────────
  const midi = useStore((s) => s.midi)
  const chordSequence = useStore((s) => s.chordSequence)
  const chordPrompterEnabled = useStore((s) => s.chordPrompterEnabled)
  const chordPrompterOpen = useStore((s) => s.chordPrompterOpen)
  const setChordPrompterOpen = useStore((s) => s.setChordPrompterOpen)
  const currentTime = useStore((s) => s.currentTime)
  const addTranscriptEntry = useStore((s) => s.addTranscriptEntry)
  const shiftHeldRef = useRef(false)
  // ── Tracks whether the primary mouse button is held, enabling glissando drag ──
  const isMouseDown = useRef(false)
  // ── Freeze prompter at last known chord index on pause/stop ──────────────────
  const frozenIndexRef = useRef<number>(-1)
  // ── Transcript generation state ───────────────────────────────────────────────
  const [transcriptState, setTranscriptState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [transcriptTooltip, setTranscriptTooltip] = useState('Transcribe & Save PDF')
  const transcriptRevertRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Compute structured inversion display for locked chord ─────────────────
  const lockedDisplay = useMemo(() => {
    if (!originalLockedChordName || lockedKeys.size === 0) return null
    const bassNoteMidi = Math.min(...lockedKeys)
    return formatInversionDisplay(
      originalLockedChordName, lockedInversionCount, lockedChordNoteCount,
      bassNoteMidi, noteNaming, accidentals, true,
    )
  }, [originalLockedChordName, lockedInversionCount, lockedChordNoteCount, lockedKeys, noteNaming, accidentals])

  // ── Compute structured inversion display for explorer chord ───────────────
  const explorerDisplay = useMemo(() => {
    if (!explorerChordDisplay || explorerKeys.size === 0) return null
    const bassNoteMidi = Math.min(...explorerKeys)
    return formatInversionDisplay(
      explorerChordDisplay.name, explorerChordDisplay.invCount, explorerChordDisplay.noteCount,
      bassNoteMidi, noteNaming, accidentals, true,
    )
  }, [explorerChordDisplay, explorerKeys, noteNaming, accidentals])

  // ── Current chord from pre-computed sequence, frozen on pause/stop ───────────
  const liveIndex = useMemo(
    () => resolveCurrentIndex(chordSequence, currentTime),
    [chordSequence, currentTime],
  )
  if (playbackState === 'playing') frozenIndexRef.current = liveIndex
  const currentIndex = playbackState === 'playing' ? liveIndex : frozenIndexRef.current
  const sequenceChord = currentIndex >= 0 ? chordSequence[currentIndex] : null

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // ── Reset frozen index on file change so stale positions don't persist ────────
  useEffect(() => { frozenIndexRef.current = -1 }, [midi])
  // Clear chord when playback stops
  useEffect(() => {
    if (playbackState === 'stopped') {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (holdRef.current) clearTimeout(holdRef.current)
      useStore.getState().setDisplayedChord(null)
    }
  }, [playbackState])

  // Clear displayed chord when either explorer closes
  useEffect(() => {
    if (!chordExplorerOpen) {
      useStore.getState().setDisplayedChord(null)
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
      if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
    }
  }, [chordExplorerOpen])

  useEffect(() => {
    if (!scaleExplorerOpen) {
      useStore.getState().setDisplayedChord(null)
    }
  }, [scaleExplorerOpen])

  // ── Tracks Shift key state for chord-lock mode ────────────────────────────
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = true }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])

  // ── Clears drag state when mouse is released anywhere on the page ─────────
  useEffect(() => {
    const up = () => { isMouseDown.current = false }
    window.addEventListener('mouseup', up)
    return () => window.removeEventListener('mouseup', up)
  }, [])

  const { min, max } = RANGES[keyboardSize]
  const keys = useMemo(() => {
    const list: { midi: number; isBlack: boolean }[] = []
    for (let m = min; m <= max; m++) list.push({ midi: m, isBlack: isBlackKey(m) })
    return list
  }, [min, max])
  const whiteKeys = keys.filter(k => !k.isBlack)

  const allActiveKeys = useMemo(() => {
    const merged = new Set(activeKeys)
    lockedKeys.forEach(k => merged.add(k))
    explorerKeys.forEach(k => merged.add(k))
    return merged
  }, [activeKeys, lockedKeys, explorerKeys])

  const allActiveColors = useMemo(() => {
    const merged = new Map(activeKeyColors)
    lockedColors.forEach((c, k) => merged.set(k, c))
    explorerKeyColors.forEach((c, k) => merged.set(k, c))
    return merged
  }, [activeKeyColors, lockedColors, explorerKeyColors])

  const getColor = (midi: number): string | null => {
    if (!allActiveKeys.has(midi)) return null
    return allActiveColors.get(midi) ?? '#e8a027'
  }

  // ── Manual chord detection — playback display is now sourced from chordSequence ─
  useEffect(() => {
    if (lockedKeys.size > 0) return
    // ── Explorer manages its own chord display — skip detection while open ──
    if (chordExplorerOpen || scaleExplorerOpen) return
    // ── Skip during playback — sequenceChord handles display ─────────────────
    if (playbackState === 'playing') {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
      if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
      return
    }
    if (activeKeys.size >= CHORD_MIN_NOTES) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
      debounceRef.current = setTimeout(() => {
        const raw = detectChord(activeKeys)
        const localized = localizeChord(raw, noteNaming, accidentals)
        if (localized) {
          useStore.getState().setDisplayedChord(localized)
          holdRef.current = setTimeout(() => useStore.getState().setDisplayedChord(null), CHORD_HOLD_MS)
        }
      }, CHORD_DEBOUNCE_MS)
    } else {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
    }
  }, [activeKeys, lockedKeys.size, chordExplorerOpen, scaleExplorerOpen, noteNaming, accidentals, playbackState])


  const handleKeyClick = useCallback((midi: number) => {
    if (shiftHeldRef.current) {
      const next = new Set(lockedKeys)
      const nextColors = new Map(lockedColors)
      if (next.has(midi)) {
        next.delete(midi)
        nextColors.delete(midi)
      } else {
        next.add(midi)
        nextColors.set(midi, '#e8a027')
        const playNote = (window as any).__orfeoPlayNote
        if (playNote) playNote(midi, 0.7, 600)
      }
      setLockedKeysStore(next, nextColors)
      // ── Detect chord once on the new note set; seed inversion count from detection ─
      // Must start at the detected inversion number, not 0 — locking C-F-A on an F
      // chord is 2nd inversion; starting at 0 would miscount all subsequent cycling.
      const info = next.size >= 2 ? detectChordWithInversion(next) : null
      const localized = info ? localizeChord(info.name, noteNaming, accidentals) : null
      useStore.getState().setOriginalLockedChordName(localized)
      useStore.getState().setLockedInversionCount(info?.ordinal ? Number(info.ordinal) : 0)
      useStore.getState().setLockedChordNoteCount(next.size)
    } else {
      if (lockedKeys.size > 0) clearLockedKeys()
      const playNote = (window as any).__orfeoPlayNote
      if (playNote) playNote(midi, 0.7, 500)
    }
  }, [lockedKeys, lockedColors, noteNaming, accidentals, setLockedKeysStore, clearLockedKeys])

  const keyContainerRef = useRef<HTMLDivElement>(null)
  const [keyHeight, setKeyHeight] = useState(130)

  useEffect(() => {
    const el = keyContainerRef.current
    if (!el) return
    const update = () => {
      const w = el.clientWidth
      if (!w) return
      // Proportional to key width — ratio 4.0 gives natural-looking keys on screen
      // (real piano is 1:6.4 but that's too tall for a UI element)
      // Hard cap: min 80px, max 140px
      const whiteW = w / whiteKeys.length
      const h = Math.round(Math.max(80, Math.min(140, whiteW * 4.0)))
      setKeyHeight(h)
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [whiteKeys.length])

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── Chord bar — simple (34px) or extended prompter (36px, single row) ── */}
      <div style={{
        height: chordPrompterOpen ? 36 : 34,
        background: '#0d0d12',
        borderTop: '1px solid #1e1e28',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        transition: 'height 0.2s ease',
        overflow: 'hidden',
      }}>

        {/* ── SIMPLE MODE: single chord name centred ──────────────────────────── */}
        {!chordPrompterOpen && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 12px', position: 'relative' }}>
            {/* ── Left: CHORDS trigger + prompter toggle ────────────────────────── */}
            <div style={{ position: 'absolute', left: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span
                onClick={() => setChordExplorerOpen(true)}
                title="Open Chord Explorer"
                style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#e8a027', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
              >
                Chords
              </span>
              {/* ── Prompter toggle — amber when open, dim when closed ─────────── */}
              {chordPrompterEnabled && midi && (
                <div
                  onClick={() => setChordPrompterOpen(!chordPrompterOpen)}
                  title="Chord Prompter"
                  style={{ cursor: 'pointer', color: chordPrompterOpen ? '#e8a027' : '#707088', display: 'flex', alignItems: 'center', transition: 'color 0.12s' }}
                >
                  <ScrollText size={13} strokeWidth={1.5} />
                </div>
              )}
            </div>

            {/* Centre: chord name — priority: locked > explorer > sequence > manual > empty */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 80, justifyContent: 'center' }}>
              {lockedDisplay ? (
                // ── Locked chord: chord/bass amber + ordinal grey ──────────────
                <>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700, color: '#e8a027', letterSpacing: '0.05em', userSelect: 'none' }}>
                    {lockedDisplay.chordLabel}
                  </span>
                  {lockedDisplay.ordinal && (
                    <span style={{ fontFamily: 'Inter', fontSize: 10, color: '#707088', userSelect: 'none' }}>
                      {lockedDisplay.ordinal}
                      <span style={{ fontSize: 7, verticalAlign: 'super' }}>{ordinalSuffix(Number(lockedDisplay.ordinal))}</span>
                      {' inv'}
                    </span>
                  )}
                </>
              ) : explorerDisplay ? (
                // ── Explorer chord: chord/bass amber + ordinal grey ────────────
                <>
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700, color: '#e8a027', letterSpacing: '0.05em', userSelect: 'none' }}>
                    {explorerDisplay.chordLabel}
                  </span>
                  {explorerDisplay.ordinal && (
                    <span style={{ fontFamily: 'Inter', fontSize: 10, color: '#707088', userSelect: 'none' }}>
                      {explorerDisplay.ordinal}
                      <span style={{ fontSize: 7, verticalAlign: 'super' }}>{ordinalSuffix(Number(explorerDisplay.ordinal))}</span>
                      {' inv'}
                    </span>
                  )}
                </>
              ) : (sequenceChord || displayedChord) ? (
                // ── Sequence (playback) or manual chord: slash-split rendered ──
                (() => {
                  const name = sequenceChord?.name ?? displayedChord ?? ''
                  const slashIdx = name.indexOf('/')
                  if (slashIdx < 0) {
                    return (
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700, color: '#e8a027', letterSpacing: '0.05em', userSelect: 'none' }}>
                        {name}
                      </span>
                    )
                  }
                  return (
                    <>
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700, color: '#e8a027', letterSpacing: '0.05em', userSelect: 'none' }}>
                        {name.slice(0, slashIdx)}
                      </span>
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600, color: '#b0b0cc', letterSpacing: '0.04em', userSelect: 'none' }}>
                        {name.slice(slashIdx)}
                      </span>
                    </>
                  )
                })()
              ) : (
                // ── Empty state ────────────────────────────────────────────────
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 400, color: '#222235', letterSpacing: '0.03em', transition: 'color 0.2s' }}>
                  {'— — —'}
                </span>
              )}
            </div>

            {/* Right: SCALES trigger */}
            <span
              onClick={() => setScaleExplorerOpen(true)}
              title="Open Scale Explorer"
              style={{ position: 'absolute', right: 10, fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#e8a027', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
            >
              Scales
            </span>
          </div>
        )}

        {/* ── EXTENDED MODE: single-row layout — CHORDS + icon | sequence | SCALES ─ */}
        {chordPrompterOpen && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6, minWidth: 0, overflow: 'hidden' }}>

            {/* ── Left: CHORDS trigger + prompter toggle + transcribe placeholder ─ */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span
                onClick={() => setChordExplorerOpen(true)}
                title="Open Chord Explorer"
                style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#e8a027', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
              >
                Chords
              </span>
              {/* ── Prompter toggle (amber — always active while open) ────────── */}
              <div
                onClick={() => setChordPrompterOpen(!chordPrompterOpen)}
                title="Chord Prompter"
                style={{ cursor: 'pointer', color: '#e8a027', display: 'flex', alignItems: 'center', transition: 'color 0.12s' }}
              >
                <ScrollText size={13} strokeWidth={1.5} />
              </div>
              {/* ── Transcribe icon — active when file is loaded with a path ──── */}
              {(() => {
                const filePath = midi ? (midi as any)._filePath as string | undefined : undefined
                const canTranscribe = !!filePath && transcriptState !== 'loading'
                const iconColor = transcriptState === 'success' ? '#4caf50'
                  : transcriptState === 'error' ? '#f44336'
                  : '#b0b0cc'
                return (
                  <div
                    title={transcriptTooltip}
                    onClick={async () => {
                      if (!canTranscribe) return
                      setTranscriptState('loading')
                      setTranscriptTooltip('Generating…')
                      if (transcriptRevertRef.current) clearTimeout(transcriptRevertRef.current)
                      try {
                        const result = await window.electronAPI.transcriptGenerate(filePath!, noteNaming, accidentals)
                        if (result.success && result.path) {
                          setTranscriptState('success')
                          const fname = result.path.split(/[\\/]/).pop() ?? result.path
                          setTranscriptTooltip(`✓ Saved — ${fname}`)
                          const today = new Date()
                          const entry: TranscriptEntry = {
                            midiPath: filePath!,
                            transcriptPath: result.path,
                            date: `${today.getDate()}. ${today.getMonth() + 1}. ${today.getFullYear()}`,
                          }
                          addTranscriptEntry(entry)
                        } else {
                          setTranscriptState('error')
                          setTranscriptTooltip(result.error ?? 'PDF generation failed')
                        }
                      } catch (err: any) {
                        setTranscriptState('error')
                        setTranscriptTooltip(err?.message ?? 'PDF generation failed')
                      }
                      transcriptRevertRef.current = setTimeout(() => {
                        setTranscriptState('idle')
                        setTranscriptTooltip('Transcribe & Save PDF')
                      }, 3000)
                    }}
                    style={{
                      cursor: canTranscribe ? 'pointer' : 'not-allowed',
                      opacity: filePath ? 1 : 0.35,
                      color: iconColor,
                      display: 'flex',
                      alignItems: 'center',
                      transition: 'color 0.2s',
                      animation: transcriptState === 'loading' ? 'orfeo-transcript-spin 1s linear infinite' : 'none',
                    }}
                  >
                    <FileText size={13} strokeWidth={1.5} />
                  </div>
                )
              })()}
            </div>

            {/* ── Centre: chord sequence (past | ‹ | current | › | next) ────────── */}
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
              {(() => {
                const noFile = !midi
                const noChords = !!midi && chordSequence.length === 0
                const notStarted = !!midi && chordSequence.length > 0 && liveIndex < 0

                if (noFile || noChords || notStarted) {
                  return (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontSize: 11, color: '#404055', fontFamily: 'Inter' }}>
                        {noFile ? 'Open a MIDI file' : noChords ? 'No chords detected' : 'Press play'}
                      </span>
                    </div>
                  )
                }

                // ── Priority: locked > explorer > sequence ─────────────────────
                const centreChord = lockedDisplay?.chordLabel ?? explorerDisplay?.chordLabel ?? sequenceChord?.name ?? '—'
                const pastChords = currentIndex > 0 ? chordSequence.slice(Math.max(0, currentIndex - 4), currentIndex) : []
                const nextChords = currentIndex >= 0 ? chordSequence.slice(currentIndex + 1, currentIndex + 3) : []

                return (
                  <>
                    {/* Past 4 chords, right-aligned */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 5, minWidth: 0 }}>
                      {pastChords.map((ev, i) => (
                        <React.Fragment key={`${ev.time}-${ev.name}`}>
                          {i > 0 && <span style={{ color: '#303048', fontSize: 10, lineHeight: 1, flexShrink: 0 }}>·</span>}
                          <span style={{ fontSize: 11, fontFamily: 'Inter', color: '#9090a8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 60 }}>
                            {ev.name}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>

                    {/* ‹ separator */}
                    <span style={{ color: '#303048', fontSize: 14, flexShrink: 0, lineHeight: 1, padding: '0 3px' }}>‹</span>

                    {/* Current chord name only, no note names */}
                    <div style={{ flexShrink: 0, width: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <span style={{ fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 700, color: '#e8a027', lineHeight: 1, whiteSpace: 'nowrap', maxWidth: 96, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {centreChord}
                      </span>
                    </div>

                    {/* › separator */}
                    <span style={{ color: '#303048', fontSize: 14, flexShrink: 0, lineHeight: 1, padding: '0 3px' }}>›</span>

                    {/* Next 2 chords, left-aligned */}
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 5, minWidth: 0 }}>
                      {nextChords.map((ev, i) => (
                        <React.Fragment key={`${ev.time}-${ev.name}`}>
                          {i > 0 && <span style={{ color: '#303048', fontSize: 10, lineHeight: 1, flexShrink: 0 }}>·</span>}
                          <span style={{ fontSize: 11, fontFamily: 'Inter', color: '#9090a8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 60 }}>
                            {ev.name}
                          </span>
                        </React.Fragment>
                      ))}
                    </div>
                  </>
                )
              })()}
            </div>

            {/* ── Right: SCALES trigger ─────────────────────────────────────────── */}
            <span
              onClick={() => setScaleExplorerOpen(true)}
              title="Open Scale Explorer"
              style={{ fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#e8a027', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none', flexShrink: 0 }}
            >
              Scales
            </span>
          </div>
        )}
      </div>

      {/* Piano keys */}
      <div
        className="relative w-full select-none"
        ref={keyContainerRef}
        style={{ height: keyHeight, background: '#111116', borderTop: '1px solid #2a2a35', transition: 'height 0.15s' }}
      >
        {/* White keys */}
        <div className="absolute inset-0 flex">
          {whiteKeys.map((k, i) => {
            const color = getColor(k.midi)
            const locked = lockedKeys.has(k.midi)
            const isC = k.midi % 12 === 0
            const label = color
              ? (getNoteName(k.midi, noteNaming, accidentals) || null)
              : (isC ? getNoteLabel(k.midi, noteNaming, accidentals) : null)
            return (
              <div
                key={k.midi}
                onMouseDown={() => { isMouseDown.current = true; handleKeyClick(k.midi) }}
                onMouseEnter={() => { if (isMouseDown.current) handleKeyClick(k.midi) }}
                title={getNoteLabel(k.midi, noteNaming, accidentals) || undefined}
                className="relative flex-1 flex flex-col justify-end items-center pb-1 cursor-pointer"
                style={{
                  background: color ?? '#e8e8e8',
                  borderRight: !color ? '1px solid #b0b0b0' : allActiveKeys.has(whiteKeys[i + 1]?.midi) ? '1px solid rgba(0,0,0,0.12)' : '1px solid transparent',
                  borderLeft: color && allActiveKeys.has(whiteKeys[i - 1]?.midi) ? '1px solid rgba(0,0,0,0.12)' : 'none',
                  boxShadow: color
                    ? `0 0 ${locked ? 18 : 12}px ${locked ? 6 : 4}px ${color}${locked ? 'cc' : '88'}`
                    : 'inset 0 -3px 6px rgba(0,0,0,0.1)',
                  transition: 'background 0.04s, box-shadow 0.04s',
                  minWidth: 0,
                  }}
              >
                {label && (
                  <span className="font-semibold pointer-events-none"
                    style={{ color: color ? '#fff' : '#888', fontFamily: 'JetBrains Mono', fontSize: (chordExplorerOpen || scaleExplorerOpen) ? 11 : 9 }}>
                    {label}
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Black keys */}
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
          {keys.filter(k => k.isBlack).map((k) => {
            const whiteIdx = whiteKeys.findIndex(w => w.midi > k.midi) - 1
            if (whiteIdx < 0) return null
            const leftPct = ((whiteIdx + 0.65) / whiteKeys.length) * 100
            const widthPct = (0.6 / whiteKeys.length) * 100
            const color = getColor(k.midi)
            const locked = lockedKeys.has(k.midi)
            return (
              <div
                key={k.midi}
                onMouseDown={() => { isMouseDown.current = true; handleKeyClick(k.midi) }}
                onMouseEnter={() => { if (isMouseDown.current) handleKeyClick(k.midi) }}
                title={getNoteLabel(k.midi, noteNaming, accidentals) || undefined}
                className="absolute top-0 cursor-pointer pointer-events-auto"
                style={{
                  left: `${leftPct}%`, width: `${widthPct}%`, height: '65%',
                  background: color ?? '#1a1a22',
                  borderRadius: '0 0 4px 4px',
                  border: color ? '1px solid rgba(0,0,0,0.18)' : '1px solid #0a0a0f',
                  borderTop: 'none',
                  boxShadow: color
                    ? `0 0 ${locked ? 14 : 10}px ${locked ? 4 : 3}px ${color}${locked ? 'bb' : '99'}`
                    : '0 4px 8px rgba(0,0,0,0.7)',
                  transition: 'background 0.04s, box-shadow 0.04s',
                  zIndex: 2,
                }}
              >
                {color && noteNaming !== 'hidden' && (
                  <span style={{
                    position: 'absolute', bottom: 3, left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: (chordExplorerOpen || scaleExplorerOpen) ? 8 : 7, fontFamily: 'JetBrains Mono', fontWeight: 700,
                    color: 'rgba(255,255,255,0.88)', pointerEvents: 'none',
                    whiteSpace: 'nowrap', textShadow: '0 1px 2px rgba(0,0,0,0.95)',
                  }}>
                    {getNoteName(k.midi, noteNaming, accidentals)}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
