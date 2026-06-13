import { useStore } from '@/store'
import TrackRow from './TrackRow'

interface TrackPanelProps {
  isOpen: boolean
}

export default function TrackPanel({ isOpen }: TrackPanelProps) {
  const { tracks } = useStore()

  return (
    <div style={{
      width: isOpen ? 280 : 0,
      overflow: 'hidden',
      transition: 'width 0.2s ease',
      background: 'var(--panel)',
      borderLeft: isOpen ? '1px solid var(--border)' : 'none',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
    }}>
      {isOpen && (
        <>
          {/* Header */}
          <div style={{
            padding: '10px 12px 8px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <span className="text-label">Tracks</span>
            <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
              {tracks.length} tracks
            </span>
          </div>

          {/* Column headers */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '12px 1fr 28px 28px 28px',
            gap: 4,
            padding: '6px 12px',
            borderBottom: '1px solid var(--border)',
          }}>
            <div />
            <span className="text-label">Name</span>
            <span className="text-label" style={{ textAlign: 'center' }}>M</span>
            <span className="text-label" style={{ textAlign: 'center' }}>S</span>
            <span className="text-label" style={{ textAlign: 'center' }}>V</span>
          </div>

          {/* Track list */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {tracks.length === 0 ? (
              <div className="empty-state" style={{ padding: 24 }}>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  No tracks loaded
                </span>
              </div>
            ) : (
              tracks.map((track, i) => (
                <TrackRow key={i} track={track} index={i} />
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
