import { useStore } from '@/store'
import type { MidiTrack } from '@/types'

interface TrackRowProps {
  track: MidiTrack
  index: number
}

export default function TrackRow({ track, index }: TrackRowProps) {
  const { toggleMute, toggleSolo, toggleVisible, setTrackVolume, setTrackPan } = useStore()

  return (
    <div style={{
      borderBottom: '1px solid var(--border)',
      padding: '6px 12px',
    }}>
      {/* Main row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '12px 1fr 28px 28px 28px',
        gap: 4,
        alignItems: 'center',
      }}>
        {/* Color swatch */}
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: track.color,
          flexShrink: 0,
          boxShadow: `0 0 4px ${track.color}88`,
        }} />

        {/* Track name */}
        <div style={{
          fontSize: 12,
          color: track.muted ? 'var(--text-muted)' : 'var(--text-primary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {track.name}
        </div>

        {/* Mute */}
        <button
          onClick={() => toggleMute(index)}
          style={{
            width: 24, height: 20,
            fontSize: 9, fontWeight: 600,
            borderRadius: 3,
            border: '1px solid',
            borderColor: track.muted ? 'var(--accent)' : 'var(--border)',
            background: track.muted ? 'var(--active)' : 'transparent',
            color: track.muted ? 'var(--accent)' : 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >M</button>

        {/* Solo */}
        <button
          onClick={() => toggleSolo(index)}
          style={{
            width: 24, height: 20,
            fontSize: 9, fontWeight: 600,
            borderRadius: 3,
            border: '1px solid',
            borderColor: track.solo ? '#6db87a' : 'var(--border)',
            background: track.solo ? 'rgba(109,184,122,0.15)' : 'transparent',
            color: track.solo ? '#6db87a' : 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >S</button>

        {/* Visible in roll */}
        <button
          onClick={() => toggleVisible(index)}
          style={{
            width: 24, height: 20,
            fontSize: 9, fontWeight: 600,
            borderRadius: 3,
            border: '1px solid',
            borderColor: track.visible ? 'var(--border)' : 'var(--border)',
            background: 'transparent',
            color: track.visible ? 'var(--text-secondary)' : 'var(--text-muted)',
            cursor: 'pointer',
            opacity: track.visible ? 1 : 0.4,
          }}
        >V</button>
      </div>

      {/* Volume slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
        <span className="text-label" style={{ minWidth: 16 }}>Vol</span>
        <input
          type="range" min={0} max={1} step={0.01}
          value={track.volume}
          onChange={e => setTrackVolume(index, Number(e.target.value))}
          style={{ flex: 1, height: 4 }}
        />
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)', minWidth: 28 }}>
          {Math.round(track.volume * 100)}
        </span>
      </div>

      {/* Pan slider */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
        <span className="text-label" style={{ minWidth: 16 }}>Pan</span>
        <input
          type="range" min={-1} max={1} step={0.01}
          value={track.pan}
          onChange={e => setTrackPan(index, Number(e.target.value))}
          style={{ flex: 1, height: 4 }}
        />
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)', minWidth: 28 }}>
          {track.pan === 0 ? 'C' : track.pan > 0 ? `R${Math.round(track.pan * 100)}` : `L${Math.round(Math.abs(track.pan) * 100)}`}
        </span>
      </div>
    </div>
  )
}
