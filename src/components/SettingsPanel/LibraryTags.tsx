import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ChevronDown, X, Check, Minus, Plus } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { tagCoverage, MAX_TAG_LENGTH } from '../../utils/libraryTags'
import { ContextMenu, ContextMenuDivider, ContextMenuLabel } from '../ContextMenu'
import Tooltip from '../Tooltip'

// ── Library tags: one pill style everywhere (dimmed amber, rounded ends; only the
// text differs), the tags row under All / ★, and the tick list used both to tag
// songs (right-click › Tags…) and to choose which tags the row shows (▾). ───────

const pillStyle = (on: boolean): CSSProperties => ({
  flexShrink: 0, padding: '1px 8px', borderRadius: 999, fontSize: 10, lineHeight: '15px', whiteSpace: 'nowrap',
  fontFamily: 'var(--font-ui)', cursor: 'pointer', userSelect: 'none',
  border: `1px solid ${on ? 'var(--accent-amber-strong)' : 'transparent'}`,
  background: on ? 'var(--accent-amber-medium)' : 'var(--accent-amber-subtle)',
  color: on ? 'var(--text-amber)' : 'var(--text-inactive)',
  transition: 'background 0.12s, color 0.12s, border-color 0.12s',
})

export function TagPill({ label, on = false, onClick }: { label: string; on?: boolean; onClick?: () => void }) {
  return <span role={onClick ? 'button' : undefined} aria-pressed={onClick ? on : undefined} onClick={onClick} style={pillStyle(on)}>{label}</span>
}

const iconBtn: CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, width: 18, height: 18,
  padding: 0, border: 'none', background: 'none', color: 'var(--text-inactive)', cursor: 'pointer', borderRadius: 4,
}

// ── The tags row: the tags chosen with ▾ (a few ready-made ones at first), each a
// one-click filter, all off until clicked. Creating a tag never puts it here by
// itself: a Library can have many tags and only the few in use sit in the row.
// `lead` is a fixed item at the very left that never scrolls (the Queue pill).
// When the pills don't all fit, the row scrolls sideways by mouse wheel or by
// dragging, with a soft fade on the side that has more. It never moves on its own:
// a pill sliding away under the pointer would be hard to click. A short line under
// the row always says how tagging works. ─────────────────────────────────────
export function TagsRow({ active, onToggle, onClear, onOpenPicker, lead }: {
  active: string[]
  onToggle: (tag: string) => void
  onClear: () => void
  onOpenPicker: (x: number, y: number) => void
  lead?: ReactNode
}) {
  const pinned = useStore(s => s.pinnedTags)
  const scroller = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const drag = useRef<{ x: number; scroll: number; moved: boolean } | null>(null)

  const measure = () => {
    const el = scroller.current
    if (!el) return
    setEdges({ left: el.scrollLeft > 1, right: el.scrollLeft + el.clientWidth < el.scrollWidth - 1 })
  }
  useLayoutEffect(measure, [pinned, active])
  useEffect(() => {
    const el = scroller.current
    if (!el) return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    // The wheel scrolls the row sideways (a passive React listener couldn't stop the page scrolling too)
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return
      e.preventDefault()
      el.scrollLeft += Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { ro.disconnect(); el.removeEventListener('wheel', onWheel) }
  }, [])

  const fade = edges.left && edges.right
    ? 'linear-gradient(to right, transparent 0, #000 14px, #000 calc(100% - 14px), transparent 100%)'
    : edges.left ? 'linear-gradient(to right, transparent 0, #000 14px)'
      : edges.right ? 'linear-gradient(to left, transparent 0, #000 14px)' : undefined

  return (
    <div style={{ marginTop: 'var(--space-1)' }}>
    <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto auto', alignItems: 'center', gap: 2 }}>
      <div style={{ display: 'flex', marginRight: lead ? 2 : 0 }}>{lead}</div>
      <div
        ref={scroller}
        onScroll={measure}
        onPointerDown={e => { if (e.button === 0) drag.current = { x: e.clientX, scroll: scroller.current?.scrollLeft ?? 0, moved: false } }}
        onPointerMove={e => {
          const d = drag.current
          if (!d || !(e.buttons & 1) || !scroller.current) return
          if (Math.abs(e.clientX - d.x) > 4) d.moved = true
          if (d.moved) scroller.current.scrollLeft = d.scroll - (e.clientX - d.x)
        }}
        onPointerUp={() => { setTimeout(() => { drag.current = null }, 0) }}
        onClickCapture={e => { if (drag.current?.moved) { e.stopPropagation(); e.preventDefault() } }}
        style={{ display: 'flex', gap: 4, overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', padding: '2px 0',
          maskImage: fade, WebkitMaskImage: fade }}
      >
        {pinned.map(tag => active.includes(tag)
          ? <TagPill key={tag} label={tag} on onClick={() => onToggle(tag)} />
          : (
            <Tooltip key={tag} title={t`Click to filter`} oneLine wrapperStyle={{ display: 'flex', flexShrink: 0 }}>
              <TagPill label={tag} onClick={() => onToggle(tag)} />
            </Tooltip>
          ))}
      </div>
      <Tooltip title={t`Choose which tags show here`} oneLine>
        <button aria-label={t`Choose which tags show here`} style={iconBtn}
          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); onOpenPicker(r.left, r.bottom + 4) }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-inactive)' }}>
          <ChevronDown size={12} />
        </button>
      </Tooltip>
      {active.length > 0 ? (
        <Tooltip title={t`Clear tag filters`} oneLine>
          <button aria-label={t`Clear tag filters`} style={iconBtn} onClick={onClear}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-inactive)' }}>
            <X size={11} />
          </button>
        </Tooltip>
      ) : <span style={{ width: 18 }} />}
    </div>
    <div style={{ marginTop: 2, fontSize: 9, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
      {t`Right-click any song to tag it, click a tag to filter`}
    </div>
    </div>
  )
}

