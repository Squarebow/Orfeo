import { useMemo, useCallback, useState, useEffect, useRef } from 'react'
import { useStore } from '../../store'
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
  const shiftHeldRef = useRef(false)

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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdRef = useRef<ReturnType<typeof setTimeout> | null>(null)
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

  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = true }
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = false }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
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

  // Smart playback chord detection
  useEffect(() => {
    if (lockedKeys.size > 0) return
    // ── Explorer manages its own chord display — skip detection while open ──
    if (chordExplorerOpen || scaleExplorerOpen) return
    if (activeKeys.size >= CHORD_MIN_NOTES) {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
      // During playback use a very short debounce; manual use longer
      const delay = playbackState === 'playing' ? 60 : CHORD_DEBOUNCE_MS
      debounceRef.current = setTimeout(() => {
        const raw = detectChord(activeKeys)
        const localized = localizeChord(raw, noteNaming, accidentals)
        if (localized) {
          useStore.getState().setDisplayedChord(localized)
          // During playback don't set a hold timeout — chord clears when keys release
          if (playbackState !== 'playing') {
            holdRef.current = setTimeout(() => useStore.getState().setDisplayedChord(null), CHORD_HOLD_MS)
          }
        }
      }, delay)
    } else {
      if (debounceRef.current) { clearTimeout(debounceRef.current); debounceRef.current = null }
      // During playback, clear immediately when chord breaks; manual use hold
      if (playbackState === 'playing') {
        if (holdRef.current) { clearTimeout(holdRef.current); holdRef.current = null }
        useStore.getState().setDisplayedChord(null)
      }
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
      {/* Chord bar */}
      <div style={{
        height: 30,
        background: '#0d0d12',
        borderTop: '1px solid #1e1e28',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '0 12px',
        position: 'relative',
      }}>
        {/* Left: CHORDS trigger */}
        <span
          onClick={() => setChordExplorerOpen(true)}
          title="Open Chord Explorer"
          style={{ position: 'absolute', left: 10, fontFamily: 'Inter', fontSize: 9, fontWeight: 700, color: '#e8a027', letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none' }}
        >
          Chords
        </span>

        {/* Centre: chord name — priority: locked > explorer > playback > empty */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 80, justifyContent: 'center' }}>
          {lockedDisplay ? (
            // ── Locked chord: chord/bass amber + ordinal grey ────────────────
            <>
              <span style={{
                fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700,
                color: '#e8a027', letterSpacing: '0.05em', userSelect: 'none',
              }}>
                {lockedDisplay.chordLabel}
              </span>
              {lockedDisplay.ordinal && (
                <span style={{ fontFamily: 'Inter', fontSize: 10, color: '#707088', userSelect: 'none' }}>
                  {lockedDisplay.ordinal}
                  <span style={{ fontSize: 7, verticalAlign: 'super' }}>
                    {ordinalSuffix(Number(lockedDisplay.ordinal))}
                  </span>
                  {' inv'}
                </span>
              )}
            </>
          ) : explorerDisplay ? (
            // ── Explorer chord: chord/bass amber + ordinal grey ──────────────
            <>
              <span style={{
                fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700,
                color: '#e8a027', letterSpacing: '0.05em', userSelect: 'none',
              }}>
                {explorerDisplay.chordLabel}
              </span>
              {explorerDisplay.ordinal && (
                <span style={{ fontFamily: 'Inter', fontSize: 10, color: '#707088', userSelect: 'none' }}>
                  {explorerDisplay.ordinal}
                  <span style={{ fontSize: 7, verticalAlign: 'super' }}>
                    {ordinalSuffix(Number(explorerDisplay.ordinal))}
                  </span>
                  {' inv'}
                </span>
              )}
            </>
          ) : displayedChord ? (
            // ── Playback chord: slash split rendered, no ordinal label ─────────
            (() => {
              const slashIdx = displayedChord.indexOf('/')
              if (slashIdx < 0) {
                return (
                  <span style={{
                    fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700,
                    color: '#e8a027', letterSpacing: '0.05em', userSelect: 'none',
                  }}>
                    {displayedChord}
                  </span>
                )
              }
              const root = displayedChord.slice(0, slashIdx)
              const bass = displayedChord.slice(slashIdx)
              return (
                <>
                  <span style={{
                    fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700,
                    color: '#e8a027', letterSpacing: '0.05em', userSelect: 'none',
                  }}>
                    {root}
                  </span>
                  <span style={{
                    fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 600,
                    color: '#b0b0cc', letterSpacing: '0.04em', userSelect: 'none',
                  }}>
                    {bass}
                  </span>
                </>
              )
            })()
          ) : (
            // ── Empty state ────────────────────────────────────────────────────
            <span style={{
              fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 400,
              color: '#222235', letterSpacing: '0.03em',
              transition: 'color 0.2s',
            }}>
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
                onMouseDown={() => handleKeyClick(k.midi)}
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
                onMouseDown={() => handleKeyClick(k.midi)}
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
