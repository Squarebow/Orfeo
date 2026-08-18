/**
 * MIDI Playback Editor — floating modal (same architecture as ChordExplorer / MixerConsole)
 *
 * Replaces the previous separate BrowserWindow. Reads MIDI and track state directly
 * from the Zustand store; save/split return file data so the renderer reloads inline.
 */

import { useState, useEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { Check, X, Save, FolderOpen, AlertCircle, ChevronDown, ChevronRight, Search, Merge, Split, Undo2, RotateCcw, Piano, Bell, Church, Guitar, Music2, AudioWaveform, Users, Megaphone, Wind, Feather, Cpu, Globe, Drum, Radio, Waves, Sparkles, SwatchBook, Eye, EyeOff, ThumbsUp, ToggleLeft, ToggleRight, AudioLines } from 'lucide-react'
import { confirmDialog } from '../../utils/confirmController'
import { PENCIL_CURSOR } from '../../utils/cursors'
import { TRACK_COLOR_PALETTE, pianoFamilyColor } from '../../utils/colors'
import { modalCloseButtonStyle, modalCloseButtonHoverColor, modalCloseButtonIdleColor } from '../../utils/modalCloseButtonStyle'
import OrfeoMark from '../OrfeoMark'
import { useStore } from '../../store'
import { parseMidiBuffer } from '../../utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from '../../utils/keyDetection'
import { bringToFront, MODAL_BASE_Z } from '../../utils/modalFocus'
import { KEYBOARD_GROUPS } from '../../utils/keyboardGroups'
import { nextOrfeoBaseName } from '../../utils/orfeoVersioning'
import { getHandPreviewStats, getLowConfidencePassages } from '../../utils/handPreview'
import { withHandSuffix } from '../../utils/handMetadata'
import { getGMName, getGMGroup } from '../../utils/gmInstruments'
import { computeTempoKeyPayload } from '../../utils/tempoKeySave'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import Tooltip from '../Tooltip'

const MODAL_W = 980
const MODAL_H = 620

// ── Fixed LH/RH hex — same values as --hand-lh/--hand-rh (src/index.css).
// Literal hex, not the CSS var: this also travels into ORFEO_TRACK_COLOR meta
// on save, which only accepts hex (see midiParser.ts's restore regex). ──────
const HAND_LH_HEX = '#6270A5'
const HAND_RH_HEX = '#CB636C'

// ── Shared footer button widths — Cancel/Save & Reload match each other;
// OK (post-save) matches Show in folder, the button directly above it. ──────
const FOOTER_BTN_W = 140
const SHOW_IN_FOLDER_W = 140

// ── Matches index.css's global ::-webkit-scrollbar width. The column header
// (not scrollable) needs this reserved on its right edge too, or its 1fr
// Track column computes wider than the scrollable list's below it. ──────────
const SCROLLBAR_W = 5

// ─── GM data ──────────────────────────────────────────────────────────────────

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
  index: number; name: string; gmName: string; trackName: string; program: number
  group: string; isDrum: boolean; color: string; colorSource: 'default' | 'palette' | 'custom'
  channel: number; noteCount: number
  included: boolean; mergeSelected: boolean; newProgram: number
  visible: boolean; showOnKeyboard: boolean
  isMerged?: boolean
  mergedFromIndices?: number[]
  mergedFromNames?: string[]
  // ── Staged hand-split — set on both output rows of an in-progress split
  // (see handleSplitConfirm). splitOriginIndex is the source track's editor
  // index on BOTH halves; the LH row also keeps that as its own `index`,
  // the RH row gets a synthetic one (same scheme merged rows already use)
  // so it has its own row identity for color/rename/include. Nothing hits
  // disk until Save & Reload — editor:save resolves these back to raw
  // track indices and does the actual note-splitting in one write. ────────
  splitHand?: 'L' | 'R'
  splitOriginIndex?: number
}

interface EditorState {
  fileName: string; filePath: string
  rows: EditorTrack[]
  outputPath: string
}

type MergeGroup = number[]

// ─── Helpers ──────────────────────────────────────────────────────────────────

