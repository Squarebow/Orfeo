import { useState, useMemo, useRef, useEffect, useCallback, useId, type CSSProperties, type ReactNode } from 'react'
import Fuse from 'fuse.js'
import { confirmDiscardDirtyNoteEdits } from '../../utils/noteEditorState'
import { confirmDialog } from '../../utils/confirmController'
import {
  ChevronLeft, ChevronDown, ChevronRight, Music2, Piano, Palette, Columns3, Volume2,
  Music, FolderOpen, Folders, RefreshCw, FileMusic, FileCode2, Guitar, BookOpen, Library, Settings, Info,
  Search, X, Undo2, Upload, ToggleLeft, ToggleRight, CloudDownload, ChevronsDownUp, AudioLines,
  Files, Hand, Repeat, Expand,
} from 'lucide-react'
import { useStore } from '../../store'
import OrfeoMark from '../OrfeoMark'
import type { NoteNaming, KeyboardSize, Accidentals, TranscriptEntry, LibraryFile, HitEffectPattern, SoundfontId, SoundfontInfo, UpdateStatus } from '../../types'
import type { AppTheme } from '../../store'
import { initSamplesEngine, loadSelectedSoundfont } from '../../hooks/useSamplesEngine'
import { MarqueeText } from '../MarqueeText'
import { detectForeignFormat, resolveAndTrackImport, base64ToBytes, confirmPendingImportBeforeSwitch } from '../../utils/foreignFormatImport'
import { parseMidiBuffer } from '../../utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from '../../utils/keyDetection'
import { TRACK_COLOR_PALETTE } from '../../utils/colors'
import FileInfoModal from '../FileInfoModal'
import Tooltip, { TooltipBox, useTooltip } from '../Tooltip'
import { ContextMenu, ContextMenuItem, ContextMenuDivider, ContextMenuLabel } from '../ContextMenu'

// ── GM groups selectable for "Follow Instrument → By group" — same group
// ids TrackPanel.tsx/MixerConsole.tsx already sort tracks by, minus 'drums'
// (following a percussion track for chord identity doesn't make sense). ───
const CHORD_FOLLOW_GROUPS = [
  'piano', 'chromatic', 'organ', 'guitar', 'bass',
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic', 'percussive', 'sfx',
]
function groupLabel(group: string): string {
  return group.split('_').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
}

// ── EyeClosed — custom icon replacing lucide EyeOff throughout settings ───────
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

// ── Spin keyframe for transcript loading animation ────────────────────────────
if (typeof document !== 'undefined' && !document.getElementById('orfeo-transcript-anim')) {
  const s = document.createElement('style')
  s.id = 'orfeo-transcript-anim'
  s.textContent = '@keyframes orfeo-transcript-spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }'
  document.head.appendChild(s)
}

// ─── Shared sub-components ──────────────────────────────────────────────────

// ── BETA badge — inline label pill for settings still being refined ──────────
function BetaBadge() {
  return (
    <span style={{
      fontSize: 8, fontWeight: 700, fontFamily: 'var(--font-ui)',
      letterSpacing: '0.1em', textTransform: 'uppercase',
      color: 'var(--status-error)',
      border: '1px solid var(--status-error)',
      borderRadius: 'var(--radius-sm)',
      padding: '1px 4px',
      lineHeight: 1,
      opacity: 0.85,
      flexShrink: 0,
    }}>
      BETA
    </span>
  )
}

// ── Section header — icon + uppercase group label row ──────────────────────
function SectionHeader({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '5px 10px',
      background: 'var(--bg-row)',
      borderTop: '1px solid var(--bg-tile)',
      borderBottom: '1px solid var(--bg-tile)',
    }}>
      <span style={{ color: 'var(--text-inactive)', display: 'flex', alignItems: 'center' }}>{icon}</span>
      <span style={{
        flex: 1, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-dimmest)',
      }}>
        {label}
      </span>
    </div>
  )
}

// ── Option row — labeled setting block with optional hint text and badge ───
// Supports two variants:
//   Standard:   label + children controls + optional hint below
//   Eye-toggle: name + icon share one flex row; description sits below full-width
function OptionRow({ label, children, hint, hintCenter, badge, eyeToggle, eyeValue, onEyeChange, description, labelSmall }: {
  label: string
  children?: React.ReactNode
  hint?: string
  hintCenter?: boolean
  badge?: React.ReactNode
  eyeToggle?: boolean
  eyeValue?: boolean
  onEyeChange?: (val: boolean) => void
  description?: React.ReactNode
  labelSmall?: boolean
}) {
  // ── Accessible label association — OptionRow's label/control pairing was
  // DOM-proximity only (a known anti-pattern, flagged in the P2 audit
  // finding). A real <label>/htmlFor isn't feasible here since `children`
  // is an opaque, per-call-site control (dropdown, slider, custom button —
  // not always a single labelable element) — role="group"+aria-labelledby
  // gives screen readers the same "this control is named X" association
  // without requiring every call site to thread an id through. ───────────
  const labelId = useId()
  // ── Eye-toggle variant — name left + icon right on one row, description below ──
  if (eyeToggle) {
    return (
      <div role="group" aria-labelledby={labelId} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-row)' }}>
        {/* ── Name + icon row — space-between keeps icon flush to the right edge ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: description ? 4 : 0,
        }}>
          {/* ── Feature name — --text-default (bright) creates hierarchy over dim description;
              labelSmall opts into the muted sub-heading look instead (see "Labels" divider). ── */}
          <div id={labelId} style={{
            fontSize: labelSmall ? 9 : 'var(--text-xs)', color: labelSmall ? 'var(--text-muted)' : 'var(--text-default)',
            fontWeight: labelSmall ? 600 : 500, letterSpacing: labelSmall ? '0.1em' : '0.02em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {label}
            {badge}
          </div>
          {/* ── Toggle icon — same line as name, right-aligned. No tooltip: the
              description line right below already explains the feature, so a
              hover tooltip on the toggle itself was pure redundancy. ── */}
          <button
            onClick={() => onEyeChange?.(!eyeValue)}
            style={{
              background: 'none', border: 'none', cursor: 'pointer', padding: 2,
              color: eyeValue ? 'var(--text-amber)' : 'var(--text-inactive)',
              display: 'flex', alignItems: 'center', flexShrink: 0,
              transition: 'opacity 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
            onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
          >
            {eyeValue
              ? <ToggleRight size={16} strokeWidth={1.5} />
              : <ToggleLeft  size={16} strokeWidth={1.5} />
            }
          </button>
        </div>
        {/* ── Description — --text-xs token (owned here, not by callers) + 85% width clears icon ── */}
        {description && (
          <div style={{
            maxWidth: '85%',
            fontSize: 'var(--text-xs)', color: 'var(--text-faint)',
            lineHeight: 1.5, fontFamily: 'var(--font-ui)', fontStyle: 'italic',
          }}>
            {description}
          </div>
        )}
      </div>
    )
  }

  // ── Standard variant — label bright, hint dim; same token sizes as eye-toggle ──
  return (
    <div role="group" aria-labelledby={labelId} style={{ padding: '10px 14px', borderBottom: '1px solid var(--border-row)' }}>
      {/* ── Label row — --text-default (bright) to match eye-toggle name hierarchy ── */}
      <div id={labelId} style={{ fontSize: labelSmall ? 9 : 'var(--text-xs)', color: labelSmall ? 'var(--text-muted)' : 'var(--text-default)', marginBottom: 6, fontWeight: labelSmall ? 600 : 500, letterSpacing: labelSmall ? '0.1em' : '0.02em', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
        {label}
        {badge}
      </div>
      {children}
      {/* ── Hint — --text-xs token + --text-dimmest matches description hierarchy ── */}
      {hint && (
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', marginTop: 5, fontFamily: 'var(--font-ui)', textAlign: hintCenter ? 'center' : 'left', fontStyle: 'italic' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

// ── Collapsible section — clickable header row (amber icon + label + chevron) that
// mounts/unmounts children; amber color applied once here, propagates to all 7 groups.
function CollapsibleSection({ icon, label, defaultCollapsed = false, collapsed: controlledCollapsed, onToggle, children }: {
  icon: React.ReactNode
  label: string
  defaultCollapsed?: boolean
  collapsed?: boolean
  onToggle?: () => void
  children: React.ReactNode
}) {
  const [internalCollapsed, setInternalCollapsed] = useState(defaultCollapsed)
  const isControlled = controlledCollapsed !== undefined
  const collapsed = isControlled ? controlledCollapsed : internalCollapsed
  const toggle = isControlled ? (onToggle ?? (() => {})) : () => setInternalCollapsed(c => !c)

  return (
    <div>
      {/* ── Header row — click anywhere to expand/collapse ── */}
      <div
        onClick={toggle}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '5px 10px',
          background: 'var(--bg-row)',
          borderTop: '1px solid var(--bg-tile)',
          borderBottom: '1px solid var(--bg-tile)',
          cursor: 'pointer', userSelect: 'none',
          transition: 'background 0.1s',
        }}
        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-tile)'}
        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-row)'}
      >
        {/* ── Group icon — amber ── */}
        <span style={{ color: 'var(--text-amber)', display: 'flex', alignItems: 'center' }}>{icon}</span>
        {/* ── Group label — amber uppercase ── */}
        <span style={{
          flex: 1, fontSize: 12, fontWeight: 700, lineHeight: '12px',
          textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-amber)',
        }}>
          {label}
        </span>
        {/* ── Chevron — amber; down = expanded, right = collapsed ── */}
        {collapsed
          ? <ChevronRight size={11} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
          : <ChevronDown  size={11} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
        }
      </div>
      {/* ── Content — unmounted when collapsed ── */}
      {!collapsed && children}
    </div>
  )
}

// ── Option button — amber-tinted pill toggle for multi-choice settings rows
// activeColor: 'accent' (default, amber) | 'error' (red — used for Hide/EyeOff)
function OptionBtn({ active, onClick, children, title, oneLine, comingSoon, activeColor = 'accent' }: {
  active: boolean; onClick: () => void; children: React.ReactNode
  title?: string; oneLine?: boolean; comingSoon?: boolean; activeColor?: 'accent' | 'error'
}) {
  // ── Active colour tokens — amber for selections, red for the Hide exception ──
  const activeBorder = activeColor === 'error' ? 'var(--status-error)' : 'var(--accent-amber-strong)'
  const activeBg    = activeColor === 'error' ? 'var(--status-error-tint-bg)' : 'var(--accent-amber-medium)'
  const activeText  = activeColor === 'error' ? 'var(--status-error)'    : 'var(--text-amber)'

  const btn = (
    <button
      onClick={comingSoon ? undefined : onClick}
      style={{
        flex: 1, padding: '4px 0', borderRadius: 4,
        border: active ? `1px solid ${activeBorder}` : '1px solid var(--border2)',
        background: active ? activeBg : 'var(--bg-modal)',
        color: active ? activeText : 'var(--text-inactive)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-ui)',
        fontWeight: active ? 700 : 400,
        cursor: comingSoon ? 'default' : 'pointer',
        opacity: comingSoon ? 0.4 : 1,
        transition: 'all 0.12s',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseEnter={e => { if (!active && !comingSoon) e.currentTarget.style.color = 'var(--text-muted)' }}
      onMouseLeave={e => { if (!active && !comingSoon) e.currentTarget.style.color = 'var(--text-inactive)' }}
    >
      {children}
    </button>
  )
  // title is optional and per-call-site free text (sometimes just a short
  // hint, sometimes a longer explanation) — wrap only when present, and
  // reuse it as the tooltip's own title verbatim rather than inventing a
  // separate description, since callers already wrote it as one clause.
  return title ? <Tooltip title={title} oneLine={oneLine} wrapperStyle={{ flex: 1 }}>{btn}</Tooltip> : btn
}

// ── FingerStepper — compact "< 4 >" toggle between the only two valid max-
// finger values (4/5). Replaces two full-width OptionBtn pills with a
// single small control, ~1/3 the footprint. ────────────────────────────────
function FingerStepper({ value, onChange }: { value: 4 | 5; onChange: (v: 4 | 5) => void }) {
  const chevronStyle = (disabled: boolean): React.CSSProperties => ({
    background: 'none', border: 'none', padding: 1, display: 'flex', alignItems: 'center',
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? 'var(--state-disabled)' : 'var(--text-inactive)',
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, border: '1px solid var(--border2)', borderRadius: 4, padding: '1px 3px' }}>
      <button
        onClick={() => onChange(4)}
        disabled={value === 4}
        style={chevronStyle(value === 4)}
        onMouseEnter={e => { if (value !== 4) e.currentTarget.style.color = 'var(--text-amber)' }}
        onMouseLeave={e => { e.currentTarget.style.color = value === 4 ? 'var(--state-disabled)' : 'var(--text-inactive)' }}
      ><ChevronLeft size={11} /></button>
      <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-amber)', minWidth: 10, textAlign: 'center' }}>{value}</span>
      <button
        onClick={() => onChange(5)}
        disabled={value === 5}
        style={chevronStyle(value === 5)}
        onMouseEnter={e => { if (value !== 5) e.currentTarget.style.color = 'var(--text-amber)' }}
        onMouseLeave={e => { e.currentTarget.style.color = value === 5 ? 'var(--state-disabled)' : 'var(--text-inactive)' }}
      ><ChevronRight size={11} /></button>
    </div>
  )
}

// ─── Hit-effect color picker — swatch trigger + in-app popover (hex + palette).
// Deliberately NOT a native <input type="color"> — that opens an OS-level dialog
// which was blurring the app window and closing the whole Settings drawer out
// from under it. Self-contained popover with its own outside-click/Escape close,
// same approach as MidiEditor's track ColorPopover. ─────────────────────────────
function HitEffectColorSwatch({ color, onChange }: { color: string | null; onChange: (c: string) => void }) {
  const [open, setOpen] = useState(false)
  const [hexInput, setHexInput] = useState(color ?? '#e8a027')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', handleDown)
    window.addEventListener('keydown', handleKey)
    return () => { window.removeEventListener('mousedown', handleDown); window.removeEventListener('keydown', handleKey) }
  }, [open])

  const commitHex = (v: string) => {
    setHexInput(v)
    if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v)
  }

  return (
    <div ref={ref} style={{ position: 'relative', flexShrink: 0 }}>
      <Tooltip
        title="Particle color"
        description="Overrides every track's color for the effect flourish — the falling notes and key glow keep their own track colors."
      >
      <button
        onClick={() => { setHexInput(color ?? '#e8a027'); setOpen(o => !o) }}
        style={{
          display: 'flex', alignItems: 'center', gap: 5, padding: 0, marginLeft: 6,
          border: 'none', background: 'none', cursor: 'pointer',
        }}
      >
        <Palette size={13} strokeWidth={1.5} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>Color</span>
        <span style={{
          width: 14, height: 14, borderRadius: 3, flexShrink: 0,
          background: color ?? 'var(--hand-lh)',
          border: '1px solid var(--border2)',
        }} />
      </button>
      </Tooltip>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 20,
          background: 'var(--panel)', border: '1px solid var(--border-popover)', borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--elevation-popover)', padding: 10, width: 150,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 4 }}>
            {TRACK_COLOR_PALETTE.map(c => (
              <div
                key={c}
                onClick={() => { commitHex(c); onChange(c) }}
                title={c}
                style={{
                  height: 22, background: c, borderRadius: 3, cursor: 'pointer', boxSizing: 'border-box',
                  border: `2px solid ${c.toLowerCase() === color?.toLowerCase() ? '#ffffff' : 'transparent'}`,
                }}
              />
            ))}
          </div>
          <input
            value={hexInput}
            onChange={e => commitHex(e.target.value)}
            placeholder="#e8a027"
            aria-label="Hit-effect color, hex value"
            style={{
              width: '100%', padding: '4px 6px', borderRadius: 4, border: '1px solid var(--border2)',
              background: 'var(--bg-modal)', color: 'var(--text-default)', fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)', boxSizing: 'border-box',
            }}
          />
        </div>
      )}
    </div>
  )
}

// ─── Transcript icon — sits in the FileMusic slot; manages its own state ───────
function TranscriptIcon({ filePath, noteNaming, accidentals, addTranscriptEntry, isLoaded }: {
  filePath: string
  noteNaming: NoteNaming
  accidentals: Accidentals
  addTranscriptEntry: (entry: TranscriptEntry) => void
  isLoaded?: boolean
}) {
  const IDLE_TOOLTIP = 'Click to create a chord transcript PDF in Orfeo folder.'
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [tooltip, setTooltip] = useState(IDLE_TOOLTIP)
  const revertRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => { if (revertRef.current) clearTimeout(revertRef.current) }, [])

  // ── Trigger generation — stops row click propagation ─────────────────────
  const handleClick = async () => {
    if (state === 'loading') return
    setState('loading')
    setTooltip('Generating…')
    if (revertRef.current) clearTimeout(revertRef.current)
    try {
      const result = await window.electronAPI.transcriptGenerate(filePath, noteNaming, accidentals)
      if (result.success && result.path) {
        setState('success')
        const fname = result.path.split(/[\\/]/).pop() ?? result.path
        setTooltip(`✓ Saved — ${fname}`)
        const today = new Date()
        addTranscriptEntry({
          midiPath: filePath,
          transcriptPath: result.path,
          date: `${today.getDate()}. ${today.getMonth() + 1}. ${today.getFullYear()}`,
        })
      } else {
        setState('error')
        setTooltip(result.error ?? 'PDF generation failed')
      }
    } catch (err: any) {
      setState('error')
      setTooltip(err?.message ?? 'PDF generation failed')
    }
    revertRef.current = setTimeout(() => {
      setState('idle')
      setTooltip(IDLE_TOOLTIP)
    }, 3000)
  }

  const iconColor = state === 'success' ? 'var(--text-amber)' : state === 'error' ? 'var(--status-error)' : 'var(--text-dimmest)'

  return (
    <Tooltip title={isLoaded && state === 'idle' ? 'Chord transcription active for this file — click to create a PDF' : tooltip} wrapperStyle={{ flexShrink: 0 }}>
    <div
      onClick={(e) => { e.stopPropagation(); void handleClick() }}
      className={isLoaded && state === 'idle' ? 'loop-nudge-blink' : undefined}
      style={{
        cursor: state === 'loading' ? 'wait' : 'pointer',
        color: iconColor,
        display: 'flex', alignItems: 'center', flexShrink: 0,
        transition: 'color 0.2s',
        animation: state === 'loading' ? 'orfeo-transcript-spin 1s linear infinite' : 'none',
      }}
      onMouseEnter={e => { if (state === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--text-amber)' }}
      onMouseLeave={e => { if (state === 'idle') (e.currentTarget as HTMLElement).style.color = 'var(--text-dimmest)' }}
    >
      <FileMusic size={11} strokeWidth={1.5} />
    </div>
    </Tooltip>
  )
}

// ── MarqueeFilename — alias for MarqueeText with library-specific font style ──
const FILENAME_SPAN_STYLE: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }
function MarqueeFilename({ name }: { name: string }) {
  return <MarqueeText name={name} spanStyle={FILENAME_SPAN_STYLE} />
}

