import { Palette, ZoomIn, RotateCcw, Sparkles, MessageSquare, Heart } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { AppBgBtn, ZoomStepper, GlanceLine, InlineIcon, Switch, useSurface } from '../controls'
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
