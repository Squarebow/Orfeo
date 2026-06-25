/**
 * MIDI Editor — Stage 5f: Track Merge
 *
 * Full replacement. Adds functional merge:
 * - Select 2+ tracks with MERGE checkboxes
 * - Click "Merge selected" → tracks collapse into one merged row
 * - Merged row shows badge, uses first selected track's instrument+color
 * - Undo merge possible before saving
 * - On save, merge is applied in main.ts via note array concatenation
 */

import { useState, useEffect, useRef } from 'react'
import { Check, X, Save, FolderOpen, AlertCircle, ChevronDown, ChevronRight, Search, Merge, Undo2, RotateCcw, Piano, Bell, Church, Guitar, Music2, AudioWaveform, Users, Megaphone, Wind, Feather, Cpu, Globe, Drum, Radio, Waves, Sparkles } from 'lucide-react'

// ─── GM data (same as 5e) ─────────────────────────────────────────────────────
// Lucide icon component map for GM families
const GM_FAMILY_ICONS: Record<string, React.ReactNode> = {
  piano:      <Piano size={15} />,
  chromatic:  <Bell size={15} />,
  organ:      <Church size={15} />,
  guitar:     <Guitar size={15} />,
  bass:       <Music2 size={15} />,
  strings:    <AudioWaveform size={15} />,
  ensemble:   <Users size={15} />,
  brass:      <Megaphone size={15} />,
  reed:       <Wind size={15} />,
  pipe:       <Feather size={15} />,
  synth_lead: <Cpu size={15} />,
  synth_pad:  <Waves size={15} />,
  synth_fx:   <Sparkles size={15} />,
  ethnic:     <Globe size={15} />,
  percussive: <Drum size={15} />,
  sound_fx:   <Radio size={15} />,
}

