import { useId, type ReactNode } from 'react'
import { SETTING_BY_ID, type SettingId } from './catalog'
import { DEFS } from './defs'
import { BetaBadge, SurfaceContext } from './controls'

const always = () => true

// Catalog text with **bold** words and ==amber== signs (like the ← → keys)
export function richText(text: string): ReactNode {
  return text.split(/(\*\*.+?\*\*|==.+?==)/g).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) return <b key={i} style={{ fontWeight: 600, color: 'var(--text-default)' }}>{part.slice(2, -2)}</b>
    if (part.startsWith('==') && part.endsWith('==') && part.length > 4) return <span key={i} style={{ color: 'var(--text-amber)', fontStyle: 'normal' }}>{part.slice(2, -2)}</span>
    return part
  })
}

// ── One setting in the Settings window: icon + name (switch on the right),
// full description, then its controls, glance lines and follow-up options.
export function SettingCard({ id }: { id: SettingId }) {
  const def = DEFS[id], info = SETTING_BY_ID[id]
  const useVisible = def.useVisible ?? always
  const visible = useVisible()
  const labelId = useId()
  if (!visible) return null
  const { Control, Glance, Extra, Description, NameSuffix, NameRight, icon: Icon } = def
  const onNameLine = def.kind !== 'choice'
  const controlFirst = def.layout === 'controlFirst'
  const columns = def.layout === 'columns'
  // A line break written into the words starts a new line; otherwise whole words wrap
  const descStyle = { fontSize: 'var(--text-xs)', color: 'var(--text-faint)', lineHeight: 1.5, fontFamily: 'var(--font-ui)', fontStyle: 'italic',
    whiteSpace: 'pre-line', hyphens: 'manual', overflowWrap: 'normal' } as const
  const descText = Description ? <Description /> : richText(info.description)
  // Name and switch on the first line. With a switch (or a small control) on the
  // name line, the description sits in the left column under the name, so its
  // lines end 10 px before the switch and never run underneath it.
  const head = (
    <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', columnGap: 10, rowGap: 6, minHeight: 20 }}>
      <div id={labelId} style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0,
        fontSize: 'var(--text-xs)', color: 'var(--text-default)', fontWeight: 500, letterSpacing: '0.02em', textTransform: 'uppercase' }}>
        <Icon size={13} strokeWidth={1.5} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{info.name}{NameSuffix && <> <NameSuffix /></>}</span>
        {def.badge === 'beta' && <BetaBadge />}
      </div>
      {onNameLine ? <Control /> : NameRight ? <NameRight /> : <span />}
      {!controlFirst && !columns && <div style={{ ...descStyle, gridColumn: onNameLine ? '1' : '1 / -1' }}>{descText}</div>}
    </div>
  )
  return (
    <SurfaceContext.Provider value="window">
    <div role="group" aria-labelledby={labelId} style={{
      background: 'var(--bg-tile)', border: `1px solid ${def.notice ? 'var(--accent-amber-strong)' : 'var(--border2)'}`, borderRadius: 'var(--radius-lg)',
      padding: '12px 14px', minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box',
    }}>
      {head}
      {columns ? (
        // Three columns of one height: the buttons one under another | the
        // at-a-glance box | the description
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) minmax(0, 1fr)', columnGap: 16, alignItems: 'stretch' }}>
          <div style={{ minWidth: 0 }}><Control /></div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>{Glance && <Glance />}</div>
          <div style={{ ...descStyle, minWidth: 0 }}>{descText}</div>
        </div>
      ) : controlFirst ? (
        <>
          {!onNameLine && <div style={{ marginTop: 4 }}><Control /></div>}
          {Glance && !def.glanceQuickOnly && <Glance />}
          <div style={{ ...descStyle, marginTop: 10 }}>{descText}</div>
        </>
      ) : (
        <>
          {!onNameLine && <div style={{ marginTop: 10 }}><Control /></div>}
          {Glance && !def.glanceQuickOnly && <Glance />}
        </>
      )}
      {Extra && <Extra />}
    </div>
    </SurfaceContext.Provider>
  )
}
