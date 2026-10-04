import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Search, X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import OrfeoMark from '../OrfeoMark'
import { GROUPS, SETTINGS, type SettingId } from './catalog'
import { searchSettings, gridColumns, CARD_GAP } from './search'
import { SettingCard } from './SettingCard'
import { UpdateButton } from './controls'
import { GROUP_ICONS } from './groupIcons'

// ── Settings window — every setting, by group, with full descriptions.
// Opened from Quick Settings (gear per group / Open settings) or Ctrl + ,.
// Same size for every group; only the content area scrolls. ─────────────

const displayVersion = (v: string) => v.replace(/\.0$/, '')

// `layoutCount`: search results always lay out as a full group would (3
// across), so one match doesn't stretch to the whole width
function CardGrid({ ids, width, layoutCount = ids.length }: { ids: SettingId[]; width: number; layoutCount?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${gridColumns(layoutCount, width)}, minmax(0, 1fr))`, gap: CARD_GAP, alignItems: 'stretch' }}>
      {ids.map(id => <SettingCard key={id} id={id} />)}
    </div>
  )
}

export default function SettingsWindow() {
  const open = useStore(s => s.settingsWindowOpen)
  const group = useStore(s => s.settingsWindowGroup)
  const [query, setQuery] = useState('')
  const [width, setWidth] = useState(0)
  const contentRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // ── Drag by the header, like the other floating windows — an offset from
  // the centred spot, reset each time the window opens. ──────────────────
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  useEffect(() => { if (open) setOffset({ x: 0, y: 0 }) }, [open])
  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, button, label')) return
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY, start = offset
    const r = dialogRef.current?.getBoundingClientRect()
    const onMove = (ev: MouseEvent) => {
      let x = start.x + ev.clientX - sx, y = start.y + ev.clientY - sy
      if (r) {
        // keep the whole window on screen, and its top clear of the 40px
        // title-bar strip where Windows draws its own controls
        x = Math.min(Math.max(x, start.x - r.left), start.x + (window.innerWidth - r.right))
        y = Math.min(Math.max(y, start.y + (44 - r.top)), start.y + (window.innerHeight - r.bottom))
      }
      setOffset({ x, y })
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  useLayoutEffect(() => {
    const el = contentRef.current
    if (!open || !el) return
    // content box width (padding excluded) decides how many cards fit across
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [open])
  useEffect(() => { if (!open) setQuery('') }, [open])
  // Esc: clears an active search first, otherwise closes
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (query) { setQuery(''); return }
      useStore.getState().closeSettingsWindow()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, query])
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }) }, [group, query])

  if (!open) return null
  const close = () => useStore.getState().closeSettingsWindow()
  const g = GROUPS.find(x => x.id === group) ?? GROUPS[0]
  const results = query.trim() ? searchSettings(query) : null

  return createPortal(
    <div onMouseDown={e => { if (e.target === e.currentTarget) close() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t`Settings`} className="orfeo-modal-glow"
        style={{ width: 'min(1000px, calc(100vw - 48px))', height: 'min(640px, calc(100vh - 48px))',
          background: 'var(--bg-modal)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)',
          display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', overflow: 'hidden',
          transform: `translate(${offset.x}px, ${offset.y}px)`,
          '--_modal-shadow': 'var(--elevation-modal)' } as CSSProperties}>
        {/* ── Header (drag handle): mark + title | search | close ── */}
        <div onMouseDown={startDrag} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 320px) minmax(0, 1fr)', alignItems: 'center',
          gap: 12, padding: '10px 14px', borderBottom: '1px solid var(--border2)', background: 'var(--bg-modal-header)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <OrfeoMark height={18} />
            <span style={{ fontSize: 'var(--text-lg)', color: 'var(--text-default)', fontWeight: 600 }}>{t`Settings`}</span>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', border: '1px solid var(--border2)', borderRadius: 999, background: 'var(--bg-modal)', minWidth: 0 }}>
            <Search size={12} strokeWidth={1.5} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)} placeholder={t`Search settings…`}
              style={{ flex: 1, minWidth: 0, background: 'none', border: 'none', outline: 'none', color: 'var(--text-default)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)' }} />
            {query && <button onClick={() => setQuery('')} aria-label={t`Clear search`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }}><X size={12} /></button>}
          </label>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, minWidth: 0 }}>
            <Tooltip title={t`Close (Esc)`} oneLine placement="bottom">
              <button onClick={close} aria-label={t`Close`} style={{ background: 'none', border: '1px solid var(--border2)', borderRadius: 4, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 3 }}><X size={14} /></button>
            </Tooltip>
          </div>
        </div>

        {/* ── Body: group list | content ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '210px minmax(0, 1fr)', minHeight: 0 }}>
          <nav style={{ borderRight: '1px solid var(--border2)', display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', minHeight: 0 }}>
            <div style={{ overflowY: 'auto', padding: '6px 0' }}>
            {GROUPS.map(x => {
              const Icon = GROUP_ICONS[x.id]
              const active = !results && x.id === group
              return (
                <button key={x.id} onClick={() => { setQuery(''); useStore.getState().openSettingsWindow(x.id) }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', border: 'none', cursor: 'pointer', textAlign: 'left',
                    background: active ? 'var(--accent-amber-medium)' : 'none',
                    borderLeft: `2px solid ${active ? 'var(--text-amber)' : 'transparent'}`,
                    color: active ? 'var(--text-amber)' : 'var(--text-inactive)',
                    fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                  <Icon size={13} strokeWidth={1.5} style={{ flexShrink: 0, color: 'var(--text-amber)' }} />{x.name}
                </button>
              )
            })}
            </div>
            {/* ── ORFEO + version (opens GitHub) | update check ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', padding: '8px 10px 8px 14px', borderTop: '1px solid var(--border-row)' }}>
              <Tooltip title="Open Orfeo on GitHub" oneLine placement="top">
                <button onClick={() => window.electronAPI.openExternal('https://github.com/Squarebow/Orfeo')}
                  style={{ display: 'flex', alignItems: 'baseline', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}>
                  <span style={{ color: 'var(--text-amber)', fontSize: 'var(--text-sm)', fontWeight: 700, letterSpacing: '0.12em', fontFamily: 'var(--font-ui)' }}>ORFEO</span>
                  <span style={{ color: 'var(--text-inactive)', fontSize: 10, fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>v{displayVersion(__APP_VERSION__)}</span>
                </button>
              </Tooltip>
              <div style={{ display: 'flex', alignItems: 'center' }}><UpdateButton placement="top" showStatus={false} /></div>
            </div>
          </nav>
          <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', minHeight: 0 }}>
            <div ref={contentRef} style={{ overflowY: 'auto', padding: '16px 18px' }}>
              {results === null ? (
                <>
                  <p style={{ margin: '0 0 16px', fontSize: 'var(--text-lg)', color: 'var(--text-default)', lineHeight: 1.45, fontFamily: 'var(--font-ui)' }}>{g.intro}</p>
                  <CardGrid ids={SETTINGS.filter(s => s.group === g.id).map(s => s.id)} width={width} />
                </>
              ) : results.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)' }}>{t`No settings match “${query.trim()}”.`}</p>
              ) : results.map(r => (
                <section key={r.group.id} style={{ marginBottom: 18 }}>
                  <div style={{ margin: '0 0 8px', fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{r.group.name}</div>
                  <CardGrid ids={r.settings.map(s => s.id)} width={width} layoutCount={3} />
                </section>
              ))}
            </div>
            {results === null && (
              <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 18px', borderTop: '1px solid var(--border-row)' }}>
                <button onClick={() => window.electronAPI.openExternal(g.manualUrl)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)' }}
                  onMouseEnter={e => e.currentTarget.style.color = 'var(--text-amber)'}
                  onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}>
                  {t`Open in user manual`} <BookOpen size={13} strokeWidth={1.5} style={{ color: 'var(--text-amber)' }} />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