const GM_FAMILIES: { key: string; label: string; programs: { num: number; name: string }[] }[] = [
  { key: 'piano', label: 'Piano', programs: [
    {num:0,name:'Acoustic Grand Piano'},{num:1,name:'Bright Acoustic Piano'},
    {num:2,name:'Electric Grand Piano'},{num:3,name:'Honky-tonk Piano'},
    {num:4,name:'Electric Piano 1'},{num:5,name:'Electric Piano 2'},
    {num:6,name:'Harpsichord'},{num:7,name:'Clavinet'},
  ]},
  { key: 'chromatic', label: 'Chromatic Perc', programs: [
    {num:8,name:'Celesta'},{num:9,name:'Glockenspiel'},{num:10,name:'Music Box'},
    {num:11,name:'Vibraphone'},{num:12,name:'Marimba'},{num:13,name:'Xylophone'},
    {num:14,name:'Tubular Bells'},{num:15,name:'Dulcimer'},
  ]},
  { key: 'organ', label: 'Organ', programs: [
    {num:16,name:'Drawbar Organ'},{num:17,name:'Percussive Organ'},{num:18,name:'Rock Organ'},
    {num:19,name:'Church Organ'},{num:20,name:'Reed Organ'},{num:21,name:'Accordion'},
    {num:22,name:'Harmonica'},{num:23,name:'Tango Accordion'},
  ]},
  { key: 'guitar', label: 'Guitar', programs: [
    {num:24,name:'Nylon Guitar'},{num:25,name:'Steel Guitar'},{num:26,name:'Jazz Guitar'},
    {num:27,name:'Clean Guitar'},{num:28,name:'Muted Guitar'},{num:29,name:'Overdriven Guitar'},
    {num:30,name:'Distortion Guitar'},{num:31,name:'Guitar Harmonics'},
  ]},
  { key: 'bass', label: 'Bass', programs: [
    {num:32,name:'Acoustic Bass'},{num:33,name:'Finger Bass'},{num:34,name:'Pick Bass'},
    {num:35,name:'Fretless Bass'},{num:36,name:'Slap Bass 1'},{num:37,name:'Slap Bass 2'},
    {num:38,name:'Synth Bass 1'},{num:39,name:'Synth Bass 2'},
  ]},
  { key: 'strings', label: 'Strings', programs: [
    {num:40,name:'Violin'},{num:41,name:'Viola'},{num:42,name:'Cello'},{num:43,name:'Contrabass'},
    {num:44,name:'Tremolo Strings'},{num:45,name:'Pizzicato Strings'},
    {num:46,name:'Orchestral Harp'},{num:47,name:'Timpani'},
  ]},
  { key: 'ensemble', label: 'Ensemble', programs: [
    {num:48,name:'String Ensemble 1'},{num:49,name:'String Ensemble 2'},
    {num:50,name:'Synth Strings 1'},{num:51,name:'Synth Strings 2'},
    {num:52,name:'Choir Aahs'},{num:53,name:'Voice Oohs'},
    {num:54,name:'Synth Voice'},{num:55,name:'Orchestra Hit'},
  ]},
  { key: 'brass', label: 'Brass', programs: [
    {num:56,name:'Trumpet'},{num:57,name:'Trombone'},{num:58,name:'Tuba'},
    {num:59,name:'Muted Trumpet'},{num:60,name:'French Horn'},{num:61,name:'Brass Section'},
    {num:62,name:'Synth Brass 1'},{num:63,name:'Synth Brass 2'},
  ]},
  { key: 'reed', label: 'Reed', programs: [
    {num:64,name:'Soprano Sax'},{num:65,name:'Alto Sax'},{num:66,name:'Tenor Sax'},
    {num:67,name:'Baritone Sax'},{num:68,name:'Oboe'},{num:69,name:'English Horn'},
    {num:70,name:'Bassoon'},{num:71,name:'Clarinet'},
  ]},
  { key: 'pipe', label: 'Pipe', programs: [
    {num:72,name:'Piccolo'},{num:73,name:'Flute'},{num:74,name:'Recorder'},
    {num:75,name:'Pan Flute'},{num:76,name:'Blown Bottle'},{num:77,name:'Shakuhachi'},
    {num:78,name:'Whistle'},{num:79,name:'Ocarina'},
  ]},
  { key: 'synth_lead', label: 'Synth Lead', programs: [
    {num:80,name:'Square Lead'},{num:81,name:'Sawtooth Lead'},{num:82,name:'Calliope Lead'},
    {num:83,name:'Chiff Lead'},{num:84,name:'Charang Lead'},{num:85,name:'Voice Lead'},
    {num:86,name:'Fifths Lead'},{num:87,name:'Bass+Lead'},
  ]},
  { key: 'synth_pad', label: 'Synth Pad', programs: [
    {num:88,name:'New Age Pad'},{num:89,name:'Warm Pad'},{num:90,name:'Polysynth Pad'},
    {num:91,name:'Choir Pad'},{num:92,name:'Bowed Pad'},{num:93,name:'Metallic Pad'},
    {num:94,name:'Halo Pad'},{num:95,name:'Sweep Pad'},
  ]},
  { key: 'synth_fx', label: 'Synth FX', programs: [
    {num:96,name:'Rain FX'},{num:97,name:'Soundtrack FX'},{num:98,name:'Crystal FX'},
    {num:99,name:'Atmosphere FX'},{num:100,name:'Brightness FX'},{num:101,name:'Goblins FX'},
    {num:102,name:'Echoes FX'},{num:103,name:'Sci-fi FX'},
  ]},
  { key: 'ethnic', label: 'Ethnic', programs: [
    {num:104,name:'Sitar'},{num:105,name:'Banjo'},{num:106,name:'Shamisen'},
    {num:107,name:'Koto'},{num:108,name:'Kalimba'},{num:109,name:'Bag Pipe'},
    {num:110,name:'Fiddle'},{num:111,name:'Shanai'},
  ]},
  { key: 'percussive', label: 'Percussive', programs: [
    {num:112,name:'Tinkle Bell'},{num:113,name:'Agogo'},{num:114,name:'Steel Drums'},
    {num:115,name:'Woodblock'},{num:116,name:'Taiko Drum'},{num:117,name:'Melodic Tom'},
    {num:118,name:'Synth Drum'},{num:119,name:'Reverse Cymbal'},
  ]},
  { key: 'sound_fx', label: 'Sound FX', programs: [
    {num:120,name:'Guitar Fret Noise'},{num:121,name:'Breath Noise'},{num:122,name:'Seashore'},
    {num:123,name:'Bird Tweet'},{num:124,name:'Telephone Ring'},{num:125,name:'Helicopter'},
    {num:126,name:'Applause'},{num:127,name:'Gunshot'},
  ]},
]