// ── The tick list. mode 'song': ticks show which of the chosen songs carry each
// tag (a dash when only some do), and a click puts it on or takes it off all of
// them. mode 'pin': ticks choose which tags sit in the tags row; that alone never
// filters, clicking a pill in the row does. Both can make a new tag at the bottom; in
// 'song' mode the new tag goes straight onto the songs. ───────────────────────────────────────
export function TagPicker({ x, y, mode, paths, onClose, onManage }: {
  x: number; y: number
  mode: 'song' | 'pin'
  paths?: string[]
  onClose: () => void
  onManage: () => void
}) {
  const tags = useStore(s => s.libraryTags)
  const songTags = useStore(s => s.songTags)
  const pinned = useStore(s => s.pinnedTags)
  const ref = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const [taken, setTaken] = useState(false)

  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }
    const id = setTimeout(() => {
      window.addEventListener('pointerdown', onDown, true)
      window.addEventListener('keydown', onKey, true)
    }, 0)
    return () => { clearTimeout(id); window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey, true) }
  }, [onClose])

  const songs = paths ?? []
  const state = (tag: string): 'none' | 'some' | 'all' =>
    mode === 'pin' ? (pinned.includes(tag) ? 'all' : 'none') : tagCoverage(songTags, songs, tag)
  const toggle = (tag: string) => {
    const S = useStore.getState()
    if (mode === 'pin') {
      const on = !pinned.includes(tag)
      S.setPinnedTags(on ? tags.filter(x => x === tag || pinned.includes(x)) : pinned.filter(p => p !== tag))
    } else S.setSongsTag(songs, tag, state(tag) !== 'all')
  }
  const create = () => {
    const S = useStore.getState()
    const name = draft
    if (!S.addLibraryTag(name)) { setTaken(!!name.trim()); return }
    const made = useStore.getState().libraryTags.at(-1)!
    if (mode === 'song') S.setSongsTag(songs, made, true)
    setDraft(''); setTaken(false)
  }

  return (
    <ContextMenu ref={ref} x={x} y={y} minWidth={190} ariaLabel={mode === 'pin' ? t`Tags to show` : t`Tags`}>
      {mode === 'pin' ? (
        <div style={{ padding: '6px 14px 2px', fontSize: 9, color: 'var(--text-amber)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {t`Click a tag to show it`}
        </div>
      ) : (
        <ContextMenuLabel>{songs.length > 1 ? t`Tags for ${songs.length} songs` : t`Tags`}</ContextMenuLabel>
      )}
      <div style={{ maxHeight: 260, overflowY: 'auto' }} className="amber-scroll">
        {tags.length === 0 && <div style={{ padding: '6px 14px', fontSize: 'var(--text-xs)', color: 'var(--text-muted)' }}>{t`No tags yet`}</div>}
        {tags.map(tag => {
          const st = state(tag)
          return (
            <button key={tag} role="menuitemcheckbox" aria-checked={st === 'all' ? true : st === 'some' ? 'mixed' : false}
              onClick={() => toggle(tag)}
              style={{ width: '100%', display: 'grid', gridTemplateColumns: '14px minmax(0, 1fr)', alignItems: 'center', gap: 8,
                padding: '5px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tile)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
              <span style={{ display: 'flex', color: 'var(--text-amber)' }}>
                {st === 'all' ? <Check size={12} /> : st === 'some' ? <Minus size={12} /> : null}
              </span>
              <span style={{ minWidth: 0, display: 'flex' }}><TagPill label={tag} on={st === 'all'} /></span>
            </button>
          )
        })}
      </div>
      <ContextMenuDivider />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', alignItems: 'center', gap: 4, padding: '4px 10px 4px 14px' }}>
        <input value={draft} maxLength={MAX_TAG_LENGTH} placeholder={t`New tag…`}
          onChange={e => { setDraft(e.target.value); setTaken(false) }}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); create() } }}
          style={{ minWidth: 0, background: 'var(--bg-modal)', border: `1px solid ${taken ? 'var(--status-protected)' : 'var(--border2)'}`, borderRadius: 4,
            padding: '3px 6px', color: 'var(--text-default)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', outline: 'none' }} />
        <button aria-label={t`Add tag`} onClick={create} disabled={!draft.trim()} style={{ ...iconBtn, opacity: draft.trim() ? 1 : 0.4 }}>
          <Plus size={12} />
        </button>
      </div>
      {taken && <div style={{ padding: '0 14px 4px', fontSize: 9, color: 'var(--status-protected)' }}>{t`That tag already exists`}</div>}
      <button onClick={() => { onClose(); onManage() }}
        style={{ width: '100%', padding: '6px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
          fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}
        onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}>
        {t`Rename or delete tags in Settings`}
      </button>
    </ContextMenu>
  )
}
