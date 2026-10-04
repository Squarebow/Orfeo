import { Palette, ZoomIn, RotateCcw } from 'lucide-react'
import { useStore } from '../../../store'
import { t } from '../../../utils/i18n'
import { AppBgBtn, ZoomStepper, GlanceLine, InlineIcon, useSurface } from '../controls'
import { useAppZoom } from '../../../hooks/useAppZoom'
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

export const APPEARANCE_DEFS: SettingDef[] = [
  { id: 'theme', icon: Palette, kind: 'choice', Control: ThemeControl },
  { id: 'appZoom', icon: ZoomIn, kind: 'inline', Control: AppZoomControl, Glance: AppZoomGlance, glanceQuickOnly: true, Extra: AppZoomCap,
    Description: () => <>{t`Makes everything in Orfeo bigger or smaller. Ctrl + / Ctrl − / Ctrl 0 work exactly as in a web browser.`} {t`Click`} <InlineIcon><RotateCcw size={10} /></InlineIcon> {t`to reset.`}</> },
]
