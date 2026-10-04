import { useId } from 'react'
import { SETTING_BY_ID, type SettingId } from './catalog'
import { DEFS } from './defs'
import { BetaBadge, SurfaceContext } from './controls'

const always = () => true

// ── One setting in the Settings window: icon + name (switch on the right),
// full description, then its controls, glance lines and follow-up options.
export function SettingCard({ id }: { id: SettingId }) {
  const def = DEFS[id], info = SETTING_BY_ID[id]
  const useVisible = def.useVisible ?? always
  const visible = useVisible()
  const labelId = useId()
  if (!visible) return null
  const { Control, Glance, Extra, Description, NameSuffix, icon: Icon } = def
  const onNameLine = def.kind !== 'choice'
  return (
    <SurfaceContext.Provider value="window">
    <div role="group" aria-labelledby={labelId} style={{
      background: 'var(--bg-tile)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)',
      padding: '12px 14px', minWidth: 0, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 8, marginBottom: 6, minHeight: 20 }}>
        <div id={labelId} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0,
          fontSize: 'var(--text-xs)', color: 'var(--text-default)', fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
          <Icon size={13} strokeWidth={1.5} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name}{NameSuffix && <> <NameSuffix /></>}</span>
          {def.badge === 'beta' && <BetaBadge />}
        </div>
        {onNameLine ? <Control /> : null}
      </div>
      <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5, fontFamily: 'var(--font-ui)', fontStyle: 'italic' }}>
        {Description ? <Description /> : info.description}
      </div>
      {!onNameLine && <div style={{ marginTop: 10 }}><Control /></div>}
      {Glance && !def.glanceQuickOnly && <Glance />}
      {Extra && <Extra />}
    </div>
    </SurfaceContext.Provider>
  )
}
