import { FolderOpen, Play, Pause, Square, SkipBack, SkipForward,
         Repeat, Metronome, Settings, Music, ChevronRight } from 'lucide-react'
import { useStore } from '@/store'
import { useMidiFile } from '@/hooks/useMidiFile'
import { usePlayback } from '@/hooks/usePlayback'
import { formatTime } from '@/utils/midiParser'
import ChordDisplay from '@/components/ChordDisplay/ChordDisplay'

interface TopBarProps {
  midiConnected: boolean
  deviceName: string | null
}

export default function TopBar({ midiConnected, deviceName }: TopBarProps) {
  const {
    midiFile, playbackState, position, tempo, tempoPercent,
    setTempo, setTempoPercent, resetTempo,
    toggleTrackPanel, toggleSettings, isTrackPanelOpen
  } = useStore()

  const { openFile, loading } = useMidiFile()
  const { play, pause, stop } = usePlayback()

  const isPlaying = playbackState === 'playing'
  const progress = midiFile ? (position.seconds / midiFile.duration) * 100 : 0

  return (
    <header className="topbar panel-bottom" style={{
      height: 'var(--topbar-height)',
      background: 'var(--panel)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      padding: '0 12px',
      flexShrink: 0,
    }}>

      {/* ── File open ── */}
      <button className="btn-icon" onClick={openFile} disabled={loading} title="Open MIDI file">
        <FolderOpen size={16} />
      </button>

      {/* ── File info ── */}
      <div style={{ minWidth: 180, maxWidth: 240 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-primary)',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {midiFile?.name ?? 'No file loaded'}
        </div>
        {midiFile && (
          <div style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
            Bar {position.bar}:{position.beat}
          </div>
        )}
      </div>

      {/* ── Progress bar ── */}
      <div style={{ flex: 1, maxWidth: 300, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{
          height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden', cursor: 'pointer'
        }}>
          <div style={{
            height: '100%', width: `${progress}%`,
            background: 'var(--accent)', borderRadius: 2,
            transition: 'width 0.1s linear'
          }} />
        </div>
        {midiFile && (
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10,
                        color: 'var(--text-secondary)', fontFamily: 'JetBrains Mono, monospace' }}>
            <span>{formatTime(position.seconds)}</span>
            <span>{formatTime(midiFile.duration)}</span>
          </div>
        )}
      </div>

      {/* ── Chord display ── */}
      <ChordDisplay />

      {/* ── Transport controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <button className="btn-transport" onClick={stop} title="Stop">
          <Square size={14} />
        </button>
        <button className="btn-transport" title="Skip back">
          <SkipBack size={14} />
        </button>
        <button className="btn-transport play" onClick={isPlaying ? pause : play}
                title={isPlaying ? 'Pause' : 'Play'} disabled={!midiFile}>
          {isPlaying ? <Pause size={18} /> : <Play size={18} />}
        </button>
        <button className="btn-transport" title="Skip forward">
          <SkipForward size={14} />
        </button>
        <button className="btn-transport" title="Loop">
          <Repeat size={14} />
        </button>
      </div>

      {/* ── Tempo ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px',
                    borderLeft: '1px solid var(--border)', marginLeft: 4 }}>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>♩</span>
        <input type="range" min={20} max={300} value={tempo}
               onChange={e => setTempo(Number(e.target.value))}
               style={{ width: 80 }} title="Tempo" />
        <span className="text-value" style={{ minWidth: 38, fontSize: 12 }}>
          {tempo}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>BPM</span>
        <button className="btn-icon" onClick={resetTempo} title="Reset tempo"
                style={{ fontSize: 10, width: 'auto', padding: '0 6px', color: 'var(--text-muted)' }}>
          {tempoPercent}%
        </button>
      </div>

      {/* ── MIDI device indicator ── */}
      {midiConnected && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4,
                      fontSize: 10, color: 'var(--accent)' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' }} />
          {deviceName}
        </div>
      )}

      {/* ── Right actions ── */}
      <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
        <button className="btn-icon" onClick={toggleSettings} title="Settings">
          <Settings size={16} />
        </button>
        <button className={`btn-icon ${isTrackPanelOpen ? 'active' : ''}`}
                onClick={toggleTrackPanel} title="Track panel">
          <ChevronRight size={16} style={{
            transform: isTrackPanelOpen ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s'
          }} />
        </button>
      </div>

    </header>
  )
}
