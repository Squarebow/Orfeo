import { useCallback, useRef, useEffect } from 'react'
import {
  Play, Pause, SkipBack, SkipForward, Repeat,
  FolderOpen, RotateCcw, ChevronUp, ChevronDown,
  Rewind, FastForward,
} from 'lucide-react'
import { useStore } from '../../store'
import { usePlayback } from '../../hooks/usePlayback'
import { useMidiFile } from '../../hooks/useMidiFile'
import { formatTime } from '../../utils/midiParser'
import { formatKey, transposeDetectedKey } from '../../utils/keyDetection'
import OrfeoLogo from '../OrfeoLogo'
import MidiIcon from '../MidiIcon'
import VolumeKnob from '../VolumeKnob'
import LoopRegionStrip from '../LoopRegionStrip'

// NOTE: no more `C` shorthand object — every color below is a literal
// `var(--token-name)` string written directly at its point of use, so the
// token being referenced is visible right here in the JSX without having to
// cross-reference a lookup table elsewhere in the file.
const SKIP_SECS = 5

export default function TopBar() {
  const midi = useStore((s) => s.midi)
  const playbackState = useStore((s) => s.playbackState)
  const currentTime = useStore((s) => s.currentTime)
  const bpm = useStore((s) => s.bpm)
  const originalBpm = useStore((s) => s.originalBpm)
  const loopRegionEnabled  = useStore((s) => s.loopRegionEnabled)
  const loopRegionActive   = useStore((s) => s.loopRegionActive)
  const loopStart          = useStore((s) => s.loopStart)
  const loopEnd            = useStore((s) => s.loopEnd)
  const setLoopRegionActive = useStore((s) => s.setLoopRegionActive)
  const setBpm = useStore((s) => s.setBpm)
  const resetBpm = useStore((s) => s.resetBpm)
  const detectedKey = useStore((s) => s.detectedKey)
  const metronomeEnabled = useStore((s) => s.metronomeEnabled)
  const setMetronomeEnabled = useStore((s) => s.setMetronomeEnabled)
  const midiDeviceConnected = useStore((s) => s.midiDeviceConnected)
  const midiDeviceName = useStore((s) => s.midiDeviceName)
  const noteNaming = useStore((s) => s.noteNaming)
  const accidentals = useStore((s) => s.accidentals)
  const chordExplorerOpen = useStore((s) => s.chordExplorerOpen)
  const resetAll = useStore((s) => s.resetAll)
  const barStarts = useStore((s) => s.barStarts)

  const { play, pause, stop, seek, seekAndPlay } = usePlayback()
  const { openFile } = useMidiFile()
  const wasPlayingRef = useRef(false)

  const handlePlayPause = useCallback(() => {
    if (playbackState === 'playing') pause(); else play()
  }, [playbackState, play, pause])

  const handleScrubStart = useCallback(() => {
    wasPlayingRef.current = playbackState === 'playing'
    if (wasPlayingRef.current) pause()
  }, [playbackState, pause])

  const handleScrubChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    useStore.setState({ currentTime: parseFloat(e.target.value) })
  }, [])

  const handleScrubEnd = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const t = parseFloat(e.target.value)
    if (wasPlayingRef.current) seekAndPlay(t); else seek(t)
  }, [seek, seekAndPlay])

  const handleSkip = useCallback((dir: 1 | -1) => {
    if (!midi) return
    const t = Math.max(0, Math.min(midi.duration, currentTime + dir * SKIP_SECS))
    if (playbackState === 'playing') seekAndPlay(t); else seek(t)
  }, [midi, currentTime, playbackState, seek, seekAndPlay])

  const handleTranspose = (semitones: number) => {
    if (!detectedKey) return
    useStore.setState({ detectedKey: transposeDetectedKey(detectedKey, semitones) })
  }

  const transpose = detectedKey?.transpose ?? 0
  const duration = midi?.duration ?? 0
  const isTempoChanged = !!midi && Math.abs(Math.round((bpm / originalBpm) * 100) - 100) > 1
  const displayKey = detectedKey ? formatKey(detectedKey, noteNaming, accidentals) : '—'

  // ── Nudge: region selected but loop not yet activated ─────────────────────
  const nudgeLoop = loopRegionEnabled && !!midi && loopStart !== null && loopEnd !== null && !loopRegionActive

  // ── Loop button tooltip — context-aware based on region state ─────────────
  const loopStartBar = loopStart !== null ? (() => {
    let bar = 1
    for (let i = 0; i < barStarts.length; i++) { if (barStarts[i] <= loopStart) bar = i + 1 }
    return bar
  })() : null
  const loopEndBar = (loopEnd !== null && loopStartBar !== null) ? (() => {
    let rawBar = 1
    for (let i = 0; i < barStarts.length; i++) { if (barStarts[i] <= loopEnd) rawBar = i + 1 }
    const pastLastBarStart = barStarts.length === 0 || loopEnd > barStarts[barStarts.length - 1] + 0.001
    return Math.max(loopStartBar, pastLastBarStart ? rawBar : rawBar - 1)
  })() : null
  const loopTooltip = loopRegionEnabled && loopStart !== null
    ? (loopRegionActive
        ? `Looping bars ${loopStartBar}–${loopEndBar} · Click to disable`
        : `Loop bars ${loopStartBar}–${loopEndBar} · Click to enable`)
    : loopRegionEnabled
      ? 'Loop entire song · Drag the strip above to select a section'
      : 'Loop entire song · Enable Loop Region in Settings to select a specific section'

  // ── Live BPM — reads current tempo from _tempoMap so rubato files update ─
  const rawTempoMap = (midi as any)?._tempoMap as { bpm: number; time: number }[] | undefined
  const currentFileBpm = rawTempoMap?.length
    ? rawTempoMap.reduce(
        (acc: number, e: { bpm: number; time: number }) => e.time <= currentTime ? e.bpm : acc,
        rawTempoMap[0].bpm,
      )
    : bpm
  const userRatio = originalBpm > 0 ? bpm / originalBpm : 1
  const liveBpm = midi ? Math.round(currentFileBpm * userRatio) : 0

  // ── Bar counter — uses same precomputed barStarts as PianoRoll ───────────
  const totalBars = barStarts.length
  // Binary search: find last index where barStarts[i] <= currentTime (= current bar index, 0-based)
  let currentBar = 0
  if (midi && barStarts.length > 0) {
    let lo = 0, hi = barStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (barStarts[mid] <= currentTime) lo = mid
      else hi = mid - 1
    }
    currentBar = lo + 1
  }

  return (
    <div
      className="app-drag-region"
      style={{
        height: loopRegionEnabled ? 120 : 96,
        background: 'var(--bg-deep)',
        borderBottom: 'none',
        display: 'flex',
        alignItems: 'center',
        // 174px right padding clears Win overlay buttons (–□×)
        padding: '0 174px 0 20px',
        gap: 0,
        flexShrink: 0,
      }}
    >
      {/* ── LOGO ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, paddingRight: 'var(--space-3)' }}>
        <span onClick={resetAll} title="Reset" className="app-no-drag" style={{ cursor: 'pointer', display: 'flex' }}>
          <OrfeoLogo />
        </span>
        <button
          onClick={openFile}
          title="Open MIDI file (Ctrl+O)"
          className="app-no-drag"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 'var(--button-height)', height: 'var(--button-height)', borderRadius: 'var(--radius-md)', background: 'transparent', border: 'none', color: 'var(--text-default)', cursor: 'pointer', flexShrink: 0, transition: 'color 0.12s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-default)'}
        >
          <FolderOpen size={16} strokeWidth={1.5} />
        </button>
      </div>

      <VSep />

      {/* ── BPM ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 var(--space-3)', flexShrink: 0 }}
        title={`Tempo: ${liveBpm || '—'} BPM`}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono', lineHeight: 1 }}>BPM</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono', lineHeight: 1 }}>TEMPO</span>
        </div>
        <span style={{ color: isTempoChanged ? 'var(--text-amber)' : 'var(--text-active)', fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 700, minWidth: 36, textAlign: 'right', lineHeight: 1 }}>
          {midi ? liveBpm : '—'}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <LongPressArrow onStep={() => setBpm(Math.min(300, useStore.getState().bpm + 1))} disabled={!midi} title="BPM +1"><ChevronUp size={10} /></LongPressArrow>
          <LongPressArrow onStep={() => setBpm(Math.max(20, useStore.getState().bpm - 1))} disabled={!midi} title="BPM -1"><ChevronDown size={10} /></LongPressArrow>
        </div>
        {isTempoChanged && (
          <button onClick={resetBpm} title="Reset tempo" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text-amber)', display: 'flex' }}>
            <RotateCcw size={9} />
          </button>
        )}
      </div>

      <VSep />

      {/* ── KEY ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 var(--space-3)', flexShrink: 0 }}
        title={`Key: ${displayKey}${transpose !== 0 ? ` (${transpose > 0 ? '+' : ''}${transpose} semitones)` : ''}`}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
          <span style={{ color: 'var(--text-muted)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono', lineHeight: 1 }}>KEY</span>
          <span style={{ color: 'var(--text-muted)', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono', lineHeight: 1 }}>TRANSPOSE</span>
        </div>
        <span style={{ color: transpose !== 0 ? 'var(--text-amber)' : 'var(--text-active)', fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'right', lineHeight: 1 }}>
          {displayKey}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <ArrowBtn onClick={() => handleTranspose(1)} disabled={!midi || transpose >= 12} title="Transpose up"><ChevronUp size={10} /></ArrowBtn>
          <ArrowBtn onClick={() => handleTranspose(-1)} disabled={!midi || transpose <= -12} title="Transpose down"><ChevronDown size={10} /></ArrowBtn>
        </div>
        {transpose !== 0 && (
          <button onClick={() => useStore.setState({ detectedKey: detectedKey ? { ...detectedKey, transpose: 0 } : null })}
            title="Reset key"
            style={{ display: 'flex', alignItems: 'center', color: 'var(--text-amber)', background: 'var(--accent-amber-subtle)', border: '1px solid var(--accent-amber-medium)', borderRadius: 4, padding: '1px 5px', fontSize: 9, cursor: 'pointer' }}>
            <RotateCcw size={8} />
          </button>
        )}
      </div>

      <VSep />

      {/* ── VOLUME ── */}
      <VolumeKnob />

      {/* ── CENTER: transport + scrub + filename ── */}
      <div className="app-no-drag" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, flex: 1, minWidth: 0 }}>
        {/* Transport */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TBtn onClick={stop} disabled={!midi} title="Go to start"><SkipBack size={16} strokeWidth={1.5} /></TBtn>
          <TBtn onClick={() => handleSkip(-1)} disabled={!midi} title={`Rewind ${SKIP_SECS}s`}><Rewind size={15} strokeWidth={1.5} /></TBtn>
          <TBtn onClick={handlePlayPause} disabled={!midi || chordExplorerOpen} accent title="Play / Pause (Space)" large>
            {playbackState === 'playing'
              ? <Pause size={24} fill="currentColor" strokeWidth={0} />
              : <Play size={24} fill="currentColor" strokeWidth={0} />}
          </TBtn>
          <TBtn onClick={() => handleSkip(1)} disabled={!midi} title={`Forward ${SKIP_SECS}s`}><FastForward size={15} strokeWidth={1.5} /></TBtn>
          <TBtn onClick={() => midi && seek(midi.duration)} disabled={!midi} title="Go to end"><SkipForward size={16} strokeWidth={1.5} /></TBtn>
          <TBtn
            onClick={() => {
              const newActive = !loopRegionActive
              setLoopRegionActive(newActive)
              // Jump to loop start when activating with a selection, without forcing playback
              if (newActive && loopStart !== null) seek(loopStart)
            }}
            disabled={!midi} active={loopRegionActive} blink={nudgeLoop} title={loopTooltip}
          ><Repeat size={13} strokeWidth={1.5} /></TBtn>
          {nudgeLoop && (
            <span style={{
              color: 'var(--text-amber)', fontSize: 9, fontFamily: 'Inter, sans-serif',
              whiteSpace: 'nowrap', letterSpacing: '0.04em',
              opacity: 0.85, pointerEvents: 'none', userSelect: 'none',
            }}>
              click to loop
            </span>
          )}
        </div>
        {/* Scrub + loop strip — shared column; width: min(100%, 400px) centers both at
            the same visual width as the old scrub content (34+6+320+6+34 = 400px).
            position: relative lets LoopRegionStrip anchor its icon outside this column. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, width: 'min(100%, 400px)', position: 'relative' }}>
          {/* Scrub */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', fontSize: 10, minWidth: 34, textAlign: 'right', flexShrink: 0 }}>
              {formatTime(currentTime)}
            </span>
            <input
              type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
              onMouseDown={handleScrubStart} onChange={handleScrubChange} onMouseUp={handleScrubEnd}
              className="scrub-slider" style={{ flex: 1, maxWidth: 320 }} disabled={!midi}
              title="Scrub position"
            />
            <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', fontSize: 10, minWidth: 34, flexShrink: 0 }}>
              {formatTime(duration)}
            </span>
          </div>
          {/* Loop Region Strip — visible only when enabled in Settings */}
          {loopRegionEnabled && <LoopRegionStrip />}
        </div>
        {/* Filename */}
        <span style={{ color: 'var(--text-default)', fontSize: 'var(--text-xs)', fontFamily: 'Inter', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }}
          title={midi?.fileName}>
          {midi ? midi.fileName.replace(/\.(mid|midi)$/i, '') : 'No file open'}
        </span>
      </div>

      <div style={{ width: 1, height: 'var(--button-height)', background: 'var(--border)', flexShrink: 0 }} />

      {/* ── TIME + METRONOME + MIDI — bottoms aligned ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'flex-end', gap: 0, flexShrink: 0 }}>

        {/* BAR COUNTER — only when a file is loaded */}
        {midi && (
          <>
            <div
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 var(--space-3)' }}
              title={`Bar ${currentBar} of ${totalBars}`}
            >
              <div style={{
                background: 'var(--bg-tile)', borderRadius: 4, padding: '2px 6px',
                display: 'flex', alignItems: 'baseline', gap: 0,
              }}>
                <span style={{ color: 'var(--topbar-bar-number)', fontFamily: 'JetBrains Mono', fontSize: 'var(--text-sm)', fontWeight: 700, lineHeight: 1, minWidth: '3ch', textAlign: 'right', display: 'inline-block' }}>
                  {currentBar}
                </span>
                <span style={{ color: 'var(--topbar-bar-total)', fontFamily: 'JetBrains Mono', fontSize: 'var(--text-sm)', lineHeight: 1 }}>
                  |{totalBars}
                </span>
              </div>
              <span style={{ color: 'var(--topbar-bar-label)', fontSize: 8, fontFamily: 'Inter', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6 }}>
                BAR
              </span>
            </div>
            <div style={{ width: 1, height: 'var(--button-height)', background: 'var(--border)', alignSelf: 'flex-end', marginBottom: 12 }} />
          </>
        )}

        {/* TIME SIGNATURE */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 14px' }}
          title={midi ? `Time signature: ${midi.timeSignatureNumerator ?? 4}/${midi.timeSignatureDenominator ?? 4}` : 'No file loaded'}
        >
          {midi ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
              <span style={{ color: 'var(--text-active)', fontFamily: 'JetBrains Mono', fontSize: 'var(--text-base)', fontWeight: 700 }}>
                {midi.timeSignatureNumerator ?? 4}
              </span>
              <div style={{ width: 14, height: 1, background: 'var(--topbar-timesig-divider)', margin: '2px 0' }} />
              <span style={{ color: 'var(--text-active)', fontFamily: 'JetBrains Mono', fontSize: 'var(--text-base)', fontWeight: 700 }}>
                {midi.timeSignatureDenominator ?? 4}
              </span>
            </div>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 700, lineHeight: 1 }}>—</span>
          )}
          <span style={{ color: 'var(--text-default)', fontSize: 8, fontFamily: 'JetBrains Mono', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6 }}>TIME</span>
        </div>

        <div style={{ width: 1, height: 'var(--button-height)', background: 'var(--border)', alignSelf: 'flex-end', marginBottom: 12 }} />

        {/* METRONOME */}
        <button
          onClick={() => setMetronomeEnabled(!metronomeEnabled)}
          title={metronomeEnabled ? 'Metronome on' : 'Metronome off'}
          style={{
            flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0 14px', border: 'none', cursor: 'pointer',
            background: 'transparent', color: metronomeEnabled ? 'var(--topbar-metronome-on)' : 'var(--topbar-metronome-off)', transition: 'color 0.15s',
          }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 11.4V9.1" />
            <path d="m12 17 6.59-6.59" />
            <path d="m15.05 5.7-.218-.691a3 3 0 0 0-5.663 0L4.418 19.695A1 1 0 0 0 5.37 21h13.253a1 1 0 0 0 .951-1.31L18.45 16.2" />
            <circle cx="20" cy="9" r="2" />
          </svg>
          <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em', marginTop: 6 }}>
            {metronomeEnabled ? 'ON' : 'OFF'}
          </span>
        </button>

        <div style={{ width: 1, height: 'var(--button-height)', background: 'var(--border)', alignSelf: 'flex-end', marginBottom: 12 }} />

        {/* MIDI */}
        <div
          title={midiDeviceConnected ? `MIDI: ${midiDeviceName}` : 'No MIDI keyboard connected'}
          style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', padding: '0 14px', color: midiDeviceConnected ? 'var(--topbar-midi-on)' : 'var(--topbar-midi-off)' }}
        >
          <MidiIcon size={24} color={midiDeviceConnected ? 'var(--topbar-midi-on)' : 'var(--topbar-midi-off)'} />
          <span style={{ fontSize: midiDeviceConnected ? 8 : 7, fontFamily: 'JetBrains Mono', letterSpacing: midiDeviceConnected ? '0.08em' : '0.05em', color: midiDeviceConnected ? 'var(--topbar-midi-on)' : 'var(--topbar-midi-off)', marginTop: 6, whiteSpace: 'nowrap' }}>
            {midiDeviceConnected ? (midiDeviceName?.split(' ')[0] ?? 'MIDI') : 'CONNECT A KEYBOARD'}
          </span>
        </div>


      </div>
    </div>
  )
}

