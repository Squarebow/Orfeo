import { SETTING_BY_ID, type SettingId } from './catalog'
import { DEFS } from './defs'
import { SurfaceContext } from './controls'

const always = () => true
const nameStyle = {
  fontSize: 'var(--text-xs)', color: 'var(--text-default)', fontWeight: 500,
  letterSpacing: '0.02em', textTransform: 'uppercase' as const,
}
const summaryStyle = {
  fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5,
  fontFamily: 'var(--font-ui)', fontStyle: 'italic' as const, marginTop: 3,
}

// ── One Setup row (the drawer): name + its one-line summary underneath, then
// its control and at-a-glance line. The full description and follow-up
// options live only in the Settings window.
export function QuickRow({ id }: { id: SettingId }) {
  const def = DEFS[id], info = SETTING_BY_ID[id]
  const useVisible = def.useVisible ?? always
  if (!useVisible()) return null
  const { Control, Glance, NameSuffix, NameRight } = def
  const name = <span style={nameStyle}>{info.name}{NameSuffix && <> <NameSuffix /></>}</span>
  const summary = <div style={summaryStyle}>{info.summary}</div>
  return (
    <SurfaceContext.Provider value="setup">
      <div style={{ padding: '9px 14px', borderBottom: '1px solid var(--border-row)' }}>
        {def.kind !== 'choice' ? (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 8 }}>{name}<Control /></div>
            {summary}
          </>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 8 }}>
              {name}{NameRight ? <NameRight /> : <span />}
            </div>
            <div style={{ ...summaryStyle, marginBottom: 7 }}>{info.summary}</div>
            <Control />
          </>
        )}
        {Glance && <Glance />}
      </div>
    </SurfaceContext.Provider>
  )
}
