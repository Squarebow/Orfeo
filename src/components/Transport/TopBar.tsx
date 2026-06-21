import { useCallback, useRef } from 'react'
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

// Design tokens — match index.css :root
const C = {
  default: '#707088',   // all inactive text, icons
  active:  '#b0b0cc',   // values in use: BPM number, 4/4, key
  muted:   '#404055',   // very dim labels
  amber:   '#e8a027',   // accent, hover on interactive elements
}
const SKIP_SECS = 5

export default function TopBar() {
  const midi = useStore((s) => s.midi)
  const playbackState = useStore((s) => s.playbackState)
  const currentTime = useStore((s) => s.currentTime)
  const bpm = useStore((s) => s.bpm)
  const originalBpm = useStore((s) => s.originalBpm)
  const loopEnabled = useStore((s) => s.loopEnabled)
  const setLoop = useStore((s) => s.setLoop)
  const setBpm = useStore((s) => s.setBpm)
  const resetBpm = useStore((s) => s.resetBpm)
  const detectedKey = useStore((s) => s.detectedKey)
  const metronomeEnabled = useStore((s) => s.metronomeEnabled)
  const setMetronomeEnabled = useStore((s) => s.setMetronomeEnabled)
  const midiDeviceConnected = useStore((s) => s.midiDeviceConnected)
  const midiDeviceName = useStore((s) => s.midiDeviceName)
  const noteNaming = useStore((s) => s.noteNaming)
  const accidentals = useStore((s) => s.accidentals)

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
  const isTempoChanged = Math.abs(Math.round((bpm / originalBpm) * 100) - 100) > 1
  const displayKey = detectedKey ? formatKey(detectedKey, noteNaming, accidentals) : '—'

  return (
    <div
      className="app-drag-region"
      style={{
        height: 96,
        background: '#111116',
        borderBottom: `1px solid #1e1e28`,
        display: 'flex',
        alignItems: 'center',
        // 174px right padding clears Win overlay buttons (–□×)
        padding: '0 174px 0 20px',
        gap: 0,
        flexShrink: 0,
      }}
    >
      {/* ── LOGO ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0, paddingRight: 12 }}>
        <OrfeoLogo />
        <button
          onClick={openFile}
          title="Open MIDI file (Ctrl+O)"
          className="app-no-drag"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 5, background: 'transparent', border: 'none', color: C.default, cursor: 'pointer', flexShrink: 0, transition: 'color 0.12s' }}
          onMouseEnter={e => e.currentTarget.style.color = C.amber}
          onMouseLeave={e => e.currentTarget.style.color = C.default}
        >
          <FolderOpen size={16} strokeWidth={1.5} />
        </button>
      </div>

      <VSep />

      {/* ── BPM ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', flexShrink: 0 }}
        title={`Tempo: ${Math.round(bpm)} BPM`}>
        <span style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono' }}>BPM</span>
        <span style={{ color: isTempoChanged ? C.amber : C.active, fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 700, minWidth: 36, textAlign: 'right', lineHeight: 1 }}>
          {Math.round(bpm)}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <ArrowBtn onClick={() => setBpm(Math.min(300, bpm + 1))} disabled={!midi} title="BPM +1"><ChevronUp size={10} /></ArrowBtn>
          <ArrowBtn onClick={() => setBpm(Math.max(20, bpm - 1))} disabled={!midi} title="BPM -1"><ChevronDown size={10} /></ArrowBtn>
        </div>
        {isTempoChanged && (
          <button onClick={resetBpm} title="Reset tempo" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: C.amber, display: 'flex' }}>
            <RotateCcw size={9} />
          </button>
        )}
      </div>

      <VSep />

      {/* ── KEY ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 12px', flexShrink: 0 }}
        title={`Key: ${displayKey}${transpose !== 0 ? ` (${transpose > 0 ? '+' : ''}${transpose} semitones)` : ''}`}>
        <span style={{ color: C.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'JetBrains Mono' }}>KEY</span>
        <span style={{ color: transpose !== 0 ? C.amber : C.active, fontFamily: 'JetBrains Mono', fontSize: 20, fontWeight: 700, minWidth: 32, textAlign: 'right', lineHeight: 1 }}>
          {displayKey}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          <ArrowBtn onClick={() => handleTranspose(1)} disabled={!midi || transpose >= 12} title="Transpose up"><ChevronUp size={10} /></ArrowBtn>
          <ArrowBtn onClick={() => handleTranspose(-1)} disabled={!midi || transpose <= -12} title="Transpose down"><ChevronDown size={10} /></ArrowBtn>
        </div>
        {transpose !== 0 && (
          <button onClick={() => useStore.setState({ detectedKey: detectedKey ? { ...detectedKey, transpose: 0 } : null })}
            title="Reset key"
            style={{ display: 'flex', alignItems: 'center', color: C.amber, background: '#e8a02715', border: '1px solid #e8a02730', borderRadius: 4, padding: '1px 5px', fontSize: 9, cursor: 'pointer' }}>
            <RotateCcw size={8} />
          </button>
        )}
      </div>

      <VSep />

      {/* ── CENTER: transport + scrub + filename ── */}
      <div className="app-no-drag" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, flex: 1, minWidth: 0 }}>
        {/* Transport */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <TBtn onClick={stop} disabled={!midi} title="Go to start"><SkipBack size={16} strokeWidth={1.5} /></TBtn>
          <TBtn onClick={() => handleSkip(-1)} disabled={!midi} title={`Rewind ${SKIP_SECS}s`}><Rewind size={15} strokeWidth={1.5} /></TBtn>
          <TBtn onClick={handlePlayPause} disabled={!midi} accent title="Play / Pause (Space)" large>
            {playbackState === 'playing'
              ? <Pause size={24} fill="currentColor" strokeWidth={0} />
              : <Play size={24} fill="currentColor" strokeWidth={0} />}
          </TBtn>
          <TBtn onClick={() => handleSkip(1)} disabled={!midi} title={`Forward ${SKIP_SECS}s`}><FastForward size={15} strokeWidth={1.5} /></TBtn>
          <TBtn onClick={() => midi && seek(midi.duration)} disabled={!midi} title="Go to end"><SkipForward size={16} strokeWidth={1.5} /></TBtn>
          <TBtn onClick={() => setLoop(!loopEnabled)} disabled={!midi} active={loopEnabled} title={loopEnabled ? 'Loop on' : 'Loop off'}><Repeat size={13} strokeWidth={1.5} /></TBtn>
        </div>
        {/* Scrub */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}>
          <span style={{ color: C.muted, fontFamily: 'JetBrains Mono', fontSize: 10, minWidth: 34, textAlign: 'right', flexShrink: 0 }}>
            {formatTime(currentTime)}
          </span>
          <input
            type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
            onMouseDown={handleScrubStart} onChange={handleScrubChange} onMouseUp={handleScrubEnd}
            className="scrub-slider" style={{ flex: 1, maxWidth: 320 }} disabled={!midi}
            title="Scrub position"
          />
          <span style={{ color: C.muted, fontFamily: 'JetBrains Mono', fontSize: 10, minWidth: 34, flexShrink: 0 }}>
            {formatTime(duration)}
          </span>
        </div>
        {/* Filename */}
        <span style={{ color: C.default, fontSize: 11, fontFamily: 'Inter', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }}
          title={midi?.fileName}>
          {midi ? midi.fileName.replace(/\.(mid|midi)$/i, '') : 'No file open'}
        </span>
      </div>

      <VSep />

      {/* ── TIME + METRONOME + MIDI — bottoms aligned ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'flex-end', gap: 0, flexShrink: 0 }}>

        {/* TIME SIGNATURE */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 14px' }}
          title={`Time signature: ${midi?.timeSignatureNumerator ?? 4}/${midi?.timeSignatureDenominator ?? 4}`}
        >
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
            <span style={{ color: C.active, fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700 }}>
              {midi?.timeSignatureNumerator ?? 4}
            </span>
            <div style={{ width: 14, height: 1, background: '#30304a', margin: '2px 0' }} />
            <span style={{ color: C.active, fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700 }}>
              {midi?.timeSignatureDenominator ?? 4}
            </span>
          </div>
          <span style={{ color: C.default, fontSize: 8, fontFamily: 'JetBrains Mono', textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 6 }}>TIME</span>
        </div>

        <div style={{ width: 1, height: 28, background: '#1e1e28', alignSelf: 'flex-end', marginBottom: 12 }} />

        {/* METRONOME */}
        <button
          onClick={() => setMetronomeEnabled(!metronomeEnabled)}
          title={metronomeEnabled ? 'Metronome on' : 'Metronome off'}
          style={{
            flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
            padding: '0 14px', border: 'none', cursor: 'pointer',
            background: 'transparent', color: metronomeEnabled ? C.amber : C.default, transition: 'color 0.15s',
          }}
        >
          <svg width="18" height="22" viewBox="0 0 16 20" fill="none">
            <path d="M8 18 L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M4 18 L12 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M8 4 L5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <path d="M8 4 L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            <circle cx="8" cy="11" r="2" fill="currentColor"/>
          </svg>
          <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em', marginTop: 6 }}>
            {metronomeEnabled ? 'ON' : 'OFF'}
          </span>
        </button>

        <div style={{ width: 1, height: 28, background: '#1e1e28', alignSelf: 'flex-end', marginBottom: 12 }} />

        {/* MIDI */}
        <div
          title={midiDeviceConnected ? `MIDI: ${midiDeviceName}` : 'No MIDI keyboard connected'}
          style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 14px' }}
        >
          <MidiIcon size={20} color={midiDeviceConnected ? C.amber : C.default} />
          <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em', color: midiDeviceConnected ? C.amber : C.default, marginTop: 6 }}>
            {midiDeviceConnected ? 'MIDI' : 'NO MIDI'}
          </span>
        </div>

      </div>
    </div>
  )
}

function VSep() {
  return <div style={{ width: 1, height: 44, background: '#1e1e28', flexShrink: 0 }} />
}

function ArrowBtn({ children, onClick, disabled, title }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean; title?: string
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        width: 16, height: 13, background: '#1a1a26', color: '#606075',
        border: 'none', borderRadius: 3,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.25 : 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'color 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = '#e8a027' }}
      onMouseLeave={e => { e.currentTarget.style.color = '#606075' }}
    >
      {children}
    </button>
  )
}

function TBtn({ children, onClick, disabled, accent, active, title, large }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
  accent?: boolean; active?: boolean; title?: string; large?: boolean
}) {
  const sz = large ? 46 : 32
  return (
    <button onClick={onClick} disabled={disabled} title={title}
      style={{
        width: sz, height: sz,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 6, border: 'none', background: 'transparent',
        color: active || accent ? '#e8a027' : '#707088',
        opacity: disabled ? 0.2 : 1,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'color 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.color = '#e8a027' }}
      onMouseLeave={e => { e.currentTarget.style.color = (active || accent) ? '#e8a027' : '#707088' }}
    >
      {children}
    </button>
  )
}
