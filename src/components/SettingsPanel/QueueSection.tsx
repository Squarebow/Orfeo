import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { ListOrdered, ChevronUp, ChevronDown, X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { neighbour } from '../../utils/practiceQueue'
import { queueStep } from '../../utils/queueControl'
import { ContextMenu, ContextMenuItem, ContextMenuDivider } from '../ContextMenu'
import Tooltip from '../Tooltip'

// ── Practice queue in the Library (Settings › Practice queue) ────────────────
// The Queue pill sits first in the tags row, fixed at the left: an amber outline
// while folders show, filled amber while the queue shows; it switches the Folders
// area between the two. The song count lives in the queue's own header. The queue takes the
// Folders area's place in a box five songs tall that scrolls, and the rest of the
// Library follows below as usual.

export const QUEUE_ROW_HEIGHT = 32
const VISIBLE_ROWS = 5

export function QueuePill() {
  const view = useStore(s => s.queueView)
  const style: CSSProperties = {
    flexShrink: 0, padding: '1px 8px', borderRadius: 999, fontSize: 10, lineHeight: '15px', whiteSpace: 'nowrap',
    fontFamily: 'var(--font-ui)', cursor: 'pointer', userSelect: 'none', fontWeight: 600,
    border: '1px solid var(--accent-amber-strong)',
    background: view ? 'var(--accent-amber-active-bg)' : 'transparent',
    color: view ? 'var(--text-amber)' : 'var(--text-inactive)',
  }
  return (
    <Tooltip title={view ? t`Show folders` : t`Show the queue`} oneLine>
      <span role="button" aria-pressed={view} aria-label={t`Queue`} style={style}
        onClick={() => useStore.getState().setQueueView(!view)}>
        {t`Queue`}
      </span>
    </Tooltip>
  )
}

const iconBtn = (enabled: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, padding: 0,
  border: 'none', background: 'none', borderRadius: 4, flexShrink: 0,
  color: enabled ? 'var(--text-amber)' : 'var(--text-muted)', opacity: enabled ? 1 : 0.4, cursor: enabled ? 'pointer' : 'default',
})