// ── SoundfontActionLink — the "remove"/"download" text links in the Sound
// Fonts catalog grid. Each row is a `display:'contents'` div so its 3 cells
// land as direct CSS Grid items — wrapping the link in `<Tooltip>` (a real
// div) would break that passthrough, and even `wrapperStyle={{display:
// 'contents'}}` doesn't work as a fix, since a `display:contents` element
// has no box of its own, so its `getBoundingClientRect()` degenerates to a
// zero-sized rect at the window's origin (tooltip renders in the top-left
// corner). `useTooltip` sidesteps this entirely: no wrapper, ref/hover go
// straight on the real `<button>`, which stays the grid's direct child. ────
function SoundfontActionLink({ label, tooltip, color, onClick }: {
  label: string; tooltip: string; color: string; onClick: () => void
}) {
  const tt = useTooltip<HTMLButtonElement>({ title: tooltip }, { oneLine: true })
  return (
    <>
      <button
        ref={tt.ref}
        onMouseEnter={tt.onMouseEnter}
        onMouseLeave={tt.onMouseLeave}
        onClick={onClick}
        style={{ fontSize: 9, color, fontFamily: 'var(--font-ui)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'right' }}
      >{label}</button>
      {tt.box}
    </>
  )
}

type RowPlacement = 'top' | 'bottom' | 'left' | 'right'

// ── RowTooltip — wraps a full-width list row (file/folder) with its own
// "Right-click for options"-style tooltip, EXCEPT while a nested interactive
// icon inside the row (star, undo) is itself being hovered and showing its
// own tooltip — without this, hovering the star showed BOTH the row's and
// the star's tooltip stacked on top of each other, since the row's own
// hover state stays true the whole time the pointer is anywhere inside it,
// including over a nested child. `children` gets a `suppress` callback to
// pass down to any nested tooltipped icon (see `FavouriteStar`/
// `RowIconButton` below) — a ref-counter, not a plain boolean, so two
// adjacent suppressing icons (undo + star) can't leave it stuck open if
// their enter/leave events interleave. ─────────────────────────────────────
function RowTooltip({ title, placement = 'right', wrapperStyle, children }: {
  title: string | undefined
  placement?: RowPlacement
  wrapperStyle?: React.CSSProperties
  children: (suppress: (on: boolean) => void) => ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState(false)
  const suppressCount = useRef(0)
  const [suppressed, setSuppressed] = useState(false)
  const suppress = (on: boolean) => {
    suppressCount.current += on ? 1 : -1
    setSuppressed(suppressCount.current > 0)
  }
  const visible = hover && !suppressed && !!title
  return (
    <div
      ref={ref}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ display: 'block', width: '100%', ...wrapperStyle }}
    >
      {children(suppress)}
      <TooltipBox
        anchorRect={visible ? ref.current?.getBoundingClientRect() ?? null : null}
        content={title ? { title } : null}
        visible={visible}
        placement={placement}
        oneLine
      />
    </div>
  )
}

// ── FavouriteStar — the ★ favourite toggle nested inside a RowTooltip row.
// Reports its own hover to the row via `onHoverChange` so the row can
// suppress its own tooltip while this one is showing. ─────────────────────
function FavouriteStar({ starred, title, onClick, onHoverChange, style }: {
  starred: boolean
  title: string
  onClick: (e: React.MouseEvent) => void
  onHoverChange: (hovering: boolean) => void
  style?: React.CSSProperties
}) {
  const tt = useTooltip<HTMLButtonElement>({ title }, { oneLine: true })
  return (
    <>
      <button
        ref={tt.ref}
        onClick={onClick}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: starred ? 'var(--text-amber)' : 'var(--state-disabled)',
          display: 'flex', alignItems: 'center', flexShrink: 0,
          fontSize: 'var(--text-sm)', lineHeight: 1, transition: 'color 0.12s',
          ...style,
        }}
        onMouseEnter={e => { tt.onMouseEnter(); onHoverChange(true); if (!starred) e.currentTarget.style.color = 'var(--state-star-hover)' }}
        onMouseLeave={e => { tt.onMouseLeave(); onHoverChange(false); if (!starred) e.currentTarget.style.color = 'var(--state-disabled)' }}
      >★</button>
      {tt.box}
    </>
  )
}

// ── RowIconButton — the Undo-move / Undo-all-moves icon nested inside a
// RowTooltip row. Same suppression-reporting as FavouriteStar. ────────────
function RowIconButton({ tooltip, onClick, onHoverChange, style, children }: {
  tooltip: string
  onClick: (e: React.MouseEvent) => void
  onHoverChange: (hovering: boolean) => void
  style?: React.CSSProperties
  children: ReactNode
}) {
  const tt = useTooltip<HTMLButtonElement>({ title: tooltip }, { oneLine: true })
  return (
    <>
      <button
        ref={tt.ref}
        onClick={onClick}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text-inactive)', display: 'flex', alignItems: 'center',
          flexShrink: 0, transition: 'color 0.12s',
          ...style,
        }}
        onMouseEnter={e => { tt.onMouseEnter(); onHoverChange(true); e.currentTarget.style.color = 'var(--text-amber)' }}
        onMouseLeave={e => { tt.onMouseLeave(); onHoverChange(false); e.currentTarget.style.color = 'var(--text-inactive)' }}
      >{children}</button>
      {tt.box}
    </>
  )
}

// ── SettingsDropdown — custom popover replacing native <select> ───────────────
// Native <select> option lists render via the OS (Windows' own blue-hover
// scheme on Chromium) and can't be restyled with CSS. Same visual shell as
// the old <select> (amber border/background trigger), options styled to
// match the app's own hover/selected palette instead of the OS default.
function SettingsDropdown<T extends string>({ value, options, onChange, title }: {
  value: T
  options: { value: T; label: string; title?: string }[]
  onChange: (v: T) => void
  title?: string
}) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selected = options.find(o => o.value === value)

  const trigger = (
    <button
      type="button"
      onClick={() => setOpen(v => !v)}
      aria-haspopup="listbox"
      aria-expanded={open}
      style={{
        width: '100%', padding: '5px 8px', borderRadius: 4,
        border: '1px solid var(--accent-amber-strong)',
        background: 'var(--accent-amber-medium)',
        color: 'var(--text-amber)',
        fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', fontWeight: 700,
        cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
      }}
    >
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected?.label ?? value}</span>
      <span style={{ flexShrink: 0, fontSize: 9 }}>▾</span>
    </button>
  )

  return (
    <div ref={wrapRef} style={{ position: 'relative', marginBottom: 8 }}>
      {title ? <Tooltip title={title} wrapperStyle={{ display: 'block', width: '100%' }}>{trigger}</Tooltip> : trigger}
      {open && (
        <div
          role="listbox"
          aria-label={title}
          onMouseDown={e => e.stopPropagation()}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 2,
            zIndex: 50001,
            background: 'var(--panel)', border: '1px solid var(--state-hover-border)',
            borderRadius: 4, overflow: 'hidden auto', maxHeight: 240,
            boxShadow: 'var(--elevation-popover)',
          }}
        >
          {options.map(o => {
            const row = (
              <div
                key={o.title ? undefined : o.value}
                role="option"
                aria-selected={o.value === value}
                onClick={() => { onChange(o.value); setOpen(false) }}
                style={{
                  padding: '6px 10px', cursor: 'pointer', fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-ui)', fontWeight: o.value === value ? 700 : 400,
                  color:      o.value === value ? 'var(--text-amber)' : 'var(--text-default)',
                  background: o.value === value ? 'var(--accent-amber-selected-bg)' : 'transparent',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--state-hover-overlay-white)' }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = o.value === value ? 'var(--accent-amber-selected-bg)' : 'transparent' }}
              >
                {o.label}
              </div>
            )
            return o.title
              ? <Tooltip key={o.value} title={o.title} wrapperStyle={{ display: 'block', width: '100%' }}>{row}</Tooltip>
              : row
          })}
        </div>
      )}
    </div>
  )
}

// ─── Library Panel ───────────────────────────────────────────────────────────

// ── Filename span styles — active (amber) and default (muted) ─────────────────
const FILENAME_SPAN_DEFAULT: React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }
const FILENAME_SPAN_ACTIVE:  React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-amber)', fontWeight: 500, fontFamily: 'var(--font-ui)' }
// Revealed-hidden-file row (showHiddenLibraryFiles on) — dimmest amber shade,
// not a generic gray fade, so it still reads as "library color" not "disabled".
const FILENAME_SPAN_HIDDEN:  React.CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-amber-dimmest)', fontFamily: 'var(--font-ui)' }

// ── Sticky headers stack: "Folders" section header (top:0) → individual
// folder header (top:FOLDER_HEADER_HEIGHT) → loaded file's row, if visible,
// pins directly beneath whichever headers are above it in its group (0, 1,
// or 2 header-heights) — or the very top, for a loaded root-group file. ─────
const FOLDER_HEADER_HEIGHT = 30

