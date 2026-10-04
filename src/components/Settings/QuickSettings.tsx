import { ArrowUpRight } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import OrfeoMark from '../OrfeoMark'
import { GROUPS, QUICK_LAYOUT } from './catalog'
import { GROUP_ICONS } from './groupIcons'
import { CollapsibleSection } from './controls'
import { QuickRow } from './QuickRow'

// ── Quick Settings — the drawer's Settings tab: the everyday switches only,
// grouped as in the Settings window; the gear on each group opens that
// group in the full window. ───────────────────────────────────────────────
export default function QuickSettings() {
  const collapsed = useStore(s => s.settingsGroupsCollapsed)
  const setCollapsed = useStore(s => s.setSettingsGroupCollapsed)
  return (
    <>
      {GROUPS.map(g => {
        const Icon = GROUP_ICONS[g.id]
        return (
          <CollapsibleSection key={g.id} icon={<Icon size={11} />} label={g.name}
            collapsed={collapsed[g.id]} onToggle={() => setCollapsed(g.id, !collapsed[g.id])}
            action={
              <Tooltip title={t`Open in Settings`} oneLine placement="left">
                <button onClick={() => useStore.getState().openSettingsWindow(g.id)} aria-label={t`Open ${g.name} in Settings`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', color: 'var(--text-muted)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                  <ArrowUpRight size={12} strokeWidth={1.75} />
                </button>
              </Tooltip>
            }>
            {QUICK_LAYOUT[g.id].map((item, i) => typeof item === 'string'
              ? <QuickRow key={item} id={item} />
              : <div key={`h${i}`} style={{
                  padding: '5px 14px 3px', fontSize: 'var(--text-xs)', color: 'var(--text-default)', fontWeight: 500,
                  letterSpacing: '0.02em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)', borderTop: '1px solid var(--border-row)',
                }}>{item.heading}</div>)}
          </CollapsibleSection>
        )
      })}
      {/* ── About — unchanged from the old drawer bottom ── */}
      <div style={{ padding: '14px 14px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Tooltip title="Open Orfeo on GitHub" oneLine>
          <button onClick={() => window.electronAPI.openExternal('https://github.com/Squarebow/Orfeo')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <OrfeoMark height={16} />
            <span style={{ color: 'var(--text-inactive)', fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>Orfeo · v{__APP_VERSION__}</span>
          </button>
        </Tooltip>
        <span style={{ color: 'var(--text-inactive)', fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>· © SquareBow</span>
      </div>
    </>
  )
}