export function QueueSection({ openSong, renderName, libraryDrag, onLibraryDrop, openPath, stickyTop = 0 }: {
  stickyTop?: number                      // below the open song's bar when that one shows
  openSong: (path: string) => void
  renderName: (path: string, current: boolean) => ReactNode
  libraryDrag: string[] | null            // songs being dragged from the Library, if any
  onLibraryDrop: () => void
  openPath: string | undefined
}) {
  const queue = useStore(s => s.queue)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [menu, setMenu] = useState<{ path: string; x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const hasPrev = neighbour(queue, -1) !== null
  const hasNext = neighbour(queue, 1) !== null
  const norm = (p: string | undefined) => (p ?? '').replace(/\\/g, '/').toLowerCase()

  const finishDrag = () => { setDragFrom(null); setDropAt(null) }
  const dropOn = (index: number) => {
    if (dragFrom !== null) useStore.getState().queueMove(dragFrom, dragFrom < index ? index - 1 : index)
    else if (libraryDrag?.length) { useStore.getState().queueAdd(libraryDrag); onLibraryDrop() }
    finishDrag()
  }

  return (
    // Sticky under the open song's bar, so the queue stays in view while the Library scrolls under it
    <div style={{ position: 'sticky', top: stickyTop, zIndex: 4, background: 'var(--bg-modal)', borderBottom: '1px solid var(--border)',
      boxShadow: '0 6px 10px -6px rgba(0,0,0,0.6)' }}
      onDragOver={e => { if (dragFrom !== null || libraryDrag?.length) e.preventDefault() }}
      onDrop={e => { e.preventDefault(); dropOn(queue.paths.length) }}>
      {/* Header: name, count, previous / next song */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', minHeight: 30, boxSizing: 'border-box',
        background: 'var(--bg-row)', borderBottom: '1px solid var(--bg-tile)' }}>
        <ListOrdered size={12} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 'var(--text-sm)', color: 'var(--text-tile-subtext)', fontWeight: 600 }}>{t`Queue`}</span>
        <Tooltip title={t`Previous song (Alt+↑)`} oneLine>
          <button aria-label={t`Previous song`} disabled={!hasPrev} style={iconBtn(hasPrev)} onClick={() => queueStep(-1)}><ChevronUp size={13} /></button>
        </Tooltip>
        <Tooltip title={t`Next song (Alt+↓)`} oneLine>
          <button aria-label={t`Next song`} disabled={!hasNext} style={iconBtn(hasNext)} onClick={() => queueStep(1)}><ChevronDown size={13} /></button>
        </Tooltip>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-amber)', fontFamily: 'var(--font-mono)', flexShrink: 0, minWidth: 14, textAlign: 'right' }}>{queue.paths.length}</span>
      </div>

      {/* Five songs tall, scrolls for more */}
      <div className="amber-scroll" style={{ maxHeight: QUEUE_ROW_HEIGHT * VISIBLE_ROWS, overflowY: 'auto' }}>
        {queue.paths.length === 0 ? (
          <div style={{ height: QUEUE_ROW_HEIGHT * 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 12px', textAlign: 'center',
            fontSize: 10, color: libraryDrag?.length ? 'var(--text-amber)' : 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
            {libraryDrag?.length ? t`Drop here to add to the queue` : t`Right-click songs › Add to queue, or drag them here`}
          </div>
        ) : queue.paths.map((path, i) => {
          const current = i === queue.index
          const open = current && norm(path) === norm(openPath)
          return (
            <div key={path}
              draggable
              onDragStart={e => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', path) }}
              onDragEnd={finishDrag}
              onDragOver={e => { if (dragFrom !== null || libraryDrag?.length) { e.preventDefault(); e.stopPropagation(); setDropAt(i) } }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); dropOn(i) }}
              onClick={() => openSong(path)}
              onContextMenu={e => { e.preventDefault(); setMenu({ path, x: e.clientX, y: e.clientY }) }}
              style={{ height: QUEUE_ROW_HEIGHT, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto',
                alignItems: 'center', gap: 6, padding: '0 6px 0 10px', cursor: 'pointer',
                background: open ? 'var(--accent-amber-subtle)' : 'transparent',
                borderBottom: '1px solid var(--border-row)',
                borderTop: dropAt === i ? '2px solid var(--text-amber)' : '2px solid transparent',
                opacity: dragFrom === i ? 0.5 : 1 }}
              onMouseEnter={e => { if (!open) e.currentTarget.style.background = 'var(--bg-tile)' }}
              onMouseLeave={e => { if (!open) e.currentTarget.style.background = 'transparent' }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: current ? 'var(--text-amber)' : 'var(--text-muted)', textAlign: 'right' }}>
                {current ? '▸' : i + 1}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>{renderName(path, current)}</div>
              <Tooltip title={t`Remove from queue`} oneLine>
                <button aria-label={t`Remove from queue`} onClick={e => { e.stopPropagation(); useStore.getState().queueRemove(path) }}
                  style={{ display: 'flex', padding: 2, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}>
                  <X size={10} />
                </button>
              </Tooltip>
            </div>
          )
        })}
        {queue.paths.length > 0 && (
          <button onClick={() => useStore.getState().queueClear()}
            style={{ width: '100%', padding: '6px 10px', border: 'none', background: 'none', textAlign: 'left', cursor: 'pointer',
              fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}>
            {t`Clear queue`}
          </button>
        )}
      </div>

      {menu && (
        <QueueMenu menuRef={menuRef} {...menu} onClose={() => setMenu(null)} />
      )}
    </div>
  )
}

function QueueMenu({ menuRef, path, x, y, onClose }: { menuRef: React.RefObject<HTMLDivElement | null>; path: string; x: number; y: number; onClose: () => void }) {
  // closes on any click outside or Esc
  useDismiss(menuRef, onClose)
  return (
    <ContextMenu ref={menuRef} x={x} y={y} minWidth={170} ariaLabel={t`Queue song`}>
      <ContextMenuItem onClick={() => { useStore.getState().queueRemove(path); onClose() }}>{t`Remove from queue`}</ContextMenuItem>
      <ContextMenuDivider />
      <ContextMenuItem onClick={() => { useStore.getState().queueClear(); onClose() }} danger>{t`Clear queue`}</ContextMenuItem>
    </ContextMenu>
  )
}

function useDismiss(ref: React.RefObject<HTMLElement | null>, close: () => void) {
  const closeRef = useRef(close)
  closeRef.current = close
  useEffect(() => {
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) closeRef.current() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    const id = setTimeout(() => { window.addEventListener('pointerdown', onDown, true); window.addEventListener('keydown', onKey, true) }, 0)
    return () => { clearTimeout(id); window.removeEventListener('pointerdown', onDown, true); window.removeEventListener('keydown', onKey, true) }
  }, [ref])
}