// ─── Types ────────────────────────────────────────────────────────────────────

interface EditorTrack {
  index: number; name: string; gmName: string; program: number
  group: string; isDrum: boolean; color: string; channel: number; noteCount: number
  included: boolean; mergeSelected: boolean; newProgram: number
  // Merge metadata
  isMerged?: boolean           // this row IS the result of a merge
  mergedFromIndices?: number[] // original track indices that were merged in
  mergedFromNames?: string[]   // display only
}

interface EditorState {
  fileName: string; filePath: string
  rows: EditorTrack[]    // what's currently displayed (may have merged rows)
  outputPath: string
}

// Merge groups sent to main.ts: array of arrays of original indices
type MergeGroup = number[]

function orfeoName(p: string, hasMerge = false) {
  const suffix = hasMerge ? '_ORFEO_MERGED' : '_ORFEO'
  return p.replace(/\.(mid|midi)$/i, suffix + '.$1') || p + suffix
}
function baseName(p: string) { return p.split(/[\\/]/).pop() ?? p }

// ─── Instrument Picker ────────────────────────────────────────────────────────

function InstrumentPicker({ program, isDrum, onChange }: {
  program: number; isDrum: boolean; onChange: (p: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [expandedFamily, setExpandedFamily] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  if (isDrum) return (
    <div style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid #252535', background: '#0d0d16', fontSize: 10, color: '#505068' }}>
      🥁 Standard Drums
    </div>
  )

  const currentName = GM_FAMILIES.flatMap(f => f.programs).find(p => p.num === program)?.name ?? `Program ${program}`
  const searchLower = search.toLowerCase()
  const filteredFamilies = search
    ? GM_FAMILIES.map(f => ({ ...f, programs: f.programs.filter(p => p.name.toLowerCase().includes(searchLower)) })).filter(f => f.programs.length > 0)
    : GM_FAMILIES

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', padding: '4px 8px', borderRadius: 4,
        border: `1px solid ${open ? '#e8a02755' : '#252535'}`,
        background: open ? '#e8a02708' : '#0d0d16',
        color: '#9090a8', fontSize: 10,
        display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentName}</span>
        <ChevronDown size={10} style={{ flexShrink: 0, color: '#505068', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'fixed', zIndex: 9999, width: 220, maxHeight: 320, overflow: 'hidden',
          background: '#13131e', border: '1px solid #2a2a3a', borderRadius: 6,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column',
        }}
        ref={el => {
          if (!el || !ref.current) return
          const r = ref.current.getBoundingClientRect()
          el.style.top = (r.bottom + 4) + 'px'
          el.style.left = Math.max(4, r.left - 60) + 'px'
        }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid #1e1e2c', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: '#0a0a10', border: '1px solid #252535', borderRadius: 4, padding: '3px 6px' }}>
              <Search size={10} style={{ color: '#505068', flexShrink: 0 }} />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                style={{ background: 'none', border: 'none', outline: 'none', color: '#9090a8', fontSize: 10, width: '100%', fontFamily: 'Inter, system-ui' }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredFamilies.map(family => {
              const expanded = search ? true : expandedFamily === family.key
              return (
                <div key={family.key}>
                  <div onClick={() => { if (!search) setExpandedFamily(expanded ? null : family.key) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: '#0e0e16', borderBottom: '1px solid #1a1a26', cursor: search ? 'default' : 'pointer', userSelect: 'none' }}>
                    <span style={{ color: '#707088', display: 'flex', alignItems: 'center' }}>{GM_FAMILY_ICONS[family.key] ?? <Music2 size={12} />}</span>
                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: '#707088', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{family.label}</span>
                    {!search && (expanded ? <ChevronDown size={9} style={{ color: '#505068' }} /> : <ChevronRight size={9} style={{ color: '#404055' }} />)}
                  </div>
                  {expanded && family.programs.map(p => (
                    <div key={p.num} onClick={() => { onChange(p.num); setOpen(false); setSearch('') }}
                      style={{ padding: '5px 10px 5px 28px', fontSize: 10, color: p.num === program ? '#e8a027' : '#707088', background: p.num === program ? '#e8a02710' : 'transparent', cursor: 'pointer', borderLeft: p.num === program ? '2px solid #e8a027' : '2px solid transparent', transition: 'background 0.1s' }}
                      onMouseEnter={e => { if (p.num !== program) e.currentTarget.style.background = '#1a1a26' }}
                      onMouseLeave={e => { if (p.num !== program) e.currentTarget.style.background = 'transparent' }}>
                      {p.name}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Track Row ────────────────────────────────────────────────────────────────

function TrackRow({ track, onToggleIncluded, onToggleMerge, onChangeProgram, onUnmerge }: {
  track: EditorTrack
  onToggleIncluded: () => void
  onToggleMerge: () => void
  onChangeProgram: (p: number) => void
  onUnmerge?: () => void
}) {
  const wasReassigned = track.newProgram !== track.program && !track.isMerged

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '70px 56px 8px 1fr 220px',
      alignItems: 'center', padding: '8px 14px', borderBottom: '1px solid #181822', gap: 6,
      opacity: track.included ? 1 : 0.4,
      background: track.isMerged ? '#101020' : track.mergeSelected ? '#1a1a08' : 'transparent',
      transition: 'opacity 0.15s',
    }}>
      <button onClick={onToggleIncluded} style={{
        width: 24, height: 24, borderRadius: 4,
        border: `1.5px solid ${track.included ? '#3a7a3a' : '#353540'}`,
        background: track.included ? '#0d200d' : 'transparent',
        color: track.included ? '#50c050' : '#353540',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0,
      }}>
        {track.included ? <Check size={13} /> : <X size={12} />}
      </button>

      {/* Merge col: show undo if merged row, else checkbox */}
      {track.isMerged ? (
        <button onClick={onUnmerge} title="Undo merge" style={{
          width: 24, height: 24, borderRadius: 4,
          border: '1.5px solid #4040a0', background: '#10102a',
          color: '#8080cc', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}>
          <Undo2 size={11} />
        </button>
      ) : (
        <button onClick={onToggleMerge} style={{
          width: 24, height: 24, borderRadius: 4,
          border: `1.5px solid ${track.mergeSelected ? '#e8a02755' : '#252535'}`,
          background: track.mergeSelected ? '#e8a02714' : 'transparent',
          color: track.mergeSelected ? '#e8a027' : '#353540',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: 11, fontWeight: 700, flexShrink: 0,
        }}>
          {track.mergeSelected ? '✓' : '+'}
        </button>
      )}

      <div style={{ width: 4, height: 32, background: track.color, borderRadius: 2, flexShrink: 0 }} />

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 500, color: '#9090a8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {track.name}
          </span>
          {track.isMerged && (
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 3, background: '#20204a', color: '#8080cc', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>
              ⊞ merged {track.mergedFromIndices?.length}
            </span>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
          {track.isMerged ? (
            <span style={{ fontSize: 9, color: '#404055', fontFamily: 'JetBrains Mono' }}>
              {track.mergedFromNames?.join(' + ')}
            </span>
          ) : (
            <>
              <span style={{ fontSize: 9, color: '#404055', fontFamily: 'JetBrains Mono' }}>ch {track.channel + 1}</span>
              <span style={{ fontSize: 9, color: '#404055', fontFamily: 'JetBrains Mono' }}>{track.noteCount} notes</span>
              {!track.isDrum && track.newProgram !== track.program && (
                <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                  <span style={{ fontSize: 9, color: '#e8a027', fontFamily: 'JetBrains Mono' }}>✎ reassigned</span>
                  <button
                    onClick={() => onChangeProgram(track.program)}
                    title={`Reset to original: ${track.gmName}`}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#505068', padding: '0 2px', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                    onMouseEnter={e => e.currentTarget.style.color = '#e8a027'}
                    onMouseLeave={e => e.currentTarget.style.color = '#505068'}
                  >
                    <RotateCcw size={9} />
                  </button>
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {track.isDrum ? (
        <div
          title="Not assignable — GM channel 10 is always drums"
          style={{
            padding: '4px 8px', borderRadius: 4,
            border: '1px solid #252535', background: '#0d0d16',
            color: '#505068', fontSize: 10, fontFamily: 'Inter',
            cursor: 'default',
          }}
        >
          Standard Drums
        </div>
      ) : (
        <InstrumentPicker program={track.newProgram} isDrum={false} onChange={onChangeProgram} />
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

// nextId counter for merged rows (they need a stable unique index)
let _mergeIdCounter = 1000

export default function MidiEditor() {
  const [state, setState] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null)

  useEffect(() => {
    window.electronAPI.getMidiEditorData().then((data: any) => {
      if (!data) return
      const rows: EditorTrack[] = data.tracks.map((t: any) => ({
        ...t, included: !t.muted, mergeSelected: false, newProgram: t.program,
      }))
      setState({ fileName: data.fileName, filePath: data.filePath, rows, outputPath: orfeoName(data.filePath, false) })
    })
  }, [])

  if (!state) return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f0f12', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#404055', fontFamily: 'Inter' }}>Loading…</div>
  )

  const update = (index: number, patch: Partial<EditorTrack>) =>
    setState(s => s && ({ ...s, rows: s.rows.map(t => t.index === index ? { ...t, ...patch } : t) }))

  const handleMerge = () => {
    setState(s => {
      if (!s) return s
      const selected = s.rows.filter(t => t.mergeSelected && !t.isMerged)
      if (selected.length < 2) return s
      const first = selected[0]
      const totalNotes = selected.reduce((sum, t) => sum + t.noteCount, 0)
      const mergedRow: EditorTrack = {
        index: _mergeIdCounter++,
        name: selected.map(t => t.name).join(' + '),
        gmName: first.gmName,
        program: first.program,
        group: first.group,
        isDrum: first.isDrum,
        color: first.color,
        channel: first.channel,
        noteCount: totalNotes,
        included: true,
        mergeSelected: false,
        newProgram: first.newProgram,
        isMerged: true,
        mergedFromIndices: selected.map(t => t.index),
        mergedFromNames: selected.map(t => t.name),
      }
      // Remove selected originals, insert merged row where first was
      const firstIdx = s.rows.findIndex(r => r.index === first.index)
      const without = s.rows.filter(r => !selected.some(sel => sel.index === r.index))
      const newRows = [...without.slice(0, firstIdx), mergedRow, ...without.slice(firstIdx)]
      const hasMerge = newRows.some(r => r.isMerged)
      return { ...s, rows: newRows, outputPath: orfeoName(s.filePath, hasMerge) }
    })
  }

  const handleUnmerge = async () => {
    // Reload original track data in-place — no close/reopen needed
    const originalData = await window.electronAPI.getMidiEditorData()
    if (!originalData) return
    const rows: EditorTrack[] = originalData.tracks.map((t: any) => ({
      ...t,
      included: !t.muted,
      mergeSelected: false,
      newProgram: t.program,
      isMerged: false,
      mergedFromIndices: undefined,
      mergedFromNames: undefined,
    }))
    setState(s => s ? {
      ...s,
      rows,
      outputPath: orfeoName(s.filePath, false),
    } : s)
  }

  const mergeCount = state.rows.filter(t => t.mergeSelected && !t.isMerged).length
  const includedCount = state.rows.filter(t => t.included).length

  // Build merge groups for save payload (array of original index arrays)
  const buildMergeGroups = (): MergeGroup[] => {
    return state.rows
      .filter(r => r.isMerged && r.mergedFromIndices)
      .map(r => r.mergedFromIndices!)
  }

  const handleSave = async () => {
    if (includedCount === 0) { setSaveResult({ ok: false, msg: 'Select at least one track.' }); return }
    setSaving(true); setSaveResult(null)
    try {
      // For merged rows: expand back to included individual tracks for the payload
      const includedTracks: { index: number; newProgram: number }[] = []
      for (const row of state.rows.filter(r => r.included)) {
        if (row.isMerged && row.mergedFromIndices) {
          // Each original track gets the merged row's newProgram
          for (const origIdx of row.mergedFromIndices) {
            includedTracks.push({ index: origIdx, newProgram: row.newProgram })
          }
        } else {
          includedTracks.push({ index: row.index, newProgram: row.newProgram })
        }
      }
      const mergeGroups = buildMergeGroups()
      const hasMerge = mergeGroups.length > 0
      const finalOutput = hasMerge && (state.outputPath === orfeoName(state.filePath, false) || state.outputPath === orfeoName(state.filePath, true))
        ? orfeoName(state.filePath, true)
        : state.outputPath
      const result = await window.electronAPI.saveMidiEditor({
        outputPath: finalOutput,
        includedTracks,
        mergeGroups,
      })
      setSaveResult({ ok: result.ok, msg: result.message })
      if (result.ok) setTimeout(() => window.electronAPI.closeMidiEditor?.(), 1200)
    } catch (e: any) {
      setSaveResult({ ok: false, msg: e?.message ?? 'Save failed' })
    }
    setSaving(false)
  }

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#0f0f12', color: '#9090a8', fontFamily: 'Inter, system-ui', display: 'flex', flexDirection: 'column', fontSize: 12, userSelect: 'none' }}>

      {/* Title bar */}
      <div style={{ height: 48, flexShrink: 0, background: '#111116', borderBottom: '1px solid #1e1e28', display: 'flex', alignItems: 'center', padding: '0 16px 0 16px', gap: 10, WebkitAppRegion: 'drag' as any, paddingRight: 160 }}>
        <svg width="22" height="22" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="50" cy="50" r="42" stroke="#e8a027" strokeWidth="9" fill="none"/>
          <line x1="24" y1="37" x2="76" y2="37" stroke="#e8a027" strokeWidth="8" strokeLinecap="round"/>
          <line x1="24" y1="50" x2="76" y2="50" stroke="#e8a027" strokeWidth="8" strokeLinecap="round"/>
          <line x1="24" y1="63" x2="76" y2="63" stroke="#e8a027" strokeWidth="8" strokeLinecap="round"/>
        </svg>
        <span style={{ color: '#e8a027', fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', WebkitAppRegion: 'no-drag' as any }}>MIDI PLAYBACK EDITOR</span>
        <span style={{ color: '#404055' }}>·</span>
        <span style={{ color: '#707088', fontSize: 11, fontFamily: 'JetBrains Mono', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', }}>{state.fileName}</span>
      </div>

      {/* Column headers */}
      <div style={{ display: 'grid', gridTemplateColumns: '70px 56px 8px 1fr 220px', alignItems: 'center', padding: '6px 14px', borderBottom: '1px solid #1a1a26', background: '#0d0d12', flexShrink: 0, gap: 6 }}>
        {['Include', 'Merge', '', 'Track', 'Assign Instrument'].map((h, i) => (
          <span key={i} style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#404055' }}>{h}</span>
        ))}
      </div>

      {/* Track list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {state.rows.map(track => (
          <TrackRow key={track.index} track={track}
            onToggleIncluded={() => update(track.index, { included: !track.included })}
            onToggleMerge={() => update(track.index, { mergeSelected: !track.mergeSelected })}
            onChangeProgram={p => update(track.index, { newProgram: p })}
            onUnmerge={track.isMerged ? () => handleUnmerge() : undefined}
          />
        ))}
      </div>

      {/* Merge toolbar */}
      {mergeCount >= 2 && (
        <div style={{ padding: '8px 14px', background: '#13131e', borderTop: '1px solid #252535', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Merge size={13} style={{ color: '#e8a027', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11, color: '#b0b0cc' }}>{mergeCount} tracks selected for merge</div>
            <div style={{ fontSize: 9, color: '#505068', fontFamily: 'JetBrains Mono', marginTop: 2, lineHeight: 1.4 }}>
              Combines selected tracks into one — all their notes play together on the keyboard.
              Useful when a melody and chords are split across separate tracks.
              To undo: close and reopen the editor (original file is never changed).
            </div>
          </div>
          <button onClick={handleMerge} style={{
            padding: '4px 14px', borderRadius: 4, flexShrink: 0,
            border: '1px solid #e8a02755', background: '#e8a02714',
            color: '#e8a027', fontSize: 11, cursor: 'pointer', fontWeight: 600,
          }}>
            Merge ({mergeCount})
          </button>
        </div>
      )}

      {/* Select all / clear */}
      <div style={{ padding: '6px 14px', borderTop: '1px solid #1a1a26', background: '#0d0d12', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: '#505068', fontFamily: 'JetBrains Mono' }}>{includedCount}/{state.rows.length} included</span>
        <div style={{ flex: 1 }} />
        <TBtn onClick={() => setState(s => s && ({ ...s, rows: s.rows.map(t => ({ ...t, included: true })) }))}>Select all</TBtn>
        <TBtn onClick={() => setState(s => s && ({ ...s, rows: s.rows.map(t => ({ ...t, included: false })) }))}>Clear all</TBtn>
      </div>

      {/* Save footer */}
      <div style={{ padding: '10px 14px 12px', borderTop: '1px solid #1e1e28', background: '#111116', flexShrink: 0 }}>
        <div style={{ fontSize: 10, color: '#505068', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Save as</div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <div style={{ flex: 1, padding: '5px 8px', background: '#0a0a10', border: '1px solid #252535', borderRadius: 4, fontSize: 10, fontFamily: 'JetBrains Mono', color: '#9090a8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={state.outputPath}>{baseName(state.outputPath)}</div>
          <button onClick={async () => {
            const p = await window.electronAPI.saveFileDialog({ defaultPath: state.outputPath, filters: [{ name: 'MIDI Files', extensions: ['mid'] }] })
            if (p) setState(s => s && ({ ...s, outputPath: p }))
          }} style={{ padding: '5px 10px', borderRadius: 4, background: '#1a1a24', border: '1px solid #252535', color: '#707088', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <FolderOpen size={11} /> Browse
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 5, padding: '5px 8px', background: '#0d0d16', borderRadius: 4, border: '1px solid #1e1e2c', marginBottom: 8 }}>
          <AlertCircle size={10} style={{ color: '#505068', flexShrink: 0, marginTop: 1 }} />
          <span style={{ fontSize: 9, color: '#505068', fontFamily: 'JetBrains Mono', lineHeight: 1.5 }}>Original file is never modified. Saved as _ORFEO copy, auto-loads on save.</span>
        </div>
        {saveResult && (
          <div style={{ padding: '5px 8px', borderRadius: 4, marginBottom: 8, background: saveResult.ok ? '#0a200a' : '#200a0a', border: `1px solid ${saveResult.ok ? '#2a5a2a' : '#5a2a2a'}`, fontSize: 10, color: saveResult.ok ? '#60c060' : '#c06060', fontFamily: 'JetBrains Mono' }}>
            {saveResult.ok ? '✓ ' : '✗ '}{saveResult.msg}
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => window.electronAPI.closeMidiEditor?.()} style={{ flex: 1, padding: '7px 0', borderRadius: 5, background: 'transparent', border: '1px solid #252535', color: '#606078', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, padding: '7px 0', borderRadius: 5, background: saving ? '#1a1a24' : '#e8a027', border: 'none', color: saving ? '#505068' : '#0a0a0a', fontSize: 12, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
            <Save size={13} /> {saving ? 'Saving…' : 'Save & Reload'}
          </button>
        </div>
      </div>
    </div>
  )
}

function TBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#505068', fontSize: 10, padding: '2px 6px', borderRadius: 3 }}
      onMouseEnter={e => e.currentTarget.style.color = '#9090a8'}
      onMouseLeave={e => e.currentTarget.style.color = '#505068'}>
      {children}
    </button>
  )
}
