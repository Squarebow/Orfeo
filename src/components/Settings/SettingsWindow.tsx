import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { BookOpen, Search, X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import OrfeoMark from '../OrfeoMark'
import LicensesLink from '../LicensesLink'
import { GROUPS, SETTINGS, type SettingId } from './catalog'
import { searchSettings, gridColumns, CARD_GAP } from './search'
import { SettingCard } from './SettingCard'
import { UpdateButton, RateButton, DevModeBadge } from './controls'
import { GROUP_ICONS } from './groupIcons'
import { TAB_ASIDES } from './defs/midi'
import { fitFrame, defaultFrame, resizeFrame, frameZoom, type Frame, type Edge } from '../../utils/settingsFrame'

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

// Tabbed groups: two independent columns (cards alternate left/right in
// catalog order), so a short card never stretches to match a tall neighbour;
// each column's last card grows so both columns end at the same line
function ColumnCards({ ids, width, stack, looseFirst }: { ids: SettingId[]; width: number; stack?: SettingId[][]; looseFirst?: boolean }) {
  const cols = stack ? gridColumns(stack.length, width) : gridColumns(2, width)
  // explicit columns when they fit; otherwise the cards flow as usual
  const columns = stack && cols === stack.length ? stack : Array.from({ length: cols }, (_, c) => ids.filter((_, i) => i % cols === c))
  const column = (col: SettingId[], c: number) => (
    <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: CARD_GAP, minWidth: 0 }}>
      {col.map((id, i) => <div key={id} style={{ flex: i === col.length - 1 ? 1 : 'none', display: 'flex', flexDirection: 'column' }}><SettingCard id={id} /></div>)}
    </div>
  )
  // `looseFirst`: the first column grows on its own (a card that opens up its
  // options), the others keep their height and still end at one line together
  if (looseFirst && columns.length > 1) {
    const share = `calc((100% - ${(columns.length - 1) * CARD_GAP}px) / ${columns.length})`
    return (
      <div style={{ display: 'grid', gridTemplateColumns: `${share} minmax(0, 1fr)`, gap: CARD_GAP, alignItems: 'start' }}>
        {column(columns[0], 0)}
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns.length - 1}, minmax(0, 1fr))`, gap: CARD_GAP, alignItems: 'stretch' }}>
          {columns.slice(1).map((col, c) => column(col, c + 1))}
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: CARD_GAP, alignItems: 'stretch' }}>
      {columns.map((col, c) => (
        <div key={c} style={{ display: 'flex', flexDirection: 'column', gap: CARD_GAP, minWidth: 0 }}>
          {col.map((id, i) => <div key={id} style={{ flex: i === col.length - 1 ? 1 : 'none', display: 'flex', flexDirection: 'column' }}><SettingCard id={id} /></div>)}
        </div>
      ))}
    </div>
  )
}

export default function SettingsWindow() {
  const open = useStore(s => s.settingsWindowOpen)
  const group = useStore(s => s.settingsWindowGroup)
  const [query, setQuery] = useState('')
  const [width, setWidth] = useState(0)
  // Tab within a tabbed group — back to the first tab whenever the group changes
  const [tab, setTab] = useState(0)
  useEffect(() => { setTab(0) }, [group, open])
  const contentRef = useRef<HTMLDivElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  // ── Where the window sits and how big it is (utils/settingsFrame.ts). Moved
  // by the header, resized by any edge or corner; the content scales with it.
  // Remembered between openings, and kept inside the app window. ──────────
  const view = () => ({ w: window.innerWidth, h: window.innerHeight })
  const [frame, setFrame] = useState<Frame>(() => fitFrame(useStore.getState().settingsWindowFrame ?? defaultFrame(view()), view()))
  const frameRef = useRef(frame)
  frameRef.current = frame
  useEffect(() => { if (open) setFrame(fitFrame(useStore.getState().settingsWindowFrame ?? defaultFrame(view()), view())) }, [open])
  useEffect(() => {
    if (!open) return
    const onResize = () => setFrame(f => fitFrame(f, view()))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [open])
  // one drag at a time: follows the mouse, saved when let go
  const follow = (e: React.MouseEvent, cursor: string, next: (dx: number, dy: number) => Frame) => {
    e.preventDefault(); e.stopPropagation()
    const sx = e.clientX, sy = e.clientY
    const body = document.body.style, prev = { cursor: body.cursor, select: body.userSelect }
    body.cursor = cursor; body.userSelect = 'none'
    const onMove = (ev: MouseEvent) => setFrame(next(ev.clientX - sx, ev.clientY - sy))
    const onUp = () => {
      window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp)
      body.cursor = prev.cursor; body.userSelect = prev.select
      useStore.getState().setSettingsWindowFrame(frameRef.current)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }
  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('input, button, label')) return
    const start = frameRef.current
    follow(e, 'grabbing', (dx, dy) => fitFrame({ ...start, x: start.x + dx, y: start.y + dy }, view()))
  }
  const startResize = (edge: Edge) => (e: React.MouseEvent) => {
    const start = frameRef.current
    follow(e, RESIZE_CURSOR[edge], (dx, dy) => resizeFrame(start, edge, dx, dy, view()))
  }
  // double-click an edge or corner: back to the size it first opened at
  const resetFrame = () => { setFrame(defaultFrame(view())); useStore.getState().setSettingsWindowFrame(null) }
  const zoom = frameZoom(frame)

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
  useEffect(() => { contentRef.current?.scrollTo({ top: 0 }) }, [group, query, tab])

  if (!open) return null
  const close = () => useStore.getState().closeSettingsWindow()
  const g = GROUPS.find(x => x.id === group) ?? GROUPS[0]
  const results = query.trim() ? searchSettings(query) : null

  return createPortal(
    <div className="app-no-drag" onMouseDown={e => { if (e.target === e.currentTarget) close() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10500 }}>
      {/* the frame, in screen pixels; the window inside is laid out at its
          designed size and scaled to fill it */}
      <div style={{ position: 'absolute', left: frame.x, top: frame.y, width: frame.w, height: frame.h }}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={t`Settings`} className="orfeo-modal-glow"
        style={{ width: frame.w / zoom, height: frame.h / zoom, zoom,
          background: 'var(--bg-modal)', border: '1px solid var(--border2)', borderRadius: 'var(--radius-lg)',
          display: 'grid', gridTemplateRows: 'auto minmax(0, 1fr)', overflow: 'hidden',
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><DevModeBadge /><RateButton placement="top" /><UpdateButton placement="top" showStatus={false} /></div>
            </div>
          </nav>
          <div style={{ display: 'grid', gridTemplateRows: 'minmax(0, 1fr) auto', minHeight: 0 }}>
            <div ref={contentRef} style={{ overflowY: 'auto', padding: '16px 18px' }}>
              {results === null ? (
                <>
                  <p style={{ margin: '0 0 10px', fontSize: 'var(--text-lg)', color: 'var(--text-default)', lineHeight: 1.45, fontFamily: 'var(--font-ui)' }}>{g.intro}</p>
                  {g.tabs ? (
                    <>
                      <div role="tablist" aria-label={g.name} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10, borderBottom: '1px solid var(--border2)' }}>
                        {g.tabs.map((tb, i) => {
                          const on = i === Math.min(tab, g.tabs!.length - 1)
                          return (
                            <button key={tb.name} role="tab" aria-selected={on} onClick={() => setTab(i)}
                              style={{ padding: '7px 14px', marginBottom: -1, background: 'none', border: 'none', cursor: 'pointer',
                                borderBottom: `2px solid ${on ? 'var(--text-amber)' : 'transparent'}`,
                                color: on ? 'var(--text-amber)' : 'var(--text-inactive)',
                                fontSize: 'var(--text-xs)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', fontFamily: 'var(--font-ui)' }}
                              onMouseEnter={e => { if (!on) e.currentTarget.style.color = 'var(--text-default)' }}
                              onMouseLeave={e => { if (!on) e.currentTarget.style.color = 'var(--text-inactive)' }}>
                              {tb.name}
                            </button>
                          )
                        })}
                        {(() => { const Aside = TAB_ASIDES[g.tabs![Math.min(tab, g.tabs!.length - 1)].aside ?? '']; return Aside ? <div style={{ marginLeft: 'auto', paddingBottom: 2 }}><Aside /></div> : null })()}
                      </div>
                      {(() => {
                        const tb = g.tabs![Math.min(tab, g.tabs!.length - 1)]
                        return (
                          <>
                            {/* Two across by default: tabbed groups have the busier cards */}
                            {tb.columns === 3 ? <CardGrid ids={tb.ids} width={width} layoutCount={3} /> : <ColumnCards ids={tb.ids} width={width} stack={tb.stack} />}
                            {tb.wide?.map(id => <div key={id} style={{ marginTop: CARD_GAP }}><SettingCard id={id} /></div>)}
                          </>
                        )
                      })()}
                    </>
                  ) : (
                    g.stack
                      ? <ColumnCards ids={SETTINGS.filter(s => s.group === g.id).map(s => s.id)} width={width} stack={g.stack} looseFirst={g.looseFirst} />
                      : <CardGrid ids={SETTINGS.filter(s => s.group === g.id).map(s => s.id)} width={width} />
                  )}
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
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', padding: '8px 18px', borderTop: '1px solid var(--border-row)' }}>
                <div><LicensesLink /></div>
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
      {/* edges and corners to resize by, and a small grip as a hint */}
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden
        style={{ position: 'absolute', right: 5, bottom: 5, pointerEvents: 'none', color: 'var(--text-dimmest)' }}>
        <path d="M9 3 3 9M9 7 7 9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      {RESIZE_EDGES.map(edge => (
        <div key={edge} onMouseDown={startResize(edge)} onDoubleClick={resetFrame} aria-hidden
          style={{ position: 'absolute', cursor: RESIZE_CURSOR[edge], ...RESIZE_HANDLE[edge] }} />
      ))}
      </div>
    </div>,
    document.body,
  )
}

// ── Resize handles: thin strips along the edges, squares at the corners, half
// inside and half outside the window's border ───────────────────────────────
const EDGE = 8, CORNER = 16
const RESIZE_EDGES: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']
const RESIZE_CURSOR: Record<Edge, string> = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' }
const RESIZE_HANDLE: Record<Edge, CSSProperties> = {
  n: { top: -EDGE / 2, left: CORNER / 2, right: CORNER / 2, height: EDGE },
  s: { bottom: -EDGE / 2, left: CORNER / 2, right: CORNER / 2, height: EDGE },
  e: { right: -EDGE / 2, top: CORNER / 2, bottom: CORNER / 2, width: EDGE },
  w: { left: -EDGE / 2, top: CORNER / 2, bottom: CORNER / 2, width: EDGE },
  ne: { top: -CORNER / 2, right: -CORNER / 2, width: CORNER, height: CORNER },
  nw: { top: -CORNER / 2, left: -CORNER / 2, width: CORNER, height: CORNER },
  se: { bottom: -CORNER / 2, right: -CORNER / 2, width: CORNER, height: CORNER },
  sw: { bottom: -CORNER / 2, left: -CORNER / 2, width: CORNER, height: CORNER },
}
