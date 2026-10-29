import { useEffect, useState } from 'react'
import { Palette, ZoomIn, RotateCcw, Sparkles, MessageSquare, Heart, Hand } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { AppBgBtn, ZoomStepper, GlanceLine, InlineIcon, Switch, SubLabel, useSurface } from '../controls'
import { HAND_PRESETS, DEFAULT_HAND_LH, DEFAULT_HAND_RH, handColorWarnings, isHex } from '../../../utils/handPalette'
import { useAppZoom } from '../../../hooks/useAppZoom'
import { simAvailable } from '../../../utils/midiSimulator'
import { previewSupportNote } from '../../../hooks/useSupportNote'
import type { SettingDef } from '../types'

function ThemeControl() {
  const appTheme = useStore(s => s.appTheme)
  return (
    <div style={{ display: 'flex', gap: 'var(--space-1)' }}>
      <AppBgBtn color="var(--bg-modal-header)" label="Dark" active={appTheme === 'dark'} onClick={() => useStore.getState().setAppTheme('dark')} />
      <AppBgBtn color="var(--bg-warm)" label="Coming soon" active={false} onClick={() => {}} comingSoon />
    </div>
  )
}

function AppZoomControl() {
  const z = useAppZoom()
  // tooltips in Setup only — the window card explains the buttons in text
  const surface = useSurface()
  return <ZoomStepper percent={z.percent} steps={z.steps} max={z.max} onStep={z.step} onReset={z.reset} tooltips={surface === 'setup'} />
}
function AppZoomGlance() {
  const z = useAppZoom()
  return (
    <GlanceLine>
      {t`Ctrl + / Ctrl − / Ctrl 0 — like a web browser`}
      {z.max < 200 && <>{' · '}{t`Limited to ${z.max}% at this window size.`}</>}
    </GlanceLine>
  )
}

// Window card: the description already gives the shortcuts — only the size cap
function AppZoomCap() {
  const z = useAppZoom()
  if (z.max >= 200) return null
  return <GlanceLine>{t`Limited to ${z.max}% at this window size.`}</GlanceLine>
}

// ── Hand colours — ready-made pairs (Control), then your own pair, clash
// notes and reset (Extra). Every change applies at once (store → CSS vars).
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()

function HandSwatch({ color }: { color: string }) {
  return <span style={{ width: 14, height: 14, borderRadius: 3, background: color, border: '1px solid var(--border2)', flexShrink: 0 }} />
}

function HandPresets() {
  const lh = useStore(s => s.handColorLH), rh = useStore(s => s.handColorRH)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-1)' }}>
      {HAND_PRESETS.map(p => {
        const active = same(p.lh, lh) && same(p.rh, rh)
        return (
          <button key={p.id} onClick={() => useStore.getState().setHandColors(p.lh, p.rh)} aria-pressed={active}
            style={{ display: 'grid', gridTemplateColumns: 'auto auto minmax(0, 1fr)', alignItems: 'center', gap: 4, padding: '5px 6px', borderRadius: 4,
              border: active ? '1px solid var(--accent-amber-strong)' : '1px solid var(--border2)',
              background: active ? 'var(--accent-amber-medium)' : 'var(--bg-modal)',
              color: active ? 'var(--text-amber)' : 'var(--text-inactive)',
              fontSize: 10, fontFamily: 'var(--font-ui)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}>
            <HandSwatch color={p.lh} /><HandSwatch color={p.rh} />
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginLeft: 2 }}>{p.name}</span>
          </button>
        )
      })}
    </div>
  )
}

function HandPicker({ label, value, onPick }: { label: string; value: string; onPick: (hex: string) => void }) {
  const [text, setText] = useState(value)
  useEffect(() => { setText(value) }, [value])
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '36px max-content 80px', alignItems: 'center', gap: 6, minWidth: 0,
      fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--text-inactive)' }}>
      {label}
      <span style={{ position: 'relative', width: 18, height: 18, borderRadius: 3, background: value, border: '1px solid var(--border2)', overflow: 'hidden' }}>
        <input type="color" value={value} onChange={e => onPick(e.target.value)} aria-label={t`${label} colour`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', border: 'none', padding: 0 }} />
      </span>
      <input value={text} spellCheck={false} aria-label={t`${label} colour, hex value`}
        onChange={e => { setText(e.target.value); if (isHex(e.target.value)) onPick(e.target.value) }}
        onBlur={() => setText(value)}
        style={{ minWidth: 0, padding: '3px 5px', borderRadius: 4, border: '1px solid var(--border2)', background: 'var(--bg-modal)',
          color: 'var(--text-default)', fontSize: 10, fontFamily: 'var(--font-mono)', boxSizing: 'border-box' }} />
    </label>
  )
}