// ── Preview only — the actual save (electron/main.ts editor:save) computes
// its own output path with the same rule (src/utils/orfeoVersioning.ts),
// this just keeps what's shown here accurate to that. ─────────────────────
function orfeoName(p: string) {
  const norm = p.replace(/\\/g, '/')
  const slash = norm.lastIndexOf('/')
  const base = norm.substring(slash + 1).replace(/\.midi?$/i, '')
  return `${nextOrfeoBaseName(base)}.mid`
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
    <div style={{ padding: '4px 8px', borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg-modal-header)', fontSize: 10, color: 'var(--text-inactive)' }}>
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
        border: `1px solid ${open ? 'var(--accent-amber-strong)' : 'var(--border2)'}`,
        background: open ? 'var(--accent-amber-subtle)' : 'var(--bg-modal-header)',
        color: 'var(--text-muted)', fontSize: 10,
        display: 'flex', alignItems: 'center', gap: 'var(--space-1)', cursor: 'pointer', textAlign: 'left',
      }}>
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentName}</span>
        <ChevronDown size={10} style={{ flexShrink: 0, color: 'var(--text-inactive)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && createPortal(
        <div
          // Portaled out of the anchor's DOM subtree, so the outside-click
          // handler's `ref.current.contains(target)` check (below) would see
          // every click inside this popup as "outside" and close it
          // immediately — stopping propagation here keeps those clicks from
          // ever reaching the document listener.
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'fixed', zIndex: 50000, width: 220, maxHeight: 320, overflow: 'hidden',
            background: 'var(--bg-modal)', border: '1px solid var(--state-hover-bg)', borderRadius: 6,
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column',
          }}
          ref={el => {
            if (!el || !ref.current) return
            const r = ref.current.getBoundingClientRect()
            el.style.top = (r.bottom + 4) + 'px'
            el.style.left = Math.max(4, r.left - 60) + 'px'
          }}>
          <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bg-field)', border: '1px solid var(--border2)', borderRadius: 4, padding: '3px 6px' }}>
              <Search size={10} style={{ color: 'var(--text-inactive)', flexShrink: 0 }} />
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
                style={{ background: 'none', border: 'none', outline: 'none', color: 'var(--text-muted)', fontSize: 10, width: '100%', fontFamily: 'var(--font-ui)' }} />
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {filteredFamilies.map(family => {
              const expanded = search ? true : expandedFamily === family.key
              return (
                <div key={family.key}>
                  <div onClick={() => { if (!search) setExpandedFamily(expanded ? null : family.key) }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', background: 'var(--bg-row)', borderBottom: '1px solid var(--bg-tile)', cursor: search ? 'default' : 'pointer', userSelect: 'none', transition: 'background 0.1s' }}
                    onMouseEnter={e => { if (!search) e.currentTarget.style.background = 'var(--accent-amber-subtle)' }}
                    onMouseLeave={e => { if (!search) e.currentTarget.style.background = 'var(--bg-row)' }}>
                    <span style={{ color: 'var(--text-dimmest)', display: 'flex', alignItems: 'center' }}>{GM_FAMILY_ICONS[family.key] ?? <Music2 size={12} />}</span>
                    <span style={{ flex: 1, fontSize: 10, fontWeight: 700, color: 'var(--text-dimmest)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{family.label}</span>
                    {!search && (expanded ? <ChevronDown size={9} style={{ color: 'var(--text-inactive)' }} /> : <ChevronRight size={9} style={{ color: 'var(--text-muted)' }} />)}
                  </div>
                  {expanded && family.programs.map(p => (
                    <div key={p.num} onClick={() => { onChange(p.num); setOpen(false); setSearch('') }}
                      style={{ padding: '5px 10px 5px 28px', fontSize: 10, color: p.num === program ? 'var(--text-amber)' : 'var(--text-dimmest)', background: p.num === program ? 'var(--accent-amber-subtle)' : 'transparent', cursor: 'pointer', borderLeft: p.num === program ? '2px solid var(--text-amber)' : '2px solid transparent', transition: 'background 0.1s, color 0.1s' }}
                      onMouseEnter={e => { if (p.num !== program) { e.currentTarget.style.background = 'var(--accent-amber-subtle)'; e.currentTarget.style.color = 'var(--text-amber)' } }}
                      onMouseLeave={e => { if (p.num !== program) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-dimmest)' } }}>
                      {p.name}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

// ─── HSV ↔ Hex utilities ─────────────────────────────────────────────────────

const HEX_RE = /^#[0-9a-fA-F]{6}$/

function hexToHsv(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min
  let h = 0
  if (d > 0) {
    if      (max === r) h = ((g - b) / d + 6) % 6
    else if (max === g) h = (b - r) / d + 2
    else                h = (r - g) / d + 4
    h *= 60
  }
  return [h, max === 0 ? 0 : d / max, max]
}

function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6
    const c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${f(5)}${f(3)}${f(1)}`
}

// ─── HSV Picker (rainbow square + hue slider) ─────────────────────────────────

function HsvPicker({ color, onChange }: { color: string; onChange: (hex: string) => void }) {
  const [hsv, setHsv] = useState<[number, number, number]>(() => hexToHsv(HEX_RE.test(color) ? color : '#e8a027'))
  const svBoxRef  = useRef<HTMLDivElement>(null)
  const hueBoxRef = useRef<HTMLDivElement>(null)
  const dragging  = useRef<'sv' | 'hue' | null>(null)
  const hsvRef    = useRef(hsv)
  hsvRef.current  = hsv

  // ── Sync when color prop changes externally (palette click / hex input) ───────
  const lastEmitted = useRef(color)
  useEffect(() => {
    if (color === lastEmitted.current || !HEX_RE.test(color)) return
    lastEmitted.current = color
    setHsv(hexToHsv(color))
  }, [color])

  const applySv = useCallback((e: MouseEvent) => {
    if (!svBoxRef.current) return
    const r = svBoxRef.current.getBoundingClientRect()
    const s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width))
    const v = Math.max(0, Math.min(1, 1 - (e.clientY - r.top) / r.height))
    const next: [number, number, number] = [hsvRef.current[0], s, v]
    hsvRef.current = next
    setHsv(next)
    const hex = hsvToHex(...next)
    lastEmitted.current = hex
    onChange(hex)
  }, [onChange])

  const applyHue = useCallback((e: MouseEvent) => {
    if (!hueBoxRef.current) return
    const r = hueBoxRef.current.getBoundingClientRect()
    const h = Math.max(0, Math.min(360, ((e.clientX - r.left) / r.width) * 360))
    const next: [number, number, number] = [h, hsvRef.current[1], hsvRef.current[2]]
    hsvRef.current = next
    setHsv(next)
    const hex = hsvToHex(...next)
    lastEmitted.current = hex
    onChange(hex)
  }, [onChange])

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragging.current === 'sv')  applySv(e)
      if (dragging.current === 'hue') applyHue(e)
    }
    const onUp = () => { dragging.current = null }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [applySv, applyHue])

  const [h, s, v] = hsv

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {/* SV square */}
      <div
        ref={svBoxRef}
        onMouseDown={e => { e.preventDefault(); dragging.current = 'sv'; applySv(e.nativeEvent) }}
        style={{ width: '100%', height: 120, position: 'relative', borderRadius: 4, cursor: 'crosshair', userSelect: 'none', background: `hsl(${h}, 100%, 50%)` }}
      >
        <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: 'linear-gradient(to right, #fff, transparent)' }} />
        <div style={{ position: 'absolute', inset: 0, borderRadius: 4, background: 'linear-gradient(to bottom, transparent, #000)' }} />
        <div style={{
          position: 'absolute', left: `${s * 100}%`, top: `${(1 - v) * 100}%`,
          width: 10, height: 10, borderRadius: '50%',
          border: '2px solid var(--text-white)', boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
          transform: 'translate(-50%, -50%)', pointerEvents: 'none',
        }} />
      </div>
      {/* Hue slider */}
      <div
        ref={hueBoxRef}
        onMouseDown={e => { e.preventDefault(); dragging.current = 'hue'; applyHue(e.nativeEvent) }}
        style={{ width: '100%', height: 14, borderRadius: 4, cursor: 'crosshair', userSelect: 'none', position: 'relative', background: 'linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)' }}
      >
        <div style={{
          position: 'absolute', top: '50%', left: `${(h / 360) * 100}%`,
          transform: 'translate(-50%, -50%)',
          width: 14, height: 14, borderRadius: '50%',
          background: `hsl(${h}, 100%, 50%)`,
          border: '2px solid var(--text-white)', boxShadow: '0 0 0 1px rgba(0,0,0,0.6)',
          pointerEvents: 'none',
        }} />
      </div>
    </div>
  )
}

// ─── Color Popover ────────────────────────────────────────────────────────────

function ColorPopover({ trackIndex, trackColor, anchor, onApplyColor, onClose }: {
  trackIndex: number
  trackColor: string
  anchor: DOMRect
  onApplyColor: (trackIndex: number, color: string, source: 'palette' | 'custom') => void
  onClose: () => void
}) {
  const [hexInput, setHexInput]   = useState(trackColor)
  const [hexError, setHexError]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  // ── Close on outside click ───────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [onClose])

  // ── Close on Escape ──────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const handlePaletteClick = (color: string) => {
    setHexInput(color)
    setHexError(false)
    onApplyColor(trackIndex, color, 'palette')
  }

  const handleHexChange = (value: string) => {
    setHexInput(value)
    if (HEX_RE.test(value)) {
      setHexError(false)
      onApplyColor(trackIndex, value, 'custom')
    } else {
      setHexError(true)
    }
  }

  // ── Position: below trigger, flip up near bottom edge ───────────────────────
  const POP_W = 220
  const POP_H = 330
  const left  = Math.min(Math.max(8, anchor.left), window.innerWidth - POP_W - 8)
  const top   = anchor.bottom + 6 + POP_H > window.innerHeight
    ? anchor.top - POP_H - 6
    : anchor.bottom + 6

  const previewColor = HEX_RE.test(hexInput) ? hexInput : trackColor

  return createPortal(
    <div
      ref={ref}
      data-no-drag
      style={{
        position: 'fixed', zIndex: 60000,
        left, top, width: POP_W,
        background: 'var(--bg-modal)',
        border: '1px solid var(--border2)',
        borderRadius: 'var(--radius-md)',
        boxShadow: '0 8px 32px rgba(0,0,0,0.7)',
        padding: 10,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}
    >
      {/* ── Palette grid ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
        {TRACK_COLOR_PALETTE.map(c => (
          <div
            key={c}
            onClick={() => handlePaletteClick(c)}
            title={c}
            style={{
              height: 26, background: c, borderRadius: 3, cursor: 'pointer', boxSizing: 'border-box',
              border: `2px solid ${c === trackColor ? 'var(--text-white)' : 'transparent'}`,
              transition: 'transform 0.1s, border-color 0.1s',
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.1)'; if (c !== trackColor) e.currentTarget.style.borderColor = 'var(--state-hover-border-white)' }}
            onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; if (c !== trackColor) e.currentTarget.style.borderColor = 'transparent' }}
          />
        ))}
      </div>

      {/* ── Rainbow picker ────────────────────────────────────────────────────── */}
      <HsvPicker
        color={previewColor}
        onChange={hex => { setHexInput(hex); setHexError(false); onApplyColor(trackIndex, hex, 'custom') }}
      />

      {/* ── Hex input ─────────────────────────────────────────────────────────── */}
      <div>
        <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
          <div style={{ width: 22, height: 22, background: previewColor, borderRadius: 3, flexShrink: 0, border: '1px solid var(--border2)' }} />
          <input
            value={hexInput}
            onChange={e => handleHexChange(e.target.value)}
            placeholder="#rrggbb"
            spellCheck={false}
            style={{
              flex: 1, background: 'var(--bg-field)',
              border: `1px solid ${hexError ? 'var(--color-input-error)' : 'var(--border2)'}`,
              borderRadius: 3,
              color: hexError ? 'var(--color-input-error)' : 'var(--text-muted)',
              fontSize: 10, fontFamily: 'var(--font-mono)',
              padding: '3px 6px', outline: 'none',
            }}
          />
        </div>
        {hexError && (
          <div style={{ fontSize: 9, color: 'var(--color-input-error)', marginTop: 3 }}>Enter a valid hex (#rrggbb)</div>
        )}
      </div>
    </div>,
    document.body
  )
}

// ─── Track Row ────────────────────────────────────────────────────────────────

// ── Column grid shared by header row and every TrackRow ──────────────────────
// Include | Track | Merge | Split | Color | Piano roll | Keyboard | Assign Instrument
const ROW_COLS = '68px 1fr 44px 44px 44px 92px 92px 190px'

function TrackRow({ track, onToggleIncluded, onToggleMerge, onChangeProgram, onUnmerge, onSplit, onRename, onPickColor, onToggleVisible, onToggleKeyboard, showBottomBorder = true }: {
  track: EditorTrack
  onToggleIncluded: () => void
  onToggleMerge: () => void
  onChangeProgram: (p: number) => void
  onUnmerge?: () => void
  onSplit?: () => void
  onRename: (name: string) => void
  onPickColor: (trackIndex: number, anchorRect: DOMRect) => void
  onToggleVisible: () => void
  onToggleKeyboard: () => void
  // False when a hand-split info row or split preview follows this track —
  // that trailing element carries the border instead, so it groups visually
  // with ITS OWN track instead of reading as belonging to the next one.
  showBottomBorder?: boolean
}) {
  // ── Inline rename state ──────────────────────────────────────────────────────
  const [editingName, setEditingName] = useState(false)
  const [editValue, setEditValue]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => { setEditValue(track.trackName); setEditingName(true) }
  const commitEdit = () => {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== track.trackName) onRename(trimmed)
    setEditingName(false)
  }
  const cancelEdit = () => setEditingName(false)

  useEffect(() => { if (editingName) inputRef.current?.select() }, [editingName])

  return (
    <div style={{
      display: 'grid', gridTemplateColumns: ROW_COLS,
      alignItems: 'center', padding: '8px 14px', borderBottom: showBottomBorder ? '1px solid var(--border-row)' : 'none', gap: 6,
      opacity: track.included ? 1 : 0.4,
      background: track.isMerged ? 'var(--track-merged-row-bg)' : track.mergeSelected ? 'var(--track-mergeselected-row-bg)' : 'transparent',
      transition: 'opacity 0.15s',
    }}>

      {/* ── Col 1: Include ───────────────────────────────────────────────────── */}
      <Tooltip title="Include in save" description="Toggle whether this track is written into the saved file, or dropped from it entirely.">
      <button onClick={onToggleIncluded} style={{
        width: 24, height: 24, borderRadius: 4,
        border: `1.5px solid ${track.included ? 'var(--track-included-border)' : 'var(--track-excluded)'}`,
        background: track.included ? 'var(--track-included-bg)' : 'transparent',
        color: track.included ? 'var(--track-included-color)' : 'var(--track-excluded)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0,
      }}>
        {track.included ? <Check size={13} /> : <X size={12} />}
      </button>
      </Tooltip>

      {/* ── Col 2: Track name + meta ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <Tooltip title="Track color" description="Click to open the color picker for this track." wrapperStyle={{ flexShrink: 0 }}>
        <div
          onClick={e => onPickColor(track.index, e.currentTarget.getBoundingClientRect())}
          style={{ width: 4, height: 32, background: track.color, borderRadius: 2, flexShrink: 0, cursor: 'pointer' }}
        />
        </Tooltip>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {editingName ? (
              <input
                ref={inputRef}
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={commitEdit}
                onKeyDown={e => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') cancelEdit() }}
                data-no-drag
                style={{
                  fontSize: 'var(--text-sm)', fontWeight: 500, fontFamily: 'var(--font-ui)',
                  color: 'var(--text-active)', background: 'var(--bg-row)',
                  border: '1px solid var(--accent-amber-strong)', borderRadius: 3,
                  padding: '1px 5px', outline: 'none', width: '100%',
                }}
              />
            ) : (
              <Tooltip title="Rename" description="Double-click to rename this track." wrapperStyle={{ minWidth: 0, overflow: 'hidden' }}>
              <span
                onDoubleClick={startEdit}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}
                style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: PENCIL_CURSOR, transition: 'color 0.12s' }}
              >
                {track.trackName}
              </span>
              </Tooltip>
            )}
            {track.isMerged && (
              <span style={{ fontSize: 10, padding: '1px 5px', borderRadius: 'var(--radius-sm)', background: 'var(--merge-badge-bg)', color: 'var(--merge-badge-text)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                ⊞ merged {track.mergedFromIndices?.length}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            {track.isMerged ? (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
                {track.mergedFromNames?.join(' + ')}
              </span>
            ) : (
              <>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>ch {track.channel + 1}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{track.noteCount} notes</span>
                {!track.isDrum && track.newProgram !== track.program && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                    <span style={{ fontSize: 9, color: 'var(--text-amber)', fontFamily: 'var(--font-mono)' }}>✎ reassigned</span>
                    <Tooltip title="Reset instrument" description={`Back to the original assignment — ${track.gmName}.`}>
                    <button
                      onClick={() => onChangeProgram(track.program)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-inactive)', padding: '0 2px', display: 'flex', alignItems: 'center', transition: 'color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text-inactive)'}
                    >
                      <RotateCcw size={9} />
                    </button>
                    </Tooltip>
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Col 3: Merge / Unmerge ───────────────────────────────────────────── */}
      {track.isMerged ? (
        <Tooltip title="Undo merge" description="Splits this merged group back into its separate original tracks." wrapperStyle={{ justifySelf: 'start' }}>
        <button onClick={onUnmerge} style={{
          width: 24, height: 24, borderRadius: 4,
          border: '1.5px solid var(--unmerge-border)', background: 'var(--unmerge-bg)',
          color: 'var(--merge-badge-text)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}>
          <Undo2 size={11} />
        </button>
        </Tooltip>
      ) : track.splitHand ? (
        <Tooltip title="Can't merge yet" description="Freshly split tracks can't be merged again in the same session — save first." wrapperStyle={{ justifySelf: 'start' }}>
        <div style={{
          width: 24, height: 24, borderRadius: 4,
          border: '1.5px solid var(--border2)', opacity: 0.3,
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
        }}>
          <Merge size={11} />
        </div>
        </Tooltip>
      ) : (
        <Tooltip title="Select for merge" description="Select two or more tracks, then merge them into one." wrapperStyle={{ justifySelf: 'start' }}>
        <button
          onClick={onToggleMerge}
          style={{
            width: 24, height: 24, borderRadius: 4,
            border: `1.5px solid ${track.mergeSelected ? 'var(--accent-amber-strong)' : 'var(--border2)'}`,
            background: track.mergeSelected ? 'var(--accent-amber-medium)' : 'transparent',
            color: track.mergeSelected ? 'var(--text-amber)' : 'var(--text-dim-control)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, transition: 'border-color 0.12s, color 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--unmerge-border)'; e.currentTarget.style.color = 'var(--merge-badge-text)' }}
          onMouseLeave={e => {
            e.currentTarget.style.borderColor = track.mergeSelected ? 'var(--accent-amber-strong)' : 'var(--border2)'
            e.currentTarget.style.color = track.mergeSelected ? 'var(--text-amber)' : 'var(--text-dim-control)'
          }}
        >
          <Merge size={11} />
        </button>
        </Tooltip>
      )}

      {/* ── Col 4: Split — only for splittable tracks ─────────────────────────── */}
      {onSplit && !track.isMerged ? (
        <Tooltip title="Split hands" description="Splits this keyboard track into separate Left Hand / Right Hand tracks." wrapperStyle={{ justifySelf: 'start' }}>
        <button
          onClick={onSplit}
          style={{
            width: 24, height: 24, borderRadius: 4,
            border: '1.5px solid var(--border2)', background: 'transparent',
            color: 'var(--text-dim-control)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', flexShrink: 0, transition: 'all 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--accent-amber-strong)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim-control)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
        >
          <Split size={11} />
        </button>
        </Tooltip>
      ) : (
        <div style={{ justifySelf: 'start' }} />
      )}

      {/* ── Col 5: Color picker trigger ──────────────────────────────────────── */}
      <Tooltip title="Track color" description="Opens the color picker for this track." wrapperStyle={{ justifySelf: 'start' }}>
      <button
        onClick={e => onPickColor(track.index, e.currentTarget.getBoundingClientRect())}
        style={{
          width: 24, height: 24, borderRadius: 4,
          border: '1.5px solid var(--border2)', background: 'transparent',
          color: 'var(--text-dim-control)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0, transition: 'all 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.color = track.color; e.currentTarget.style.borderColor = track.color }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim-control)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
      >
        <SwatchBook size={11} />
      </button>
      </Tooltip>

      {/* ── Col 6: Piano roll visibility — persists into the file on save, unlike
          the TrackPanel's matching icon which is session/playback-only. ────── */}
      <Tooltip
        title={track.visible ? 'Visible in roll' : 'Hidden from roll'}
        description="Persists with the saved file, unlike the practice-view toggle in the Tracks panel."
        wrapperStyle={{ justifySelf: 'start' }}
      >
      <button
        onClick={onToggleVisible}
        style={{
          width: 24, height: 24, borderRadius: 4,
          border: `1.5px solid ${track.visible ? 'var(--border2)' : 'var(--icon-visibility-active)'}`,
          background: 'transparent', color: track.visible ? 'var(--text-dim-control)' : 'var(--icon-visibility-active)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        {track.visible ? <Eye size={12} /> : <EyeOff size={12} />}
      </button>
      </Tooltip>

      {/* ── Col 7: Keyboard-lit — same persistence distinction as roll visibility ── */}
      <Tooltip
        title={track.showOnKeyboard ? 'Lit on keyboard' : 'Not lit on keyboard'}
        description="Persists with the saved file, same as the piano-roll visibility toggle."
        wrapperStyle={{ justifySelf: 'start' }}
      >
      <button
        onClick={onToggleKeyboard}
        style={{
          width: 24, height: 24, borderRadius: 4,
          border: `1.5px solid ${track.showOnKeyboard ? 'var(--accent-amber-strong)' : 'var(--border2)'}`,
          background: track.showOnKeyboard ? 'var(--accent-amber-medium)' : 'transparent',
          color: track.showOnKeyboard ? 'var(--text-amber)' : 'var(--text-dim-control)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
        }}
      >
        <svg width="13" height="9" viewBox="0 0 13 9" fill="none">
          <rect x="0.5" y="0.5" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="0.9"/>
          <rect x="2.5" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
          <rect x="5"   y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
          <rect x="7.5" y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
          <rect x="10"  y="0.5" width="1.3" height="5" rx="0.4" fill="currentColor"/>
        </svg>
      </button>
      </Tooltip>

      {/* ── Col 8: Assign Instrument ──────────────────────────────────────────── */}
      {track.isDrum ? (
        <Tooltip title="Standard Drums" description="Not assignable — GM channel 10 is always drums.">
        <div
          style={{
            padding: '4px 8px', borderRadius: 4,
            border: '1px solid var(--border2)', background: 'var(--bg-modal-header)',
            color: 'var(--text-inactive)', fontSize: 10, fontFamily: 'var(--font-ui)',
            cursor: 'default',
          }}
        >
          Standard Drums
        </div>
        </Tooltip>
      ) : (
        <InstrumentPicker program={track.newProgram} isDrum={false} onChange={onChangeProgram} />
      )}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

let _mergeIdCounter = 1000

export default function MidiEditor() {
  // ── Store reads ──────────────────────────────────────────────────────────────
  const midi             = useStore((s) => s.midi)
  // ── Display-relevant signature, not the live `tracks` array — same root
  // cause as TrackPanel.tsx/ChannelStrip.tsx/etc: every fader/pan/chorus/
  // reverb drag replaces the whole array, but buildRows() below only reads
  // name/gmName/trackName/program/group/isDrum/color/colorSource/muted/
  // visible/showOnKeyboard, none of which those drags touch. ───────────────
  const trackSignature = useStore((s) => s.tracks.map((t) =>
    `${t.index}:${t.name}:${t.gmName}:${t.trackName ?? ''}:${t.program}:${t.group ?? ''}:${t.isDrum}:${t.color}:${t.colorSource ?? ''}:${t.muted}:${t.visible}:${t.showOnKeyboard}`
  ).join('|'))
  const tracks           = useMemo(() => useStore.getState().tracks, [trackSignature])
  const showHandLabels   = useStore((s) => s.showHandLabels)
  const midiEditorOpen   = useStore((s) => s.midiEditorOpen)
  const setMidiEditorOpen = useStore((s) => s.setMidiEditorOpen)
  const saveTempoKeyChangesEnabled = useStore((s) => s.saveTempoKeyChangesEnabled)
  const noteEditorEnabled = useStore((s) => s.noteEditorEnabled)

  // ── Editor state ─────────────────────────────────────────────────────────────
  const [state, setState] = useState<EditorState | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string; filePath?: string } | null>(null)
  const [splitResult, setSplitResult] = useState<{ ok: boolean; msg: string } | null>(null)
  const [pendingSplitIndex, setPendingSplitIndex] = useState<number | null>(null)
  // ── Which tracks' hand-split info row is expanded to show the preview
  // graphic — collapsed by default, per-track, info only (no actions). ──────
  const [expandedInfoRows, setExpandedInfoRows] = useState<Set<number>>(new Set())
  // ── One-slot undo for a STAGED split only — snapshots state.rows immediately
  // before staging replaces one row with two. Nothing has hit disk yet at that
  // point, so undoing is a pure local revert, not a file reload. Once Save &
  // Reload actually commits, the session is done — no post-save "undo the
  // file" affordance (see performSave). ─────────────────────────────────────
  const [preSplitRows, setPreSplitRows] = useState<EditorTrack[] | null>(null)
  // ── Snapshot of each row's color/name/roll/keyboard as of the last time
  // rows were freshly loaded (open, or post-save resync) — buildSaveSummary
  // diffs against this to report only what actually changed this session.
  const originalRowsRef = useRef<Map<number, { color: string; colorSource: EditorTrack['colorSource']; trackName: string; visible: boolean; showOnKeyboard: boolean; program: number }>>(new Map())
  const snapshotRows = (rows: EditorTrack[]) => {
    originalRowsRef.current = new Map(rows.map(r => [r.index, { color: r.color, colorSource: r.colorSource, trackName: r.trackName, visible: r.visible, showOnKeyboard: r.showOnKeyboard, program: r.program }]))
  }
  // ── Cancel — handleApplyColor writes color straight into the live store (so
  // TrackPanel/Keyboard/PianoRoll preview it immediately while the editor is
  // open), unlike every other edit here which stays staged in `state.rows`
  // until Save & Reload. That means closing without saving must explicitly
  // revert any track whose store color drifted from the open-time snapshot —
  // otherwise Cancel silently keeps a color pick it never should have. ──────
  const handleCancel = useCallback(() => {
    originalRowsRef.current.forEach((orig, index) => {
      const track = useStore.getState().tracks.find(t => t.index === index)
      if (track && track.color !== orig.color) {
        useStore.getState().updateTrack(index, { color: orig.color, colorSource: orig.colorSource })
      }
    })
    setMidiEditorOpen(false)
  }, [])
  // ── Z-index — bringToFront on mousedown so last-clicked modal is on top ────
  const [zIndex, setZIndex] = useState(MODAL_BASE_Z)

  // ── Drag state ───────────────────────────────────────────────────────────────
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const panelRef  = useRef<HTMLDivElement>(null)
  const positioned = useRef(false)
  const dragState = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  // ── Mounted only while midiEditorOpen && state (see `if (!midiEditorOpen
  // || !state) return null` below) — always active while this exists. ──────
  useFocusTrap(panelRef, true)

  // ── Build rows from store state ───────────────────────────────────────────────
  const buildRows = useCallback((): EditorTrack[] => {
    if (!midi) return []
    return tracks.map(t => {
      // Parsed (already note-filtered, compacted) track — same index scheme as `t.index`,
      // unlike `_rawMidiTracks` (unfiltered raw array) which landed on the wrong track
      // whenever an earlier raw track had 0 notes, showing a bogus "0 notes" badge.
      const parsedTrack = (midi as any).tracks?.[t.index]
      return {
        index: t.index, name: t.name, gmName: t.gmName, trackName: t.trackName, program: t.program,
        group: t.group ?? '', isDrum: t.isDrum, color: t.color, colorSource: t.colorSource ?? 'default',
        channel: parsedTrack?.channel ?? t.index,
        noteCount: parsedTrack?.notes?.length ?? 0,
        included: !t.muted, mergeSelected: false, newProgram: t.program,
        visible: t.visible, showOnKeyboard: t.showOnKeyboard,
      }
    }).sort((a, b) => {
      const aK = KEYBOARD_GROUPS.has(a.group), bK = KEYBOARD_GROUPS.has(b.group)
      if (aK !== bK) return aK ? -1 : 1
      if (a.isDrum !== b.isDrum) return a.isDrum ? 1 : -1
      if (a.name === 'Left Hand' && b.name === 'Right Hand') return -1
      if (a.name === 'Right Hand' && b.name === 'Left Hand') return 1
      return 0
    })
  }, [midi, tracks])

  // ── Re-initialise state whenever the editor opens ─────────────────────────────
  useEffect(() => {
    if (!midiEditorOpen || !midi) return
    const filePath = (midi as any)._filePath ?? ''
    const rows = buildRows()
    snapshotRows(rows)
    setState({ fileName: midi.fileName, filePath, rows, outputPath: orfeoName(filePath) })
    setSaveResult(null)
    setSplitResult(null)
    setPendingSplitIndex(null)
    setPreSplitRows(null)

    // Centre the modal on first open — horizontally centered on the whole
    // screen (not the piano roll — explicit correction), fixed 120px down
    // from the top of the app window. Clamped so it can never render
    // partially off-screen regardless of window size.
    if (!positioned.current) {
      positioned.current = true
      setPos({
        x: Math.max(0, Math.round((window.innerWidth - MODAL_W) / 2)),
        y: 220,
      })
    }
  }, [midiEditorOpen])

  // ── Keep editor state in sync after a split/save reload while the editor
  // stays open — reloadFile() only updates the global midi/tracks store; it
  // never touched this modal's own `state`, which otherwise stayed pointed at
  // the ORIGINAL file path. That's the real bug: every subsequent IPC call
  // (Save, another Split) reads `state.filePath`, so without this, clicking
  // Save after a Split re-reads the pre-split file from disk and silently
  // discards the split — it looks like "reload loads the original file"
  // because it literally does. Deliberately does not touch saveResult/
  // splitResult so the just-set result banner survives this resync.
  useEffect(() => {
    if (!midiEditorOpen || !midi) return
    const filePath = (midi as any)._filePath ?? ''
    const freshRows = buildRows()
    snapshotRows(freshRows)
    setState(s => s ? { ...s, rows: freshRows, filePath, fileName: midi.fileName, outputPath: orfeoName(filePath) } : s)
  }, [midi])

  // ── Drag: mousemove / mouseup ─────────────────────────────────────────────────
  const onMouseMove = useCallback((e: MouseEvent) => {
    const ds = dragState.current
    if (!ds) return
    const panelW = panelRef.current?.offsetWidth ?? MODAL_W
    const panelH = panelRef.current?.offsetHeight ?? MODAL_H
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - panelW, ds.startPosX + (e.clientX - ds.startX))),
      // 44, not 0 — keeps the top edge clear of the 40px titleBarOverlay
      // (electron/main.ts) where Windows draws its own window controls on
      // top of everything in the DOM.
      y: Math.max(44, Math.min(window.innerHeight - panelH, ds.startPosY + (e.clientY - ds.startY))),
    })
  }, [])
  const onMouseUp = useCallback(() => { dragState.current = null }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup', onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  const startMove = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    e.preventDefault()
    dragState.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y }
  }


  // ── Reload file after save/split ─────────────────────────────────────────────
  const reloadFile = useCallback((base64: string, fileName: string, filePath: string) => {
    const binary = atob(base64)
    const bytes  = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const parsed = parseMidiBuffer(bytes.buffer, fileName, filePath)
    useStore.getState().setMidi(parsed)
    const raw = parsed as any
    if (raw._keySignature) {
      useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
    } else {
      useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
    }
  }, [])

  // ── Color popover state ──────────────────────────────────────────────────────
  const [colorPopover, setColorPopover] = useState<{ trackIndex: number; trackColor: string; anchor: DOMRect } | null>(null)

  const openColorPopover = useCallback((trackIndex: number, anchor: DOMRect) => {
    const track = useStore.getState().tracks.find(t => t.index === trackIndex)
    // '#e8a027' fallback must stay a literal hex string, not var(--text-amber) — it seeds
    // ColorPopover's hexInput text state (HEX_RE-tested, rendered into a text <input>), so a
    // CSS var reference would leak as literal text "var(--text-amber)" in the input box.
    setColorPopover({ trackIndex, trackColor: track?.color ?? '#e8a027', anchor })
  }, [])

  const handleApplyColor = useCallback((trackIndex: number, color: string, source: 'palette' | 'custom') => {
    useStore.getState().updateTrack(trackIndex, { color, colorSource: source })
    setState(s => s ? { ...s, rows: s.rows.map(r => r.index === trackIndex ? { ...r, color } : r) } : s)
    setColorPopover(prev => prev && prev.trackIndex === trackIndex ? { ...prev, trackColor: color } : prev)
  }, [])

  // ── Header filename marquee — centered by default; marquee-scrolls left on
  // hover only when the filename is too long to fit its available space (same
  // measured-overflow pattern as Console Mixer's header description). ────────
  const fileNameWrapRef = useRef<HTMLDivElement>(null)
  const fileNameRef     = useRef<HTMLSpanElement>(null)
  const [fileNameOverflow, setFileNameOverflow] = useState(0)
  useEffect(() => {
    const wrap = fileNameWrapRef.current, text = fileNameRef.current
    if (!wrap || !text) return
    const measure = () => setFileNameOverflow(Math.max(0, text.scrollWidth - wrap.clientWidth))
    measure()
    // Self-hosted fonts load async — an initial measure can under-report width
    // against fallback-font metrics before JetBrains Mono swaps in.
    document.fonts?.ready?.then(measure)
    const ro = new ResizeObserver(measure)
    ro.observe(wrap)
    ro.observe(text)
    return () => ro.disconnect()
  }, [state?.fileName])

  // ── Not open and never initialised → nothing to render ───────────────────────
  if (!midiEditorOpen || !state) return null

  // ── Editor operations ─────────────────────────────────────────────────────────

  const update = (index: number, patch: Partial<EditorTrack>) =>
    setState(s => s && ({ ...s, rows: s.rows.map(t => t.index === index ? { ...t, ...patch } : t) }))

  const handleMerge = () => {
    setState(s => {
      if (!s) return s
      const selected = s.rows.filter(t => t.mergeSelected && !t.isMerged && !t.splitHand)
      if (selected.length < 2) return s
      const first = selected[0]
      const totalNotes = selected.reduce((sum, t) => sum + t.noteCount, 0)
      const mergedRow: EditorTrack = {
        index: _mergeIdCounter++,
        name: selected.map(t => t.name).join(' + '),
        gmName: first.gmName, trackName: first.trackName, program: first.program,
        group: first.group, isDrum: first.isDrum, color: first.color, colorSource: first.colorSource, channel: first.channel,
        noteCount: totalNotes, included: true, mergeSelected: false, newProgram: first.newProgram,
        visible: first.visible, showOnKeyboard: first.showOnKeyboard,
        isMerged: true, mergedFromIndices: selected.map(t => t.index), mergedFromNames: selected.map(t => t.name),
      }
      const firstIdx = s.rows.findIndex(r => r.index === first.index)
      const without  = s.rows.filter(r => !selected.some(sel => sel.index === r.index))
      const newRows  = [...without.slice(0, firstIdx), mergedRow, ...without.slice(firstIdx)]
      return { ...s, rows: newRows, outputPath: orfeoName(s.filePath) }
    })
  }

  // ── Unmerge: reset rows from current store state (no IPC needed) ──────────────
  const handleUnmerge = () => {
    const rows = buildRows()
    setState(s => s ? { ...s, rows, outputPath: orfeoName(s.filePath) } : s)
  }

  const mergeCount    = state.rows.filter(t => t.mergeSelected && !t.isMerged).length
  const includedCount = state.rows.filter(t => t.included).length

  const buildMergeGroups = (): MergeGroup[] =>
    state.rows.filter(r => r.isMerged && r.mergedFromIndices).map(r => r.mergedFromIndices!)

  // ── Human summary of this save, for the File info change log — counts
  // only, not a full per-field diff (renames/colors/roll-keyboard toggles
  // aren't individually tracked here; the counts below are what's cheap and
  // honest to report from staged row state alone). ───────────────────────
  const buildSaveSummary = (): string => {
    const excludedCount = state.rows.filter(r => !r.included).length
    const mergedGroups = state.rows.filter(r => r.isMerged && r.mergedFromIndices)
    const mergedTrackCount = mergedGroups.reduce((sum, r) => sum + (r.mergedFromIndices?.length ?? 0), 0)
    const splitOrigins = new Set(state.rows.filter(r => r.splitHand).map(r => r.splitOriginIndex))

    // ── Color/rename/roll/keyboard changes — diffed against originalRowsRef,
    // the snapshot taken the last time rows were freshly loaded (editor open
    // or the post-save resync). Skips split/merged rows: those are already
    // covered by the split/merge phrases above, and a split row's fixed
    // hand color would otherwise ALWAYS read as "changed color" vs. the
    // pre-split single track it came from. ──────────────────────────────────
    let colorChanged = 0, renamed = 0, rollChanged = 0, keyboardChanged = 0, reassigned = 0
    for (const r of state.rows) {
      if (r.isMerged || r.splitHand) continue
      const orig = originalRowsRef.current.get(r.index)
      if (!orig) continue
      if (r.color !== orig.color) colorChanged++
      if (r.trackName !== orig.trackName) renamed++
      if (r.visible !== orig.visible) rollChanged++
      if (r.showOnKeyboard !== orig.showOnKeyboard) keyboardChanged++
      if (r.newProgram !== orig.program) reassigned++
    }

    const s = (n: number) => n === 1 ? '' : 's'
    const parts: string[] = []
    if (splitOrigins.size > 0) parts.push(`split ${splitOrigins.size} track${s(splitOrigins.size)}`)
    if (mergedGroups.length > 0) parts.push(`merged ${mergedTrackCount} tracks into ${mergedGroups.length}`)
    if (excludedCount > 0) parts.push(`excluded ${excludedCount} track${s(excludedCount)}`)
    if (reassigned > 0) parts.push(`reassigned instrument on ${reassigned} track${s(reassigned)}`)
    if (colorChanged > 0) parts.push(`changed color of ${colorChanged} track${s(colorChanged)}`)
    if (renamed > 0) parts.push(`renamed ${renamed} track${s(renamed)}`)
    if (rollChanged > 0) parts.push(`changed roll visibility of ${rollChanged} track${s(rollChanged)}`)
    if (keyboardChanged > 0) parts.push(`changed keyboard lighting of ${keyboardChanged} track${s(keyboardChanged)}`)
    return parts.join(', ') // '' when nothing changed — caller decides the "Saved" fallback
  }

  // ── Save — the ONLY point that writes to disk. Every staged edit (include/
  // exclude, merge, split, rename, recolor, reassign instrument) travels in
  // one payload and lands in exactly one _ORFEO_vN. Once a save SUCCEEDS the
  // footer switches to a single OK button (see render below) — Cancel and
  // Save & Reload disappear so a second click here can't silently mint v2,
  // v3, ad infinitum. A failed save leaves Cancel/Save & Reload in place so
  // the user can fix the problem and retry. ──────────────────────────────────
  const performSave = async () => {
    if (includedCount === 0) { setSaveResult({ ok: false, msg: 'Select at least one track.' }); return }
    setSaving(true); setSaveResult(null)
    try {
      const includedTracks: { index: number; newProgram: number; name?: string; color?: string; splitHand?: 'L' | 'R'; visible?: boolean; showOnKeyboard?: boolean }[] = []
      for (const row of state.rows.filter(r => r.included)) {
        if (row.isMerged && row.mergedFromIndices) {
          row.mergedFromIndices.forEach((origIdx, i) => {
            includedTracks.push({
              index: origIdx, newProgram: row.newProgram,
              ...(i === 0 ? { name: row.trackName, color: row.color, visible: row.visible, showOnKeyboard: row.showOnKeyboard } : {}),
            })
          })
        } else if (row.splitHand) {
          includedTracks.push({ index: row.splitOriginIndex!, newProgram: row.newProgram, name: row.trackName, color: row.color, splitHand: row.splitHand, visible: row.visible, showOnKeyboard: row.showOnKeyboard })
        } else {
          includedTracks.push({ index: row.index, newProgram: row.newProgram, name: row.trackName, color: row.color, visible: row.visible, showOnKeyboard: row.showOnKeyboard })
        }
      }
      const mergeGroups = buildMergeGroups()
      const finalOutput = state.outputPath

      // ── Tempo/Key fold-in — only when the toggle above is on and BPM/
      // transpose are actually dirty; same math as the standalone
      // tempoKey:save path (see tempoKeySave.ts's computeTempoKeyPayload),
      // baked into this one write instead of a second save. ───────────────
      const tempoKeyPayload = useStore.getState().saveTempoKeyChangesEnabled ? computeTempoKeyPayload() : null
      const saveSummary = [buildSaveSummary(), tempoKeyPayload?.summary].filter(Boolean).join(', ') || 'Saved'

      const { rhMaxFingers, lhMaxFingers } = useStore.getState()
      const result = await window.electronAPI.saveMidiEditor({
        filePath: state.filePath, outputPath: finalOutput, includedTracks, mergeGroups,
        rhMaxFingers, lhMaxFingers,
        bpmRatio: tempoKeyPayload?.bpmRatio, transposeSemitones: tempoKeyPayload?.transposeSemitones, finalKey: tempoKeyPayload?.finalKey,
      })
      setSaveResult({ ok: result.ok, msg: result.message, filePath: result.filePath })
      if (result.ok && result.base64 && result.fileName && result.filePath) {
        setPendingSplitIndex(null)
        setPreSplitRows(null)
        reloadFile(result.base64, result.fileName, result.filePath)
        useStore.getState().setLibraryNeedsRefresh(true)
        window.electronAPI.logFileEvent(result.filePath, 'save', saveSummary)
      }
    } catch (e: any) {
      setSaveResult({ ok: false, msg: e?.message ?? 'Save failed' })
    }
    setSaving(false)
  }

  const handleSave = () => performSave()

  // ── Open a track in the Note Editor, solo'd/editable — the split-info
  // row's "fine-tune it yourself" action. Prompts to save first if this
  // session has staged changes (same Save/Discard/Cancel pattern as
  // MixerConsole's requestClose), since opening the Note Editor closes this
  // panel and any staged-but-unsaved edits would otherwise be silently lost.
  // Plain function, not useCallback — it doesn't need referential stability
  // anywhere, and memoizing it was the actual bug: as a `useCallback(..., [])`
  // declared before the early return above, React froze it to the FIRST
  // render's closure — this component's first render has `state === null`
  // (populated by an effect after mount), which hit that early return before
  // ever reaching buildSaveSummary/performSave's declarations below, so the
  // frozen closure referenced them from a call frame that never initialized
  // them — "Cannot access 'buildSaveSummary' before initialization" on every
  // click, permanently, regardless of later renders. A plain function
  // declared here (after both, and after the early return) is recreated
  // fresh every render, so it always closes over already-initialized
  // bindings. ─────────────────────────────────────────────────────────────
  const handleOpenInNoteEditor = async (trackIndex: number) => {
    const summary = buildSaveSummary()
    if (summary) {
      const choice = await confirmDialog({
        title: 'Save changes before editing?',
        message: `This session ${summary}. Save before opening the Note Editor?`,
        buttons: ['Save', 'Discard', 'Cancel'],
      })
      if (choice === 2) return // Cancel — stay in Playback Editor
      if (choice === 0) {
        await performSave()
      } else {
        // Discard — same color-drift revert as handleCancel above
        originalRowsRef.current.forEach((orig, index) => {
          const track = useStore.getState().tracks.find(t => t.index === index)
          if (track && track.color !== orig.color) {
            useStore.getState().updateTrack(index, { color: orig.color, colorSource: orig.colorSource })
          }
        })
      }
    }
    useStore.getState().soloTrackForEdit(trackIndex)
    useStore.getState().setNoteEditorActive(true)
    setMidiEditorOpen(false)
  }

  // ── Split — two-step: first click arms the preview, second STAGES the split
  // locally (no disk write, no IPC). The source row is replaced with two new
  // rows carrying the already-known hand tags from the loaded file's notes —
  // same source the preview panel already reads for its stats. The actual
  // note-splitting happens once, inside Save & Reload's single write. ────────
  const handleSplitRequest = (trackIndex: number) => {
    setPendingSplitIndex(trackIndex)
    setSplitResult(null)
  }

  // ── Undo a STAGED split — restores state.rows from right before staging.
  // Belongs here, not after a save: once Save & Reload actually commits,
  // there's nothing left in this modal to undo (see performSave). ──────────
  const handleUndoSplit = () => {
    if (!preSplitRows) return
    setState(s => s ? { ...s, rows: preSplitRows } : s)
    setPreSplitRows(null)
    setSplitResult(null)
  }

  const handleSplitConfirm = () => {
    if (pendingSplitIndex === null) return
    const trackIndex = pendingSplitIndex
    const parsedTrack = midi?.tracks.find(t => t.index === trackIndex)
    const notes = parsedTrack?.notes ?? []
    const lhCount = notes.filter(n => n.hand === 'L').length
    const rhCount = notes.filter(n => n.hand === 'R').length
    setPendingSplitIndex(null)
    if (lhCount === 0 || rhCount === 0) {
      setSplitResult({ ok: false, msg: 'Could not find two independent hands in this track' })
      return
    }
    setPreSplitRows(state.rows)
    setState(s => {
      if (!s) return s
      const idx = s.rows.findIndex(r => r.index === trackIndex)
      if (idx === -1) return s
      const orig = s.rows[idx]
      // ── "Piano" fallback matches the pre-refactor server-side split: a
      // trackName that's still the default GM name means the file never had
      // a real track-name meta event, so prefix with "Piano" instead of the
      // full GM instrument name ("Acoustic Grand Piano LH" reads worse). A
      // genuinely custom name is kept as-is. ─────────────────────────────
      const baseLabel = orig.trackName && orig.trackName !== orig.gmName ? orig.trackName : 'Piano'
      const lhName = withHandSuffix(baseLabel, 'L')
      const rhName = withHandSuffix(baseLabel, 'R')
      // ── Fixed LH/RH colors (same tokens as the piano roll/keyboard split
      // rendering, src/utils/handColors.ts) — not inherited from the source
      // track, which would make both halves look identical. ───────────────
      const lhRow: EditorTrack = { ...orig, name: 'Left Hand', trackName: lhName, noteCount: lhCount, splitHand: 'L', splitOriginIndex: trackIndex, mergeSelected: false, color: HAND_LH_HEX, colorSource: 'custom' }
      const rhRow: EditorTrack = { ...orig, index: _mergeIdCounter++, name: 'Right Hand', trackName: rhName, noteCount: rhCount, splitHand: 'R', splitOriginIndex: trackIndex, mergeSelected: false, color: HAND_RH_HEX, colorSource: 'custom' }
      const rows = [...s.rows]
      rows.splice(idx, 1, lhRow, rhRow)
      return { ...s, rows, outputPath: orfeoName(s.filePath) }
    })
    setSplitResult({ ok: true, msg: 'Staged — apply with Save & Reload' })
  }

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="MIDI Playback Editor"
      className="orfeo-modal-glow"
      onMouseDown={() => setZIndex(bringToFront())}
      style={{
        position: 'fixed', left: pos.x, top: pos.y,
        width: MODAL_W, height: MODAL_H,
        zIndex,
        background: 'var(--bg-modal-header)',
        border: '1px solid var(--state-hover-bg)',
        borderRadius: 10,
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        color: 'var(--text-muted)', fontFamily: 'var(--font-ui)',
        fontSize: 'var(--text-sm)', userSelect: 'none',
        '--_modal-shadow': 'var(--elevation-modal-heavy)',
      } as CSSProperties}
    >
      {/* ── Draggable title bar ──────────────────────────────────────────────── */}
      <div
        onMouseDown={startMove}
        style={{
          height: 36, flexShrink: 0,
          background: 'var(--bg-modal-header)',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center',
          padding: '0 var(--space-3)', gap: 10,
          cursor: 'grab',
        }}
      >
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', marginRight: 0 }}>
          <OrfeoMark height={22} />
        </div>
        <span style={{ color: 'var(--text-amber)', fontSize: 14, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          MIDI PLAYBACK EDITOR
        </span>
        <span style={{ color: 'var(--text-muted)' }}>·</span>
        <div
          ref={fileNameWrapRef}
          className="orfeo-marquee-track"
          style={{
            flex: 1, minWidth: 0, overflow: 'hidden',
            display: 'flex', justifyContent: fileNameOverflow > 0 ? 'flex-start' : 'center',
          }}
        >
          <span
            ref={fileNameRef}
            className={fileNameOverflow > 0 ? 'orfeo-marquee-text is-overflowing' : 'orfeo-marquee-text'}
            style={{
              color: 'var(--text-dimmest)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)',
              whiteSpace: 'nowrap',
              ...(fileNameOverflow > 0 ? { '--marquee-distance': `-${fileNameOverflow}px` } as CSSProperties : {}),
            }}
          >
            {state.fileName}
          </span>
        </div>
        <button
          data-no-drag="true"
          onClick={handleCancel}
          style={modalCloseButtonStyle}
          onMouseEnter={e => e.currentTarget.style.color = modalCloseButtonHoverColor}
          onMouseLeave={e => e.currentTarget.style.color = modalCloseButtonIdleColor}
        >
          <X size={14} />
        </button>
      </div>

      {/* ── Column headers ───────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: ROW_COLS, alignItems: 'center', padding: `6px ${14 + SCROLLBAR_W}px 6px 14px`, borderBottom: '1px solid var(--bg-tile)', background: 'var(--bg-modal-header)', flexShrink: 0, gap: 6 }}>
        {[
          { label: 'Include', title: 'Include or exclude this track from the saved file' },
          { label: 'Track', title: 'Track name, color swatch, and note info — double-click the name to rename' },
          { label: 'Merge', title: 'Select two or more tracks to merge them into one' },
          { label: 'Split', title: 'Split a keyboard track into separate Left Hand / Right Hand tracks' },
          { label: 'Color', title: 'Track color in the piano roll and keyboard' },
          { label: 'Piano roll', title: 'Show or hide this track in the piano roll — persists with the file' },
          { label: 'Keyboard', title: "Light this track's notes on the keyboard — persists with the file" },
          { label: 'Assign Instrument', title: "Reassign this track's GM instrument" },
        ].map((h, i) => (
          // Explicit justifySelf: a bare <span> grid item is auto-width and
          // stretch-eligible by default, while the icon buttons below have a
          // fixed width and fall back to 'start' — same visual position in
          // theory, but forcing both to the same explicit value removes any
          // gap between how the two element types actually resolve it. Now
          // lives on Tooltip's wrapperStyle instead of the span itself, since
          // wrapping moved the actual grid item one level out.
          <Tooltip key={i} title={h.label} description={h.title} wrapperStyle={{ justifySelf: 'start' }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', lineHeight: '11.25px', cursor: 'default' }}>{h.label}</span>
          </Tooltip>
        ))}
      </div>

      {/* ── Track list — scrollable ───────────────────────────────────────────── */}
      {/* scrollbar-gutter: stable — the column header above this list is NOT
          scrollable and always has the full row width, but this list's own
          available width shrinks by the scrollbar's width (5px, see index.css)
          the moment there are enough tracks to scroll. That made the shared
          1fr Track column compute two different widths between the header row
          and these rows, shifting every fixed column after it (Merge, Split,
          Color, Piano roll, Keyboard) by the scrollbar's width whenever
          scrolling kicked in. Reserving the gutter unconditionally makes this
          list's width constant regardless of track count — matching the
          header's SCROLLBAR_GUTTER right-padding below keeps both grids
          computing the same 1fr width at all times. ───────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarGutter: 'stable' }}>
        {state.rows.map(track => {
        // ── Always-on hand-split info strip — separate from the click-
        // triggered preview below (pendingSplitIndex), which has real
        // Split/Cancel actions. This one is pure passive info: shown for
        // every qualifying track all the time, no button required, pointing
        // at the Note Editor as the way to make it exactly right. Same
        // eligibility as the Split button itself — a single mixed-hand
        // keyboard track, not already a split half. ─────────────────────────
        const splitEligible = !track.isMerged && !track.splitHand && KEYBOARD_GROUPS.has(track.group) && track.name !== 'Left Hand' && track.name !== 'Right Hand'
        const infoNotes = splitEligible && pendingSplitIndex !== track.index
          ? midi?.tracks.find(t => t.index === track.index)?.notes ?? []
          : []
        const infoStats = infoNotes.length > 0 ? getHandPreviewStats(infoNotes) : null
        return (
        <div key={track.index}>
          <TrackRow track={track}
            onToggleIncluded={() => update(track.index, { included: !track.included })}
            onToggleMerge={() => update(track.index, { mergeSelected: !track.mergeSelected })}
            onChangeProgram={p => {
              const newGroup = getGMGroup(p, track.isDrum)
              // Auto-follow the reassigned instrument's color/group too — but only when
              // the track never had a custom color (colorSource 'default'), otherwise a
              // picked instrument would clobber a color the user deliberately chose.
              // Piano-family slot is based on file order among OTHER keyboard-group
              // tracks — same rule midiParser.ts uses on initial load — so reassigning
              // a track into the piano family lands it on the same deterministic
              // blue/pink/amber slot it would get on a fresh reimport.
              const colorPatch = track.colorSource === 'default'
                ? (KEYBOARD_GROUPS.has(newGroup)
                    ? { color: pianoFamilyColor(state.rows.filter(r => r.index < track.index && KEYBOARD_GROUPS.has(r.group)).length) }
                    : { color: TRACK_COLOR_PALETTE[track.index % TRACK_COLOR_PALETTE.length] })
                : {}
              update(track.index, {
                newProgram: p,
                group: newGroup,
                // Auto-follow the reassigned instrument's GM name — but only when
                // the track's name is still its own auto-generated GM name (never
                // been custom-renamed), otherwise a picked instrument leaves the
                // display saying e.g. "Nylon Guitar" for what's now a piano.
                ...(track.trackName === track.gmName ? { trackName: getGMName(p), gmName: getGMName(p) } : {}),
                ...colorPatch,
              })
            }}
            onUnmerge={track.isMerged ? () => handleUnmerge() : undefined}
            onToggleVisible={() => update(track.index, { visible: !track.visible })}
            onToggleKeyboard={() => update(track.index, { showOnKeyboard: !track.showOnKeyboard })}
            onSplit={!track.isMerged && !track.splitHand && KEYBOARD_GROUPS.has(track.group) && track.name !== 'Left Hand' && track.name !== 'Right Hand' ? () => handleSplitRequest(track.index) : undefined}
            onRename={newName => {
              update(track.index, { trackName: newName })
              useStore.getState().updateTrack(track.index, { trackName: newName })
            }}
            onPickColor={openColorPopover}
            showBottomBorder={!(infoStats && infoStats.taggedNotes > 0) && pendingSplitIndex !== track.index}
          />
          {infoStats && infoStats.taggedNotes > 0 && (() => {
            const expanded = expandedInfoRows.has(track.index)
            const passages = getLowConfidencePassages(infoNotes)
            const duration = midi?.duration ?? 0
            const SLATE = 'var(--hand-lh)'
            const AMBER = 'var(--hand-rh)'
            const LOW_CONF = 'var(--status-low-confidence)'
            return (
              <>
                {/* ── Toggle line — grid-aligned to the track row's own columns
                    (ROW_COLS), so it starts exactly under the Track column
                    instead of a hardcoded left-pad guess. Carries the row's
                    bottom border itself when collapsed (TrackRow's own border
                    is suppressed via showBottomBorder — see the map below) so
                    this line visually groups with ITS track, not the next
                    one's. ── */}
                <div style={{
                  display: 'grid', gridTemplateColumns: ROW_COLS, gap: 6,
                  padding: '3px 14px 5px 14px',
                  borderBottom: expanded ? 'none' : '1px solid var(--border-row)',
                }}>
                  <div />{/* empty Col-1 cell — keeps Col-2 content aligned under Track column */}
                  <div style={{ gridColumn: '2 / -1', minWidth: 0, display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)' }}>
                    <Tooltip
                      title={expanded ? 'Hide split preview' : 'Show split preview'}
                      description="Toggle the inline hand-split timeline preview for this track."
                    >
                    <button
                      onClick={() => setExpandedInfoRows(prev => {
                        const next = new Set(prev)
                        if (next.has(track.index)) next.delete(track.index); else next.add(track.index)
                        return next
                      })}
                      style={{ background: 'none', border: 'none', padding: 0, display: 'flex', color: 'var(--text-inactive)', cursor: 'pointer', flexShrink: 0 }}
                    >
                      {expanded ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                    </button>
                    </Tooltip>
                    <span style={{ lineHeight: '11px' }}>
                      {infoStats.confidenceUnknown ? (
                        'Hand split shown is automatic.'
                      ) : infoStats.lowConfidenceCount > 0 ? (
                        // Bright red (matches the closed-eye "hidden" icon) so this
                        // collapsed-row flag reads as an alert at a glance — kept
                        // distinct from the legend/overlay's muted LOW_CONF red below,
                        // which is deliberately quieter since it's always-on chrome.
                        <><span style={{ color: 'var(--status-error-hover)', fontFamily: 'var(--font-ui)' }}>{Math.round(infoStats.lowConfidenceRatio * 100)}% flagged low-confidence</span> — for a perfectly accurate split, edit in Note Editor</>
                      ) : (
                        'Hand split looks accurate — edit in Note Editor to fine-tune'
                      )}
                    </span>
                    <Tooltip
                      title={noteEditorEnabled ? 'Open in Note Editor' : 'Note Editor disabled'}
                      description={noteEditorEnabled
                        ? "Opens this track in the Note Editor, solo'd and editable."
                        : 'Turn on MIDI Note Editor in Settings to use this.'}
                    >
                      <button
                        onClick={() => { if (noteEditorEnabled) handleOpenInNoteEditor(track.index) }}
                        disabled={!noteEditorEnabled}
                        style={{
                          background: 'none', border: 'none', padding: 0, display: 'flex',
                          color: noteEditorEnabled ? 'var(--text-amber)' : 'var(--text-inactive)',
                          opacity: noteEditorEnabled ? 1 : 0.4,
                          cursor: noteEditorEnabled ? 'pointer' : 'default',
                          flexShrink: 0,
                        }}
                      >
                        <AudioLines size={11} />
                      </button>
                    </Tooltip>
                  </div>
                </div>

                {/* ── Expanded preview — info only, no buttons/actions. Same
                    styling/logic as the click-triggered Split preview below
                    (timeline + legend), just without the button row — opens
                    inline, pushing content below it down, not an overlay. ── */}
                {expanded && (
                  <div style={{ padding: '10px 14px', background: 'var(--bg-modal)', borderTop: '1px solid var(--border2)', borderBottom: '1px solid var(--border-row)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {duration > 0 && infoNotes.length > 0 && (
                      <svg viewBox="0 0 1000 40" preserveAspectRatio="none" style={{ width: '100%', height: 40, borderRadius: 4, background: 'var(--bg-deep)' }}>
                        {passages.map((p, i) => (
                          <rect key={`p${i}`}
                            x={(p.start / duration) * 1000} y={0}
                            width={Math.max(2, ((p.end - p.start) / duration) * 1000)} height={40}
                            fill={LOW_CONF} opacity={0.28}
                          />
                        ))}
                        {infoNotes.map((n, i) => (
                          <rect key={i}
                            x={(n.time / duration) * 1000} y={n.hand === 'L' ? 21 : 2}
                            width={1.4} height={17}
                            fill={n.hand === 'L' ? SLATE : n.hand === 'R' ? AMBER : 'var(--hand-note-neutral)'}
                          />
                        ))}
                      </svg>
                    )}
                    <div style={{ display: 'flex', gap: 6, fontSize: 10, lineHeight: '10px', color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: SLATE, display: 'inline-block' }} />Left hand</span>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: AMBER, display: 'inline-block' }} />Right hand</span>
                      {infoStats.lowConfidenceCount > 0 && (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: LOW_CONF, opacity: 0.6, display: 'inline-block' }} />Low-confidence passage</span>
                      )}
                    </div>
                    {/* ── Same tech-info + disclaimer pair as the Split preview
                        below — info only here, no button row. ── */}
                    <div style={{ fontSize: 10, lineHeight: '11px', color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)' }}>
                      {infoStats.taggedNotes} notes tagged — {infoStats.leftCount} left, {infoStats.rightCount} right by hand.{' '}
                      {infoStats.confidenceUnknown
                        ? 'Tags restored from a prior split — confidence not re-evaluated.'
                        : infoStats.lowConfidenceCount > 0
                          ? `${Math.round(infoStats.lowConfidenceRatio * 100)}% fall in a low-confidence passage — check those first.`
                          : 'No passages flagged — split looks reliable.'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-inactive)', fontFamily: 'var(--font-ui)', lineHeight: '12.6px' }}>
                      <AlertCircle size={11} style={{ flexShrink: 0, color: 'var(--text-inactive)' }} />
                      <span>Hand assignment is automated — a guideline, not a verified transcription. Use your ear, especially on flagged passages.</span>
                    </div>
                  </div>
                )}
              </>
            )
          })()}

          {/* ── Hand-split preview — non-destructive review before choosing an
              output mode. Opens directly in this track's own row, not at the
              bottom of the whole panel. ── */}
          {pendingSplitIndex === track.index && (() => {
            const trackName = track.trackName
            const parsedTrack = midi?.tracks.find(t => t.index === track.index)
            const notes = parsedTrack?.notes ?? []
            const stats = getHandPreviewStats(notes)
            const passages = getLowConfidencePassages(notes)
            const duration = midi?.duration ?? 0

            const SLATE = 'var(--hand-lh)'
            const AMBER = 'var(--hand-rh)'
            // Was var(--flag-red), then amber — both read too close to one
            // of the two hand colors. A dark, deeply-muted red (same family
            // as the right-hand pink, much lower contrast/brightness) reads
            // as clearly its own thing instead.
            const LOW_CONF = 'var(--status-low-confidence)'

            return (
              <div style={{ padding: '10px 14px', background: 'var(--bg-modal)', borderTop: '1px solid var(--border2)', borderBottom: '1px solid var(--border2)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <Split size={13} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10, color: 'var(--text-dim)' }}>Hand-split preview — <span style={{ color: track.color }}>"{trackName}"</span></div>
                    <div style={{ fontSize: 9, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)', marginTop: 2 }}>
                      {stats.taggedNotes} notes · {stats.leftCount} left / {stats.rightCount} right
                      {stats.confidenceUnknown ? (
                        <span style={{ color: 'var(--text-inactive)' }}> · tags restored from a prior split — confidence not re-evaluated</span>
                      ) : stats.lowConfidenceCount > 0 ? (
                        <span style={{ color: LOW_CONF }}> · {passages.length} low-confidence passage{passages.length === 1 ? '' : 's'} flagged ({Math.round(stats.lowConfidenceRatio * 100)}% of notes)</span>
                      ) : (
                        <span style={{ color: 'var(--text-inactive)' }}> · no low-confidence passages flagged</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* ── Timeline: each note as a colored tick, low-confidence passages flagged with an amber band ── */}
                {duration > 0 && notes.length > 0 && (
                  <svg viewBox="0 0 1000 40" preserveAspectRatio="none" style={{ width: '100%', height: 40, borderRadius: 4, background: 'var(--bg-deep)' }}>
                    {passages.map((p, i) => (
                      <rect key={`p${i}`}
                        x={(p.start / duration) * 1000} y={0}
                        width={Math.max(2, ((p.end - p.start) / duration) * 1000)} height={40}
                        fill={LOW_CONF} opacity={0.28}
                      />
                    ))}
                    {notes.map((n, i) => (
                      <rect key={i}
                        x={(n.time / duration) * 1000} y={n.hand === 'L' ? 21 : 2}
                        width={1.4} height={17}
                        fill={n.hand === 'L' ? SLATE : n.hand === 'R' ? AMBER : 'var(--hand-note-neutral)'}
                      />
                    ))}
                  </svg>
                )}
                <div style={{ display: 'flex', gap: 6, fontSize: 10, lineHeight: '10px', color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: SLATE, display: 'inline-block' }} />Left hand</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: AMBER, display: 'inline-block' }} />Right hand</span>
                  {stats.lowConfidenceCount > 0 && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: LOW_CONF, opacity: 0.6, display: 'inline-block' }} />Low-confidence passage</span>
                  )}
                </div>

                {/* ── Description (⅔) + actions (⅓), horizontally aligned. The
                    "Don't split" button moved down here from the header row.
                    "Keep one track, hand-colored" removed entirely — not needed
                    under the new logic. ─────────────────────────────────────── */}
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ flex: 2, fontSize: 10, lineHeight: '11px', color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)' }}>
                    {stats.taggedNotes} notes tagged — {stats.leftCount} left, {stats.rightCount} right by hand.{' '}
                    {stats.confidenceUnknown
                      ? 'Tags restored from a prior split — confidence not re-evaluated.'
                      : stats.lowConfidenceCount > 0
                        ? `${Math.round(stats.lowConfidenceRatio * 100)}% fall in a low-confidence passage — check those first.`
                        : 'No passages flagged — split looks reliable.'}
                  </div>
                  <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => setPendingSplitIndex(null)}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: '1px solid var(--text-inactive)', background: 'transparent', color: 'var(--text-default)', fontSize: 'var(--text-xs)', cursor: 'pointer', fontWeight: 600, transition: 'color 0.12s, border-color 0.12s' }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--accent-amber-strong)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-default)'; e.currentTarget.style.borderColor = 'var(--text-inactive)' }}
                    >
                      Don't split
                    </button>
                    <Tooltip
                      title="Stage the split"
                      description="Stages left-hand notes to one track and right-hand notes to another — applies with Save & Reload below, doesn't touch disk yet."
                      wrapperStyle={{ flex: 1 }}
                    >
                    <button
                      onClick={handleSplitConfirm}
                      style={{ flex: 1, padding: '6px 10px', borderRadius: 4, border: '1px solid var(--accent-amber-strong)', background: 'var(--accent-amber-medium)', color: 'var(--text-amber)', fontSize: 'var(--text-xs)', cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}
                    >
                      <Split size={11} /> Split into two tracks
                    </button>
                    </Tooltip>
                  </div>
                </div>

                {/* ── Standing disclaimer, restored — always shown regardless of
                    whether anything got flagged; hand assignment is automated
                    heuristics, never ground truth. ── */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text-inactive)', fontFamily: 'var(--font-ui)', lineHeight: '12.6px' }}>
                  <AlertCircle size={11} style={{ flexShrink: 0, color: 'var(--text-inactive)' }} />
                  <span>Hand assignment is automated — a guideline, not a verified transcription. Use your ear, especially on flagged passages.</span>
                </div>
              </div>
            )
          })()}
        </div>
        )})}
      </div>

      {/* ── Merge toolbar ────────────────────────────────────────────────────── */}
      {mergeCount >= 2 && (
        <div style={{ padding: '8px 14px', background: 'var(--bg-modal)', borderTop: '1px solid var(--border2)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <Merge size={13} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-dim)' }}>{mergeCount} tracks selected for merge</div>
            <div style={{ fontSize: 9, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)', marginTop: 2, lineHeight: 1.4 }}>
              Combines selected tracks into one — all their notes play together on the keyboard.
            </div>
          </div>
          <button onClick={handleMerge} style={{
            padding: '4px 14px', borderRadius: 4, flexShrink: 0,
            border: '1px solid var(--accent-amber-strong)', background: 'var(--accent-amber-medium)',
            color: 'var(--text-amber)', fontSize: 'var(--text-xs)', cursor: 'pointer', fontWeight: 600,
          }}>
            Merge ({mergeCount})
          </button>
        </div>
      )}

      {/* ── Select all / Clear all / count / Save Tempo & Key toggle ─────────── */}
      <div style={{ padding: '6px 14px', borderTop: '1px solid var(--bg-tile)', background: 'var(--bg-modal-header)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <TBtn onClick={() => setState(s => s && ({ ...s, rows: s.rows.map(t => ({ ...t, included: true })) }))}>Select all</TBtn>
        <TBtn onClick={() => setState(s => s && ({ ...s, rows: s.rows.map(t => ({ ...t, included: false })) }))}>Clear all</TBtn>
        <span style={{ fontSize: 10, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)' }}>{includedCount}/{state.rows.length} included</span>
        {/* ── Save Tempo & Key changes — off by default; when on, folds the
            session's BPM/transpose changes into this same Save & Reload
            write instead of needing a separate save (see performSave). A
            hover tooltip carries the explanation — an always-visible two-line
            description here read as a layout bug rather than an aside. ──── */}
        <Tooltip title="Save Tempo & Key changes" description="Folds the session's tempo/key changes into the next Save & Reload, instead of needing a separate save." wrapperStyle={{ marginLeft: 'auto' }}>
        <button
          onClick={() => useStore.getState().setSaveTempoKeyChangesEnabled(!saveTempoKeyChangesEnabled)}
          className="app-no-drag"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer', padding: 2,
          }}
        >
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Save Tempo & Key changes
          </span>
          <span style={{ display: 'flex', color: saveTempoKeyChangesEnabled ? 'var(--text-amber)' : 'var(--text-inactive)', flexShrink: 0 }}>
            {saveTempoKeyChangesEnabled
              ? <ToggleRight size={16} strokeWidth={1.5} />
              : <ToggleLeft  size={16} strokeWidth={1.5} />
            }
          </span>
        </button>
        </Tooltip>
      </div>

      {/* ── Color popover ────────────────────────────────────────────────────── */}
      {colorPopover && (
        <ColorPopover
          trackIndex={colorPopover.trackIndex}
          trackColor={colorPopover.trackColor}
          anchor={colorPopover.anchor}
          onApplyColor={handleApplyColor}
          onClose={() => setColorPopover(null)}
        />
      )}

      {/* ── Save footer ──────────────────────────────────────────────────────── */}
      <div style={{ padding: '10px 14px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-modal-header)', flexShrink: 0 }}>
        <div style={{ fontSize: 10, lineHeight: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Save as</div>
        {/* ── Path field + Browse/Show-in-folder — one row. Browse only makes sense
            before a save has landed; once it has, the field shows the real saved
            path (not just the preview name) with a green accent, and Show in
            folder replaces Browse in the same slot instead of stacking a whole
            extra banner underneath. ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
          <div style={{
            flex: 1, minWidth: 0, overflow: 'hidden',
            padding: '5px 8px', background: 'var(--bg-field)', borderRadius: 4,
            border: `1px solid ${saveResult?.ok ? 'var(--status-success-border)' : 'var(--border2)'}`,
            fontSize: 10, fontFamily: 'var(--font-mono)',
            color: saveResult?.ok ? 'var(--status-success-text)' : 'var(--text-muted)',
            textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {saveResult?.ok && saveResult.filePath ? `✓ ${saveResult.filePath}` : baseName(state.outputPath)}
          </div>
          {saveResult?.ok && saveResult.filePath ? (
            <Tooltip
              title="Show in folder"
              description="Opens Windows Explorer with this exact saved file highlighted — settles any doubt about where it landed."
              wrapperStyle={{ width: SHOW_IN_FOLDER_W, flexShrink: 0 }}
            >
            <button
              onClick={() => window.electronAPI.showItemInFolder(saveResult.filePath!)}
              style={{ width: '100%', padding: '5px 10px', borderRadius: 4, background: 'var(--bg-tile)', border: '1px solid var(--border2)', color: 'var(--text-muted)', fontSize: 12, lineHeight: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-1)', transition: 'all 0.12s', whiteSpace: 'nowrap' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--accent-amber-strong)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
            >
              <FolderOpen size={11} /> Show in folder
            </button>
            </Tooltip>
          ) : (
            <button onClick={async () => {
              const p = await window.electronAPI.saveFileDialog({ defaultPath: state.outputPath, filters: [{ name: 'MIDI Files', extensions: ['mid'] }] })
              if (p) setState(s => s && ({ ...s, outputPath: p }))
            }} style={{ padding: '5px 10px', borderRadius: 4, background: 'var(--bg-tile)', border: '1px solid var(--border2)', color: 'var(--text-muted)', fontSize: 12, lineHeight: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 'var(--space-1)', transition: 'all 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--accent-amber-strong)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
            >
              <FolderOpen size={11} /> Browse
            </button>
          )}
        </div>
        {splitResult && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', borderRadius: 4, marginBottom: 8, background: splitResult.ok ? 'var(--status-success-bg)' : 'var(--status-error-banner-bg)', border: `1px solid ${splitResult.ok ? 'var(--status-success-border)' : 'var(--status-error-banner-border)'}` }}>
            <span style={{ flex: 1, fontSize: 10, color: splitResult.ok ? 'var(--status-success-text)' : 'var(--status-error-banner-text)', fontFamily: 'var(--font-mono)' }}>
              {splitResult.ok ? '✓ ' : '✗ '}{splitResult.msg}
            </span>
            {splitResult.ok && preSplitRows && (
              <button onClick={handleUndoSplit} style={{ padding: '3px 10px', borderRadius: 4, border: '1px solid var(--border2)', background: 'transparent', color: 'var(--text-amber)', fontSize: 10, cursor: 'pointer', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                <Undo2 size={10} /> Undo split
              </button>
            )}
          </div>
        )}
        {/* Error only — a successful save is now shown by the green path field
            above instead of a second banner repeating the same information. */}
        {saveResult && !saveResult.ok && (
          <div style={{ padding: '5px 8px', borderRadius: 4, marginBottom: 8, background: 'var(--status-error-banner-bg)', border: '1px solid var(--status-error-banner-border)', fontSize: 10, color: 'var(--status-error-banner-text)', fontFamily: 'var(--font-mono)' }}>
            ✗ {saveResult.msg}
          </div>
        )}
        {/* ── Info + action buttons — one row, info wraps left, buttons sit right
            at their natural size instead of stretching to fill half the row. ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-start', gap: 5, minWidth: 0 }}>
            <AlertCircle size={10} style={{ color: 'var(--text-inactive)', flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontSize: 10, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)', lineHeight: '13.5px' }}>Original file is never modified. Saved as a new _ORFEO_vN copy in an "Orfeo" folder next to it, auto-loads on save. Only shows up in your Library list if that folder is inside your registered Library Folder.</span>
          </div>
          {saveResult?.ok ? (
            <button
              onClick={() => setMidiEditorOpen(false)}
              style={{ width: SHOW_IN_FOLDER_W, padding: '6px 0', borderRadius: 'var(--radius-md)', background: 'var(--text-amber)', border: 'none', color: 'var(--text-near-black)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexShrink: 0 }}
            >
              <ThumbsUp size={13} /> OK
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
              <button
                onClick={handleCancel}
                style={{ width: FOOTER_BTN_W, padding: '6px 0', borderRadius: 'var(--radius-md)', background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text-muted)', fontSize: 'var(--text-sm)', cursor: 'pointer', transition: 'all 0.12s' }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--accent-amber-strong)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{ width: FOOTER_BTN_W, padding: '6px 0', borderRadius: 'var(--radius-md)', background: saving ? 'var(--bg-tile)' : 'var(--text-amber)', border: 'none', color: saving ? 'var(--text-inactive)' : 'var(--text-near-black)', fontSize: 'var(--text-sm)', fontWeight: 600, cursor: saving ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, whiteSpace: 'nowrap' }}
              >
                <Save size={13} /> {saving ? 'Saving…' : 'Save & Reload'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function TBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} style={{
      background: 'none', border: '1px solid var(--border2)', borderRadius: 'var(--radius-md)',
      cursor: 'pointer', color: 'var(--text-dim-control)', fontSize: 12, lineHeight: '12px', padding: '3px 10px',
      transition: 'all 0.12s',
    }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--accent-amber-strong)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim-control)'; e.currentTarget.style.borderColor = 'var(--border2)' }}>
      {children}
    </button>
  )
}
