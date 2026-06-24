import { useMemo, useState, useEffect } from 'react'
import { ChevronRight, ChevronLeft, Eye, EyeOff, Volume2, VolumeX, ChevronDown, Music2, Pencil, SlidersHorizontal } from 'lucide-react'
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
  const [editorOpen, setEditorOpen] = useState(false)

  useEffect(() => {
    if (!window.electronAPI?.onEditorClosed) return
    window.electronAPI.onEditorClosed(() => setEditorOpen(false))
  }, [])

  const handleOpenEditor = async () => {
    if (!midi) return
    const midiAny = midi as any
    const data = {
      fileName: midi.fileName,
      filePath: midiAny._filePath ?? '',
      tracks: tracks.map(t => {
        const rawTrack = midiAny._rawMidiTracks?.[t.index]
        return {
          index: t.index,
          name: t.name,
          gmName: t.gmName,
          program: t.program,
          group: t.group ?? '',
          isDrum: t.isDrum,
          color: t.color,
          channel: rawTrack?.channel ?? t.index,
          noteCount: rawTrack?.notes?.length ?? 0,
          muted: t.muted,
        }
      }),
    }
    try {
      setEditorOpen(true)
      await window.electronAPI.openMidiEditor(data)
    } catch (e) {
      console.error('[Orfeo] Failed to open MIDI editor:', e)
      setEditorOpen(false)
    }
  }

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
        onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
        onMouseLeave={e => e.currentTarget.style.color = '#707088'}
      >
        {trackPanelOpen
          ? <ChevronRight size={15} />
          : <SlidersHorizontal size={20} />
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
            {midi && (
              <button
                onClick={editorOpen ? undefined : handleOpenEditor}
                title={editorOpen ? 'MIDI Editor is open' : 'Open MIDI Editor'}
                style={{
                  background: 'none', border: 'none',
                  cursor: editorOpen ? 'default' : 'pointer',
                  color: editorOpen ? '#e8a027' : '#505068',
                  padding: '2px 4px',
                  display: 'flex', alignItems: 'center',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (!editorOpen) e.currentTarget.style.color = '#e8a027' }}
                onMouseLeave={e => { if (!editorOpen) e.currentTarget.style.color = '#505068' }}
              >
                <Pencil size={13} strokeWidth={1.5} />
              </button>
            )}
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