function LibraryPanel() {
  const libraryFolder = useStore((s) => s.libraryFolder)
  const libraryFiles = useStore((s) => s.libraryFiles)
  const libraryFavourites = useStore((s) => s.libraryFavourites)
  const setLibraryFiles = useStore((s) => s.setLibraryFiles)
  const setLibraryFolderAndFiles = useStore((s) => s.setLibraryFolderAndFiles)
  const toggleFavourite = useStore((s) => s.toggleFavourite)
  const hideDemoFolder  = useStore((s) => s.hideDemoFolder)
  const demoFiles       = useStore((s) => s.demoFiles)
  const libraryNeedsRefresh    = useStore((s) => s.libraryNeedsRefresh)
  const setLibraryNeedsRefresh = useStore((s) => s.setLibraryNeedsRefresh)
  const libraryHighlightPath   = useStore((s) => s.libraryHighlightPath)
  // ── Chord Transcription — needed to show per-file transcript icon ─────────
  const chordTranscriptionEnabled = useStore((s) => s.chordTranscriptionEnabled)
  const noteNaming                = useStore((s) => s.noteNaming)
  const accidentals               = useStore((s) => s.accidentals)
  const addTranscriptEntry        = useStore((s) => s.addTranscriptEntry)
  // ── Active-file highlight — reads _filePath private field on parsed midi ──
  const midi              = useStore((s) => s.midi)
  const loadedFilePath    = (midi as any)?._filePath as string | undefined
  // ── Hidden files — client-side exclusion list, no disk change ────────────
  const hiddenLibraryFiles = useStore((s) => s.hiddenLibraryFiles)
  const hideLibraryFile    = useStore((s) => s.hideLibraryFile)
  const unhideLibraryFile  = useStore((s) => s.unhideLibraryFile)
  const showHiddenLibraryFiles    = useStore((s) => s.showHiddenLibraryFiles)
  const setShowHiddenLibraryFiles = useStore((s) => s.setShowHiddenLibraryFiles)
  const remapLibraryPaths  = useStore((s) => s.remapLibraryPaths)
  const setFavourites      = useStore((s) => s.setFavourites)
  const lastFolderOf       = useStore((s) => s.lastFolderOf)
  const setLastFolderOf    = useStore((s) => s.setLastFolderOf)
  const foldersWithUndo    = useStore((s) => s.foldersWithUndo)
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState<'all' | 'starred'>('all')
  const [librarySearch, setLibrarySearch] = useState('')
  // Folders start expanded (not in collapsed set)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  // Whole "Folders" section (all folder rows, collapsed under one row) — starts expanded
  const [foldersSectionExpanded, setFoldersSectionExpanded] = useState(true)
  // ── Context menu state — file/multi-select menu (path+x+y) or folder menu (folder+x+y) ──
  const [contextMenu, setContextMenu] = useState<{ path: string; x: number; y: number } | null>(null)
  const [fileInfoTarget, setFileInfoTarget] = useState<{ path: string; name: string } | null>(null)
  const [folderContextMenu, setFolderContextMenu] = useState<{ folder: string; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const folderMenuRef = useRef<HTMLDivElement>(null)

  // ── Multi-select + folder organization state ──────────────────────────────
  const PROTECTED_FOLDERS = ['demo', 'orfeo']
  const isProtectedFolder = (name: string | null | undefined) => !!name && PROTECTED_FOLDERS.includes(name.toLowerCase())
  // ── Narrower than isProtectedFolder — for FILES, not the folder itself.
  // "Orfeo" isn't one well-known folder: every saved version lands in an
  // "Orfeo" folder next to its source (see electron/main.ts getOrfeoOutputDir),
  // so using the folder-level check here blocked organizing any saved version
  // ever created. Demo is genuinely read-only bundled content and stays
  // blocked; Orfeo is the user's own output and shouldn't be. ────────────────
  const isReadOnlyFolder = (name: string | null | undefined) => !!name && name.toLowerCase() === 'demo'
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [selectionAnchor, setSelectionAnchor] = useState<string | null>(null)
  const [draggingPaths, setDraggingPaths] = useState<string[] | null>(null)
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null)
  const [renamingFolder, setRenamingFolder] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  // Real subfolder names from disk — includes empty folders, which the file-derived
  // `grouped` list below can't see on its own (it only knows about folders that hold midi files).
  const [libraryFolderNames, setLibraryFolderNames] = useState<string[]>([])
  useEffect(() => {
    if (!libraryFolder) { setLibraryFolderNames([]); return }
    window.electronAPI.listLibraryFolders(libraryFolder).then(setLibraryFolderNames).catch(() => {})
  }, [libraryFolder, libraryFiles])

  // ── Library sidebar drag-and-drop state ───────────────────────────────────
  const [isDragOver, setIsDragOver]   = useState(false)
  const [dropError, setDropError]     = useState<string | null>(null)
  const dropErrorTimer                = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Show a timed error inside the panel, clearing any previous timer ──────
  const showDropError = (msg: string) => {
    if (dropErrorTimer.current) clearTimeout(dropErrorTimer.current)
    setDropError(msg)
    dropErrorTimer.current = setTimeout(() => setDropError(null), 2500)
  }

  // ── dragover: prevent browser default + light up the drop zone ────────────
  // Only for real OS file drags (dataTransfer carries a "Files" type) — our own
  // internal row-to-folder drags use "text/plain" and must not trigger this
  // panel-wide overlay, or the whole library flashes an amber border on every
  // internal drag instead of just the target folder.
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }

  // ── dragleave: clear highlight only when pointer leaves the container ──────
  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }

  // ── drop: add file to library — never touches playback state ─────────────
  // Reuses copyMidiToLibrary IPC (collision-safe copy) and getPathForFile
  // from the main-area drop zone implementation. No confirmation modal needed.
  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files[0]
    if (!file) return

    if (!/\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx|cap)$/i.test(file.name)) {
      showDropError('Unsupported file type. Orfeo accepts .mid, .musicxml, .mxl, .gp/.gp5, .cap, and .kar files.')
      return
    }

    const currentLibraryFolder = (useStore.getState() as any).libraryFolder as string | null
    if (!currentLibraryFolder) {
      showDropError('Set a library folder first.')
      return
    }

    const filePath = window.electronAPI.getPathForFile(file)
    const normLib  = currentLibraryFolder.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
    const normFile = filePath.replace(/\\/g, '/').toLowerCase()
    const isInside = normFile.startsWith(normLib + '/')

    try {
      if (!isInside) {
        await window.electronAPI.copyMidiToLibrary(filePath, currentLibraryFolder)
      }
      const files = await window.electronAPI.scanMidiFolder(currentLibraryFolder)
      setLibraryFiles(files)
    } catch (err) {
      console.error('[Orfeo] library sidebar drop failed:', err)
      showDropError('Could not copy file into library.')
    }
  }

  // ── Close context menu on outside click or Escape ────────────────────────
  useEffect(() => {
    if (!contextMenu && !folderContextMenu) return
    const handleDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null)
      if (folderMenuRef.current && !folderMenuRef.current.contains(e.target as Node)) setFolderContextMenu(null)
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setContextMenu(null); setFolderContextMenu(null) }
    }
    window.addEventListener('mousedown', handleDown)
    window.addEventListener('keydown', handleKey)
    return () => {
      window.removeEventListener('mousedown', handleDown)
      window.removeEventListener('keydown', handleKey)
    }
  }, [contextMenu, folderContextMenu])

  // ── Open context menu at cursor position for a library file row ───────────
  // Right-clicking a file that isn't part of the current selection replaces the
  // selection with just that file (standard Explorer behavior).
  const handleContextMenu = (e: React.MouseEvent, filePath: string) => {
    e.preventDefault()
    setSelectedPaths(prev => prev.has(filePath) ? prev : new Set([filePath]))
    setContextMenu({ path: filePath, x: e.clientX, y: e.clientY })
  }

  const handleFolderContextMenu = (e: React.MouseEvent, folder: string) => {
    e.preventDefault()
    // Protected folders (Orfeo) still get the menu — just Show in explorer,
    // not Rename/Move/Delete (guarded inside the menu render below).
    setFolderContextMenu({ folder, x: e.clientX, y: e.clientY })
  }

  // ── Refresh + remap favourites/hidden after any create/rename/delete/move ──
  const refreshAfterFolderOp = async (pairs?: { oldPath: string; newPath: string }[]) => {
    if (pairs && pairs.length > 0) remapLibraryPaths(pairs)
    if (!libraryFolder) return
    try {
      const files = await window.electronAPI.scanMidiFolder(libraryFolder)
      setLibraryFiles(files)
    } catch { /* keep stale list rather than clearing it on a transient scan error */ }
  }

  const handleCreateFolder = async (namePrefill?: string) => {
    if (!libraryFolder) return
    const name = await window.electronAPI.createLibraryFolder(libraryFolder, namePrefill ?? 'New Folder')
    await refreshAfterFolderOp()
    setExpandedFolders(prev => new Set(prev).add(name))
    setRenamingFolder(name)
    setRenameDraft(name)
    return name
  }

  const commitFolderRename = async () => {
    const folder = renamingFolder
    const draft = renameDraft.trim()
    setRenamingFolder(null)
    if (!libraryFolder || !folder || !draft || draft === folder) return
    const result = await window.electronAPI.renameLibraryFolder(libraryFolder, folder, draft)
    if (!result.ok) return
    // Renaming a folder changes every contained file's path — remap lastFolderOf's
    // keys (files that live in it) and values (files elsewhere whose recorded undo
    // destination was this folder) to the new name, same for foldersWithUndo, or a
    // rename silently wipes undo state that should last the whole session.
    const pairs = result.pairs ?? []
    const pathRemap = new Map(pairs.map(p => [p.oldPath, p.newPath]))
    const nextLastFolderOf = new Map<string, string | null>()
    for (const [path, prevFolder] of useStore.getState().lastFolderOf) {
      const newPath = pathRemap.get(path) ?? path
      const newPrevFolder = prevFolder === folder ? result.name ?? draft : prevFolder
      nextLastFolderOf.set(newPath, newPrevFolder)
    }
    useStore.getState().setLastFolderOf(nextLastFolderOf)
    const nextFoldersWithUndo = new Set(useStore.getState().foldersWithUndo)
    if (nextFoldersWithUndo.has(folder)) { nextFoldersWithUndo.delete(folder); nextFoldersWithUndo.add(result.name ?? draft) }
    useStore.getState().setFoldersWithUndo(nextFoldersWithUndo)
    await refreshAfterFolderOp(pairs)
  }

  const handleDeleteFolder = async (folder: string) => {
    if (!libraryFolder) return
    const result = await window.electronAPI.deleteLibraryFolder(libraryFolder, folder)
    if (!result.ok) return
    // Drop any "undo would send this file back to <folder>" entries — that
    // destination no longer exists, so the undo icon would otherwise keep
    // showing on those (now-root) files for a move that can never succeed.
    const purged = new Map(useStore.getState().lastFolderOf)
    for (const [path, prevFolder] of purged) if (prevFolder === folder) purged.delete(path)
    useStore.getState().setLastFolderOf(purged)
    const purgedFolders = new Set(useStore.getState().foldersWithUndo)
    purgedFolders.delete(folder)
    useStore.getState().setFoldersWithUndo(purgedFolders)
    await refreshAfterFolderOp()
  }

  // ── Move a set of file paths into destFolder (null = library root) ────────
  const moveFilesToFolder = async (paths: string[], destFolder: string | null) => {
    if (!libraryFolder || paths.length === 0) return
    const movable = paths.filter(p => !isReadOnlyFolder(currentFolderOf(p)) && currentFolderOf(p) !== destFolder)
    if (movable.length === 0) return
    const prevFolders = new Map(movable.map(p => [p, currentFolderOf(p)]))
    const pairs = await window.electronAPI.moveLibraryFiles(movable, libraryFolder, destFolder)
    // Read/write via getState() rather than the reactive `lastFolderOf` closure — this
    // function can run several times back-to-back within one handler (folder-level undo),
    // and a stale closure would make each call clobber the previous one's update.
    const nextLastFolderOf = new Map(useStore.getState().lastFolderOf)
    for (const { oldPath, newPath } of pairs) nextLastFolderOf.set(newPath, prevFolders.get(oldPath) ?? null)
    useStore.getState().setLastFolderOf(nextLastFolderOf)
    // ── Folder-level undo flag — tracked directly by name rather than derived by
    // matching file paths against lastFolderOf on every render (which requires the
    // moved file's *new* path to exactly match what the next rescan reports back;
    // this is simpler and can't silently drift out of sync with that). ───────────
    if (destFolder && pairs.length > 0) {
      const nextFoldersWithUndo = new Set(useStore.getState().foldersWithUndo)
      nextFoldersWithUndo.add(destFolder)
      useStore.getState().setFoldersWithUndo(nextFoldersWithUndo)
    }
    await refreshAfterFolderOp(pairs)
    setSelectedPaths(new Set())
  }

  // ── Undo (or redo, if run twice) the most recent move of a single file ────
  const handleUndoMove = (filePath: string) => {
    const prevFolder = lastFolderOf.get(filePath)
    if (prevFolder === undefined) return
    moveFilesToFolder([filePath], prevFolder)
  }

  // ── Undo every file currently sitting in `folder`, each back to its own
  // recorded previous location (not necessarily all the same place). Falls back
  // to library root for any file missing a specific record — this button only
  // shows when the folder is flagged undo-eligible at all (moved into this
  // session), so every file here got here somehow and root is always a safe,
  // reversible destination even if the exact origin wasn't captured. Grouped by
  // destination and awaited sequentially — moveFilesToFolder reads fresh state
  // via getState() so back-to-back calls don't race each other. ────────────────
  const handleUndoFolder = async (folder: string, filesInFolder: LibraryFile[]) => {
    const byDest = new Map<string | null, string[]>()
    for (const file of filesInFolder) {
      const prevFolder = lastFolderOf.get(file.path) ?? null
      const list = byDest.get(prevFolder) ?? []
      list.push(file.path)
      byDest.set(prevFolder, list)
    }
    for (const [dest, paths] of byDest) await moveFilesToFolder(paths, dest)
    const nextFoldersWithUndo = new Set(useStore.getState().foldersWithUndo)
    nextFoldersWithUndo.delete(folder)
    useStore.getState().setFoldersWithUndo(nextFoldersWithUndo)
  }

  // ── Bulk-favourite toggle for a folder's contents — stars everything if any
  // file isn't starred yet, otherwise unstars everything (checkbox-style). ───
  const handleToggleFolderFavourites = (filesInFolder: LibraryFile[]) => {
    const paths = filesInFolder.map(f => f.path)
    const allStarred = paths.length > 0 && paths.every(p => libraryFavourites.has(p))
    setFavourites(paths, !allStarred)
  }

  // ── Which library subfolder (name only, null = root) a file path currently lives in ──
  const currentFolderOf = (filePath: string): string | null => {
    if (!libraryFolder) return null
    const normRoot = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '')
    const normFile = filePath.replace(/\\/g, '/')
    const rel = normFile.startsWith(normRoot + '/') ? normFile.slice(normRoot.length + 1) : normFile
    const slash = rel.indexOf('/')
    return slash === -1 ? null : rel.slice(0, slash)
  }

  // ── After a save auto-refreshes the library, expand the folder holding the new
  // version. It's almost always a just-created, collapsed Orfeo/ — without this
  // the amber-highlighted file (and its File-info history) is invisible until
  // the user finds and opens that folder by hand. ───────────────────────────
  useEffect(() => {
    if (!libraryHighlightPath) return
    const folder = currentFolderOf(libraryHighlightPath)
    if (folder) setExpandedFolders(prev => (prev.has(folder) ? prev : new Set(prev).add(folder)))
  }, [libraryHighlightPath]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Row click: plain click loads the file (existing behavior, unchanged) and
  // selects only that row; Ctrl/Cmd toggles it in the selection; Shift selects
  // the range from the last anchor. Modifier clicks never load a file. ────────
  const handleRowClick = (e: React.MouseEvent, filePath: string, orderedPaths: string[]) => {
    e.stopPropagation() // don't let the list-background click-to-clear handler fire right after this
    if (e.shiftKey && selectionAnchor) {
      const ai = orderedPaths.indexOf(selectionAnchor)
      const ci = orderedPaths.indexOf(filePath)
      if (ai !== -1 && ci !== -1) {
        const [lo, hi] = ai < ci ? [ai, ci] : [ci, ai]
        setSelectedPaths(new Set(orderedPaths.slice(lo, hi + 1)))
      }
      return
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedPaths(prev => {
        const next = new Set(prev)
        if (next.has(filePath)) next.delete(filePath); else next.add(filePath)
        return next
      })
      setSelectionAnchor(filePath)
      return
    }
    setSelectedPaths(new Set([filePath]))
    setSelectionAnchor(filePath)
    handleLoadFile(filePath)
  }

  const handleFileDragStart = (e: React.DragEvent, filePath: string) => {
    if (isReadOnlyFolder(currentFolderOf(filePath))) { e.preventDefault(); return }
    const paths = selectedPaths.has(filePath) ? Array.from(selectedPaths) : [filePath]
    if (!selectedPaths.has(filePath)) { setSelectedPaths(new Set([filePath])); setSelectionAnchor(filePath) }
    setDraggingPaths(paths)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', filePath) // OS drag needs a payload even though we read draggingPaths directly
  }

  const handleFolderDrop = async (e: React.DragEvent, folder: string | null) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOverFolder(null)
    const paths = draggingPaths
    setDraggingPaths(null)
    if (!paths || paths.length === 0) return
    await moveFilesToFolder(paths, folder)
  }

  // ── Folder picker — opens Electron folder dialog and scans for MIDI files ─
  const handlePickFolder = async () => {
    try {
      const result = await window.electronAPI.openFolder()
      if (!result) return
      setLoading(true)
      const files = await window.electronAPI.scanMidiFolder(result)
      setLibraryFolderAndFiles(result, files)
      setLoading(false)
    } catch (err) {
      console.error('Failed to scan folder:', err)
      setLoading(false)
    }
  }

  // ── Refresh — re-scans the current folder for new or removed MIDI files ──
  const handleRefresh = async () => {
    if (!libraryFolder) return
    setLoading(true)
    setLibraryNeedsRefresh(false)
    try {
      const files = await window.electronAPI.scanMidiFolder(libraryFolder)
      setLibraryFiles(files)
    } catch {}
    setLoading(false)
  }

  // ── File loader — reads MIDI from disk and parses into store state ────────
  // loadRequestIdRef guards against overlapping loads: clicking a second library
  // row before the first file's async chain (confirm dialogs, IPC round-trip,
  // parse) has resolved used to let both run concurrently, with whichever
  // resolved last winning setMidi() regardless of click order — visible as the
  // app appearing to hang with the wrong (or seemingly several) file(s) selected.
  const loadRequestIdRef = useRef(0)
  const handleLoadFile = useCallback(async (filePath: string) => {
    const requestId = ++loadRequestIdRef.current
    const canDiscard = await confirmDiscardDirtyNoteEdits('Save changes before opening this file?')
    if (!canDiscard || requestId !== loadRequestIdRef.current) return
    try {
      const proceed = await confirmPendingImportBeforeSwitch(filePath)
      if (!proceed || requestId !== loadRequestIdRef.current) return

      const result = await window.electronAPI.loadMidiFromPath(filePath)
      if (!result || requestId !== loadRequestIdRef.current) return

      let base64    = result.base64
      let resolvedFilePath = filePath
      let parseName = result.fileName
      const libraryFolder = (useStore.getState() as any).libraryFolder as string | null ?? null

      try {
        const resolved = await resolveAndTrackImport(filePath, base64, result.fileName, libraryFolder)
        base64 = resolved.base64
        resolvedFilePath = resolved.filePath
        parseName = resolved.fileName
      } catch (e: any) {
        console.error('[Orfeo] Foreign format conversion failed:', e)
        return
      }
      if (requestId !== loadRequestIdRef.current) return

      const bytes  = base64ToBytes(base64)
      // _filePath = original source, or the on-disk .mid cache once saved (see resolveAndTrackImport)
      const parsed = parseMidiBuffer(bytes.buffer as ArrayBuffer, parseName, resolvedFilePath)
      useStore.getState().setMidi(parsed)
      const raw = parsed as any
      if (raw._keySignature != null) {
        useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
      } else {
        useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
      }
    } catch (err) {
      console.error('Failed to load file:', err)
    }
  }, [])

  // ── Fuzzy search — same Fuse.js convention as ChordExplorer (threshold 0.2,
  // ignoreLocation so a match anywhere in the name counts, not just a prefix).
  // Searches by filename only — that's what "artist/song name" resolves to,
  // since library entries don't carry separate metadata.
  const libraryFuse = useMemo(() => new Fuse(libraryFiles, {
    keys: ['name'],
    threshold: 0.2,
    includeScore: true,
    minMatchCharLength: 1,
    ignoreLocation: true,
    useExtendedSearch: false,
  }), [libraryFiles])

  // ── Group files — root files first, then one entry per subfolder ─────────
  // Hidden files are filtered here so the rest of the render sees a clean list.
  // While actively searching, folder grouping is bypassed entirely — a
  // fuzzy match can live in any subfolder, so results render as one flat
  // list instead (this is what "search the whole midi folder" means).
  type FileGroup = { folder: string | null; files: LibraryFile[] }
  const grouped: FileGroup[] = useMemo(() => {
    const hiddenSet = new Set(hiddenLibraryFiles)
    // When revealed, hidden files stay in the list (dimmed at render time) —
    // otherwise they're excluded here so the rest of the render sees a clean list.
    const isExcluded = (f: LibraryFile) => !showHiddenLibraryFiles && hiddenSet.has(f.path)

    if (librarySearch.trim()) {
      const matches = libraryFuse.search(librarySearch.trim())
        .map(r => r.item)
        .filter(f => !isExcluded(f))
      return [{ folder: null, files: matches }]
    }

    // ── Starred filter — flat list across all folders, not grouped by folder.
    // Files stay physically wherever they are on disk; this tab is just a
    // cross-folder view of everything currently favourited. ─────────────────
    if (filter === 'starred') {
      const matches = libraryFiles.filter(f => libraryFavourites.has(f.path) && !isExcluded(f))
      return [{ folder: null, files: matches }]
    }

    // The loaded file additionally gets its own always-visible pinned bar
    // above this list (see render below) — it still renders here too, at its
    // normal alphabetical spot inside its folder, so a folder's contents
    // never look like a file went missing just because it's the loaded one.
    const allFiles = libraryFiles.filter((f: LibraryFile) => !isExcluded(f))

    const rootFiles: LibraryFile[] = []
    const folderMap = new Map<string, LibraryFile[]>()

    for (const file of allFiles) {
      if (!libraryFolder) { rootFiles.push(file); continue }
      const normFile = file.path.replace(/\\/g, '/')
      const normRoot = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '')
      const rel = normFile.startsWith(normRoot)
        ? normFile.slice(normRoot.length).replace(/^\//, '')
        : file.name
      const parts = rel.split('/')
      if (parts.length <= 1) {
        rootFiles.push(file)
      } else {
        const folder = parts[0]
        if (!folderMap.has(folder)) folderMap.set(folder, [])
        folderMap.get(folder)!.push(file)
      }
    }

    // ── Include empty folders too (no midi files yet), so a freshly-created or
    // pre-existing-on-disk empty folder still gets a row to drop files into ──
    if (!librarySearch.trim()) {
      for (const name of libraryFolderNames) if (!folderMap.has(name)) folderMap.set(name, [])
    }

    // Folders first, then root files — root stays in natural (alphabetical, since
    // scanMidiFolder already sorts that way) order regardless of favourite status.
    // Starred-first grouping only applies inside the dedicated "starred" filter tab.
    const result: FileGroup[] = []

    // ── Sort folders: Orfeo always topmost, Demo pinned next, rest alphabetical ──
    Array.from(folderMap.entries())
      .sort((a, b) => {
        if (a[0].toLowerCase() === 'orfeo') return -1
        if (b[0].toLowerCase() === 'orfeo') return 1
        if (a[0].toLowerCase() === 'demo') return -1
        if (b[0].toLowerCase() === 'demo') return 1
        return a[0].localeCompare(b[0])
      })
      .forEach(([folder, files]) => result.push({ folder, files }))

    // Root files at the bottom
    result.push({ folder: null, files: rootFiles })

    return result
  }, [libraryFiles, libraryFavourites, libraryFolder, filter, hiddenLibraryFiles, showHiddenLibraryFiles, librarySearch, libraryFuse, libraryFolderNames])

  // ── Flat visible file order (collapsed folders excluded) — anchors Shift-range select ──
  const visibleFilePaths = useMemo(
    () => grouped.flatMap(g => (!g.folder || expandedFolders.has(g.folder)) ? g.files.map(f => f.path) : []),
    [grouped, expandedFolders],
  )

  const realFolders = libraryFolderNames.filter(f => !isProtectedFolder(f)).sort((a, b) => a.localeCompare(b))
  const folderIsEmpty = (folder: string) => (grouped.find(g => g.folder === folder)?.files.length ?? 0) === 0

  // ── The loaded file, pinned in its own bar above the list (see render below)
  // instead of relying on CSS sticky — sticky only holds an element in place
  // while its normal scroll position is still in view; it doesn't pull the
  // element out of a collapsed folder or up from wherever it sorts alphabetically.
  // Pinning is a real reorder: excluded from `grouped` above, shown here instead. ──
  const loadedFile = loadedFilePath
    ? libraryFiles.find(f => f.path.replace(/\\/g, '/') === loadedFilePath.replace(/\\/g, '/'))
    : undefined
  const loadedFileFolder = loadedFile ? currentFolderOf(loadedFile.path) : null
  // Every other sticky header stacks below the pinned bar when one is showing.
  const pinnedBarOffset = loadedFile ? FOLDER_HEADER_HEIGHT : 0

  const toggleFolder = (folder: string) => setExpandedFolders(prev => {
    const next = new Set(prev)
    if (next.has(folder)) next.delete(folder); else next.add(folder)
    return next
  })

  const starredCount = Array.from(libraryFavourites).filter(p => libraryFiles.some(f => f.path === p)).length
  const hasAnyFiles = grouped.some(g => g.files.length > 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Folder picker row ── */}
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--bg-tile)', flexShrink: 0 }}>
        {libraryFolder ? (
          <div>
            {/* Current folder display */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 8px', background: 'var(--bg-row)', borderRadius: 4,
              border: '1px solid var(--border2)', marginBottom: 6,
            }}>
              <Tooltip title="Change library folder" oneLine wrapperStyle={{ flexShrink: 0 }}>
              <button
                onClick={handlePickFolder}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', flexShrink: 0 }}
              >
                <FolderOpen size={11} style={{ color: 'var(--text-amber)' }} />
              </button>
              </Tooltip>
              {/* ── Fuzzy search — any artist/song/filename, across all subfolders ── */}
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 4,
                border: '1px solid var(--border2)', borderRadius: 4,
                padding: '2px 6px', background: 'var(--bg-modal-header)',
                minWidth: 0,
              }}>
                <Search size={10} style={{ color: 'var(--text-inactive)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={librarySearch}
                  onChange={e => setLibrarySearch(e.target.value)}
                  placeholder="Search your library"
                  style={{
                    flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none',
                    fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                  }}
                />
                {librarySearch && (
                  <Tooltip title="Clear search" oneLine>
                  <button
                    onClick={() => setLibrarySearch('')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', color: 'var(--text-inactive)' }}
                  >
                    <X size={10} />
                  </button>
                  </Tooltip>
                )}
              </div>
              <Tooltip title={libraryNeedsRefresh ? 'A file was saved — click to refresh the library' : 'Refresh library'} oneLine>
              <button
                onClick={handleRefresh}
                className={libraryNeedsRefresh ? 'loop-nudge-blink' : undefined}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: libraryNeedsRefresh ? 'var(--text-amber)' : 'var(--text-inactive)', padding: 2, display: 'flex', alignItems: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                onMouseLeave={e => e.currentTarget.style.color = libraryNeedsRefresh ? 'var(--text-amber)' : 'var(--text-inactive)'}
              >
                <RefreshCw size={10} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
              </Tooltip>
            </div>

            {/* Active library path — click opens it in Explorer (shows files; the folder-picker dialog above never does, that's OS-level) */}
            <Tooltip title="Open in Explorer" oneLine wrapperStyle={{ display: 'block', width: '100%' }}>
            <div
              onClick={() => libraryFolder && window.electronAPI.openFolderInExplorer(libraryFolder)}
              style={{
                fontSize: 10, lineHeight: '11px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
                padding: '4px 2px', marginBottom: 6, cursor: 'pointer',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              {libraryFolder}
            </div>
            </Tooltip>

            {/* Filter tabs */}
            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
              {(['all', 'starred'] as const).map(f => (
                <Tooltip key={f} title={f === 'all' ? 'Show all files' : 'Show favorites only'} oneLine wrapperStyle={{ flex: 1 }}>
                <button
                  onClick={() => setFilter(f)}
                  style={{
                    flex: 1, padding: '3px 2px', borderRadius: 4, fontSize: 10,
                    border: filter === f ? '1px solid var(--accent-amber-strong)' : '1px solid var(--border2)',
                    background: filter === f ? 'var(--accent-amber-medium)' : 'transparent',
                    color: filter === f ? 'var(--text-amber)' : 'var(--text-inactive)',
                    cursor: 'pointer', transition: 'all 0.12s',
                  }}
                >
                  {f === 'all' ? `All (${libraryFiles.length})` : `★ ${starredCount}`}
                </button>
                </Tooltip>
              ))}
              <Tooltip title="New folder" oneLine>
              <button
                onClick={() => handleCreateFolder()}
                style={{
                  padding: '3px 6px', borderRadius: 4, fontSize: 10,
                  border: '1px solid var(--border2)', background: 'transparent',
                  color: 'var(--text-inactive)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-inactive)'}
              >
                <Folders size={10} />
              </button>
              </Tooltip>
              <Tooltip title={showHiddenLibraryFiles ? 'Hide hidden files in library' : 'Reveal hidden files in library'} oneLine>
              <button
                onClick={() => setShowHiddenLibraryFiles(!showHiddenLibraryFiles)}
                style={{
                  padding: '3px 6px', borderRadius: 4, fontSize: 10,
                  border: showHiddenLibraryFiles ? '1px solid var(--accent-amber-strong)' : '1px solid var(--border2)',
                  background: showHiddenLibraryFiles ? 'var(--accent-amber-medium)' : 'transparent',
                  color: showHiddenLibraryFiles ? 'var(--text-amber)' : 'var(--text-inactive)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (!showHiddenLibraryFiles) e.currentTarget.style.color = 'var(--text-amber)' }}
                onMouseLeave={e => { if (!showHiddenLibraryFiles) e.currentTarget.style.color = 'var(--text-inactive)' }}
              >
                <ChevronsDownUp size={10} />
              </button>
              </Tooltip>
            </div>
          </div>
        ) : (
          <button
            onClick={handlePickFolder}
            className="loop-nudge-blink"
            style={{
              width: '100%', padding: '8px 0', borderRadius: 'var(--radius-md)',
              border: '1px dashed var(--text-amber)', background: 'transparent',
              color: 'var(--text-amber)', fontSize: 'var(--text-xs)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              transition: 'all 0.15s',
            }}
          >
            <FolderOpen size={13} />
            Set your MIDI folder
          </button>
        )}
      </div>

      {/* ── File list — also the library drop zone ── */}
      <div
        style={{ flex: 1, overflowY: 'auto', position: 'relative' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onScroll={() => setContextMenu(null)}
        onClick={() => setSelectedPaths(new Set())}
      >

        {/* ── Drag-over highlight — amber border + tint, pointer-events none ─── */}
        {isDragOver && (
          <div style={{
            position: 'absolute', inset: 0,
            border: '2px solid var(--text-amber)',
            background: 'var(--accent-amber-tint-bg)',
            pointerEvents: 'none',
            zIndex: 10,
          }} />
        )}

        {/* ── Drop error toast — scoped inside the panel, auto-dismissed ─────── */}
        {dropError && (
          <div style={{
            position: 'absolute', bottom: 8, left: 8, right: 8,
            background: 'var(--bg-panel2)', border: '1px solid var(--drag-handle-dot)',
            borderRadius: 5, padding: '6px 10px',
            color: 'var(--text-default)', fontSize: 'var(--text-xs)',
            textAlign: 'center', pointerEvents: 'none',
            zIndex: 11, boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
          }}>
            {dropError}
          </div>
        )}

        {/* ── Right-click context menu — position:fixed escapes panel overflow ── */}
        {contextMenu && (
          <ContextMenu ref={menuRef} x={contextMenu.x} y={contextMenu.y} ariaLabel="File actions">
            <ContextMenuItem
              onClick={() => { window.electronAPI.showItemInFolder(contextMenu.path); setContextMenu(null) }}
              title="Opens Windows Explorer with this file highlighted"
            >
              Show in folder
            </ContextMenuItem>
            <ContextMenuItem
              onClick={() => {
                const path = contextMenu.path
                const name = libraryFiles.find(f => f.path === path)?.name ?? path.split(/[\\/]/).pop() ?? path
                setFileInfoTarget({ path, name })
                setContextMenu(null)
              }}
              title="Tempo, key, artist/song, track count, and copyright — read-only"
            >
              File info
            </ContextMenuItem>

            <ContextMenuDivider />

            {hiddenLibraryFiles.includes(contextMenu.path) ? (
              <ContextMenuItem
                onClick={() => { unhideLibraryFile(contextMenu.path); setContextMenu(null) }}
                title="Restores this file to the normal library list"
              >
                Unhide
              </ContextMenuItem>
            ) : (
              <ContextMenuItem
                onClick={() => { hideLibraryFile(contextMenu.path); setContextMenu(null) }}
                title="Hides this file from the library list — stays on disk, unaffected"
              >
                Hide from library
              </ContextMenuItem>
            )}

            {lastFolderOf.has(contextMenu.path) && (
              <ContextMenuItem
                onClick={() => { const path = contextMenu.path; setContextMenu(null); handleUndoMove(path) }}
                title="Moves this file back to where it was before its last move (this session only)"
              >
                Undo move
              </ContextMenuItem>
            )}

            {/* ── Organize actions — hidden only if EVERY selected file is protected
                (Demo/Orfeo). A mixed selection still shows this: the move backend
                already skips protected-folder files individually (fs:moveLibraryFiles
                in main.ts), so hiding the whole block for one protected file in an
                otherwise-movable multi-select blocked the rest for no reason. ────── */}
            {!Array.from(selectedPaths.size > 0 ? selectedPaths : [contextMenu.path]).every(p => isReadOnlyFolder(currentFolderOf(p))) && (
              <>
                <ContextMenuDivider />
                <ContextMenuItem
                  onClick={async () => {
                    const moveSet = Array.from(selectedPaths.size > 0 ? selectedPaths : [contextMenu.path])
                    setContextMenu(null)
                    const name = await handleCreateFolder()
                    if (name) await moveFilesToFolder(moveSet, name)
                  }}
                  title="Creates a new folder and moves the selected file(s) into it"
                >
                  New folder from selection
                </ContextMenuItem>
                {realFolders.length > 0 && (
                  <>
                    <ContextMenuLabel>Move to folder</ContextMenuLabel>
                    {realFolders.map(folder => (
                      <ContextMenuItem
                        key={folder}
                        onClick={() => { const moveSet = Array.from(selectedPaths.size > 0 ? selectedPaths : [contextMenu.path]); setContextMenu(null); moveFilesToFolder(moveSet, folder) }}
                        title={`Moves the selected file(s) into "${folder}"`}
                      >
                        {folder}
                      </ContextMenuItem>
                    ))}
                    <ContextMenuItem
                      onClick={() => { const moveSet = Array.from(selectedPaths.size > 0 ? selectedPaths : [contextMenu.path]); setContextMenu(null); moveFilesToFolder(moveSet, null) }}
                      title="Moves the selected file(s) out of their folder, back to the library root"
                    >
                      Library root
                    </ContextMenuItem>
                  </>
                )}
              </>
            )}
          </ContextMenu>
        )}

        {/* ── Folder right-click menu — Rename / Move selection here / Delete ── */}
        {folderContextMenu && (
          <ContextMenu ref={folderMenuRef} x={folderContextMenu.x} y={folderContextMenu.y} minWidth={180} ariaLabel="Folder actions">
            <ContextMenuItem
              onClick={() => { const folder = folderContextMenu.folder; setFolderContextMenu(null); if (libraryFolder) window.electronAPI.openFolderInExplorer(`${libraryFolder}/${folder}`) }}
              title="Opens this folder in File Explorer"
            >
              Show in explorer
            </ContextMenuItem>
            {!isProtectedFolder(folderContextMenu.folder) && (<>
              <ContextMenuItem
                onClick={() => { setRenamingFolder(folderContextMenu.folder); setRenameDraft(folderContextMenu.folder); setFolderContextMenu(null) }}
                title="Renames this folder on disk"
              >
                Rename
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => { const folder = folderContextMenu.folder; setFolderContextMenu(null); moveFilesToFolder(Array.from(selectedPaths), folder) }}
                disabled={selectedPaths.size === 0}
                title={selectedPaths.size === 0 ? 'Select file(s) first' : `Moves the ${selectedPaths.size} selected file(s) into this folder`}
              >
                Move {selectedPaths.size || ''} selected files here
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => { const folder = folderContextMenu.folder; setFolderContextMenu(null); handleDeleteFolder(folder) }}
                disabled={!folderIsEmpty(folderContextMenu.folder)}
                danger
                title={!folderIsEmpty(folderContextMenu.folder) ? 'Move files out first' : 'Deletes this empty folder from disk'}
              >
                Delete
              </ContextMenuItem>
            </>)}
          </ContextMenu>
        )}

        {/* ── Pinned active file — always the first thing visible, regardless of
            scroll position or folder expand/collapse. Still renders at its
            normal spot inside its folder too (see `grouped` above) — this is
            an always-visible SUMMARY, not a move, so a folder's contents never
            look incomplete just because one of them is the loaded file.
            Exactly FOLDER_HEADER_HEIGHT tall (single line, no wrapping) so
            every other sticky header's offset math below stays correct — a
            taller pinned bar would visually overlap the header stacked right
            under it. ─────────────────────────────────────────────────────── */}
        {loadedFile && (() => {
          const starred = libraryFavourites.has(loadedFile.path)
          const fmt = detectForeignFormat(loadedFile.path)
          const RowIcon = fmt === 'musicxml' ? FileCode2 : fmt === 'guitarpro' ? Guitar : FileMusic
          return (
            <RowTooltip title="Right-click for options" wrapperStyle={{ position: 'sticky', top: 0, zIndex: 5 }}>
              {suppress => (
              <div
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '0 10px', minHeight: FOLDER_HEADER_HEIGHT, boxSizing: 'border-box',
                  background: 'var(--panel)',
                  borderBottom: '1px solid var(--accent-amber-strong)',
                }}
                onContextMenu={e => handleContextMenu(e, loadedFile!.path)}
              >
                {chordTranscriptionEnabled ? (
                  <TranscriptIcon filePath={loadedFile.path} noteNaming={noteNaming} accidentals={accidentals} addTranscriptEntry={addTranscriptEntry} isLoaded />
                ) : (
                  <RowIcon size={11} strokeWidth={1.5} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <MarqueeText name={loadedFile.name.replace(/\.(mid|midi)$/i, '')} spanStyle={FILENAME_SPAN_ACTIVE} />
                  {loadedFileFolder && (
                    <span style={{ fontSize: 8, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>{loadedFileFolder}</span>
                  )}
                </div>
                {lastFolderOf.has(loadedFile.path) && (
                  <RowIconButton
                    tooltip={`Move back to ${lastFolderOf.get(loadedFile.path) ?? 'library root'}`}
                    onClick={e => { e.stopPropagation(); handleUndoMove(loadedFile!.path) }}
                    onHoverChange={suppress}
                    style={{ padding: '2px 3px' }}
                  >
                    <Undo2 size={11} />
                  </RowIconButton>
                )}
                <FavouriteStar
                  starred={starred}
                  title={starred ? 'Remove from favourites' : 'Add to favourites'}
                  onClick={e => { e.stopPropagation(); toggleFavourite(loadedFile!.path) }}
                  onHoverChange={suppress}
                  style={{ padding: '2px 3px' }}
                />
              </div>
              )}
            </RowTooltip>
          )
        })()}

        {/* Empty state */}
        {libraryFolder && !hasAnyFiles && (
          <div style={{ padding: '16px 14px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)', textAlign: 'center' }}>
            {librarySearch.trim()
              ? `No files matching "${librarySearch.trim()}".`
              : filter === 'starred' ? 'No starred files yet.\nStar a file with ★' : 'No MIDI files found.'}
          </div>
        )}

        {/* ── Standalone demo section shown when no library folder is set ─────── */}
        {!libraryFolder && !hideDemoFolder && demoFiles.length > 0 && (
          <div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', background: 'var(--bg-row)',
              borderBottom: '1px solid var(--bg-tile)',
            }}>
              <FolderOpen size={12} style={{ color: 'var(--accent-amber-icon-dim)', flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-tile-subtext)', fontWeight: 600 }}>Demo</span>
              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{demoFiles.length}</span>
            </div>
            {demoFiles.filter((f: { name: string; path: string }) => showHiddenLibraryFiles || !hiddenLibraryFiles.includes(f.path)).map(file => {
              const isLoaded = !!loadedFilePath &&
                file.path.replace(/\\/g, '/') === loadedFilePath.replace(/\\/g, '/')
              const isHidden = hiddenLibraryFiles.includes(file.path)
              const fmt = detectForeignFormat(file.path)
              const RowIcon = fmt === 'musicxml' ? FileCode2 : fmt === 'guitarpro' ? Guitar : FileMusic
              return (
                <Tooltip key={file.path} title="Right-click for options" oneLine placement="right" wrapperStyle={{ display: 'block', width: '100%' }}>
                <div
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 10px 8px 26px', borderBottom: '1px solid var(--border-row)',
                    cursor: 'pointer', transition: 'background 0.08s',
                    background: isLoaded ? 'var(--accent-amber-medium)' : 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = isLoaded ? 'var(--accent-amber-medium)' : 'var(--bg-tile)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = isLoaded ? 'var(--accent-amber-medium)' : 'transparent'}
                  onClick={() => handleLoadFile(file.path)}
                  onContextMenu={e => handleContextMenu(e, file.path)}
                >
                  {/* ── Icon doubles as transcript trigger when transcription is on; otherwise shows format-specific icon ── */}
                  {chordTranscriptionEnabled ? (
                    <TranscriptIcon filePath={file.path} noteNaming={noteNaming} accidentals={accidentals} addTranscriptEntry={addTranscriptEntry} isLoaded={isLoaded} />
                  ) : (
                    <RowIcon size={11} strokeWidth={1.5} style={{ color: isHidden ? 'var(--text-amber-dimmest)' : isLoaded ? 'var(--text-amber)' : 'var(--text-muted)', flexShrink: 0 }} />
                  )}
                  <MarqueeText name={file.name.replace(/\.(mid|midi)$/i, '')} spanStyle={isHidden ? FILENAME_SPAN_HIDDEN : isLoaded ? FILENAME_SPAN_ACTIVE : FILENAME_SPAN_DEFAULT} />
                </div>
                </Tooltip>
              )
            })}
          </div>
        )}

        {/* ── "Folders" section — one collapsible row for the whole stack of folder
            groups, so a large library can be collapsed down to just its root files.
            Sticky at the very top; individual folder headers stick right beneath it. ── */}
        {grouped.some(g => g.folder && !(hideDemoFolder && g.folder.toLowerCase() === 'demo')) && (
          <div
            onClick={() => setFoldersSectionExpanded(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 10px', minHeight: FOLDER_HEADER_HEIGHT, boxSizing: 'border-box',
              background: 'var(--bg-row)', borderBottom: '1px solid var(--bg-tile)',
              cursor: 'pointer', userSelect: 'none',
              position: 'sticky', top: pinnedBarOffset, zIndex: 4,
            }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = '#111120'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-row)'}
          >
            {foldersSectionExpanded
              ? <ChevronDown size={11} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
              : <ChevronRight size={11} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />}
            <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-tile-subtext)', fontWeight: 600 }}>Folders</span>
          </div>
        )}

        {/* ── hideDemoFolder filters the Demo subfolder from display ───────── */}
        {grouped.filter(g => !(hideDemoFolder && g.folder?.toLowerCase() === 'demo')).map((group, gi) => {
          if (group.folder && !foldersSectionExpanded) return null
          const protectedFolder = isProtectedFolder(group.folder)
          const isDropTarget = !!group.folder && !protectedFolder && dragOverFolder === group.folder
          return (
          <div key={group.folder ?? '__root__'}>

            {/* Subfolder header — only for named folders (includes empty ones). Drag/drop
                and the undo/star icons stay live even while renaming — a folder created via
                "New folder"/"New folder from selection" auto-enters rename mode immediately,
                and files dropped or moved into it during that window need to still work and
                still show their undo affordance, not silently no-op behind a bare input. ── */}
            {group.folder && (() => {
                const isRenaming = renamingFolder === group.folder
                const isExpanded = expandedFolders.has(group.folder!)
                const isProtectedHover = protectedFolder && dragOverFolder === group.folder
                const folderHasUndo = foldersWithUndo.has(group.folder!)
                const folderAllStarred = group.files.length > 0 && group.files.every(f => libraryFavourites.has(f.path))
                // Same "Right-click for options" wording/style as file rows — this used
                // to spell out the whole action list ("Expand folder — right-click for
                // rename/delete/move options") in the amber heading, with no description
                // row, which overflowed the tooltip's own maxWidth since a heading is
                // whiteSpace:nowrap by design (meant for short labels, not full sentences).
                const folderRowTitle = isRenaming || protectedFolder ? undefined : 'Right-click for options'
                const folderRow = (suppress: (on: boolean) => void) => (
                <div
                  onClick={e => { e.stopPropagation(); if (!isRenaming) toggleFolder(group.folder!) }}
                  onContextMenu={e => handleFolderContextMenu(e, group.folder!)}
                  onDragOver={e => {
                    setDragOverFolder(group.folder!)
                    if (!protectedFolder) e.preventDefault() // protected: no preventDefault → OS shows its own "no drop" cursor
                  }}
                  onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolder(null) }}
                  onDrop={e => !protectedFolder && handleFolderDrop(e, group.folder!)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 10px', minHeight: FOLDER_HEADER_HEIGHT, boxSizing: 'border-box',
                    background: isDropTarget ? 'var(--accent-amber-subtle)' : isProtectedHover ? 'var(--status-protected-tint-bg)' : 'var(--bg-row)',
                    outline: isDropTarget ? '1px solid var(--accent-amber-strong)' : isProtectedHover ? '1px solid var(--status-protected)' : 'none',
                    outlineOffset: -1,
                    borderBottom: '1px solid var(--bg-tile)',
                    borderTop: gi > 0 ? '1px solid var(--border)' : 'none',
                    cursor: isRenaming ? 'default' : 'pointer', userSelect: 'none',
                  }}
                  onMouseEnter={e => { if (!isDropTarget && !isProtectedHover) (e.currentTarget as HTMLElement).style.background = '#111120' }}
                  onMouseLeave={e => { if (!isDropTarget && !isProtectedHover) (e.currentTarget as HTMLElement).style.background = 'var(--bg-row)' }}
                >
                  {/* ── Expanded indicator — dim chevron, shown only while this folder's
                      files are visible below; collapsed folders show just the plain icon ── */}
                  {isExpanded && (
                    <ChevronDown size={9} style={{ color: 'var(--text-amber-dimmest)', flexShrink: 0 }} />
                  )}
                  <FolderOpen size={12} style={{ color: 'var(--accent-amber-icon-dim)', flexShrink: 0 }} />
                  {isRenaming ? (
                    <input
                      autoFocus
                      value={renameDraft}
                      onClick={e => e.stopPropagation()}
                      onChange={e => setRenameDraft(e.target.value)}
                      onFocus={e => e.currentTarget.select()}
                      onBlur={commitFolderRename}
                      onKeyDown={e => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                        if (e.key === 'Escape') setRenamingFolder(null)
                      }}
                      style={{
                        flex: 1, minWidth: 0, background: 'var(--bg-modal-header)',
                        border: '1px solid var(--accent-amber-strong)', borderRadius: 3,
                        color: 'var(--text-default)', fontSize: 'var(--text-xs)', padding: '2px 5px',
                      }}
                    />
                  ) : (
                    <span style={{
                      flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-tile-subtext)', fontWeight: 600,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {group.folder}
                    </span>
                  )}
                  {/* ── Live drag feedback — native title tooltips don't reliably show mid-drag ── */}
                  {isProtectedHover && (
                    <span style={{ fontSize: 9, color: 'var(--status-protected)', flexShrink: 0, whiteSpace: 'nowrap' }}>Can't move to system folder</span>
                  )}
                  {isDropTarget && (
                    <span style={{ fontSize: 9, color: 'var(--text-amber)', flexShrink: 0, whiteSpace: 'nowrap' }}>Move to {group.folder}</span>
                  )}
                  {!protectedFolder && folderHasUndo && (
                    <RowIconButton
                      tooltip="Undo all moves into this folder (this session only)"
                      onClick={e => { e.stopPropagation(); handleUndoFolder(group.folder!, group.files) }}
                      onHoverChange={suppress}
                      style={{ padding: '1px 2px' }}
                    >
                      <Undo2 size={10} />
                    </RowIconButton>
                  )}
                  {!protectedFolder && group.files.length > 0 && (
                    <FavouriteStar
                      starred={folderAllStarred}
                      title={folderAllStarred ? 'Unstar all songs in this folder' : 'Star all songs in this folder'}
                      onClick={e => { e.stopPropagation(); handleToggleFolderFavourites(group.files) }}
                      onHoverChange={suppress}
                      style={{ padding: '1px 2px' }}
                    />
                  )}
                  <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>
                    {group.files.length}
                  </span>
                </div>
                )
                return (
                  <RowTooltip
                    title={folderRowTitle}
                    wrapperStyle={{ position: 'sticky', top: pinnedBarOffset + FOLDER_HEADER_HEIGHT, zIndex: 3 }}
                  >
                    {folderRow}
                  </RowTooltip>
                )
              })()}

            {/* ── Divider between the folders' content and the root library files —
                only when the Folders section is actually showing folder rows above,
                so root files don't visually read as trailing off the last folder ── */}
            {!group.folder && foldersSectionExpanded && group.files.length > 0 &&
              grouped.some(g => g.folder && !(hideDemoFolder && g.folder.toLowerCase() === 'demo')) && (
              <div style={{ height: 1, margin: '4px 10px', background: 'var(--text-amber-dimmest)' }} />
            )}

            {/* Files inside this group — hidden when folder is collapsed */}
            {(!group.folder || expandedFolders.has(group.folder)) && group.files.map((file) => {
              const starred   = libraryFavourites.has(file.path)
              const isLoaded  = !!loadedFilePath &&
                file.path.replace(/\\/g, '/') === loadedFilePath.replace(/\\/g, '/')
              const isSelected = selectedPaths.has(file.path)
              const isHidden  = hiddenLibraryFiles.includes(file.path)
              // ── Briefly amber-highlighted right after an auto-refreshed save (see
              // notifyLibrarySaved in store/index.ts) — clears itself after ~2.5s. ──
              const isJustSaved = !!libraryHighlightPath &&
                file.path.replace(/\\/g, '/') === libraryHighlightPath.replace(/\\/g, '/')
              // ── Cell border+background is reserved for multi-select (2+ files, the
              // drag/create-folder gesture) — a single selected/loaded file only gets
              // its icon+filename highlighted amber, no cell decoration. ─────────────
              const isMultiSelected = isSelected && selectedPaths.size >= 2
              const fmt = detectForeignFormat(file.path)
              const RowIcon = fmt === 'musicxml' ? FileCode2 : fmt === 'guitarpro' ? Guitar : FileMusic
              // Loaded row is sticky (see below) so its background must be opaque, not
              // the translucent amber tint — otherwise rows scrolling underneath bleed
              // through. Reads as a plain/unselected row; the amber filename still
              // marks it as loaded. isJustSaved takes priority over both — it's a
              // temporary flash, not a persistent state.
              const rowBg = isJustSaved ? 'var(--accent-amber-subtle)' : isLoaded ? 'var(--panel)' : isMultiSelected ? 'var(--accent-amber-subtle)' : 'transparent'
              // ── Draw one bordered "box" around each contiguous run of selected rows,
              // instead of an outline on every individual row — top/bottom border only
              // where the neighbor in visual order isn't also selected. ────────────────
              const rowIndex = visibleFilePaths.indexOf(file.path)
              const prevSelected = isMultiSelected && rowIndex > 0 && selectedPaths.has(visibleFilePaths[rowIndex - 1])
              const nextSelected = isMultiSelected && rowIndex < visibleFilePaths.length - 1 && selectedPaths.has(visibleFilePaths[rowIndex + 1])
              const selectionBorder = '2px solid var(--accent-amber-strong)'
              return (
                <RowTooltip key={file.path} title="Right-click for options">
                  {suppress => (
                  <div
                    draggable={!protectedFolder}
                    className={isJustSaved ? 'loop-nudge-blink' : undefined}
                    onDragStart={e => handleFileDragStart(e, file.path)}
                    onDragEnd={() => setDraggingPaths(null)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      // Indent subfolder files slightly
                      padding: group.folder ? '8px 10px 8px 26px' : '8px 10px 8px 12px',
                      cursor: 'pointer', transition: 'background 0.08s',
                      background: rowBg,
                      borderLeft: isMultiSelected ? selectionBorder : 'none',
                      borderRight: isMultiSelected ? selectionBorder : 'none',
                      borderTop: isMultiSelected && !prevSelected ? selectionBorder : 'none',
                      borderBottom: isMultiSelected && !nextSelected ? selectionBorder : '1px solid var(--border-row)',
                      marginTop: isMultiSelected && !prevSelected ? -1 : 0,
                    }}
                    // Hover only repaints plain (unselected, unloaded) rows — selected/loaded rows
                    // keep their amber background on hover instead of flashing to the same gray
                    // used for plain hover, which is what made "selected" read as gray before.
                    onMouseEnter={e => { if (!isLoaded && !isMultiSelected && !isJustSaved) (e.currentTarget as HTMLElement).style.background = 'var(--bg-tile)' }}
                    onMouseLeave={e => { if (!isLoaded && !isMultiSelected && !isJustSaved) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    onClick={e => handleRowClick(e, file.path, visibleFilePaths)}
                    onContextMenu={e => handleContextMenu(e, file.path)}
                  >
                    {/* ── Icon doubles as transcript trigger when transcription is on; otherwise shows format-specific icon ── */}
                    {chordTranscriptionEnabled ? (
                      <TranscriptIcon filePath={file.path} noteNaming={noteNaming} accidentals={accidentals} addTranscriptEntry={addTranscriptEntry} isLoaded={isLoaded || isJustSaved} />
                    ) : (
                      <RowIcon size={11} strokeWidth={1.5} style={{ color: isHidden ? 'var(--text-amber-dimmest)' : isLoaded || isSelected || isJustSaved ? 'var(--text-amber)' : 'var(--text-muted)', flexShrink: 0 }} />
                    )}
                    <MarqueeText name={file.name.replace(/\.(mid|midi)$/i, '')} spanStyle={isHidden ? FILENAME_SPAN_HIDDEN : isLoaded || isSelected || isJustSaved ? FILENAME_SPAN_ACTIVE : FILENAME_SPAN_DEFAULT} />
                    {lastFolderOf.has(file.path) && (
                      <RowIconButton
                        tooltip={`Move back to ${lastFolderOf.get(file.path) ?? 'library root'}`}
                        onClick={e => { e.stopPropagation(); handleUndoMove(file.path) }}
                        onHoverChange={suppress}
                        style={{ padding: '2px 3px' }}
                      >
                        <Undo2 size={11} />
                      </RowIconButton>
                    )}
                    <FavouriteStar
                      starred={starred}
                      title={starred ? 'Remove from favourites' : 'Add to favourites'}
                      onClick={e => { e.stopPropagation(); toggleFavourite(file.path) }}
                      onHoverChange={suppress}
                      style={{ padding: '2px 3px' }}
                    />
                  </div>
                  )}
                </RowTooltip>
              )
            })}
          </div>
          )
        })}

        {/* ── Library-root drop zone — moves dragged files back to root ─────── */}
        {draggingPaths && (
          <div
            onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDragOverFolder('__root__') }}
            onDragLeave={() => setDragOverFolder(null)}
            onDrop={e => handleFolderDrop(e, null)}
            style={{
              padding: '10px', margin: '6px 10px', borderRadius: 4, textAlign: 'center',
              fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)',
              border: `1px dashed ${dragOverFolder === '__root__' ? 'var(--accent-amber-strong)' : 'var(--border2)'}`,
              background: dragOverFolder === '__root__' ? 'var(--accent-amber-subtle)' : 'transparent',
            }}
          >
            Drop here to move to library root
          </div>
        )}
      </div>

      {fileInfoTarget && (
        <FileInfoModal
          filePath={fileInfoTarget.path}
          fileName={fileInfoTarget.name}
          onClose={() => setFileInfoTarget(null)}
          onRenamed={(oldPath, newPath, newName) => {
            setLibraryFiles(libraryFiles.map(f => f.path === oldPath ? { path: newPath, name: newName } : f))
            remapLibraryPaths([{ oldPath, newPath }])
            // Currently-loaded file got renamed underneath it — patch the store's
            // in-memory path/name so a subsequent Playback Editor save resolves
            // against the new location instead of a path that no longer exists.
            if (loadedFilePath && loadedFilePath.replace(/\\/g, '/') === oldPath.replace(/\\/g, '/')) {
              useStore.setState(s => s.midi ? { midi: { ...(s.midi as any), _filePath: newPath, fileName: newName } } : {})
            }
            setFileInfoTarget({ path: newPath, name: newName })
          }}
        />
      )}
    </div>
  )
}