function HandColorsExtra() {
  const lh = useStore(s => s.handColorLH), rh = useStore(s => s.handColorRH)
  const set = useStore.getState().setHandColors
  const warnings = handColorWarnings(lh, rh)
  const isDefault = same(lh, DEFAULT_HAND_LH) && same(rh, DEFAULT_HAND_RH)
  return (
    <>
      <SubLabel>{t`Your own`}</SubLabel>
      <div style={{ display: 'grid', rowGap: 6 }}>
        <HandPicker label={t`Left`} value={lh} onPick={hex => set(hex, rh)} />
        <HandPicker label={t`Right`} value={rh} onPick={hex => set(lh, hex)} />
      </div>
      {warnings.map(w => <GlanceLine key={w}>⚠ {w}</GlanceLine>)}
      {!isDefault && (
        <button onClick={() => set(DEFAULT_HAND_LH, DEFAULT_HAND_RH)}
          style={{ marginTop: 10, alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 5, padding: 0, border: 'none', background: 'none',
            color: 'var(--text-inactive)', fontSize: 10, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-inactive)' }}>
          <RotateCcw size={10} /> {t`Back to Orfeo's colours`}
        </button>
      )}
    </>
  )
}

// Test builds: see either version's note now instead of on the 5th launch
function SupportNotePreview() {
  if (!simAvailable) return null
  const btn = (label: string, store: boolean) => (
    <button onClick={() => previewSupportNote(store)}
      style={{ padding: '3px 6px', borderRadius: 4, border: '1px dashed var(--border2)', background: 'transparent', color: 'var(--text-inactive)',
        fontSize: 10, fontFamily: 'var(--font-ui)', cursor: 'pointer' }}>{label}</button>
  )
  return (
    <div style={{ marginTop: 12, padding: 8, border: '1px dashed var(--border2)', borderRadius: 4 }}>
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 6 }}>{t`Preview · test builds only`}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {btn(t`Show note`, false)}
        {btn(t`Microsoft Store version`, true)}
      </div>
    </div>
  )
}

export const APPEARANCE_DEFS: SettingDef[] = [
  { id: 'theme', icon: Palette, kind: 'choice', Control: ThemeControl },
  { id: 'handColors', icon: Hand, kind: 'choice', Control: HandPresets, Extra: HandColorsExtra },
  { id: 'appZoom', icon: ZoomIn, kind: 'inline', Control: AppZoomControl, Glance: AppZoomGlance, glanceQuickOnly: true, Extra: AppZoomCap,
    Description: () => <>{t`Makes everything in Orfeo bigger or smaller. Ctrl + / Ctrl − / Ctrl 0 work exactly as in a web browser.`} {t`Click`} <InlineIcon><RotateCcw size={10} /></InlineIcon> {t`to reset.`}</> },
  {
    id: 'tooltips', icon: MessageSquare, kind: 'switch',
    Control: () => { const v = useStore(s => s.tooltipsEnabled); return <Switch value={v} onChange={useStore.getState().setTooltipsEnabled} label={t`Tooltips`} /> },
  },
  {
    id: 'supportNote', icon: Heart, kind: 'switch', Extra: SupportNotePreview,
    Control: () => { const v = useStore(s => s.supportNoteEnabled); return <Switch value={v} onChange={useStore.getState().setSupportNoteEnabled} label={t`Enjoying Orfeo?`} /> },
  },
  {
    id: 'starmap', icon: Sparkles, kind: 'switch',
    Control: () => { const v = useStore(s => s.starmapEnabled); return <Switch value={v} onChange={useStore.getState().setStarmapEnabled} label={t`Starmap`} /> },
  },
]
