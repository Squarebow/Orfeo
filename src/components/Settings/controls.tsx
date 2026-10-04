import { useState, useRef, useEffect, createContext, useContext, type ReactNode } from 'react'
import {
  ChevronDown, ChevronLeft, ChevronRight, Palette, ToggleLeft, ToggleRight, ZoomIn, ZoomOut, RotateCcw, CloudDownload,
} from 'lucide-react'
import { useStore } from '../../store'
import { TRACK_COLOR_PALETTE } from '../../utils/colors'
import Tooltip, { useTooltip } from '../Tooltip'
import { useUpdateState, pressUpdateButton } from '../../hooks/useUpdateCheck'
import { t } from '../../utils/i18n'

// ── Which panel a control is drawn in — Setup (the drawer) or the Settings
// window — for the few controls that differ between the two. ─────────────
export const SurfaceContext = createContext<'setup' | 'window'>('window')
export const useSurface = () => useContext(SurfaceContext)

// ── Shared settings controls — used by the Settings window cards and the
// drawer's Quick Settings rows (moved out of SettingsPanel.tsx unchanged,
// plus the small pieces both surfaces need). ─────────────────────────────

// ── EyeClosed — custom icon replacing lucide EyeOff throughout settings ───────
export function EyeClosed({ size = 24, strokeWidth = 2 }: { size?: number; strokeWidth?: number }) {
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

// ── BETA badge — inline label pill for settings still being refined ──────────
export function BetaBadge() {
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

// ── Collapsible section — clickable header row (amber icon + label + chevron) that
// mounts/unmounts children; amber color applied once here, propagates to all 7 groups.
export function CollapsibleSection({ icon, label, defaultCollapsed = false, collapsed: controlledCollapsed, onToggle, action, children }: {
  icon: React.ReactNode
  label: string
  // ── Optional button before the chevron (Quick Settings' gear) — its clicks
  // never fold the group. ──
  action?: React.ReactNode
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
        {action && <span onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>{action}</span>}
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
export function OptionBtn({ active, onClick, children, title, oneLine, comingSoon, activeColor = 'accent' }: {
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
export function FingerStepper({ value, onChange }: { value: 4 | 5; onChange: (v: 4 | 5) => void }) {
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

// ── ZoomStepper — app zoom control (Settings → Appearance), same compact
// bordered-pill shape as FingerStepper above. `percent`/`steps`/`max` come
// from electron/main.ts (the one place that actually owns and persists the
// zoom level) via SettingsPanel's zoomInfo state — this is purely a
// display + dispatch component, same division of responsibility as the
// Ctrl +/-/0 shortcuts it stays in sync with. ──────────────────────────────
// the Settings window explains the zoom buttons in text, so no tooltips there
function MaybeTip({ on, title, children }: { on: boolean; title: string; children: React.ReactElement }) {
  return on ? <Tooltip title={title} oneLine>{children}</Tooltip> : children
}

export function ZoomStepper({ percent, steps, max, onStep, onReset, tooltips = true }: {
  percent: number; steps: number[]; max: number
  onStep: (direction: 1 | -1) => void; onReset: () => void
  tooltips?: boolean
}) {
  const atMin = percent <= steps[0]
  const atMax = percent >= max
  const chevronStyle = (disabled: boolean): React.CSSProperties => ({
    background: 'none', border: 'none', padding: 1, display: 'flex', alignItems: 'center',
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? 'var(--state-disabled)' : 'var(--text-inactive)',
  })
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, border: '1px solid var(--border2)', borderRadius: 4, padding: '1px 6px' }}>
        <MaybeTip on={tooltips} title="Zoom out">
        <button
          onClick={() => onStep(-1)}
          disabled={atMin}
          style={chevronStyle(atMin)}
          onMouseEnter={e => { if (!atMin) e.currentTarget.style.color = 'var(--text-amber)' }}
          onMouseLeave={e => { e.currentTarget.style.color = atMin ? 'var(--state-disabled)' : 'var(--text-inactive)' }}
        ><ZoomOut size={12} strokeWidth={1.5} /></button>
        </MaybeTip>
        <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--text-amber)', minWidth: 34, textAlign: 'center' }}>{percent}%</span>
        <MaybeTip on={tooltips} title="Zoom in">
        <button
          onClick={() => onStep(1)}
          disabled={atMax}
          style={chevronStyle(atMax)}
          onMouseEnter={e => { if (!atMax) e.currentTarget.style.color = 'var(--text-amber)' }}
          onMouseLeave={e => { e.currentTarget.style.color = atMax ? 'var(--state-disabled)' : 'var(--text-inactive)' }}
        ><ZoomIn size={12} strokeWidth={1.5} /></button>
        </MaybeTip>
      </div>
      <MaybeTip on={tooltips} title="Reset to 100%">
      <button
        onClick={onReset}
        disabled={percent === 100}
        style={chevronStyle(percent === 100)}
        onMouseEnter={e => { if (percent !== 100) e.currentTarget.style.color = 'var(--text-amber)' }}
        onMouseLeave={e => { e.currentTarget.style.color = percent === 100 ? 'var(--state-disabled)' : 'var(--text-inactive)' }}
      ><RotateCcw size={12} strokeWidth={1.5} /></button>
      </MaybeTip>
    </div>
  )
}

// ─── Hit-effect color picker — swatch trigger + in-app popover (hex + palette).
// Deliberately NOT a native <input type="color"> — that opens an OS-level dialog
// which was blurring the app window and closing the whole Settings drawer out
// from under it. Self-contained popover with its own outside-click/Escape close,
// same approach as MidiEditor's track ColorPopover. ─────────────────────────────
export function HitEffectColorSwatch({ color, onChange }: { color: string | null; onChange: (c: string) => void }) {
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

// ── SoundfontActionLink — the "remove"/"download" text links in the Sound
// Fonts catalog grid. Each row is a `display:'contents'` div so its 3 cells
// land as direct CSS Grid items — wrapping the link in `<Tooltip>` (a real
// div) would break that passthrough, and even `wrapperStyle={{display:
// 'contents'}}` doesn't work as a fix, since a `display:contents` element
// has no box of its own, so its `getBoundingClientRect()` degenerates to a
// zero-sized rect at the window's origin (tooltip renders in the top-left
// corner). `useTooltip` sidesteps this entirely: no wrapper, ref/hover go
// straight on the real `<button>`, which stays the grid's direct child. ────
export function SoundfontActionLink({ label, tooltip, color, onClick }: {
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

// ── SettingsDropdown — custom popover replacing native <select> ───────────────
// Native <select> option lists render via the OS (Windows' own blue-hover
// scheme on Chromium) and can't be restyled with CSS. Same visual shell as
// the old <select> (amber border/background trigger), options styled to
// match the app's own hover/selected palette instead of the OS default.
export function SettingsDropdown<T extends string>({ value, options, onChange, title }: {
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

// ── Zoom step button — small +/− stepper for discrete-increment controls ──
export function ZoomStepBtn({ onClick, disabled, children }: {
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
export function AppBgBtn({ color, label, active, onClick, comingSoon }: {
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

// ── Switch — the toggle icon every on/off setting uses (was inline in OptionRow)
export function Switch({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch" aria-checked={value} aria-label={label}
      onClick={() => onChange(!value)}
      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0,
        color: value ? 'var(--text-amber)' : 'var(--text-inactive)', transition: 'opacity 0.12s' }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}
    >
      {value ? <ToggleRight size={16} strokeWidth={1.5} /> : <ToggleLeft size={16} strokeWidth={1.5} />}
    </button>
  )
}

// ── Small amber icon inside running text ("Click ⟲ to loop")
export function InlineIcon({ children }: { children: ReactNode }) {
  return <span style={{ display: 'inline-flex', verticalAlign: '-2px', margin: '0 2px', color: 'var(--text-amber)' }}>{children}</span>
}

// ── At-a-glance line under a control (mono, dim) — Quick Settings + window
export function GlanceLine({ children, center }: { children: ReactNode; center?: boolean }) {
  return <div style={{ marginTop: 5, fontSize: 10, color: 'var(--text-inactive)', fontFamily: 'var(--font-mono)', lineHeight: 1.5, textAlign: center ? 'center' : 'left' }}>{children}</div>
}

// ── Preview strip (note names, chord spellings) — same look as before
export function PreviewBox({ children, spacing = '0.08em' }: { children: ReactNode; spacing?: string }) {
  return <div style={{ marginTop: 6, padding: '4px 8px', background: 'var(--bg-row)', borderRadius: 4, fontSize: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)', letterSpacing: spacing, textAlign: 'center' }}>{children}</div>
}

// ── Small-caps label for follow-up options inside a card
export function SubLabel({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 10, marginBottom: 6, fontSize: 9, color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)' }}>{children}</div>
}

// ── Italic helper text inside a card's follow-up options
export function HelpText({ children }: { children: ReactNode }) {
  return <div style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5, fontFamily: 'var(--font-ui)', fontStyle: 'italic' }}>{children}</div>
}

// ── Piano-roll zoom — − / step dots / + (moved from the drawer unchanged)
export const ROLL_ZOOM_STEPS = [0.5, 0.75, 1, 1.5, 2, 3]
export function RollZoomStepper() {
  const zoomLevel = useStore((s) => s.zoomLevel)
  const setZoomLevel = useStore((s) => s.setZoomLevel)
  const ZOOM_STEPS = ROLL_ZOOM_STEPS
  return (
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
  )
}

// ── Update check button (+ its short status text) — drawer footer and the
// Settings window header share one status (hooks/useUpdateCheck.ts). ─────
export function UpdateButton({ placement = 'left', showStatus = true }: { placement?: 'left' | 'right' | 'top' | 'bottom'; showStatus?: boolean }) {
  const updateStatus = useUpdateState((s) => s.status)
  const updateInfo = useUpdateState((s) => s.info)
  return (
    <>
      {showStatus && updateInfo.mode === 'auto' && updateStatus.state === 'up-to-date' && (
        <span style={{ fontSize: 9, color: 'var(--text-faint)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>
          Orfeo is up to date
        </span>
      )}
      {showStatus && updateInfo.mode === 'auto' && updateStatus.state === 'ready' && (
        <span style={{ fontSize: 9, color: 'var(--text-amber)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap' }}>
          Update ready — click to install
        </span>
      )}
      <Tooltip
        title={
          updateInfo.mode === 'manual'         ? t`Check for updates` :
          updateStatus.state === 'checking'    ? 'Checking for updates…' :
          updateStatus.state === 'downloading' ? `Downloading update${updateStatus.percent ? ` — ${Math.round(updateStatus.percent)}%` : '…'}` :
          updateStatus.state === 'ready'       ? `Update ${updateStatus.version ?? ''} ready — click to restart and install` :
          updateStatus.state === 'error'       ? `${(updateStatus.message ?? 'Update check failed').slice(0, 160)} — click to open the Releases page` :
          t`Check for updates`
        }
        oneLine
        wrapperStyle={{ flexShrink: 0 }}
        placement={placement}
      >
      <button
        onClick={pressUpdateButton}
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
    </>
  )
}
