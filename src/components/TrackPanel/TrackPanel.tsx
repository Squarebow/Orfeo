import { ChevronRight, ChevronLeft, Eye, EyeOff, Volume2, VolumeX } from 'lucide-react'
import { useStore } from '../../store'

export default function TrackPanel() {
  const tracks = useStore((s) => s.tracks)
  const midi = useStore((s) => s.midi)
  const trackPanelOpen = useStore((s) => s.trackPanelOpen)
  const setTrackPanelOpen = useStore((s) => s.setTrackPanelOpen)
  const updateTrack = useStore((s) => s.updateTrack)

  const hasSolo = tracks.some((t) => t.solo)

  return (
    <div
      className="flex flex-col shrink-0 relative"
      style={{
        width: trackPanelOpen ? 220 : 32,
        background: '#13131a',
        borderLeft: '1px solid #252530',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Toggle arrow */}
      <button
        onClick={() => setTrackPanelOpen(!trackPanelOpen)}
        className="absolute top-2 left-0 z-10 p-1 rounded-r"
        style={{
          background: '#1e1e2a',
          border: '1px solid #2e2e3e',
          borderLeft: 'none',
          color: '#606075',
        }}
        title={trackPanelOpen ? 'Close track panel' : 'Open track panel'}
      >
        {trackPanelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {trackPanelOpen && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div
            className="flex items-center px-3 py-2 shrink-0"
            style={{
              height: 36,
              borderBottom: '1px solid #252530',
            }}
          >
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: '#505065' }}>
              Tracks
            </span>
            {midi && (
              <span className="ml-auto text-xs" style={{ color: '#404055', fontFamily: 'JetBrains Mono' }}>
                {tracks.length}
              </span>
            )}
          </div>

          {/* Track list */}
          <div className="flex-1 overflow-y-auto">
            {!midi && (
              <div className="p-3 text-xs" style={{ color: '#3a3a50' }}>
                Open a MIDI file to see tracks
              </div>
            )}
            {tracks.map((track) => {
              const isEffectivelyMuted = track.muted || (hasSolo && !track.solo)
              return (
                <div
                  key={track.index}
                  className="flex items-center gap-1.5 px-2 py-1.5"
                  style={{
                    borderBottom: '1px solid #1a1a24',
                    opacity: isEffectivelyMuted ? 0.45 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  {/* Color swatch */}
                  <div
                    className="shrink-0 rounded-sm"
                    style={{
                      width: 10,
                      height: 28,
                      background: track.color,
                      opacity: isEffectivelyMuted ? 0.5 : 1,
                    }}
                  />

                  {/* Name */}
                  <span
                    className="flex-1 text-xs truncate"
                    style={{ color: '#a0a0b8', fontFamily: 'Inter' }}
                    title={track.name}
                  >
                    {track.name}
                  </span>

                  {/* Controls */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    {/* Mute */}
                    <TrackBtn
                      onClick={() => updateTrack(track.index, { muted: !track.muted })}
                      active={track.muted}
                      title={track.muted ? 'Unmute' : 'Mute'}
                    >
                      {track.muted ? <VolumeX size={11} /> : <Volume2 size={11} />}
                    </TrackBtn>

                    {/* Solo */}
                    <TrackBtn
                      onClick={() => updateTrack(track.index, { solo: !track.solo })}
                      active={track.solo}
                      accent
                      title={track.solo ? 'Unsolo' : 'Solo'}
                    >
                      <span className="text-[9px] font-bold leading-none">S</span>
                    </TrackBtn>

                    {/* Visible */}
                    <TrackBtn
                      onClick={() => updateTrack(track.index, { visible: !track.visible })}
                      active={!track.visible}
                      title={track.visible ? 'Hide in roll' : 'Show in roll'}
                    >
                      {track.visible ? <Eye size={11} /> : <EyeOff size={11} />}
                    </TrackBtn>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function TrackBtn({
  children,
  onClick,
  active,
  accent,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  active?: boolean
  accent?: boolean
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex items-center justify-center rounded p-1 transition-colors"
      style={{
        background: active ? (accent ? '#e8a02720' : '#ffffff12') : 'transparent',
        color: active ? (accent ? '#e8a027' : '#d0d0e0') : '#454560',
        width: 20,
        height: 20,
      }}
    >
      {children}
    </button>
  )
}
