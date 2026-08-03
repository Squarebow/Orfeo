import { useMemo, useState } from 'react'
import { ChevronRight, Eye, Volume2, VolumeX, ChevronDown, AudioLines, SlidersVertical, GripVertical } from 'lucide-react'
import { useStore, DEFAULT_MUTED_GROUPS } from '../../store'
import { GM_GROUPS } from '../../utils/gmInstruments'
import type { TrackState } from '../../types'
import { MarqueeText } from '../MarqueeText'
import { usePlayback } from '../../hooks/usePlayback'
import { NES } from '../../utils/noteEditorState'
import NoteEditorIcon from '../NoteEditorIcon'

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

// ── PencilSparkles icon — open MIDI Playback Editor (not in installed lucide-react v0.503.0, inlined) ──
function PencilSparklesIcon({ size = 16 }: { size?: number }) {
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
  // ── Drag-to-reorder — session-only display order, never written to the file.
  // Piano/keys always stays pinned first (see `grouped` below) — group drag is
  // simply disabled for it, and it's excluded from any custom order snapshot.
  const [customGroupOrder, setCustomGroupOrder] = useState<string[] | null>(null)
  const [customTrackOrder, setCustomTrackOrder] = useState<Record<string, number[]>>({})
  const [draggedGroup, setDraggedGroup] = useState<string | null>(null)
  const [draggedTrack, setDraggedTrack] = useState<{ group: string; index: number } | null>(null)
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null)
  const midiEditorOpen          = useStore((s) => s.midiEditorOpen)
  const noteEditorEnabled       = useStore((s) => s.noteEditorEnabled)
  const noteEditorActive        = useStore((s) => s.noteEditorActive)
  const setNoteEditorActive     = useStore((s) => s.setNoteEditorActive)
  const noteEditorSoloTrackIndex = useStore((s) => s.noteEditorSoloTrackIndex)
  const soloTrackForEdit        = useStore((s) => s.soloTrackForEdit)
  const playbackState           = useStore((s) => s.playbackState)
  const { pause } = usePlayback()

  // ── Open editor — sets store flag; MidiEditor floating modal reads from store ─
  // Gated on confirmPendingImportBeforeEdit: an imported foreign-format file
  // must be saved as a real .mid before any Orfeo editing tool can touch it.
  const handleOpenEditor = async () => {
    if (!midi) return
    const { confirmPendingImportBeforeEdit } = await import('../../utils/foreignFormatImport')
    if (!(await confirmPendingImportBeforeEdit())) return
    useStore.getState().setMidiEditorOpen(true)
  }

  // ── Toggle note edit mode — moved here from TopBar; same gating (only
  // visible/enabled when noteEditorEnabled in Settings, and a file is loaded) ──
  const handleToggleNoteEditor = async () => {
    if (noteEditorActive) {
      setNoteEditorActive(false)
      NES.reset()
      return
    }
    const { confirmPendingImportBeforeEdit } = await import('../../utils/foreignFormatImport')
    if (!(await confirmPendingImportBeforeEdit())) return
    if (playbackState === 'playing') pause()
    NES.reset()
    setNoteEditorActive(true)
  }

  // ── Group tracks — partition by GM group key. Default order is GROUP_ORDER;
  // customGroupOrder/customTrackOrder (drag-reorder, session-only) override it
  // when present. Piano always renders first regardless — pinned, not draggable.
  const grouped = useMemo(() => {
    const map = new Map<string, TrackState[]>()
    for (const track of tracks) {
      const g = track.group ?? 'sfx'
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(track)
    }
    const present = GROUP_ORDER.filter(g => map.has(g))
    const nonPiano = present.filter(g => g !== 'piano')
    const orderedNonPiano = customGroupOrder
      ? [...customGroupOrder.filter(g => nonPiano.includes(g)), ...nonPiano.filter(g => !customGroupOrder!.includes(g))]
      : nonPiano
    const orderedKeys = present.includes('piano') ? ['piano', ...orderedNonPiano] : orderedNonPiano

    return orderedKeys.map(g => {
      const groupTracks = map.get(g)!
      const order = customTrackOrder[g]
      const orderedTracks = order
        ? [...order.map(idx => groupTracks.find(t => t.index === idx)).filter((t): t is TrackState => !!t),
           ...groupTracks.filter(t => !order.includes(t.index))]
        : groupTracks
      return { key: g, label: GM_GROUPS[g]?.label ?? g, tracks: orderedTracks }
    })
  }, [tracks, customGroupOrder, customTrackOrder])

  // ── Group drag-to-reorder — piano is never draggable and never a valid drop
  // target's displacement (it's excluded from the reorderable list entirely,
  // so nothing can end up ahead of it). ────────────────────────────────────
  const reorderGroups = (draggedKey: string, targetKey: string) => {
    if (draggedKey === targetKey || draggedKey === 'piano' || targetKey === 'piano') return
    const base = customGroupOrder ?? grouped.filter(g => g.key !== 'piano').map(g => g.key)
    const without = base.filter(k => k !== draggedKey)
    const targetIdx = without.indexOf(targetKey)
    without.splice(targetIdx, 0, draggedKey)
    setCustomGroupOrder(without)
  }

  // ── Track drag-to-reorder within a single group ───────────────────────────
  const reorderTracks = (groupKey: string, draggedIndex: number, targetIndex: number) => {
    if (draggedIndex === targetIndex) return
    const groupTracksNow = grouped.find(g => g.key === groupKey)?.tracks.map(t => t.index) ?? []
    const base = customTrackOrder[groupKey] ?? groupTracksNow
    const without = base.filter(i => i !== draggedIndex)
    const targetIdx = without.indexOf(targetIndex)
    without.splice(targetIdx, 0, draggedIndex)
    setCustomTrackOrder(prev => ({ ...prev, [groupKey]: without }))
  }

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
            onClick={midi && !midiEditorOpen ? handleOpenEditor : undefined}
            title={!midi ? 'Open a MIDI file first' : midiEditorOpen ? 'MIDI PlaybackEditor is open' : 'Open MIDI Playback Editor'}
            style={{
              background: 'none', border: 'none',
              cursor: !midi || midiEditorOpen ? 'default' : 'pointer',
              color: midiEditorOpen ? 'var(--text-amber)' : !midi ? 'var(--state-disabled)' : 'var(--text-dimmest)',
              padding: 4, marginTop: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => { if (midi && !midiEditorOpen) e.currentTarget.style.color = 'var(--text-amber)' }}
            onMouseLeave={e => { if (midi && !midiEditorOpen) e.currentTarget.style.color = 'var(--text-dimmest)'; else (e.currentTarget as HTMLElement).style.color = midiEditorOpen ? 'var(--text-amber)' : !midi ? 'var(--state-disabled)' : 'var(--text-dimmest)' }}
          >
            <PencilSparklesIcon size={18} />
          </button>
          {noteEditorEnabled && midi && (
            <button
              onClick={handleToggleNoteEditor}
              title={noteEditorActive ? 'Exit note edit mode' : 'Enter note edit mode'}
              style={{
                background: 'none', border: 'none', cursor: 'pointer',
                color: noteEditorActive ? 'var(--text-amber)' : 'var(--text-dimmest)',
                padding: 4, marginTop: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (!noteEditorActive) e.currentTarget.style.color = 'var(--text-amber)' }}
              onMouseLeave={e => { if (!noteEditorActive) e.currentTarget.style.color = 'var(--text-dimmest)' }}
            >
              <NoteEditorIcon size={22} />
            </button>
          )}
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
              onClick={midi && !midiEditorOpen ? handleOpenEditor : undefined}
              title={!midi ? 'Open a MIDI file first' : midiEditorOpen ? 'MIDI Playback Editor is open' : 'Open MIDI Playback Editor'}
              style={{
                background: 'none', border: 'none',
                cursor: !midi || midiEditorOpen ? 'default' : 'pointer',
                color: midiEditorOpen ? 'var(--text-amber)' : !midi ? 'var(--state-disabled)' : 'var(--text-dimmest)',
                padding: 4, marginTop: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => { if (midi && !midiEditorOpen) e.currentTarget.style.color = 'var(--text-amber)' }}
              onMouseLeave={e => { if (midi && !midiEditorOpen) e.currentTarget.style.color = 'var(--text-dimmest)'; else (e.currentTarget as HTMLElement).style.color = midiEditorOpen ? 'var(--text-amber)' : !midi ? 'var(--state-disabled)' : 'var(--text-dimmest)' }}
            >
              <PencilSparklesIcon size={16} />
            </button>
            {noteEditorEnabled && midi && (
              <button
                onClick={handleToggleNoteEditor}
                title={noteEditorActive ? 'Exit note edit mode' : 'Enter note edit mode'}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: noteEditorActive ? 'var(--text-amber)' : 'var(--text-dimmest)',
                  padding: 4, marginTop: 8,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => { if (!noteEditorActive) e.currentTarget.style.color = 'var(--text-amber)' }}
                onMouseLeave={e => { if (!noteEditorActive) e.currentTarget.style.color = 'var(--text-dimmest)' }}
              >
                <NoteEditorIcon size={20} />
              </button>
            )}
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
                      padding: '2px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: 'none',
                      background: 'var(--text-amber)',
                      color: 'var(--text-on-amber)',
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
              <div style={{ padding: '12px 14px', fontSize: 'var(--text-xs)', color: 'var(--topbar-timesig-divider)' }}>
                Open a MIDI file to see tracks
              </div>
            )}

            {grouped.map(({ key, label, tracks: groupTracks }) => {
              const collapsed = collapsedGroups.has(key)
              const groupMuted = isGroupMuted(key)
              const isPiano = key === 'piano'
              const handleId = `group:${key}`

              return (
                <div
                  key={key}
                  style={{ marginBottom: 2, opacity: draggedGroup === key ? 0.4 : 1 }}
                  onDragOver={!isPiano ? (e) => e.preventDefault() : undefined}
                  onDrop={!isPiano ? () => { if (draggedGroup) reorderGroups(draggedGroup, key); setDraggedGroup(null) } : undefined}
                >
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
                      draggable={!isPiano}
                      onDragStart={!isPiano ? () => setDraggedGroup(key) : undefined}
                      onDragEnd={() => setDraggedGroup(null)}
                      onMouseEnter={() => setHoveredHandle(handleId)}
                      onMouseLeave={() => setHoveredHandle(h => h === handleId ? null : h)}
                      style={{
                        background: 'none', border: 'none', padding: 0, display: 'flex', alignItems: 'center',
                        color: 'var(--text-inactive)',
                        cursor: isPiano ? 'pointer' : (hoveredHandle === handleId ? 'grab' : 'pointer'),
                      }}
                      title={isPiano ? (collapsed ? 'Expand' : 'Collapse') : (collapsed ? 'Expand (drag to reorder)' : 'Collapse (drag to reorder)')}
                    >
                      {!isPiano && hoveredHandle === handleId
                        ? <GripVertical size={11} />
                        : <ChevronDown size={11} style={{ transform: collapsed ? 'rotate(-90deg)' : 'none', transition: 'transform 0.15s' }} />}
                    </button>

                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dimmest)' }}>
                      {label}
                    </span>

                    {/* ── Collapsed: colored square per track — visual legend only ── */}
                    {collapsed && (
                      <div style={{ display: 'flex', gap: 2, cursor: 'pointer' }} onClick={() => toggleGroupCollapse(key)}>
                        {groupTracks.map(t => (
                          <div key={t.index} title={t.trackName ?? t.gmName}
                            style={{ width: 7, height: 7, borderRadius: 2, background: t.color, flexShrink: 0 }} />
                        ))}
                      </div>
                    )}

                    <span style={{ fontSize: 10, color: 'var(--text-track-count)', fontFamily: 'JetBrains Mono' }}>
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
                        onSoloForEdit={noteEditorActive ? () => soloTrackForEdit(track.index) : undefined}
                        isSoloedForEdit={noteEditorSoloTrackIndex === track.index}
                        isDragging={draggedTrack?.group === key && draggedTrack.index === track.index}
                        isHandleHovered={hoveredHandle === `track:${key}:${track.index}`}
                        onHandleHover={(hovered) => setHoveredHandle(hovered ? `track:${key}:${track.index}` : null)}
                        onDragStart={() => setDraggedTrack({ group: key, index: track.index })}
                        onDragEnd={() => setDraggedTrack(null)}
                        onDragOverRow={(e) => e.preventDefault()}
                        onDropRow={() => { if (draggedTrack && draggedTrack.group === key) reorderTracks(key, draggedTrack.index, track.index); setDraggedTrack(null) }}
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
function TrackRow({
  track, dimmed, onMute, onSolo, onVisible, onKeyboard, onSoloForEdit, isSoloedForEdit,
  isDragging, isHandleHovered, onHandleHover, onDragStart, onDragEnd, onDragOverRow, onDropRow,
}: {
  track: TrackState; dimmed: boolean
  onMute: () => void; onSolo: () => void; onVisible: () => void; onKeyboard: () => void
  onSoloForEdit?: () => void; isSoloedForEdit?: boolean
  isDragging?: boolean; isHandleHovered?: boolean; onHandleHover?: (hovered: boolean) => void
  onDragStart?: () => void; onDragEnd?: () => void
  onDragOverRow?: (e: React.DragEvent) => void; onDropRow?: () => void
}) {
  // Friendly channel/program label
  const ch = (track as any).channel != null ? (track as any).channel + 1 : track.index + 1
  const prog = track.isDrum ? 'drums' : `prog ${track.program + 1}`
  const noteCount = useStore(s => (s.midi as any)?.tracks?.find((t: any) => t.index === track.index)?.notes?.length ?? 0)
  const tooltip = `Track ${track.index + 1} · MIDI channel ${ch} · ${prog}`

  return (
    <div
      title={tooltip}
      onClick={onSoloForEdit}
      onDragOver={onDragOverRow}
      onDrop={onDropRow}
      style={{
        padding: '6px 10px 5px 8px',
        borderBottom: '1px solid var(--border-row)',
        opacity: isDragging ? 0.4 : dimmed ? 0.45 : 1,
        transition: 'opacity 0.15s, background 0.1s',
        cursor: onSoloForEdit ? 'pointer' : 'default',
        background: isSoloedForEdit ? 'var(--accent-amber-selected-bg)' : 'transparent',
        borderLeft: isSoloedForEdit ? '2px solid var(--text-amber)' : '2px solid transparent',
      }}
      onMouseEnter={e => { if (onSoloForEdit && !isSoloedForEdit) (e.currentTarget as HTMLElement).style.background = 'var(--state-row-hover-overlay)' }}
      onMouseLeave={e => { if (onSoloForEdit && !isSoloedForEdit) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
    >
      {/* ── Row 1: drag handle + color bar + instrument name ──────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          draggable
          onDragStart={e => { e.stopPropagation(); onDragStart?.() }}
          onDragEnd={() => onDragEnd?.()}
          onMouseEnter={() => onHandleHover?.(true)}
          onMouseLeave={() => onHandleHover?.(false)}
          onClick={e => e.stopPropagation()}
          title="Drag to reorder"
          style={{
            width: 11, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: isHandleHovered ? 'grab' : 'default',
            color: isHandleHovered ? 'var(--text-inactive)' : 'transparent',
          }}
        >
          <GripVertical size={11} />
        </div>
        <div style={{ width: 3, height: 20, background: track.color, borderRadius: 2, flexShrink: 0, opacity: dimmed ? 0.6 : 1 }} />
        <MarqueeText name={track.trackName ?? track.gmName} spanStyle={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-muted)' }} />
      </div>

      {/* ── Row 2: track number (left) + M/S/V/K controls (right) ─────────── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 3, paddingLeft: 26 }}>
        <span style={{ fontSize: 9, color: 'var(--text-inactive)', fontFamily: 'JetBrains Mono' }}>track {track.index + 1}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
          <IBtn onClick={onMute} active={track.muted} title={track.muted ? 'Unmute' : 'Mute'} activeColor="var(--status-error)">
            <span style={{ fontSize: 'var(--text-xs)', fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>M</span>
          </IBtn>
          <IBtn onClick={onSolo} active={track.solo} title={track.solo ? 'Unsolo' : 'Solo'} activeColor="var(--text-amber)">
            <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'JetBrains Mono', lineHeight: 1 }}>S</span>
          </IBtn>
          <IBtn onClick={onVisible} active={!track.visible} title={track.visible ? 'Hide in roll' : 'Show in roll'} activeColor="var(--icon-visibility-active)">
            {track.visible ? <Eye size={12} /> : <EyeClosed size={12} />}
          </IBtn>
          <IBtn onClick={onKeyboard} active={track.showOnKeyboard} title={track.showOnKeyboard ? 'Lit on keyboard' : 'Not lit on keyboard'} activeColor="var(--text-amber)">
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

      {/* ── Row 3: MIDI channel + program + note count ────────────────────── */}
      <div style={{ display: 'flex', gap: 6, marginTop: 2, paddingLeft: 26 }}>
        <span style={{ fontSize: 9, color: 'var(--text-track-meta)', fontFamily: 'JetBrains Mono' }}>ch {ch}</span>
        <span style={{ fontSize: 9, color: 'var(--text-track-meta)', fontFamily: 'JetBrains Mono' }}>·</span>
        <span style={{ fontSize: 9, color: 'var(--text-track-meta)', fontFamily: 'JetBrains Mono' }}>{prog}</span>
        <span style={{ fontSize: 9, color: 'var(--text-track-meta)', fontFamily: 'JetBrains Mono' }}>·</span>
        <span style={{ fontSize: 9, color: 'var(--text-track-meta)', fontFamily: 'JetBrains Mono' }}>{noteCount} notes</span>
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
      onClick={e => { e.stopPropagation(); onClick() }} title={title}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 22, height: 22, background: 'none', border: 'none', cursor: 'pointer',
        color: active ? activeColor : 'var(--text-icon-inactive)',
        borderRadius: 4, transition: 'color 0.1s',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-icon-hover)' }}
      onMouseLeave={e => { e.currentTarget.style.color = active ? activeColor : 'var(--text-icon-inactive)' }}
    >
      {children}
    </button>
  )
}
