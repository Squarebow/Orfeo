import { useMemo, useState } from 'react'
import { ChevronRight, ChevronLeft, Eye, EyeOff, Volume2, VolumeX, ChevronDown, ChevronUp } from 'lucide-react'
import { useStore } from '../../store'
import { GM_GROUPS } from '../../utils/gmInstruments'
import type { TrackState } from '../../types'

// Group order for display
const GROUP_ORDER = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass',
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic',
  'percussive', 'sfx', 'drums',
]

export default function TrackPanel() {
  const tracks = useStore((s) => s.tracks)
  const midi = useStore((s) => s.midi)
  const trackPanelOpen = useStore((s) => s.trackPanelOpen)
  const setTrackPanelOpen = useStore((s) => s.setTrackPanelOpen)
  const updateTrack = useStore((s) => s.updateTrack)
  const muteGroup = useStore((s) => s.muteGroup)

  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  // Group tracks by GM group
  const grouped = useMemo(() => {
    const map = new Map<string, TrackState[]>()
    for (const track of tracks) {
      const g = track.group ?? 'sfx'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(track)
    }
    // Sort groups by GM_ORDER
    return GROUP_ORDER
      .filter(g => map.has(g))
      .map(g => ({ key: g, label: GM_GROUPS[g]?.label ?? g, tracks: map.get(g)! }))
  }, [tracks])

  const hasSolo = tracks.some(t => t.solo)

  const toggleGroupCollapse = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group)
      else next.add(group)
      return next
    })
  }

  const isGroupMuted = (groupKey: string) =>
    tracks.filter(t => t.group === groupKey).every(t => t.muted)

  const handleGroupMute = (groupKey: string) => {
    muteGroup(groupKey, !isGroupMuted(groupKey))
  }

  return (
    <div
      className="flex flex-col shrink-0 relative"
      style={{
        width: trackPanelOpen ? 240 : 32,
        background: '#141418',
        borderLeft: '1px solid #2a2a35',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
      }}
    >
      {/* Toggle arrow */}
      <button
        onClick={() => setTrackPanelOpen(!trackPanelOpen)}
        title={trackPanelOpen ? 'Close track panel' : 'Open track panel'}
        className="absolute top-2 left-0 z-10 p-1 rounded-r"
        style={{ background: '#1e1e2a', border: '1px solid #2e2e3e', borderLeft: 'none', color: '#606075' }}
      >
        {trackPanelOpen ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
      </button>

      {trackPanelOpen && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Header */}
          <div
            className="flex items-center px-3 shrink-0"
            style={{ height: 36, borderBottom: '1px solid #252530' }}
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

            {grouped.map(({ key, label, tracks: groupTracks }) => {
              const collapsed = collapsedGroups.has(key)
              const groupMuted = isGroupMuted(key)

              return (
                <div key={key}>
                  {/* Group header */}
                  <div
                    className="flex items-center gap-1 px-2 py-1 select-none"
                    style={{
                      background: '#1a1a22',
                      borderBottom: '1px solid #252530',
                      borderTop: '1px solid #252530',
                    }}
                  >
                    {/* Collapse toggle */}
                    <button
                      onClick={() => toggleGroupCollapse(key)}
                      className="p-0.5 rounded opacity-60 hover:opacity-100"
                      style={{ color: '#808098' }}
                      title={collapsed ? 'Expand group' : 'Collapse group'}
                    >
                      {collapsed ? <ChevronRight size={11} /> : <ChevronDown size={11} />}
                    </button>

                    {/* Group name */}
                    <span
                      className="flex-1 text-xs font-semibold uppercase tracking-wider"
                      style={{ color: '#808098', letterSpacing: '0.08em' }}
                    >
                      {label}
                    </span>

                    {/* Track count */}
                    <span className="text-xs mr-1" style={{ color: '#404055', fontFamily: 'JetBrains Mono' }}>
                      {groupTracks.length}
                    </span>

                    {/* Group mute all */}
                    <button
                      onClick={() => handleGroupMute(key)}
                      title={groupMuted ? `Unmute all ${label}` : `Mute all ${label}`}
                      className="px-1.5 py-0.5 rounded text-[9px] font-bold transition-all"
                      style={{
                        background: groupMuted ? '#e8a02730' : '#ffffff10',
                        color: groupMuted ? '#e8a027' : '#505065',
                        border: groupMuted ? '1px solid #e8a02750' : '1px solid transparent',
                      }}
                    >
                      {groupMuted ? 'UNMUTE' : 'MUTE'}
                    </button>
                  </div>

                  {/* Tracks in group */}
                  {!collapsed && groupTracks.map((track) => {
                    const isEffectivelyMuted = track.muted || (hasSolo && !track.solo)
                    return (
                      <TrackRow
                        key={track.index}
                        track={track}
                        dimmed={isEffectivelyMuted}
                        onMute={() => updateTrack(track.index, { muted: !track.muted })}
                        onSolo={() => updateTrack(track.index, { solo: !track.solo })}
                        onVisible={() => updateTrack(track.index, { visible: !track.visible })}
                        onKeyboard={() => updateTrack(track.index, { showOnKeyboard: !track.showOnKeyboard })}
                      />
                    )
                  })}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function TrackRow({ track, dimmed, onMute, onSolo, onVisible, onKeyboard }: {
  track: TrackState
  dimmed: boolean
  onMute: () => void
  onSolo: () => void
  onVisible: () => void
  onKeyboard: () => void
}) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-1.5"
      style={{
        borderBottom: '1px solid #1a1a24',
        opacity: dimmed ? 0.4 : 1,
        transition: 'opacity 0.15s',
      }}
      title={`${track.gmName} (ch ${track.channel ?? track.index + 1}, prog ${track.program >= 0 ? track.program + 1 : 'Drums'})`}
    >
      {/* Color swatch */}
      <div
        className="shrink-0 rounded-sm"
        style={{ width: 3, height: 28, background: track.color, opacity: dimmed ? 0.5 : 1 }}
      />

      {/* Track info */}
      <div className="flex-1 min-w-0">
        <div className="text-xs truncate font-medium" style={{ color: '#c0c0d8' }}>
          {track.gmName}
        </div>
        <div className="text-[9px]" style={{ color: '#404055', fontFamily: 'JetBrains Mono' }}>
          #{track.index + 1} · ch {(track as any).channel ?? track.index}
          {track.isDrum ? ' · drums' : ` · prog ${track.program + 1}`}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-0.5 shrink-0">
        <TrkBtn onClick={onMute} active={track.muted} title={track.muted ? 'Unmute' : 'Mute'}>
          {track.muted ? <VolumeX size={10} /> : <Volume2 size={10} />}
        </TrkBtn>
        <TrkBtn onClick={onSolo} active={track.solo} accent title={track.solo ? 'Unsolo' : 'Solo'}>
          <span className="text-[9px] font-bold leading-none">S</span>
        </TrkBtn>
        <TrkBtn onClick={onVisible} active={!track.visible} title={track.visible ? 'Hide in roll' : 'Show in roll'}>
          {track.visible ? <Eye size={10} /> : <EyeOff size={10} />}
        </TrkBtn>
        <TrkBtn onClick={onKeyboard} active={track.showOnKeyboard} accent title={track.showOnKeyboard ? 'Hide on keyboard' : 'Show on keyboard'}>
          <svg width="11" height="8" viewBox="0 0 11 8" fill="none">
            <rect x="0.5" y="0.5" width="10" height="7" rx="1" stroke="currentColor" strokeWidth="0.8"/>
            <rect x="2" y="0.5" width="1.2" height="4" rx="0.3" fill="currentColor"/>
            <rect x="4" y="0.5" width="1.2" height="4" rx="0.3" fill="currentColor"/>
            <rect x="6" y="0.5" width="1.2" height="4" rx="0.3" fill="currentColor"/>
            <rect x="8" y="0.5" width="1.2" height="4" rx="0.3" fill="currentColor"/>
          </svg>
        </TrkBtn>
      </div>
    </div>
  )
}

function TrkBtn({ children, onClick, active, accent, title }: {
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
