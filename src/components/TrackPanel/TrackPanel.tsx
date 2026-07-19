import { useMemo, useState, useEffect } from 'react'
import { ChevronRight, Eye, Volume2, VolumeX, ChevronDown, AudioLines, SlidersVertical } from 'lucide-react'
import { useStore, DEFAULT_MUTED_GROUPS } from '../../store'
import { GM_GROUPS } from '../../utils/gmInstruments'
import type { TrackState } from '../../types'
import { MarqueeText } from '../MarqueeText'

const GROUP_ORDER = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass',
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic',
  'percussive', 'sfx', 'drums',
]

// Groups that show on keyboard by default
const KEYBOARD_GROUPS = new Set(['piano', 'chromatic', 'organ'])

// ── EyeClosed — custom icon replacing lucide EyeOff ──────────────────────────
function EyeClosed({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="m15 18-.722-3.25"/>
      <path d="M2 8a10.645 10.645 0 0 0 20 0"/>
      <path d="m20 15-1.726-2.05"/>
      <path d="m4 15 1.726-2.05"/>
      <path d="m9 18 .722-3.25"/>
    </svg>
  )
}

// ── Pencil-Sparkles icon (not yet in installed lucide-react version) ──────────
function PencilSparkles({ size = 16 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 3H8"/><path d="m15.007 5.008 3.987 3.986"/><path d="M20 15v4"/><path d="M21.174 6.813a2.82 2.82 0 0 0-3.986-3.987L3.842 16.175a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="M22 17h-4"/><path d="M4 5v4"/><path d="M6 7H2"/><path d="M9 2v2"/>
    </svg>
  )
}