function VSep() {
  return <div style={{ width: 1, height: 'var(--row-height)', background: 'var(--border)', flexShrink: 0 }} />
}

// Long-press button: single click = +1, hold = accelerating repeat
function LongPressArrow({ children, onStep, disabled, title }: {
  children: React.ReactNode; onStep: () => void; disabled?: boolean; title?: string
}) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stepsRef = useRef(0)

  const stop = () => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
    stepsRef.current = 0
  }

  const start = () => {
    if (disabled) return
    onStep()
    stepsRef.current = 0
    // After 400ms hold, start repeating
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        onStep()
        stepsRef.current++
      // Accelerate: start at 120ms, ramp down to 40ms after 20 steps
      }, Math.max(40, 120 - stepsRef.current * 4))
    }, 400)
  }

  useEffect(() => () => stop(), [])

  return (
    <button
      title={title}
      disabled={disabled}
      onMouseDown={start}
      onMouseUp={stop}
      onMouseLeave={stop}
      style={{
        width: 16, height: 13, background: 'var(--bg-tile)', color: 'var(--text-dim-control)',
        border: 'none', borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.25 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color 0.1s', userSelect: 'none',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--text-amber)' }}
    >
      {children}
    </button>
  )
}

function ArrowBtn({ children, onClick, disabled, title }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        width: 16, height: 13, background: 'var(--bg-tile)', color: 'var(--text-dim-control)',
        border: 'none', borderRadius: 'var(--radius-sm)',
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.25 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--text-amber)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim-control)' }}
    >
      {children}
    </button>
  )
}

function TBtn({ children, onClick, disabled, accent, active, blink, title, large }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
  accent?: boolean; active?: boolean; blink?: boolean; title?: string; large?: boolean
}) {
  const sz = large ? 46 : 32
  const isAmber = active || accent || blink
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      className={blink ? 'loop-nudge-blink' : undefined}
      style={{
        width: sz, height: sz,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, border: 'none', background: 'transparent',
        color: isAmber ? 'var(--text-amber)' : 'var(--text-default)',
        opacity: disabled ? 0.2 : 1,
        cursor: disabled ? 'default' : 'pointer',
        transition: blink ? undefined : 'color 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = 'var(--text-amber)' }}
      onMouseLeave={e => { e.currentTarget.style.color = isAmber ? 'var(--text-amber)' : 'var(--text-default)' }}
    >
      {children}
    </button>
  )
}
