import { useCallback } from 'react'
import {
  Play, Pause, Square, SkipBack, SkipForward, Repeat,
  FolderOpen, Gauge, RotateCcw
} from 'lucide-react'
import { useStore } from '../../store'
import { usePlayback } from '../../hooks/usePlayback'
import { useMidiFile } from '../../hooks/useMidiFile'
import { formatTime } from '../../utils/midiParser'

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

  const { play, pause, stop, seek } = usePlayback()
  const { openFile } = useMidiFile()

  const handlePlayPause = useCallback(() => {
    if (playbackState === 'playing') pause()
    else play()
  }, [playbackState, play, pause])

  const duration = midi?.duration ?? 0
  const tempoPercent = Math.round((bpm / originalBpm) * 100)
  const isTempoChanged = Math.abs(tempoPercent - 100) > 1

  return (
    <div
      className="flex items-center px-3 shrink-0"
      style={{
        height: 48,
        background: '#13131a',
        borderBottom: '1px solid #1e1e28',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}
    >
      {/* LEFT — Open button */}
      <div className="flex items-center gap-2 w-48" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          onClick={openFile}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors"
          style={{
            background: '#1e1e2a',
            color: '#808098',
            border: '1px solid #2a2a3a',
          }}
          title="Open MIDI file (Ctrl+O)"
        >
          <FolderOpen size={13} />
          Open
        </button>

        {/* File name */}
        {midi && (
          <span
            className="text-xs truncate max-w-32"
            style={{ color: '#606075', fontFamily: 'Inter' }}
            title={midi.fileName}
          >
            {midi.fileName.replace(/\.(mid|midi)$/i, '')}
          </span>
        )}
      </div>

      {/* CENTER — Transport + scrub */}
      <div
        className="flex flex-col items-center justify-center flex-1 gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {/* Transport buttons */}
        <div className="flex items-center gap-0.5">
          <TBtn onClick={() => seek(0)} disabled={!midi} title="Back to start">
            <SkipBack size={13} />
          </TBtn>
          <TBtn onClick={handlePlayPause} disabled={!midi} accent title="Play / Pause">
            {playbackState === 'playing' ? <Pause size={15} /> : <Play size={15} />}
          </TBtn>
          <TBtn onClick={stop} disabled={!midi} title="Stop">
            <Square size={13} />
          </TBtn>
          <TBtn onClick={() => midi && seek(midi.duration)} disabled={!midi} title="Skip to end">
            <SkipForward size={13} />
          </TBtn>
          <TBtn onClick={() => setLoop(!loopEnabled)} disabled={!midi} active={loopEnabled} title="Loop">
            <Repeat size={13} />
          </TBtn>
        </div>

        {/* Scrub bar + times */}
        <div className="flex items-center gap-2">
          <span
            className="text-xs tabular-nums"
            style={{ color: '#505065', fontFamily: 'JetBrains Mono', minWidth: 32, textAlign: 'right' }}
          >
            {formatTime(currentTime)}
          </span>
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={(e) => seek(parseFloat(e.target.value))}
            className="scrub-slider"
            style={{ width: 200 }}
            disabled={!midi}
          />
          <span
            className="text-xs tabular-nums"
            style={{ color: '#505065', fontFamily: 'JetBrains Mono', minWidth: 32 }}
          >
            {formatTime(duration)}
          </span>
        </div>
      </div>

      {/* RIGHT — Tempo */}
      <div
        className="flex items-center gap-2 w-48 justify-end"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Gauge size={12} style={{ color: '#404055' }} />
        <input
          type="range"
          min={30}
          max={300}
          step={1}
          value={bpm}
          onChange={(e) => setBpm(Number(e.target.value))}
          className="scrub-slider"
          style={{ width: 72 }}
          disabled={!midi}
          title={`Tempo: ${bpm} BPM`}
        />
        <span
          className="text-xs tabular-nums"
          style={{
            color: isTempoChanged ? '#e8a027' : '#505065',
            fontFamily: 'JetBrains Mono',
            minWidth: 36,
          }}
          title={`${bpm} BPM`}
        >
          {isTempoChanged ? `${tempoPercent}%` : `${Math.round(bpm)}`}
        </span>
        {isTempoChanged && (
          <button onClick={resetBpm} title="Reset tempo" style={{ color: '#e8a027', opacity: 0.7 }}>
            <RotateCcw size={11} />
          </button>
        )}
      </div>
    </div>
  )
}

function TBtn({
  children, onClick, disabled, accent, active, title,
}: {
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
  accent?: boolean
  active?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-1.5 rounded transition-all"
      style={{
        color: active ? '#e8a027' : accent ? '#e8a027' : '#707088',
        background: active ? '#e8a02718' : 'transparent',
        opacity: disabled ? 0.25 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {children}
    </button>
  )
}
