import { useMemo, useState } from 'react'
import { ChevronRight, ChevronLeft, Eye, EyeOff, Volume2, VolumeX, ChevronDown, Music2 } from 'lucide-react'
import { useStore } from '../../store'
import { GM_GROUPS } from '../../utils/gmInstruments'
import type { TrackState } from '../../types'

const GROUP_ORDER = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass',
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic',
  'percussive', 'sfx', 'drums',
]

// Groups that show on keyboard by default
const KEYBOARD_GROUPS = new Set(['piano', 'chromatic', 'organ'])

export default function TrackPanel() {
  const tracks = useStore((s) => s.tracks)
  const midi = useStore((s) => s.midi)
  const trackPanelOpen = useStore((s) => s.trackPanelOpen)
  const setTrackPanelOpen = useStore((s) => s.setTrackPanelOpen)
  const updateTrack = useStore((s) => s.updateTrack)
  const muteGroup = useStore((s) => s.muteGroup)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())

  const grouped = useMemo(() => {
    const map = new Map<string, TrackState[]>()
    for (const track of tracks) {
      const g = track.group ?? 'sfx'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(track)
    }
    return GROUP_ORDER
      .filter(g => map.has(g))
      .map(g => ({ key: g, label: GM_GROUPS[g]?.label ?? g, tracks: map.get(g)! }))
  }, [tracks])

  const hasSolo = tracks.some(t => t.solo)

  const toggleGroupCollapse = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group); else next.add(group)
      return next
    })
  }

  const isGroupMuted = (groupKey: string) =>
    tracks.filter(t => t.group === groupKey).every(t => t.muted)

  return (
    <div
      style={{
        width: trackPanelOpen ? 260 : 32,
        background: '#13131a',
        borderLeft: '1px solid #222230',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setTrackPanelOpen(!trackPanelOpen)}
        title={trackPanelOpen ? 'Close track panel' : 'Open track panel'}
        style={{
          position: 'absolute', top: 10, left: 0, zIndex: 10,
          padding: '4px 5px', borderRadius: '0 4px 4px 0',
          background: '#1a1a24', border: '1px solid #252535', borderLeft: 'none',
          color: '#707088', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'color 0.15s',
        }}
      >
        {trackPanelOpen
          ? <ChevronRight size={13} />
          : (
            /* Playlist icon (amber) when drawer is closed */
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 16.4286C16 17.8487 14.8807 19 13.5 19C12.1193 19 11 17.8487 11 16.4286C11 15.0084 12.1193 13.8571 13.5 13.8571C14.8807 13.8571 16 15.0084 16 16.4286ZM16 16.4286V10"/>
              <path d="M18.675 7.116L16.92 7.958C16.579 8.122 16.408 8.204 16.285 8.331C16.185 8.432 16.109 8.553 16.06 8.687C16 8.853 16 9.042 16 9.421C16 10.298 16 10.736 16.191 10.999C16.342 11.207 16.567 11.348 16.82 11.395C17.14 11.453 17.535 11.263 18.325 10.884L20.08 10.042C20.421 9.878 20.592 9.796 20.716 9.67C20.815 9.568 20.891 9.447 20.94 9.314C21 9.148 21 8.958 21 8.579C21 7.703 21 7.264 20.809 7.001C20.658 6.794 20.433 6.652 20.18 6.606C19.86 6.547 19.465 6.737 18.675 7.116Z"/>
              <path d="M15 5L3 5M13 9L3 9M9 13H3M8 17H3"/>
            </svg>
          )
        }
      </button>

      {trackPanelOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{
            height: 40, display: 'flex', alignItems: 'center',
            padding: '0 14px 0 36px',
            borderBottom: '1px solid #1e1e2c', flexShrink: 0,
            gap: 8,
          }}>
            <Music2 size={14} style={{ color: '#50506a', flexShrink: 0 }} />
            <span style={{ color: '#707088', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Tracks
            </span>
            {midi && (
              <span style={{ marginLeft: 'auto', color: '#50506a', fontSize: 11, fontFamily: 'JetBrains Mono' }}>
                {tracks.length}
              </span>
            )}
            {/* Placeholder for soundfont switcher */}
            <button
              title="Switch soundfont — coming soon"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#30303e', padding: 2 }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
              </svg>
            </button>
          </div>

          {/* Track list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {!midi && (
              <div style={{ padding: '12px 14px', fontSize: 11, color: '#35354a' }}>
                Open a MIDI file to see tracks
              </div>
            )}

            {grouped.map(({ key, label, tracks: groupTracks }) => {
              const collapsed = collapsedGroups.has(key)
              const groupMuted = isGroupMuted(key)

              return (
                <div key={key} style={{ marginBottom: 2 }}>
                  {/* Group header row */}
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 10px 5px 10px',
                    background: '#0e0e16',
                    borderTop: '1px solid #1a1a26',
                    borderBottom: '1px solid #1a1a26',
                  }}>
                    <button
                      onClick={() => toggleGroupCollapse(key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#50506a', padding: 0, display: 'flex', alignItems: 'center' }}
                      title={collapsed ? 'Expand' : 'Collapse'}
                    >
                      <ChevronDown size={11} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>

                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#707088' }}>
                      {label}
                    </span>
                    <span style={{ fontSize: 10, color: '#40404e', fontFamily: 'JetBrains Mono' }}>
                      {groupTracks.length}
                    </span>
                    <button
                      onClick={() => muteGroup(key, !groupMuted)}
                      title={groupMuted ? `Unmute all ${label}` : `Mute all ${label}`}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        padding: '2px 4px', display: 'flex', alignItems: 'center',
                        color: groupMuted ? '#e8a027' : '#404055',
                      }}
                    >
                      {groupMuted ? <VolumeX size={12} /> : <Volume2 size={12} />}
                    </button>
                  </div>

                  {/* Track rows */}
                  {!collapsed && groupTracks.map((track) => {
                    const effectivelyMuted = track.muted || (hasSolo && !track.solo)
                    return (
                      <TrackRow
                        key={track.index}
                        track={track}
                        dimmed={effectivelyMuted}
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
  track: TrackState; dimmed: boolean
  onMute: () => void; onSolo: () => void; onVisible: () => void; onKeyboard: () => void
}) {
  // Friendly channel/program label
  const ch = (track as any).channel != null ? (track as any).channel + 1 : track.index + 1
  const prog = track.isDrum ? 'drums' : `prog ${track.program + 1}`
  const tooltip = `Track ${track.index + 1} · MIDI channel ${ch} · ${prog}`

  return (
    <div
      title={tooltip}
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px 6px 14px',
        borderBottom: '1px solid #181822',
        opacity: dimmed ? 0.45 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {/* Color bar */}
      <div style={{ width: 3, height: 30, background: track.color, borderRadius: 2, flexShrink: 0, opacity: dimmed ? 0.6 : 1 }} />

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#9090a8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {track.gmName}
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
          <span style={{ fontSize: 9, color: '#505068', fontFamily: 'JetBrains Mono' }}>track {track.index + 1}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 1 }}>
          <span style={{ fontSize: 9, color: '#454560', fontFamily: 'JetBrains Mono' }}>ch {ch}</span>
          <span style={{ fontSize: 9, color: '#454560', fontFamily: 'JetBrains Mono' }}>·</span>
          <span style={{ fontSize: 9, color: '#454560', fontFamily: 'JetBrains Mono' }}>{prog}</span>
        </div>
      </div>

      {/* Control icons — no backgrounds, color = state */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        <IBtn onClick={onMute} active={track.muted} title={track.muted ? 'Unmute' : 'Mute'} activeColor="#d04040">
          <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>M</span>
        </IBtn>
        <IBtn onClick={onSolo} active={track.solo} title={track.solo ? 'Unsolo' : 'Solo'} activeColor="#e8a027">
          <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>S</span>
        </IBtn>
        <IBtn onClick={onVisible} active={!track.visible} title={track.visible ? 'Hide in roll' : 'Show in roll'} activeColor="#6080c0">
          {track.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </IBtn>
        <IBtn onClick={onKeyboard} active={track.showOnKeyboard} title={track.showOnKeyboard ? 'Lit on keyboard' : 'Not lit on keyboard'} activeColor="#e8a027">
          {/* Mini piano icon */}
          <svg width="13" height="9" viewBox="0 0 13 9" fill="none">
            <rect x="0.5" y="0.5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="0.9"/>
            <rect x="2.5" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
            <rect x="5"   y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
            <rect x="7.5" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
            <rect x="10"  y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
          </svg>
        </IBtn>
      </div>
    </div>
  )
}

function IBtn({ children, onClick, active, title, activeColor = '#e8a027' }: {
  children: React.ReactNode; onClick: () => void
  active?: boolean; title?: string; activeColor?: string
}) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, background: 'none', border: 'none', cursor: 'pointer',
        color: active ? activeColor : '#404058',
        borderRadius: 4, transition: 'color 0.1s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = '#808098' }}
      onMouseLeave={e => { e.currentTarget.style.color = active ? activeColor : '#404058' }}
    >
      {children}
    </button>
  )
}
