import { useCallback, useRef } from 'react'
import {
  Play, Pause, Square, SkipBack, SkipForward, Repeat,
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

const SKIP_SECS = 5
const SECTION_H = 60  // all side sections share this inner height for alignment

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

  const { play, pause, stop, seek, seekAndPlay } = usePlayback()
  const { openFile } = useMidiFile()
  const wasPlayingRef = useRef(false)

  const handlePlayPause = useCallback(() => {
    if (playbackState === 'playing') pause()
    else play()
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
    if (wasPlayingRef.current) seekAndPlay(t)
    else seek(t)
  }, [seek, seekAndPlay])

  const handleSkip = useCallback((dir: 1 | -1) => {
    if (!midi) return
    const t = Math.max(0, Math.min(midi.duration, currentTime + dir * SKIP_SECS))
    if (playbackState === 'playing') seekAndPlay(t)
    else seek(t)
  }, [midi, currentTime, playbackState, seek, seekAndPlay])

  const handleTranspose = (semitones: number) => {
    if (!detectedKey) return
    useStore.setState({ detectedKey: transposeDetectedKey(detectedKey, semitones) })
  }

  const transpose = detectedKey?.transpose ?? 0
  const duration = midi?.duration ?? 0
  const isTempoChanged = Math.abs(Math.round((bpm / originalBpm) * 100) - 100) > 1
  const displayKey = detectedKey ? formatKey(detectedKey, noteNaming) : '—'

  return (
    <div
      className="app-drag-region"
      style={{
        height: 100,
        background: '#111116',
        borderBottom: '1px solid #1e1e28',
        display: 'flex',
        alignItems: 'center',
        padding: '0 174px 0 20px',
        gap: 10,
        flexShrink: 0,
      }}
    >
      {/* ── LOGO + OPEN ── */}
      <div className="app-no-drag" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <OrfeoLogo />
        <button
          onClick={openFile}
          title="Open MIDI file (Ctrl+O)"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 28, height: 28, borderRadius: 6,
            background: 'transparent', border: 'none',
            color: '#50506a', cursor: 'pointer', flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget.style.color = '#9090b0')}
          onMouseLeave={e => (e.currentTarget.style.color = '#50506a')}
        >
          <FolderOpen size={16} />
        </button>
      </div>

      <Divider />

      {/* ── BPM + KEY on same row, stacked vertically ── */}
      <div
        className="app-no-drag"
        style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6, flexShrink: 0, height: SECTION_H }}
      >
        {/* Row 1: BPM label + value + slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          title={`Tempo: ${Math.round(bpm)} BPM${isTempoChanged ? ` (original: ${Math.round(originalBpm)} BPM)` : ''}`}
        >
          <span style={{ color: '#35354a', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', width: 24 }}>BPM</span>
          <span style={{ color: isTempoChanged ? '#e8a027' : '#b0b0cc', fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, minWidth: 36, textAlign: 'right', lineHeight: 1 }}>
            {Math.round(bpm)}
          </span>
          <input
            type="range" min={20} max={300} step={1} value={bpm}
            onChange={(e) => setBpm(Number(e.target.value))}
            className="scrub-slider" style={{ width: 60 }} disabled={!midi}
            title="Drag to change tempo"
          />
          {isTempoChanged && (
            <button onClick={resetBpm} title="Reset tempo" style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
              <RotateCcw size={10} style={{ color: '#e8a027' }} />
            </button>
          )}
        </div>

        {/* Row 2: KEY label + value + up/down arrows to the right */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          title={`Key: ${displayKey}${transpose !== 0 ? ` (${transpose > 0 ? '+' : ''}${transpose} semitones)` : ''}`}
        >
          <span style={{ color: '#35354a', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', width: 24 }}>KEY</span>
          <span style={{ color: transpose !== 0 ? '#e8a027' : '#b0b0cc', fontFamily: 'JetBrains Mono', fontSize: 18, fontWeight: 700, minWidth: 36, textAlign: 'right', lineHeight: 1 }}>
            {displayKey}
          </span>
          {/* Up/down arrows to the right of KEY value */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <button onClick={() => handleTranspose(1)} disabled={!midi || transpose >= 12} title="Transpose up"
              style={{ width: 18, height: 13, background: '#1a1a26', color: '#505068', border: 'none', borderRadius: 3, cursor: !midi ? 'default' : 'pointer', opacity: !midi ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronUp size={10} />
            </button>
            <button onClick={() => handleTranspose(-1)} disabled={!midi || transpose <= -12} title="Transpose down"
              style={{ width: 18, height: 13, background: '#1a1a26', color: '#505068', border: 'none', borderRadius: 3, cursor: !midi ? 'default' : 'pointer', opacity: !midi ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <ChevronDown size={10} />
            </button>
          </div>
          {transpose !== 0 && (
            <button
              onClick={() => useStore.setState({ detectedKey: detectedKey ? { ...detectedKey, transpose: 0 } : null })}
              title="Reset key"
              style={{ display: 'flex', alignItems: 'center', gap: 2, color: '#e8a027', background: '#e8a02715', border: '1px solid #e8a02730', borderRadius: 4, padding: '1px 5px', fontSize: 9, fontFamily: 'JetBrains Mono', cursor: 'pointer' }}
            >
              <RotateCcw size={8} />
            </button>
          )}
        </div>
      </div>

      <Divider />

      {/* ── CENTER: transport / scrub / filename ── */}
      <div
        className="app-no-drag"
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, flex: 1, minWidth: 0 }}
      >
        {/* Transport buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <TBtn onClick={stop} disabled={!midi} title="Go to start"><SkipBack size={16} /></TBtn>
          <TBtn onClick={() => handleSkip(-1)} disabled={!midi} title={`Rewind ${SKIP_SECS}s`}><Rewind size={16} /></TBtn>
          <TBtn onClick={handlePlayPause} disabled={!midi} accent title="Play / Pause (Space)" large>
            {playbackState === 'playing'
              ? <Pause size={24} fill="currentColor" />
              : <Play size={24} fill="currentColor" />}
          </TBtn>
          <TBtn onClick={() => handleSkip(1)} disabled={!midi} title={`Forward ${SKIP_SECS}s`}><FastForward size={16} /></TBtn>
          <TBtn onClick={() => midi && seek(midi.duration)} disabled={!midi} title="Go to end"><SkipForward size={16} /></TBtn>
          <TBtn onClick={() => setLoop(!loopEnabled)} disabled={!midi} active={loopEnabled} title={loopEnabled ? 'Loop on' : 'Loop off'}><Repeat size={14} /></TBtn>
        </div>

        {/* Scrub slider */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}>
          <span style={{ color: '#40405a', fontFamily: 'JetBrains Mono', fontSize: 10, minWidth: 34, textAlign: 'right', flexShrink: 0 }}>
            {formatTime(currentTime)}
          </span>
          <input
            type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
            onMouseDown={handleScrubStart} onChange={handleScrubChange} onMouseUp={handleScrubEnd}
            className="scrub-slider" style={{ flex: 1, maxWidth: 320 }} disabled={!midi}
            title="Scrub position"
          />
          <span style={{ color: '#40405a', fontFamily: 'JetBrains Mono', fontSize: 10, minWidth: 34, flexShrink: 0 }}>
            {formatTime(duration)}
          </span>
        </div>

        {/* File name */}
        <span style={{ color: '#55556e', fontSize: 11, fontFamily: 'Inter', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 340 }}
          title={midi?.fileName}>
          {midi ? midi.fileName.replace(/\.(mid|midi)$/i, '') : 'No file open'}
        </span>
      </div>

      <Divider />

      {/* ── TIME SIGNATURE — value centred, TIME label below ── */}
      <div
        className="app-no-drag"
        style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: SECTION_H }}
        title={`Time signature: ${midi?.timeSignatureNumerator ?? 4}/${midi?.timeSignatureDenominator ?? 4}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
          <span style={{ color: '#b0b0cc', fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 700 }}>
            {midi?.timeSignatureNumerator ?? 4}
          </span>
          <div style={{ width: 18, height: 1, background: '#30304a', margin: '2px 0' }} />
          <span style={{ color: '#b0b0cc', fontFamily: 'JetBrains Mono', fontSize: 16, fontWeight: 700 }}>
            {midi?.timeSignatureDenominator ?? 4}
          </span>
        </div>
        <span style={{ color: '#35354a', fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.1em', marginTop: 4 }}>TIME</span>
      </div>

      <Divider />

      {/* ── METRONOME ── */}
      <button
        onClick={() => setMetronomeEnabled(!metronomeEnabled)}
        className="app-no-drag"
        title={metronomeEnabled ? 'Metronome on — click to disable' : 'Metronome off'}
        style={{
          flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          gap: 4, height: SECTION_H,
          padding: '0 8px', border: 'none', cursor: 'pointer',
          background: 'transparent', color: metronomeEnabled ? '#e8a027' : '#35354a',
          transition: 'color 0.15s',
        }}
      >
        <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
          <path d="M8 18 L8 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M4 18 L12 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M8 4 L5 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <path d="M8 4 L11 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="8" cy="11" r="2" fill="currentColor"/>
        </svg>
        <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.05em' }}>
          {metronomeEnabled ? 'ON' : 'OFF'}
        </span>
      </button>

      <Divider />

      {/* ── MIDI DEVICE ── */}
      <div
        className="app-no-drag"
        title={midiDeviceConnected ? `MIDI: ${midiDeviceName}` : 'No MIDI keyboard connected'}
        style={{
          flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 4, padding: '0 10px', height: SECTION_H,
        }}
      >
        <MidiIcon size={20} color={midiDeviceConnected ? '#e8a027' : '#35354a'} />
        <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.05em', color: midiDeviceConnected ? '#e8a027' : '#35354a' }}>
          {midiDeviceConnected ? 'MIDI' : 'NO MIDI'}
        </span>
      </div>
    </div>
  )
}

function Divider() {
  return <div style={{ width: 1, height: 40, background: '#1e1e28', flexShrink: 0 }} />
}

function TBtn({ children, onClick, disabled, accent, active, title, large }: {
  children: React.ReactNode; onClick?: () => void; disabled?: boolean
  accent?: boolean; active?: boolean; title?: string; large?: boolean
}) {
  const size = large ? 46 : 34
  return (
    <button
      onClick={onClick} disabled={disabled} title={title}
      style={{
        width: size, height: size,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, border: 'none', background: 'transparent',
        color: active || accent ? '#e8a027' : '#70708a',
        opacity: disabled ? 0.2 : 1,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'color 0.1s, background 0.1s',
      }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = '#ffffff0d' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {children}
    </button>
  )
}
