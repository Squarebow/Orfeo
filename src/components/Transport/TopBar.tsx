import { useCallback, useRef } from 'react'
import {
  Play, Pause, Square, SkipBack, SkipForward, Repeat,
  FolderOpen, RotateCcw, ChevronUp, ChevronDown
} from 'lucide-react'
import { useStore } from '../../store'
import { usePlayback } from '../../hooks/usePlayback'
import { useMidiFile } from '../../hooks/useMidiFile'
import { formatTime } from '../../utils/midiParser'
import { formatKey, transposeDetectedKey } from '../../utils/keyDetection'
import OrfeoLogo from '../OrfeoLogo'
import MidiIcon from '../MidiIcon'

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
  const setDetectedKey = useStore((s) => s.setDetectedKey)
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

  const handleTranspose = (semitones: number) => {
    if (!detectedKey) return
    const newKey = transposeDetectedKey(detectedKey, semitones)
    // Update key in store — audio engine watches detectedKey.transpose
    useStore.setState({ detectedKey: newKey })
  }

  const transpose = detectedKey?.transpose ?? 0
  const duration = midi?.duration ?? 0
  const tempoPercent = Math.round((bpm / originalBpm) * 100)
  const isTempoChanged = Math.abs(tempoPercent - 100) > 1
  const displayKey = detectedKey ? formatKey(detectedKey, noteNaming) : '—'

  return (
    <div
      style={{
        height: 60,
        background: '#111116',
        borderBottom: '1px solid #222228',
        display: 'flex',
        alignItems: 'center',
        padding: '0 8px 0 4px',
        gap: 8,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* ── LOGO + OPEN ── */}
      <div
        className="flex items-center gap-2 shrink-0"
        style={{ WebkitAppRegion: 'no-drag', paddingLeft: 4 } as React.CSSProperties}
      >
        <OrfeoLogo />
        <button
          onClick={openFile}
          title="Open MIDI file (Ctrl+O)"
          className="flex items-center justify-center w-7 h-7 rounded transition-colors"
          style={{ background: '#1e1e2a', color: '#808098', border: '1px solid #2a2a3a', flexShrink: 0 }}
        >
          <FolderOpen size={13} />
        </button>
      </div>

      <Divider />

      {/* ── BPM ── */}
      <div
        className="flex items-center gap-1.5 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title={`Tempo: ${Math.round(bpm)} BPM${isTempoChanged ? ` (original: ${Math.round(originalBpm)} BPM)` : ''}`}
      >
        <span style={{ color: '#404055', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>BPM</span>
        <span style={{
          color: isTempoChanged ? '#e8a027' : '#c0c0d8',
          fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 700, minWidth: 36, textAlign: 'right'
        }}>
          {Math.round(bpm)}
        </span>
        <input
          type="range" min={20} max={300} step={1} value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          className="scrub-slider" style={{ width: 60 }} disabled={!midi}
          title="Drag to change tempo"
        />
        {isTempoChanged && (
          <button onClick={resetBpm} title="Reset to original tempo" style={{ opacity: 0.7 }}>
            <RotateCcw size={10} style={{ color: '#e8a027' }} />
          </button>
        )}
      </div>

      <Divider />

      {/* ── KEY ── */}
      <div
        className="flex items-center gap-1 shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        title={`Key: ${displayKey}${transpose !== 0 ? ` (${transpose > 0 ? '+' : ''}${transpose} semitones)` : ''}`}
      >
        <span style={{ color: '#404055', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Key</span>
        <span style={{
          color: transpose !== 0 ? '#e8a027' : '#c0c0d8',
          fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 700, minWidth: 36, textAlign: 'center'
        }}>
          {displayKey}
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <button
            onClick={() => handleTranspose(1)}
            disabled={!midi || transpose >= 12}
            title="Transpose up one semitone"
            style={{
              width: 16, height: 12, background: '#1e1e2a', color: '#606075',
              border: 'none', borderRadius: 2, cursor: !midi ? 'default' : 'pointer',
              opacity: !midi ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <ChevronUp size={10} />
          </button>
          <button
            onClick={() => handleTranspose(-1)}
            disabled={!midi || transpose <= -12}
            title="Transpose down one semitone"
            style={{
              width: 16, height: 12, background: '#1e1e2a', color: '#606075',
              border: 'none', borderRadius: 2, cursor: !midi ? 'default' : 'pointer',
              opacity: !midi ? 0.3 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <ChevronDown size={10} />
          </button>
        </div>
        {transpose !== 0 && (
          <button
            onClick={() => useStore.setState({ detectedKey: detectedKey ? { ...detectedKey, transpose: 0 } : null })}
            title="Reset to original key"
            style={{
              display: 'flex', alignItems: 'center', gap: 3,
              color: '#e8a027', background: '#e8a02715', border: '1px solid #e8a02730',
              borderRadius: 4, padding: '2px 5px', fontSize: 9,
              fontFamily: 'JetBrains Mono', cursor: 'pointer'
            }}
          >
            <span>{transpose > 0 ? `+${transpose}` : transpose}</span>
            <RotateCcw size={9} />
          </button>
        )}
      </div>

      <Divider />

      {/* ── CENTER: TRANSPORT + SONG NAME + SCRUB ── */}
      <div
        className="flex flex-col items-center gap-1 flex-1 min-w-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Transport buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <TBtn onClick={stop} disabled={!midi} title="Stop & return to start">
            <SkipBack size={18} />
          </TBtn>
          <TBtn onClick={handlePlayPause} disabled={!midi} accent title="Play / Pause (Space)" large>
            {playbackState === 'playing'
              ? <Pause size={22} fill="currentColor" />
              : <Play size={22} fill="currentColor" />}
          </TBtn>
          <TBtn onClick={stop} disabled={!midi} title="Stop">
            <Square size={18} fill="currentColor" />
          </TBtn>
          <TBtn onClick={() => midi && seekAndPlay(midi.duration)} disabled={!midi} title="Skip to end">
            <SkipForward size={18} />
          </TBtn>
          <TBtn onClick={() => setLoop(!loopEnabled)} disabled={!midi} active={loopEnabled} title="Toggle loop">
            <Repeat size={16} />
          </TBtn>
        </div>

        {/* Song name frame + scrub */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', justifyContent: 'center' }}>
          <span style={{
            color: '#505065', fontFamily: 'JetBrains Mono', fontSize: 10,
            minWidth: 32, textAlign: 'right', flexShrink: 0
          }}>
            {formatTime(currentTime)}
          </span>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 6, flex: 1, maxWidth: 340,
            background: '#1a1a22', borderRadius: 6, border: '1px solid #252530',
            padding: '2px 8px'
          }}>
            <span style={{
              color: '#808098', fontSize: 11, fontFamily: 'Inter',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              flex: 1, minWidth: 0
            }}
              title={midi?.fileName}
            >
              {midi ? midi.fileName.replace(/\.(mid|midi)$/i, '') : 'No file open'}
            </span>
            <input
              type="range" min={0} max={duration || 1} step={0.1} value={currentTime}
              onMouseDown={handleScrubStart}
              onChange={handleScrubChange}
              onMouseUp={handleScrubEnd}
              className="scrub-slider" style={{ width: 120, flexShrink: 0 }} disabled={!midi}
              title="Scrub position"
            />
          </div>

          <span style={{
            color: '#505065', fontFamily: 'JetBrains Mono', fontSize: 10,
            minWidth: 32, flexShrink: 0
          }}>
            {formatTime(duration)}
          </span>
        </div>
      </div>

      <Divider />

      {/* ── TIME SIGNATURE ── */}
      <div
        style={{ WebkitAppRegion: 'no-drag', flexShrink: 0 } as React.CSSProperties}
        title={`Time signature: ${midi?.timeSignatureNumerator ?? 4}/${midi?.timeSignatureDenominator ?? 4}`}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 1 }}>
          <span style={{ color: '#c0c0d8', fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700 }}>
            {midi?.timeSignatureNumerator ?? 4}
          </span>
          <div style={{ width: 18, height: 1, background: '#404055', margin: '1px 0' }} />
          <span style={{ color: '#c0c0d8', fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700 }}>
            {midi?.timeSignatureDenominator ?? 4}
          </span>
        </div>
      </div>

      <Divider />

      {/* ── METRONOME ── */}
      <button
        onClick={() => setMetronomeEnabled(!metronomeEnabled)}
        title={metronomeEnabled ? 'Metronome on — click to disable' : 'Metronome off — click to enable'}
        style={{
          WebkitAppRegion: 'no-drag',
          flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          padding: '4px 6px', borderRadius: 6, border: 'none', cursor: 'pointer',
          background: metronomeEnabled ? '#e8a02718' : 'transparent',
          color: metronomeEnabled ? '#e8a027' : '#404055',
          transition: 'all 0.15s',
        } as React.CSSProperties}
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
        title={midiDeviceConnected ? `MIDI keyboard connected: ${midiDeviceName}` : 'No MIDI keyboard connected — plug in via USB'}
        style={{
          WebkitAppRegion: 'no-drag',
          flexShrink: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
          padding: '4px 6px',
        } as React.CSSProperties}
      >
        <MidiIcon connected={midiDeviceConnected} size={24} />
        <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono', letterSpacing: '0.05em', color: midiDeviceConnected ? '#e8a027' : '#353545' }}>
          {midiDeviceConnected ? 'MIDI' : 'NO MIDI'}
        </span>
      </div>

      {/* Right padding to avoid window controls overlap on Windows */}
      <div style={{ width: 140, flexShrink: 0, WebkitAppRegion: 'drag' } as React.CSSProperties} />
    </div>
  )
}

function Divider() {
  return (
    <div style={{ width: 1, height: 28, background: '#222228', flexShrink: 0 }} />
  )
}

function TBtn({ children, onClick, disabled, accent, active, title, large }: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  accent?: boolean
  active?: boolean
  title?: string
  large?: boolean
}) {
  const size = large ? 44 : 34
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: size, height: size,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, border: accent ? '1px solid #e8a02830' : '1px solid transparent',
        background: active ? '#e8a02718' : accent ? '#e8a02712' : 'transparent',
        color: active ? '#e8a027' : accent ? '#e8a027' : '#909098',
        opacity: disabled ? 0.2 : 1,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'all 0.1s',
      }}
    >
      {children}
    </button>
  )
}