// ─── Settings Panel ──────────────────────────────────────────────────────────

type DrawerTab = 'settings' | 'library'

const HIT_EFFECT_DESCRIPTIONS: Record<HitEffectPattern, string> = {
  glowBloom: 'Soft radial glow that blooms outward and fades.',
  rippleRing: 'Expanding concentric rings, like a ripple in water.',
  particleBurst: 'Small particles spray upward and fall back down with gravity.',
  smokePlume: 'Soft blurred smoke wisps drift upward, shifting color as they dissipate.',
  colorAura: 'A soft glowing blob that pulses outward while cycling through colors.',
  starburstNova: 'Sharp radiating rays with a bright flash — explosive and energetic.',
  cometTrail: 'A bright streak shoots upward with a fading trail behind it.',
}

export default function SettingsPanel() {
  // ── Auto-update — status pushed from main via IPC (electron/main.ts), see
  // electron-updater wiring there. 'idle' shows the plain cloud icon; other
  // states badge/animate it and drive the tooltip + click behavior below. ──
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' })
  useEffect(() => {
    const handler = (data: UpdateStatus) => setUpdateStatus(data)
    window.electronAPI.onUpdateStatus(handler)
    return () => window.electronAPI.offUpdateStatus()
  }, [])
  const handleCheckForUpdates = async () => {
    setUpdateStatus({ state: 'checking' })
    await window.electronAPI.checkForUpdates()
  }
  // ── 'up to date' and 'unavailable' (dev/portable) are transient states —
  // fade back to the plain icon after a few seconds instead of sticking. ────
  useEffect(() => {
    if (updateStatus.state !== 'up-to-date' && updateStatus.state !== 'unavailable') return
    const t = setTimeout(() => setUpdateStatus({ state: 'idle' }), 3000)
    return () => clearTimeout(t)
  }, [updateStatus.state])

  const settingsPanelOpen = useStore((s) => s.settingsPanelOpen)
  const setSettingsPanelOpen = useStore((s) => s.setSettingsPanelOpen)
  const noteNaming = useStore((s) => s.noteNaming)
  const setNoteNaming = useStore((s) => s.setNoteNaming)
  const accidentals = useStore((s) => s.accidentals)
  const setAccidentals = useStore((s) => s.setAccidentals)
  const chordTrackingMode = useStore((s) => s.chordTrackingMode)
  const setChordTrackingMode = useStore((s) => s.setChordTrackingMode)
  const chordFollowSubMode = useStore((s) => s.chordFollowSubMode)
  const setChordFollowSubMode = useStore((s) => s.setChordFollowSubMode)
  const chordFollowGroup = useStore((s) => s.chordFollowGroup)
  const setChordFollowGroup = useStore((s) => s.setChordFollowGroup)
  const chordFollowTrackIndex = useStore((s) => s.chordFollowTrackIndex)
  const setChordFollowTrackIndex = useStore((s) => s.setChordFollowTrackIndex)
  const chordNamingStyle = useStore((s) => s.chordNamingStyle)
  const setChordNamingStyle = useStore((s) => s.setChordNamingStyle)
  const chordTracks = useStore((s) => s.tracks)
  const keyboardSize = useStore((s) => s.keyboardSize)
  const setKeyboardSize = useStore((s) => s.setKeyboardSize)
  const zoomLevel = useStore((s) => s.zoomLevel)
  const setZoomLevel = useStore((s) => s.setZoomLevel)
  const showBarNumbers = useStore((s) => s.showBarNumbers)
  const setShowBarNumbers = useStore((s) => s.setShowBarNumbers)
  const playbarVisible = useStore((s) => s.playbarVisible)
  const setPlaybarVisible = useStore((s) => s.setPlaybarVisible)
  const hitEffectsEnabled = useStore((s) => s.hitEffectsEnabled)
  const setHitEffectsEnabled = useStore((s) => s.setHitEffectsEnabled)
  const autoLevelOnLoad = useStore((s) => s.autoLevelOnLoad)
  const setAutoLevelOnLoad = useStore((s) => s.setAutoLevelOnLoad)
  const hitEffectPattern = useStore((s) => s.hitEffectPattern)
  const setHitEffectPattern = useStore((s) => s.setHitEffectPattern)
  const hitEffectScope = useStore((s) => s.hitEffectScope)
  const setHitEffectScope = useStore((s) => s.setHitEffectScope)
  const hitEffectColor = useStore((s) => s.hitEffectColor)
  const setHitEffectColor = useStore((s) => s.setHitEffectColor)
  const hitEffectBloomThreshold = useStore((s) => s.hitEffectBloomThreshold)
  const setHitEffectBloomThreshold = useStore((s) => s.setHitEffectBloomThreshold)
  const hitEffectBloomIntensity = useStore((s) => s.hitEffectBloomIntensity)
  const setHitEffectBloomIntensity = useStore((s) => s.setHitEffectBloomIntensity)
  const hitEffectBloomSpread = useStore((s) => s.hitEffectBloomSpread)
  const setHitEffectBloomSpread = useStore((s) => s.setHitEffectBloomSpread)
  const appTheme = useStore((s) => s.appTheme)
  const setAppTheme = useStore((s) => s.setAppTheme)
  const audioEngine = useStore((s) => s.audioEngine)
  const setAudioEngine = useStore((s) => s.setAudioEngine)
  const selectedSoundfont = useStore((s) => s.selectedSoundfont)
  const setSelectedSoundfont = useStore((s) => s.setSelectedSoundfont)
  const chordPrompterEnabled = useStore((s) => s.chordPrompterEnabled)
  const setChordPrompterEnabled = useStore((s) => s.setChordPrompterEnabled)
  const loopRegionEnabled    = useStore((s) => s.loopRegionEnabled)
  const setLoopRegionEnabled = useStore((s) => s.setLoopRegionEnabled)
  const noteEditorEnabled    = useStore((s) => s.noteEditorEnabled)
  const setNoteEditorEnabled = useStore((s) => s.setNoteEditorEnabled)
  const chordTranscriptionEnabled = useStore((s) => s.chordTranscriptionEnabled)
  const setChordTranscriptionEnabled = useStore((s) => s.setChordTranscriptionEnabled)
  const hideDemoFolder           = useStore((s) => s.hideDemoFolder)
  const setHideDemoFolder        = useStore((s) => s.setHideDemoFolder)
  const showHandLabels               = useStore((s) => s.showHandLabels)
  const showHandLetters              = useStore((s) => s.showHandLetters)
  const setShowHandLetters           = useStore((s) => s.setShowHandLetters)
  const setShowHandLabels            = useStore((s) => s.setShowHandLabels)
  const showOctaveLabels             = useStore((s) => s.showOctaveLabels)
  const setShowOctaveLabels          = useStore((s) => s.setShowOctaveLabels)
  const showNoteNamesOnKeyboard      = useStore((s) => s.showNoteNamesOnKeyboard)
  const setShowNoteNamesOnKeyboard   = useStore((s) => s.setShowNoteNamesOnKeyboard)
  const autoCollapseDrawers          = useStore((s) => s.autoCollapseDrawers)
  const setAutoCollapseDrawers       = useStore((s) => s.setAutoCollapseDrawers)
  const trackVuColorEnabled          = useStore((s) => s.trackVuColorEnabled)
  const setTrackVuColorEnabled       = useStore((s) => s.setTrackVuColorEnabled)
  const handLabelMode                        = useStore((s) => s.handLabelMode)
  const setHandLabelMode                     = useStore((s) => s.setHandLabelMode)
  const performanceSplitSensitivity          = useStore((s) => s.performanceSplitSensitivity)
  const setPerformanceSplitSensitivity       = useStore((s) => s.setPerformanceSplitSensitivity)
  const rhMaxFingers                 = useStore((s) => s.rhMaxFingers)
  const setRhMaxFingers              = useStore((s) => s.setRhMaxFingers)
  const lhMaxFingers                 = useStore((s) => s.lhMaxFingers)
  const setLhMaxFingers              = useStore((s) => s.setLhMaxFingers)
  const autoMuteNonKeyboard         = useStore((s) => s.autoMuteNonKeyboard)
  const setAutoMuteNonKeyboard      = useStore((s) => s.setAutoMuteNonKeyboard)
  const settingsGroupsCollapsed     = useStore((s) => s.settingsGroupsCollapsed)
  const setSettingsGroupCollapsed   = useStore((s) => s.setSettingsGroupCollapsed)
  // ── Samples engine loading state ─────────────────────────────────────────
  const [samplesStatus, setSamplesStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [samplesProgress, setSamplesProgress] = useState(0)
  const [activeTab, setActiveTab] = useState<DrawerTab>('library')
  const didInit = useRef(false)
  // ── Init — ensures panel is open on first mount ───────────────────────────
  useEffect(() => {
    if (!didInit.current) { didInit.current = true; if (!settingsPanelOpen) setSettingsPanelOpen(true) }
  }, [])

  // ── Downloadable extra soundfonts (FluidR3 GM, MuseScore General) ─────────
  const [extraSoundfonts, setExtraSoundfonts] = useState<SoundfontInfo[]>([])
  const [sfDownloadingId, setSfDownloadingId] = useState<SoundfontId | null>(null)
  const [sfDownloadProgress, setSfDownloadProgress] = useState(0)
  const [sfError, setSfError] = useState<string | null>(null)
  const refreshSoundfonts = useCallback(() => {
    window.electronAPI.listSoundfonts().then(setExtraSoundfonts).catch(() => {})
  }, [])
  useEffect(() => {
    refreshSoundfonts()
    window.electronAPI.onSoundfontProgress(({ id, progress }) => {
      setSfDownloadProgress(progress)
      if (progress >= 1) { setSfDownloadingId(null); refreshSoundfonts() }
    })
    return () => window.electronAPI.offSoundfontProgress()
  }, [refreshSoundfonts])
  async function handleDownloadSoundfont(id: SoundfontId) {
    setSfError(null); setSfDownloadingId(id); setSfDownloadProgress(0)
    const res = await window.electronAPI.downloadSoundfont(id)
    if (!res.ok) { setSfError(res.error ?? 'Download failed'); setSfDownloadingId(null) }
  }
  async function handleSelectSoundfont(id: SoundfontId) {
    setSelectedSoundfont(id)
    if (audioEngine === 'samples') loadSelectedSoundfont(id).catch(() => {})
  }
  async function handleDeleteSoundfont(id: SoundfontId) {
    if (selectedSoundfont === id) await handleSelectSoundfont('generaluser-gs')
    await window.electronAPI.deleteSoundfont(id)
    refreshSoundfonts()
  }
  async function handleImportSoundfont() {
    setSfError(null)
    const id = await window.electronAPI.importSoundfont()
    if (!id) return // user cancelled the picker
    refreshSoundfonts()
    await handleSelectSoundfont(id)
  }
  // ── Bundled default + downloaded extras + user imports, in list order.
  // Used both for the dropdown (downloaded-only) and the status line below. ──
  const allSoundfonts: SoundfontInfo[] = [
    { id: 'generaluser-gs', name: 'GeneralUser GS', sizeMB: 30.8, downloaded: true },
    ...extraSoundfonts,
  ]
  const activeSoundfontEntry = allSoundfonts.find(sf => sf.id === selectedSoundfont)

  // ── Auto-init samples engine when prefs restore sets audioEngine='samples'
  useEffect(() => {
    if (audioEngine !== 'samples') return
    if (samplesStatus !== 'idle') return
    setSamplesStatus('loading'); setSamplesProgress(0)
    initSamplesEngine((p) => setSamplesProgress(p))
      .then(() => setSamplesStatus('ready'))
      .catch(() => setSamplesStatus('error'))
  }, [audioEngine])

  const NOTE_NAMING_OPTIONS: { value: NoteNaming; label: string; hint: string }[] = [
    { value: 'english',          label: 'UK/US',  hint: 'C D E F G A B' },
    { value: 'central-european', label: 'EU',        hint: 'C D E F G A H (B = B♭)' },
    { value: 'solfege',          label: 'Solfège',  hint: 'Do Re Mi Fa Sol La Si' },
    { value: 'hidden',           label: 'Hide',     hint: 'No labels shown' },
  ]

  const KEYBOARD_SIZES: KeyboardSize[] = [61, 73, 88]
  const ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3]

  return (
    <div style={{
      // Match TrackPanel width exactly: 260px open, 32px collapsed
      width: settingsPanelOpen ? 260 : 32,
      background: 'var(--bg-modal)',
      borderRight: '1px solid var(--border2)',
      transition: 'width 0.2s ease',
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'relative',
    }}>
      {/* ── Closed state: 3-icon column ────────────────────────────────────── */}
      {!settingsPanelOpen && (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          height: '100%', paddingTop: 10, paddingBottom: 10,
        }}>
          <Tooltip title="Open Library" description="Browse and load MIDI files from your library folder.">
          <button
            onClick={() => { setActiveTab('library'); setSettingsPanelOpen(true) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dimmest)', padding: 4,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
          >
            <Library size={18} />
          </button>
          </Tooltip>
          <Tooltip title="Open Settings" description="Notation, audio engine, effects, and other app preferences.">
          <button
            onClick={() => { setActiveTab('settings'); setSettingsPanelOpen(true) }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-dimmest)', padding: 4, marginTop: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
          >
            <Settings size={18} />
          </button>
          </Tooltip>
          <div style={{ flex: 1 }} />
          <Tooltip title="Coming soon" oneLine>
          <button
            style={{
              background: 'none', border: 'none', cursor: 'default',
              color: 'var(--text-inactive)', padding: 4, opacity: 0.5,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <Info size={18} />
          </button>
          </Tooltip>
        </div>
      )}

      {settingsPanelOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

          {/* ── Collapse button: chevron only, dynamic tooltip ────────────────── */}
          <Tooltip title="Close panel" placement="left" oneLine>
          <button
            onClick={() => setSettingsPanelOpen(false)}
            style={{
              position: 'absolute', top: 10, right: 0, zIndex: 10,
              padding: '4px 5px', borderRadius: '4px 0 0 4px',
              background: 'var(--bg-tile)', border: '1px solid var(--border2)', borderRight: 'none',
              color: 'var(--text-dimmest)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
          >
            <ChevronLeft size={15} />
          </button>
          </Tooltip>

          {/* ── Tab bar: Library / Settings, left-aligned with content ─────── */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {([
              { id: 'library',  icon: <Library size={16} />,  label: 'Library'  },
              { id: 'settings', icon: <Settings size={16} />, label: 'Settings' },
            ] as { id: DrawerTab; icon: React.ReactNode; label: string }[]).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  flex: 1, height: 40,
                  display: 'flex', alignItems: 'center', justifyContent: 'flex-start',
                  paddingLeft: 'var(--space-3)', gap: 5,
                  background: 'none', border: 'none', cursor: 'pointer',
                  borderBottom: activeTab === tab.id ? '2px solid var(--text-amber)' : '2px solid transparent',
                  color: activeTab === tab.id ? 'var(--text-amber)' : 'var(--text-inactive)',
                  fontSize: 12, fontWeight: 600,
                  textTransform: 'uppercase', letterSpacing: '0.08em',
                  transition: 'color 0.15s',
                }}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Panel content */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {activeTab === 'library' ? (
              <LibraryPanel />
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>

                {/* ── 1. AUDIO ───────────────────────────────────────────────────── */}
                <CollapsibleSection icon={<Volume2 size={11} />} label="Audio"
                  collapsed={settingsGroupsCollapsed['audio']}
                  onToggle={() => setSettingsGroupCollapsed('audio', !settingsGroupsCollapsed['audio'])}
                >
                  <OptionRow label="Sound engine">
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      {/* ── GM Synth — always available, switches back from Samples instantly ── */}
                      <OptionBtn
                        active={audioEngine === 'gm'}
                        onClick={() => setAudioEngine('gm')}
                        title="Generic, boring, and synthetic sound" oneLine
                      >General MIDI</OptionBtn>
                      {/* ── Samples — loads GeneralUser GS SF2 via spessasynth_lib on first click ── */}
                      <OptionBtn
                        active={audioEngine === 'samples'}
                        onClick={async () => {
                          if (audioEngine === 'samples') return
                          if (samplesStatus === 'ready') { setAudioEngine('samples'); return }
                          if (samplesStatus === 'loading') return
                          setSamplesStatus('loading'); setSamplesProgress(0)
                          try {
                            await initSamplesEngine((p) => setSamplesProgress(p))
                            setSamplesStatus('ready')
                            setAudioEngine('samples')
                          } catch (e) {
                            console.error('[Orfeo Samples] init failed:', e)
                            setSamplesStatus('error')
                          }
                        }}
                        title="High-fidelity, realistic audio (recommended)" oneLine
                      >Samples</OptionBtn>
                    </div>
                    {/* ── Loading progress / status block ──────────────────────────── */}
                    {samplesStatus === 'loading' && (
                      <div style={{ marginTop: 7 }}>
                        <div style={{ fontSize: 9, color: 'var(--text-dimmest)', fontFamily: 'var(--font-ui)', marginBottom: 4 }}>
                          Loading soundfont… {Math.round(samplesProgress * 100)}%
                        </div>
                        <div style={{ height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{
                            height: '100%', background: 'var(--text-amber)', borderRadius: 2,
                            width: `${Math.round(samplesProgress * 100)}%`, transition: 'width 0.1s',
                          }} />
                        </div>
                      </div>
                    )}
                    {samplesStatus === 'ready' && (
                      <div style={{ marginTop: 5, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                        {/* ── Always prints the actually-active soundfont — "loaded" goes amber when Samples is the active engine ── */}
                        {activeSoundfontEntry?.name ?? selectedSoundfont} · {activeSoundfontEntry?.sizeMB ?? '?'} MB · <span style={{ color: audioEngine === 'samples' ? 'var(--text-amber)' : 'inherit' }}>loaded</span>
                      </div>
                    )}
                    {samplesStatus === 'error' && (
                      <div style={{ marginTop: 5, fontSize: 9, color: 'var(--status-error)', fontFamily: 'var(--font-ui)' }}>
                        Failed to load soundfont — check console
                      </div>
                    )}
                    {samplesStatus === 'idle' && (
                      <div style={{ marginTop: 5, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
                        {audioEngine === 'gm'
                          ? 'GM Synth (jzz-synth-tiny) — ships with app, no internet needed.'
                          : `${activeSoundfontEntry?.name ?? selectedSoundfont} · ${activeSoundfontEntry?.sizeMB ?? '?'} MB · click Samples to load`}
                      </div>
                    )}
                  </OptionRow>

                  {/* ── Sound library — extra downloadable SF2/SF3s, Samples engine only ── */}
                  {/* Title sits on this outer wrapper (covers the label too) rather than the inner
                      dimmed div — a tooltip anchored only to the dimmed/inert body wouldn't fire
                      when hovering the "Sound Fonts Library" label itself. ── */}
                  {(() => {
                    const soundFontsBody = (
                  <div>
                  <OptionRow label="Sound Fonts">
                  {/* ── Dimmed + inert whenever GM Synth is active — this library only affects
                      the Samples engine, so there's nothing useful to click here otherwise. ── */}
                  <div
                    style={{
                      opacity: audioEngine === 'samples' ? 1 : 0.4,
                      pointerEvents: audioEngine === 'samples' ? 'auto' : 'none',
                      transition: 'opacity 0.15s',
                    }}
                  >
                    {/* ── Description — moved above the list (was a trailing hint below it) ── */}
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', marginBottom: 8, fontStyle: 'italic' }}>
                      Add sf2 soundfonts, downloaded on demand. Samples engine exclusive.
                    </div>

                    {/* ── Active selection — a dropdown instead of pill buttons, since library
                        names don't reliably fit a fixed-width button. Only lists soundfonts
                        that are actually downloaded/importable right now; amber border+background
                        mirrors the old per-item "active" pill styling. ── */}
                    <SettingsDropdown
                      value={selectedSoundfont}
                      onChange={handleSelectSoundfont}
                      options={allSoundfonts.filter(sf => sf.downloaded).map(sf => ({
                        value: sf.id, label: `${sf.name} — ${sf.sizeMB} MB`,
                      }))}
                    />

                    {/* ── Full catalog, incl. not-yet-downloaded — grid columns keep name/size/action
                        aligned regardless of name length, which a row of fixed-width buttons couldn't.
                        Bullet before each name — future-proof: every entry in allSoundfonts (bundled,
                        catalog, or a later addition) is rendered from this one map, so a new soundfont
                        automatically gets its bullet too, nothing to update by hand. ── */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', columnGap: 'var(--space-2)', rowGap: 5, alignItems: 'center' }}>
                      {allSoundfonts.map((sf) => {
                        const isActive = selectedSoundfont === sf.id
                        const isDownloading = sfDownloadingId === sf.id
                        return (
                          <div key={sf.id} style={{ display: 'contents' }}>
                            <span
                              title={sf.downloaded ? `Use ${sf.name} for the Samples engine` : `Download ${sf.name} first`}
                              style={{
                                fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)',
                                color: isActive ? 'var(--text-amber)' : 'var(--text-inactive)',
                                fontWeight: isActive ? 600 : 400,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                              }}
                            >• {sf.name}</span>
                            <span style={{ fontSize: 9, color: 'var(--text-dimmest)', fontFamily: 'var(--font-ui)', textAlign: 'right' }}>{sf.sizeMB} MB</span>
                            {sf.id === 'generaluser-gs' ? (
                              <span style={{ fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', textAlign: 'right' }}>bundled</span>
                            ) : sf.downloaded ? (
                              <SoundfontActionLink
                                label="remove" color="var(--text-dimmest)"
                                tooltip={sf.custom ? 'Remove imported file' : 'Delete downloaded file'}
                                onClick={() => handleDeleteSoundfont(sf.id)}
                              />
                            ) : isDownloading ? (
                              <div style={{ width: 60, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
                                <div style={{ height: '100%', background: 'var(--text-amber)', borderRadius: 2, width: `${Math.round(sfDownloadProgress * 100)}%`, transition: 'width 0.1s' }} />
                              </div>
                            ) : (
                              <SoundfontActionLink
                                label="download" color="var(--text-amber)"
                                tooltip={`Download ${sf.name} (${sf.sizeMB} MB)`}
                                onClick={() => handleDownloadSoundfont(sf.id)}
                              />
                            )}
                          </div>
                        )
                      })}
                    </div>

                    {sfError && (
                      <div style={{ fontSize: 9, color: 'var(--status-error)', fontFamily: 'var(--font-ui)', marginTop: 5 }}>{sfError}</div>
                    )}

                    {/* ── Import a user's own .sf2/.sf3 — same storage/loading path as the catalog entries ── */}
                    <Tooltip title="Make sure you have the rights to use imported soundfonts." oneLine wrapperStyle={{ display: 'block', width: '100%' }}>
                    <button
                      onClick={handleImportSoundfont}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        marginTop: 8, padding: '5px 8px', width: '100%',
                        borderRadius: 4, border: '1px dashed var(--border2)', background: 'transparent',
                        color: 'var(--text-inactive)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)',
                        cursor: 'pointer', justifyContent: 'center',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--text-amber)' }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-inactive)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
                    >
                      <Upload size={11} strokeWidth={1.5} />
                      Import your own .sf2/.sf3
                    </button>
                    </Tooltip>
                  </div>
                  </OptionRow>
                  </div>
                    )
                    return soundFontsBody
                  })()}
                  {/* ── Auto-Level on load — off by default; existing playback never changes
                      unexpectedly for anyone who hasn't opted in. Analyzes each file's note
                      unexpectedly for anyone who hasn't opted in. Analyzes each file's note
                      velocities as it loads and, if they dip a lot in places, automatically
                      turns on (and if needed strengthens) the Mixer Console's master
                      Compressor — same tool as manually setting a preset there, just picked
                      for you instead of requiring you to notice the dip and dig for it. ── */}
                  <OptionRow
                    label="Auto-Level on Load"
                    eyeToggle
                    eyeValue={autoLevelOnLoad}
                    onEyeChange={setAutoLevelOnLoad}
                    description="Automatically balances loud and quiet passages in a MIDI file using the Compressor's makeup gain."
                  />
                </CollapsibleSection>

                {/* ── 2. MIDI FILES & LIBRARY ────────────────────────────────────── */}
                <CollapsibleSection icon={<Files size={11} />} label="MIDI Files & Library"
                  collapsed={settingsGroupsCollapsed['midi-files-library']}
                  onToggle={() => setSettingsGroupCollapsed('midi-files-library', !settingsGroupsCollapsed['midi-files-library'])}
                >
                  {/* ── Demo folder — eye-toggle: Eye=show, EyeOff=hidden ────────── */}
                  <OptionRow
                    label="Demo content"
                    eyeToggle
                    eyeValue={!hideDemoFolder}
                    onEyeChange={(val) => setHideDemoFolder(!val)}
                    description="Hides bundled demo songs from library view. Files are not deleted."
                  />
                  {/* ── Chord Transcription — eye-toggle with BETA badge ──────────── */}
                  <OptionRow
                    label="Chord Transcription"
                    badge={<BetaBadge />}
                    eyeToggle
                    eyeValue={chordTranscriptionEnabled}
                    onEyeChange={setChordTranscriptionEnabled}
                    description="Adds a transcript icon to every file in your library — click to generate a chord chart PDF in ORFEO folder."
                  />
                </CollapsibleSection>

                {/* ── 3. PLAYBACK & EDITING ──────────────────────────────────────── */}
                <CollapsibleSection icon={<Music size={11} />} label="Playback & Editing"
                  collapsed={settingsGroupsCollapsed['playback-editing']}
                  onToggle={() => setSettingsGroupCollapsed('playback-editing', !settingsGroupsCollapsed['playback-editing'])}
                >
                  {/* ── Note Editor — eye-toggle: unlocks the note-edit icon in the Tracks panel ── */}
                  <OptionRow
                    label="MIDI Note Editor"
                    eyeToggle
                    eyeValue={noteEditorEnabled}
                    onEyeChange={setNoteEditorEnabled}
                    description={
                      <>
                        Shows <span style={{ display: 'inline-flex', verticalAlign: '-2px', margin: '0 2px', color: 'var(--text-amber)' }}><AudioLines size={11} /></span> icon in the Tracks panel. Enables MIDI note-editing mode directly on the piano roll.
                      </>
                    }
                  />
                  {/* ── Left/Right Hand BETA — eye-toggle; sub-controls unchanged ─── */}
                  <OptionRow
                    label="Hand Assignment"
                    badge={<BetaBadge />}
                    eyeToggle
                    eyeValue={showHandLabels}
                    onEyeChange={setShowHandLabels}
                    description={<>
                      Automated hand assignment for piano that colors each note by the hand that plays it. A guideline, not a verified trascript!
                      <br /><br />
                      For a perfectly accurate split use MIDI note editor and click the{' '}
                      <span style={{ display: 'inline-flex', verticalAlign: '-2px', margin: '0 2px', color: 'var(--text-amber)' }}><Hand size={11} /></span>
                      {' '}icon to manually assign notes to left and right hand.
                    </>}
                  />
                  {/* ── Sub-controls — only visible when hand labels are on ─────────── */}
                  {showHandLabels && (
                    <>
                      {/* ── Max fingers per hand — hard cap for the hand-assignment
                          engine's wide-chord split point; independent per hand. This
                          is a real cost-function parameter in the DP split algorithm
                          (handAssignment.ts), not cosmetic — kept, just redesigned:
                          heading, Left, Right, one shared description below. ────── */}
                      <div style={{
                        padding: '5px 14px 3px',
                        fontSize: 9, color: 'var(--text-muted)', fontWeight: 600,
                        letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)',
                      }}>
                        Max Fingers
                      </div>
                      <div style={{ padding: '3px 14px 6px', display: 'flex', alignItems: 'center', gap: 16 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-default)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>Left hand</span>
                          <FingerStepper value={lhMaxFingers} onChange={setLhMaxFingers} />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span style={{ fontSize: 10, color: 'var(--text-default)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>Right hand</span>
                          <FingerStepper value={rhMaxFingers} onChange={setRhMaxFingers} />
                        </div>
                      </div>
                      <div style={{ padding: '2px 12px 6px', color: 'var(--text-inactive)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', lineHeight: 1.5, fontStyle: 'italic' }}>
                        How many notes of a wide chord each hand can take before the rest is absorbed by the other — left counts from the bottom of the chord, right from the top.
                      </div>
                      {/* ── Mode (Practice/Performance) — disabled, not deleted.
                          Practice mode proves inconsistent in performance for now;
                          may return once improved. A JS false-guard instead of a
                          JSX comment, since this block has its own inline JSX
                          comments that would terminate a wrapping one early. ── */}
                      {false && (
                        <>
                          <OptionRow
                            label="Mode"
                            hint={handLabelMode === 'practice'
                              ? 'Practice shows a split line that moves with the piece, averaged over a few seconds of hand tags.'
                              : 'Performance colors each note on the keyboard by its own hand tag as it plays.'}
                          >
                            <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                              <OptionBtn active={handLabelMode === 'practice'}    onClick={() => setHandLabelMode('practice')}>Practice</OptionBtn>
                              <OptionBtn active={handLabelMode === 'performance'} onClick={() => setHandLabelMode('performance')}>Performance</OptionBtn>
                            </div>
                          </OptionRow>
                          {handLabelMode === 'practice' && (
                            <div style={{ padding: '2px 12px 6px', color: 'var(--text-inactive)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', lineHeight: 1.5 }}>
                              The line tracks the average pitch split between left- and right-hand notes in a ~3-second window around the playhead — not user-adjustable, it comes straight from the hand-assignment engine's tags.
                            </div>
                          )}
                          {handLabelMode === 'performance' && (
                            <>
                              <OptionRow label="Hardware Split Sensitivity" labelSmall>
                                <div style={{ fontSize: 11, color: 'var(--text-dim-control)', fontFamily: 'var(--font-mono)', marginBottom: 4 }}>
                                  {performanceSplitSensitivity} semitones
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 9, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>2</span>
                                  <input
                                    type="range" min={2} max={16} step={1}
                                    value={performanceSplitSensitivity}
                                    onChange={e => setPerformanceSplitSensitivity(Number(e.target.value))}
                                    className="orfeo-slider-amber"
                                    style={{ flex: 1, '--fill': `${((performanceSplitSensitivity - 2) / 14) * 100}%` } as CSSProperties}
                                  />
                                  <span style={{ fontSize: 9, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)', flexShrink: 0 }}>16</span>
                                </div>
                              </OptionRow>
                              <div style={{ padding: '2px 12px 6px', color: 'var(--text-inactive)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', lineHeight: 1.5 }}>
                                Only affects notes played on a physical MIDI keyboard, which have no file tag to read.
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </>
                  )}
                  {/* ── Loop region — eye-toggle ──────────────────────────────────── */}
                  <OptionRow
                    label="Loop region"
                    eyeToggle
                    eyeValue={loopRegionEnabled}
                    onEyeChange={setLoopRegionEnabled}
                    description={<>
                      Shows a strip to select and loop-play a section. Alt+Click & drag to select. Click{' '}
                      <span style={{ display: 'inline-flex', verticalAlign: '-2px', margin: '0 2px', color: 'var(--text-amber)' }}><Repeat size={11} /></span>
                      {' '}icon to loop.
                    </>}
                  />
                  {/* ── Selective Tracks Playback — eye-toggle; shows/hides quick-toggle button in Track Panel ─ */}
                  <OptionRow
                    label="Focus mode"
                    eyeToggle
                    eyeValue={autoMuteNonKeyboard}
                    onEyeChange={setAutoMuteNonKeyboard}
                    description="Focus ON/OFF toggle in Tracks panel and Console Mixer allows you to select if you want to hear/see all tracks or only Keys, Bass & Drums."
                  />
                </CollapsibleSection>

                {/* ── 4. PRACTICE ────────────────────────────────────────────────── */}
                <CollapsibleSection icon={<BookOpen size={11} />} label="Practice"
                  collapsed={settingsGroupsCollapsed['practice']}
                  onToggle={() => setSettingsGroupCollapsed('practice', !settingsGroupsCollapsed['practice'])}
                >
                  {/* ── Chord Prompter — eye-toggle ───────────────────────────────── */}
                  <OptionRow
                    label="Chord Prompter"
                    eyeToggle
                    eyeValue={chordPrompterEnabled}
                    onEyeChange={setChordPrompterEnabled}
                    description={<>
                      Shows past, current and upcoming chords during playback. Click{' '}
                      <span style={{ display: 'inline-flex', verticalAlign: '-2px', margin: '0 2px', color: 'var(--text-amber)' }}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="8" x="7" y="8" rx="1"/></svg>
                      </span>
                      {' '}icon above keyboard to enable it.
                    </>}
                  />
                  {/* ── Auto-collapse drawers — collapses the Tracks panel on
                      playback, restores it on pause/new file load ──────────────── */}
                  <OptionRow
                    label="Close panels on playback"
                    eyeToggle
                    eyeValue={autoCollapseDrawers}
                    onEyeChange={setAutoCollapseDrawers}
                    description={<>Automatically hide side panels during playback to maximize the piano roll view. For full-screen view click{' '}
                      <span style={{ display: 'inline-flex', verticalAlign: '-2px', margin: '0 2px', color: 'var(--text-amber)' }}><Expand size={10} /></span>
                      {' '}to enter presentation mode.
                  </>}
                  />
                  {/* ── Hand letter badges — accessibility backup for colorblind users
                      who can't rely on the blue/pink alone. Independent of Left/Right
                      Hand above: a genuinely split Left Hand/Right Hand track (e.g. from
                      Split Hands in the Playback Editor) stays blue/pink even with that
                      toggle off, so this needs to work on its own too. ─────────────── */}
                  <OptionRow
                    label="Hand tags"
                    eyeToggle
                    eyeValue={showHandLetters}
                    onEyeChange={setShowHandLetters}
                    description="Prints a small L/R badge on hand-colored keys, for colorblind users who can't rely on blue vs. pink alone."
                  />
                  {/* ── Tracks panel color line doubles as a mini VU meter ──────────── */}
                  <OptionRow
                    label="Track color VU meters"
                    eyeToggle
                    eyeValue={trackVuColorEnabled}
                    onEyeChange={setTrackVuColorEnabled}
                    description="Each track's color line in the Tracks panel pulses with its playback level, without opening the Console Mixer"
                  />
                </CollapsibleSection>

                {/* ── 5. NOTATION & CHORDS ───────────────────────────────────────── */}
                <CollapsibleSection icon={<Music2 size={11} />} label="Notation & Chords"
                  collapsed={settingsGroupsCollapsed['notation']}
                  onToggle={() => setSettingsGroupCollapsed('notation', !settingsGroupsCollapsed['notation'])}
                >
                  {/* ── Display system — single 4-button row; Hide uses EyeOff icon ── */}
                  <OptionRow label="Display system">
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5, fontFamily: 'var(--font-ui)', marginBottom: 6, fontStyle: 'italic' }}>
                      Select your preferred note naming system for notation and labels.
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      {NOTE_NAMING_OPTIONS.slice(0, 3).map(opt => (
                        <OptionBtn key={opt.value} active={noteNaming === opt.value}
                          onClick={() => setNoteNaming(opt.value)}>
                          {opt.label}
                        </OptionBtn>
                      ))}
                      {/* ── Hide — EyeOff icon; red when active (hidden is a meaningful state) ── */}
                      <OptionBtn
                        active={noteNaming === 'hidden'}
                        onClick={() => setNoteNaming('hidden')}
                        activeColor="error"
                      >
                        <EyeClosed size={11} strokeWidth={1.5} />
                      </OptionBtn>
                    </div>
                    {/* ── Note name preview — value display, JetBrains Mono intentional ── */}
                    <div style={{
                      marginTop: 6, padding: '4px 8px',
                      background: 'var(--bg-row)', borderRadius: 4,
                      fontSize: 10, fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)', letterSpacing: '0.08em', textAlign: 'center',
                    }}>
                      {noteNaming === 'english'          && 'C  D  E  F  G  A  B'}
                      {noteNaming === 'central-european' && 'C  D  E  F  G  A  H'}
                      {noteNaming === 'solfege'          && 'Do Re Mi Fa Sol La Si'}
                      {noteNaming === 'hidden'           && '— labels hidden —'}
                    </div>
                  </OptionRow>
                  {/* ── Accidentals — only shown when note names are visible ───────── */}
                  {noteNaming !== 'hidden' && (
                    <OptionRow
                      label="Accidentals"
                      hint={accidentals === 'flat' ? 'Bb  Eb  Ab  Db  Gb' : 'A#  D#  G#  C#  F#'}
                      hintCenter
                    >
                      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5, fontFamily: 'var(--font-ui)', marginBottom: 6, fontStyle: 'italic' }}>
                        Select your preferred enharmonic spelling for black keys: sharps or flats.
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
                        <span
                          onClick={() => setAccidentals('flat')}
                          style={{
                            cursor: 'pointer', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', fontWeight: 600,
                            color: accidentals === 'flat' ? 'var(--text-amber)' : 'var(--text-inactive)',
                          }}
                        ><span style={{ fontSize: 'calc(var(--text-xs) * 1.5)' }}>♭</span> Flats</span>
                        <button
                          onClick={() => setAccidentals(accidentals === 'flat' ? 'sharp' : 'flat')}
                          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', color: 'var(--text-amber)' }}
                        >
                          {accidentals === 'flat'
                            ? <ToggleLeft  size={16} strokeWidth={1.5} />
                            : <ToggleRight size={16} strokeWidth={1.5} />
                          }
                        </button>
                        <span
                          onClick={() => setAccidentals('sharp')}
                          style={{
                            cursor: 'pointer', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', fontWeight: 600,
                            color: accidentals === 'sharp' ? 'var(--text-amber)' : 'var(--text-inactive)',
                          }}
                        ><span style={{ fontSize: 'calc(var(--text-xs) * 1.5)' }}>♯</span> Sharps</span>
                      </div>
                    </OptionRow>
                  )}

                  {/* ── Chord tracking — what the playback chord display & lock-a-chord
                      actually follow. See docs/superpowers/specs/2026-08-20-chord-
                      settings-design.md for the full design writeup. ──────────────── */}
                  <OptionRow label="Chord tracking">
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5, fontFamily: 'var(--font-ui)', marginBottom: 6, fontStyle: 'italic' }}>
                      Select what the live chord display and the Lock-A-Chord modal follow during playback.
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      <OptionBtn active={chordTrackingMode === 'classic'} onClick={() => setChordTrackingMode('classic')}>Classic</OptionBtn>
                      <OptionBtn active={chordTrackingMode === 'harmony'} onClick={() => setChordTrackingMode('harmony')}>Harmony</OptionBtn>
                      <OptionBtn active={chordTrackingMode === 'follow'} onClick={() => setChordTrackingMode('follow')}>Follow</OptionBtn>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)', lineHeight: 1.5 }}>
                      {chordTrackingMode === 'classic' && 'All tracks are pooled together, grouped by note onset. Can flicker between incidental combinations under a busy melody.'}
                      {chordTrackingMode === 'harmony' && 'Tracks which notes are actually sounding at each moment — the real harmony stays correctly named under a moving melody.'}
                      {chordTrackingMode === 'follow' && 'Same sustain-aware detection, scoped to one instrument or group — falls back to General Harmony if it’s not present in the file.'}
                    </div>

                    {chordTrackingMode === 'follow' && (
                      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border-row)' }}>
                        <div style={{ display: 'flex', gap: 'var(--space-1)', marginBottom: 6 }}>
                          <OptionBtn active={chordFollowSubMode === 'group'} onClick={() => setChordFollowSubMode('group')}>By Group</OptionBtn>
                          <OptionBtn active={chordFollowSubMode === 'track'} onClick={() => setChordFollowSubMode('track')}>By Track</OptionBtn>
                        </div>

                        {chordFollowSubMode === 'group' ? (
                          <SettingsDropdown
                            value={chordFollowGroup ?? ''}
                            onChange={(v) => setChordFollowGroup(v || null)}
                            options={[
                              { value: '', label: '— choose a group —' },
                              ...CHORD_FOLLOW_GROUPS.map(g => ({ value: g, label: groupLabel(g) })),
                            ]}
                          />
                        ) : chordTracks.length === 0 ? (
                          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-inactive)', fontFamily: 'var(--font-ui)', fontStyle: 'italic' }}>
                            No file open
                          </div>
                        ) : (
                          <SettingsDropdown
                            value={chordFollowTrackIndex === null ? '' : String(chordFollowTrackIndex)}
                            onChange={(v) => setChordFollowTrackIndex(v === '' ? null : Number(v))}
                            options={[
                              { value: '', label: '— choose a track —' },
                              ...chordTracks.map(t => ({ value: String(t.index), label: t.trackName })),
                            ]}
                          />
                        )}
                      </div>
                    )}
                  </OptionRow>

                  {/* ── Chord naming — abbreviation vs symbol, applied everywhere a
                      chord name is shown (playback display, lock-a-chord, Chords
                      Explorer, Scales Explorer). ─────────────────────────────────── */}
                  <OptionRow label="Chord naming">
                    <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5, fontFamily: 'var(--font-ui)', marginBottom: 6, fontStyle: 'italic' }}>
                      How chord qualities are written, everywhere a chord name appears.
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      <OptionBtn active={chordNamingStyle === 'abbreviation'} onClick={() => setChordNamingStyle('abbreviation')}>Abbreviations</OptionBtn>
                      <OptionBtn active={chordNamingStyle === 'symbol'} onClick={() => setChordNamingStyle('symbol')}>Symbols</OptionBtn>
                    </div>
                    <div style={{
                      marginTop: 6, padding: '4px 8px',
                      background: 'var(--bg-row)', borderRadius: 4,
                      fontSize: 10, fontFamily: 'var(--font-mono)',
                      color: 'var(--text-dim)', letterSpacing: '0.04em', textAlign: 'center',
                    }}>
                      {chordNamingStyle === 'abbreviation'
                        ? 'Bb(b5)/D  ·  Cm7  ·  Gaug  ·  Fdim7'
                        : 'Bb(♭5)/D  ·  Cm7  ·  G+  ·  F°7'}
                    </div>
                  </OptionRow>
                </CollapsibleSection>

                {/* ── 6. KEYBOARD ────────────────────────────────────────────────── */}
                <CollapsibleSection icon={<Piano size={11} />} label="Keyboard"
                  collapsed={settingsGroupsCollapsed['keyboard']}
                  onToggle={() => setSettingsGroupCollapsed('keyboard', !settingsGroupsCollapsed['keyboard'])}
                >
                  {/* ── Key range — multi-choice selector, unchanged structure ───── */}
                  <OptionRow label="Key range" hint="Number of keys on the virtual keyboard">
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      {KEYBOARD_SIZES.map(size => (
                        <OptionBtn key={size} active={keyboardSize === size}
                          onClick={() => setKeyboardSize(size)}>
                          {size}
                        </OptionBtn>
                      ))}
                    </div>
                  </OptionRow>
                  {/* ── Labels sub-group heading — contains Show octaves + Show note names,
                      so it gets the same weight as a real heading, not a thin divider ── */}
                  <div style={{
                    padding: '5px 14px 3px',
                    fontSize: 'var(--text-xs)', color: 'var(--text-default)', fontWeight: 500,
                    letterSpacing: '0.02em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)',
                    borderTop: '1px solid var(--border-row)',
                  }}>
                    Labels
                  </div>
                  {/* ── Octave labels — show/hide octave numbers on virtual keyboard ─ */}
                  <OptionRow
                    label="Show octaves"
                    labelSmall
                    eyeToggle
                    eyeValue={showOctaveLabels}
                    onEyeChange={setShowOctaveLabels}
                    description="Display octave numbers (e.g. C3, C4, C5) on the virtual keyboard."
                  />
                  {/* ── Note name labels — show/hide note names on virtual keyboard ── */}
                  <OptionRow
                    label="Show note names"
                    labelSmall
                    eyeToggle
                    eyeValue={showNoteNamesOnKeyboard}
                    onEyeChange={setShowNoteNamesOnKeyboard}
                    description="Display note names on the virtual keyboard for easier identification."
                  />
                </CollapsibleSection>

                {/* ── 7. PIANO ROLL ──────────────────────────────────────────────── */}
                <CollapsibleSection icon={<Columns3 size={11} />} label="Piano Roll"
                  collapsed={settingsGroupsCollapsed['piano-roll']}
                  onToggle={() => setSettingsGroupCollapsed('piano-roll', !settingsGroupsCollapsed['piano-roll'])}
                >
                  {/* ── Zoom slider — unchanged ───────────────────────────────────── */}
                  <OptionRow label={`Zoom  —  ${Math.round(zoomLevel * 100)}%`} hint={`${Math.round(6 / zoomLevel * 10) / 10}s visible · higher = notes appear larger`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                      <ZoomStepBtn
                        disabled={zoomLevel <= ZOOM_STEPS[0]}
                        onClick={() => { const i = ZOOM_STEPS.indexOf(zoomLevel); if (i > 0) setZoomLevel(ZOOM_STEPS[i - 1]) }}
                      >−</ZoomStepBtn>
                      <div style={{ flex: 1, position: 'relative', height: 4, background: 'var(--border)', borderRadius: 2 }}>
                        <div style={{
                          position: 'absolute', left: 0, top: 0, height: '100%', borderRadius: 2,
                          background: 'var(--text-amber)',
                          width: `${(ZOOM_STEPS.indexOf(zoomLevel) / (ZOOM_STEPS.length - 1)) * 100}%`,
                          transition: 'width 0.12s',
                        }} />
                        {ZOOM_STEPS.map((step, i) => (
                          <Tooltip key={step} title={`${Math.round(step * 100)}%`}>
                          <button onClick={() => setZoomLevel(step)}
                            style={{
                              position: 'absolute',
                              left: `${(i / (ZOOM_STEPS.length - 1)) * 100}%`,
                              top: '50%', transform: 'translate(-50%, -50%)',
                              width: 10, height: 10, borderRadius: '50%',
                              background: zoomLevel === step ? 'var(--text-amber)' : 'var(--state-hover-bg)',
                              border: `1.5px solid ${zoomLevel === step ? 'var(--text-amber)' : 'var(--text-muted)'}`,
                              cursor: 'pointer', padding: 0, transition: 'all 0.12s',
                            }} />
                          </Tooltip>
                        ))}
                      </div>
                      <ZoomStepBtn
                        disabled={zoomLevel >= ZOOM_STEPS[ZOOM_STEPS.length - 1]}
                        onClick={() => { const i = ZOOM_STEPS.indexOf(zoomLevel); if (i < ZOOM_STEPS.length - 1) setZoomLevel(ZOOM_STEPS[i + 1]) }}
                      >+</ZoomStepBtn>
                    </div>
                  </OptionRow>
                  {/* ── Bar numbers & grid lines — eye-toggle ──────────────────────── */}
                  <OptionRow
                    label="Bar numbers & grid lines"
                    eyeToggle
                    eyeValue={showBarNumbers}
                    onEyeChange={setShowBarNumbers}
                    description="Turn on to see bar numbers and horizontal lines in piano roll."
                  />
                  {/* ── Show Playbar — eye-toggle; off tracks the hit line to the ──
                       live keyboard position instead (docked or floating). */}
                  <OptionRow
                    label="Show Playbar"
                    eyeToggle
                    eyeValue={playbarVisible}
                    onEyeChange={setPlaybarVisible}
                    description="When off, notes fall toward the keyboard's actual on-screen position instead on a fixed line."
                  />
                  {/* ── Note Hit Effects — eye-toggle, off by default; pattern picker ──
                       only shown when on. */}
                  <OptionRow
                    label="Visual Effects"
                    eyeToggle
                    eyeValue={hitEffectsEnabled}
                    onEyeChange={setHitEffectsEnabled}
                    description="Animated flourish when notes hit the playbar during playback."
                  />
                  {hitEffectsEnabled && (
                    <OptionRow label="Scope & Color" labelSmall>
                      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'stretch' }}>
                        {/* ── Left: which tracks spawn effects — purely visual, doesn't touch
                            which notes actually sound or light the keyboard. Compact icon
                            toggle instead of a pair of pill buttons. ── */}
                        <Tooltip
                          title={hitEffectScope === 'keyboard' ? 'Piano tracks only' : 'All tracks'}
                          description={hitEffectScope === 'keyboard'
                            ? 'Effects on keyboard tracks only — click to include every track in the file.'
                            : 'Effects on every track in the file — click to limit to keyboard tracks only.'}
                          wrapperStyle={{ width: 116, flexShrink: 0 }}
                        >
                        <button
                          onClick={() => setHitEffectScope(hitEffectScope === 'keyboard' ? 'all' : 'keyboard')}
                          style={{
                            // Fixed width (fits the longer label) instead of flex — otherwise
                            // toggling between "Keyboard tracks" and "All tracks" shifts every
                            // control to its right left/right on each click.
                            width: 116, flexShrink: 0,
                            display: 'flex', alignItems: 'center', gap: 6, padding: 0,
                            border: 'none', background: 'none',
                            fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', cursor: 'pointer',
                          }}
                        >
                          {hitEffectScope === 'keyboard'
                            ? <ToggleLeft size={16} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--text-amber)' }} />
                            : <ToggleRight size={16} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--text-amber)' }} />
                          }
                          <span style={{ color: 'var(--text-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}>
                            {hitEffectScope === 'keyboard' ? 'Piano only' : 'All tracks'}
                          </span>
                        </button>
                        </Tooltip>
                        {/* ── Right: overrides the effect particle color for every track at once
                            — never touches the falling-note color or the key glow. ── */}
                        <HitEffectColorSwatch color={hitEffectColor} onChange={setHitEffectColor} />
                        {hitEffectColor && (
                          <Tooltip title="Use each track's own color again" wrapperStyle={{ flexShrink: 0 }}>
                          <button
                            onClick={() => setHitEffectColor(null)}
                            style={{
                              display: 'flex', alignItems: 'center',
                              color: 'var(--text-dimmest)',
                              background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', flexShrink: 0,
                            }}
                            onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-dimmest)'}
                          >
                            <Undo2 size={11} />
                          </button>
                          </Tooltip>
                        )}
                      </div>
                    </OptionRow>
                  )}
                  {hitEffectsEnabled && (
                    <OptionRow label="Pattern" labelSmall>
                      <SettingsDropdown
                        value={hitEffectPattern}
                        onChange={v => setHitEffectPattern(v as typeof hitEffectPattern)}
                        options={[
                          { value: 'glowBloom',     label: 'Glow Bloom',     title: HIT_EFFECT_DESCRIPTIONS.glowBloom },
                          { value: 'rippleRing',    label: 'Ripple Ring',    title: HIT_EFFECT_DESCRIPTIONS.rippleRing },
                          { value: 'particleBurst', label: 'Particle Burst', title: HIT_EFFECT_DESCRIPTIONS.particleBurst },
                          { value: 'smokePlume',    label: 'Smoke Plume',    title: HIT_EFFECT_DESCRIPTIONS.smokePlume },
                          { value: 'colorAura',     label: 'Color Aura',     title: HIT_EFFECT_DESCRIPTIONS.colorAura },
                          { value: 'starburstNova', label: 'Starburst Nova', title: HIT_EFFECT_DESCRIPTIONS.starburstNova },
                          { value: 'cometTrail',    label: 'Comet Trail',    title: HIT_EFFECT_DESCRIPTIONS.cometTrail },
                        ]}
                      />
                      <div style={{ padding: '2px 12px 0', color: 'var(--text-inactive)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', lineHeight: 1.5, fontStyle: 'italic' }}>
                        {HIT_EFFECT_DESCRIPTIONS[hitEffectPattern]}
                      </div>
                    </OptionRow>
                  )}
                  {/* ── Bloom controls — real bloom (pixi-filters AdvancedBloomFilter) ── */}
                  {hitEffectsEnabled && (
                    <>
                      <OptionRow label={`Intensity — ${hitEffectBloomIntensity.toFixed(1)}`} labelSmall>
                        <Tooltip title="Drag to change" oneLine wrapperStyle={{ display: 'block', width: '100%' }}>
                        <input
                          type="range" min={0} max={4} step={0.1}
                          value={hitEffectBloomIntensity}
                          onChange={e => setHitEffectBloomIntensity(Number(e.target.value))}
                          className="orfeo-slider-amber"
                          style={{ '--fill': `${(hitEffectBloomIntensity / 4) * 100}%` } as CSSProperties}
                        />
                        </Tooltip>
                      </OptionRow>
                      <OptionRow label={`Spread — ${hitEffectBloomSpread.toFixed(1)}`} labelSmall>
                        <Tooltip title="Drag to change" oneLine wrapperStyle={{ display: 'block', width: '100%' }}>
                        <input
                          type="range" min={0} max={12} step={0.5}
                          value={hitEffectBloomSpread}
                          onChange={e => setHitEffectBloomSpread(Number(e.target.value))}
                          className="orfeo-slider-amber"
                          style={{ '--fill': `${(hitEffectBloomSpread / 12) * 100}%` } as CSSProperties}
                        />
                        </Tooltip>
                      </OptionRow>
                      <OptionRow label={`Threshold — ${hitEffectBloomThreshold.toFixed(2)}`} labelSmall hint="Lower values make more of the effect glow; higher values only bloom the brightest parts.">
                        <Tooltip title="Drag to change" oneLine wrapperStyle={{ display: 'block', width: '100%' }}>
                        <input
                          type="range" min={0} max={1} step={0.05}
                          value={hitEffectBloomThreshold}
                          onChange={e => setHitEffectBloomThreshold(Number(e.target.value))}
                          className="orfeo-slider-amber"
                          style={{ '--fill': `${hitEffectBloomThreshold * 100}%` } as CSSProperties}
                        />
                        </Tooltip>
                      </OptionRow>
                    </>
                  )}
                </CollapsibleSection>

                {/* ── 8. APPEARANCE — no content changes ─────────────────────────── */}
                <CollapsibleSection icon={<Palette size={11} />} label="Appearance"
                  collapsed={settingsGroupsCollapsed['appearance']}
                  onToggle={() => setSettingsGroupCollapsed('appearance', !settingsGroupsCollapsed['appearance'])}
                >
                  <OptionRow label="Theme">
                    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
                      <AppBgBtn color="var(--bg-modal-header)" label="Dark" active={appTheme === 'dark'} onClick={() => setAppTheme('dark')} />
                      <AppBgBtn color="var(--bg-warm)" label="Coming soon" active={false} onClick={() => {}} comingSoon />
                    </div>
                  </OptionRow>
                </CollapsibleSection>

                {/* ── About — single row: logo, name, version, credit. No border/margin
                    of its own — the Theme OptionRow right above it already has a
                    borderBottom, a second one here just made two lines with a gap. ── */}
                <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Tooltip title="Open Orfeo on GitHub" oneLine>
                  <button
                    onClick={() => window.electronAPI.openExternal('https://github.com/SquareBow/orfeo')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    }}
                  >
                    <OrfeoMark height={16} />
                    <span style={{ color: 'var(--text-inactive)', fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>Orfeo · v{__APP_VERSION__}</span>
                  </button>
                  </Tooltip>
                  <span style={{ color: 'var(--text-inactive)', fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>
                    · © SquareBow
                  </span>
                </div>

              </div>
            )}
          </div>

          {/* ── Manual link + update check — always visible at drawer bottom ── */}
          <div style={{
            flexShrink: 0,
            borderTop: '1px solid var(--bg-tile)',
            padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <Tooltip title="Open user manual on GitHub" oneLine wrapperStyle={{ flex: 1, minWidth: 0 }}>
            <button
              onClick={() => window.electronAPI.openExternal('https://github.com/SquareBow/orfeo/blob/main/docs/HOW_TO_USE.md')}
              style={{
                flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 7,
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: '4px 0',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
            >
              <BookOpen size={11} strokeWidth={1.5} />
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)', letterSpacing: '0.02em' }}>User Manual</span>
            </button>
            </Tooltip>
            {updateStatus.state === 'up-to-date' && (
              <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>
                Orfeo is up to date
              </span>
            )}
            {updateStatus.state === 'ready' && (
              <span style={{ fontSize: 9, color: 'var(--text-amber)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>
                Update ready — click to install
              </span>
            )}
            <Tooltip
              title={
                updateStatus.state === 'checking'    ? 'Checking for updates…' :
                updateStatus.state === 'downloading' ? `Downloading update${updateStatus.percent ? ` — ${Math.round(updateStatus.percent)}%` : '…'}` :
                updateStatus.state === 'ready'       ? `Update ${updateStatus.version ?? ''} ready — click to restart and install` :
                updateStatus.state === 'error'       ? `Update check failed: ${updateStatus.message ?? 'unknown error'} — click to open releases page` :
                updateStatus.state === 'unavailable' ? 'Open GitHub releases page' :
                'Check for updates'
              }
              oneLine
              wrapperStyle={{ flexShrink: 0 }}
              placement="left"
            >
            <button
              onClick={() => {
                if (updateStatus.state === 'ready') { window.electronAPI.installUpdate(); return }
                if (updateStatus.state === 'unavailable') { window.electronAPI.openExternal('https://github.com/SquareBow/orfeo/releases'); return }
                void handleCheckForUpdates()
              }}
              style={{
                position: 'relative',
                flexShrink: 0, display: 'flex', alignItems: 'center',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: updateStatus.state === 'ready' ? 'var(--text-amber)' : 'var(--text-muted)',
                padding: '4px 2px',
                transition: 'color 0.15s',
              }}
              onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
              onMouseLeave={e => { if (updateStatus.state !== 'ready') e.currentTarget.style.color = 'var(--text-muted)' }}
            >
              <CloudDownload size={13} strokeWidth={1.5} />
              {(updateStatus.state === 'downloading' || updateStatus.state === 'ready') && (
                <span
                  className={updateStatus.state === 'downloading' ? 'loop-nudge-blink' : undefined}
                  style={{
                    position: 'absolute', top: 1, right: 0,
                    width: 6, height: 6, borderRadius: '50%',
                    background: 'var(--text-amber)',
                  }}
                />
              )}
            </button>
            </Tooltip>
          </div>

        </div>
      )}
    </div>
  )
}

// ── Zoom step button — small +/− stepper for discrete-increment controls ──
function ZoomStepBtn({ onClick, disabled, children }: {
  onClick: () => void; disabled: boolean; children: React.ReactNode
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width: 22, height: 22, borderRadius: 4,
      background: 'var(--bg-modal)', border: '1px solid var(--border2)',
      color: disabled ? 'var(--state-disabled)' : 'var(--text-dimmest)',
      fontSize: 'var(--text-lg)', lineHeight: 1,
      cursor: disabled ? 'default' : 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    }}>
      {children}
    </button>
  )
}

// ── App background button — color swatch + label toggle for theme selection
function AppBgBtn({ color, label, active, onClick, comingSoon }: {
  color: string; label: string; active: boolean; onClick: () => void; comingSoon?: boolean
}) {
  return (
    <button onClick={comingSoon ? undefined : onClick} style={{
      flex: 1, padding: '6px 4px', borderRadius: 4,
      border: active ? '1px solid var(--accent-amber-strong)' : '1px solid var(--border2)',
      background: active ? 'var(--accent-amber-medium)' : 'var(--bg-modal)',
      color: active ? 'var(--text-amber)' : 'var(--text-inactive)',
      fontSize: 10, cursor: comingSoon ? 'default' : 'pointer',
      opacity: comingSoon ? 0.4 : 1,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-1)',
      transition: 'all 0.12s',
    }}>
      <div style={{ width: 28, height: 14, borderRadius: 'var(--radius-sm)', background: color, border: '1px solid var(--state-disabled)' }} />
      <span style={{ fontFamily: 'var(--font-ui)', fontSize: 10 }}>{label}</span>
    </button>
  )
}