// ── Track panel — collapsible right drawer with instrument group list and track controls
export default function TrackPanel() {
  const tracks = useStore((s) => s.tracks)
  const midi = useStore((s) => s.midi)
  const trackPanelOpen = useStore((s) => s.trackPanelOpen)
  const setTrackPanelOpen = useStore((s) => s.setTrackPanelOpen)
  const updateTrack = useStore((s) => s.updateTrack)
  const muteGroup = useStore((s) => s.muteGroup)
  const setTrackMuteFilter = useStore((s) => s.setTrackMuteFilter)
  const autoMuteNonKeyboard = useStore((s) => s.autoMuteNonKeyboard)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [editorOpen, setEditorOpen] = useState(false)

  // ── Editor closed listener — syncs editorOpen when MIDI Editor window closes
  useEffect(() => {
    if (!window.electronAPI?.onEditorClosed) return
    window.electronAPI.onEditorClosed(() => setEditorOpen(false))
  }, [])

  // ── Open editor — serialises track state and opens MIDI Editor window ─────
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

  // ── Group tracks — partition by GM group key, ordered by GROUP_ORDER ──────
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

  // ── isCurrentlyFiltered — true when all DEFAULT_MUTED_GROUPS tracks are muted ──
  const isCurrentlyFiltered = useMemo(() => {
    const filterable = tracks.filter(t => !t.isDrum && DEFAULT_MUTED_GROUPS.has(t.group ?? ''))
    return filterable.length > 0 && filterable.every(t => t.muted)
  }, [tracks])

  // ── Toggle group collapse — adds/removes group key from collapsed set ─────
  const toggleGroupCollapse = (group: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      if (next.has(group)) next.delete(group); else next.add(group)
      return next
    })
  }

  // ── isGroupMuted — true when every track in the group is muted ───────────
  const isGroupMuted = (groupKey: string) =>
    tracks.filter(t => t.group === groupKey).every(t => t.muted)

  return (
    <div
      style={{
        width: trackPanelOpen ? 260 : 32,
        background: 'var(--bg-modal)',
        borderLeft: '1px solid var(--border2)',
        transition: 'width 0.2s ease',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        position: 'relative',
      }}
    >
      {/* ── Closed state: 3-icon column ────────────────────────────────────── */}
      {!trackPanelOpen && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          height: '100%', paddingTop: 10,
        }}>
          <button
            onClick={() => setTrackPanelOpen(true)}
            title="Open Tracks"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dimmest)', padding: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
          >
            <AudioLines size={18} />
          </button>
          <button
            onClick={() => useStore.getState().setMixerOpen(true)}
            title="Console"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dimmest)', padding: 4, marginTop: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
          >
            <SlidersVertical size={18} />
          </button>
          <button
            onClick={midi && !editorOpen ? handleOpenEditor : undefined}
            title={!midi ? 'Open a MIDI file first' : editorOpen ? 'MIDI PlaybackEditor is open' : 'Open MIDI Playback Editor'}
            style={{
              background: 'none', border: 'none',
              cursor: !midi || editorOpen ? 'default' : 'pointer',
              color: editorOpen ? 'var(--text-amber)' : !midi ? 'var(--state-disabled)' : 'var(--text-dimmest)',
              padding: 4, marginTop: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (midi && !editorOpen) e.currentTarget.style.color = 'var(--text-amber)' }}
            onMouseLeave={e => { if (midi && !editorOpen) e.currentTarget.style.color = 'var(--text-dimmest)'; else (e.currentTarget as HTMLElement).style.color = editorOpen ? 'var(--text-amber)' : !midi ? 'var(--state-disabled)' : 'var(--text-dimmest)' }}
          >
            <PencilSparkles size={18} />
          </button>
        </div>
      )}

      {trackPanelOpen && (
        <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>

          {/* ── Left icon strip: chevron + coming soon + MIDI editor ──────── */}
          <div style={{
            width: 32, flexShrink: 0,
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            paddingTop: 10,
            borderRight: '1px solid var(--bg-tile)',
          }}>
            <button
              onClick={() => setTrackPanelOpen(false)}
              title="Close Tracks"
              style={{
                background: 'var(--bg-tile)', border: '1px solid var(--border2)', borderRight: 'none',
                borderRadius: '0 4px 4px 0',
                cursor: 'pointer', color: 'var(--text-dimmest)', padding: '4px 5px',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
            >
              <ChevronRight size={15} />
            </button>
            <button
              onClick={() => useStore.getState().setMixerOpen(true)}
              title="Console"
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text-dimmest)', padding: 4, marginTop: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
            >
              <SlidersVertical size={16} />
            </button>
            <button
              onClick={midi && !editorOpen ? handleOpenEditor : undefined}
              title={!midi ? 'Open a MIDI file first' : editorOpen ? 'MIDI Playback Editor is open' : 'Open MIDI Playback Editor'}
              style={{
                background: 'none', border: 'none',
                cursor: !midi || editorOpen ? 'default' : 'pointer',
                color: editorOpen ? 'var(--text-amber)' : !midi ? 'var(--state-disabled)' : 'var(--text-dimmest)',
                padding: 4, marginTop: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (midi && !editorOpen) e.currentTarget.style.color = 'var(--text-amber)' }}
              onMouseLeave={e => { if (midi && !editorOpen) e.currentTarget.style.color = 'var(--text-dimmest)'; else (e.currentTarget as HTMLElement).style.color = editorOpen ? 'var(--text-amber)' : !midi ? 'var(--state-disabled)' : 'var(--text-dimmest)' }}
            >
              <PencilSparkles size={16} />
            </button>
          </div>

          {/* ── Track content ─────────────────────────────────────────────── */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Header */}
          <div style={{
            height: 40, display: 'flex', alignItems: 'center',
            padding: '0 10px 0 14px',
            borderBottom: '1px solid var(--border)', flexShrink: 0,
            gap: 'var(--space-2)',
          }}>
            <AudioLines size={14} style={{ color: 'var(--text-inactive)', flexShrink: 0 }} />
            <span style={{ color: 'var(--text-dimmest)', fontSize: 'var(--text-xs)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
              Tracks
            </span>
            {midi && (
              <>
                <span style={{ color: 'var(--text-inactive)', fontSize: 'var(--text-xs)', fontFamily: 'JetBrains Mono' }}>
                  {tracks.length}
                </span>
                {/* ── Mute-filter quick toggle — visible only when Selective Tracks Playback is on in Settings ── */}
                {autoMuteNonKeyboard && (
                  <button
                    onClick={() => setTrackMuteFilter(!isCurrentlyFiltered)}
                    title={isCurrentlyFiltered ? 'Play all tracks' : 'Play only piano, bass & drums'}
                    style={{
                      marginLeft: 'auto',
                      padding: '2px 7px',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: 'var(--text-amber)',
                      color: '#1a1000',
                      fontSize: 9,
                      fontWeight: 700,
                      fontFamily: 'Inter',
                      letterSpacing: '0.02em',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                      lineHeight: '18px',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                    }}
                  >
                    <svg width="6" height="7" viewBox="0 0 6 7" style={{ marginRight: 3, flexShrink: 0 }}><polygon points="0,0 6,3.5 0,7" fill="currentColor"/></svg>
                    {isCurrentlyFiltered ? 'Selection' : 'All tracks'}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Track list */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
            {!midi && (
              <div style={{ padding: '12px 14px', fontSize: 'var(--text-xs)', color: '#35354a' }}>
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
                    background: 'var(--bg-row)',
                    borderTop: '1px solid var(--bg-tile)',
                    borderBottom: '1px solid var(--bg-tile)',
                  }}>
                    <button
                      onClick={() => toggleGroupCollapse(key)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-inactive)', padding: 0, display: 'flex', alignItems: 'center' }}
                      title={collapsed ? 'Expand' : 'Collapse'}
                    >
                      <ChevronDown size={11} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }} />
                    </button>

                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dimmest)' }}>
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
                        color: groupMuted ? 'var(--text-amber)' : 'var(--text-muted)',
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
        </div>
      )}
    </div>
  )
}

// ── Track row — three-line layout: name (top, full width) / track# + controls (mid) / ch+prog (bottom)
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
        padding: '6px 10px 5px 14px',
        borderBottom: '1px solid var(--border-row)',
        opacity: dimmed ? 0.45 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {/* ── Row 1: color bar + instrument name spanning full available width ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ width: 3, height: 20, background: track.color, borderRadius: 2, flexShrink: 0, opacity: dimmed ? 0.6 : 1 }} />
        <MarqueeText name={track.gmName} spanStyle={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-muted)' }} />
      </div>

      {/* ── Row 2: track number (left) + M/S/V/K controls (right) ─────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, paddingLeft: 11 }}>
        <span style={{ fontSize: 9, color: 'var(--text-inactive)', fontFamily: 'JetBrains Mono' }}>track {track.index + 1}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <IBtn onClick={onMute} active={track.muted} title={track.muted ? 'Unmute' : 'Mute'} activeColor="var(--status-error)">
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>M</span>
          </IBtn>
          <IBtn onClick={onSolo} active={track.solo} title={track.solo ? 'Unsolo' : 'Solo'} activeColor="#e8a027">
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>S</span>
          </IBtn>
          <IBtn onClick={onVisible} active={!track.visible} title={track.visible ? 'Hide in roll' : 'Show in roll'} activeColor="#6080c0">
            {track.visible ? <Eye size={12} /> : <EyeClosed size={12} />}
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

      {/* ── Row 3: MIDI channel + program ─────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2, paddingLeft: 11 }}>
        <span style={{ fontSize: 9, color: '#454560', fontFamily: 'JetBrains Mono' }}>ch {ch}</span>
        <span style={{ fontSize: 9, color: '#454560', fontFamily: 'JetBrains Mono' }}>·</span>
        <span style={{ fontSize: 9, color: '#454560', fontFamily: 'JetBrains Mono' }}>{prog}</span>
      </div>
    </div>
  )
}

// ── IBtn — icon button for track controls: color driven by active state ───
function IBtn({ children, onClick, active, title, activeColor = 'var(--text-amber)' }: {
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
