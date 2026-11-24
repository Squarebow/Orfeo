import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { ListOrdered, ChevronUp, ChevronDown, X, ListX, Settings2, Sparkles, ListMusic } from 'lucide-react'
import { featValue, barIcon } from '../Practice/practiceBar'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { neighbour, stepAround } from '../../utils/practiceQueue'
import { queueStep, openQueueAt } from '../../utils/queueControl'
import { getLibraryDragPaths, setLibraryDragPaths } from '../../utils/libraryDrag'
import { libraryDisplayName } from '../../utils/libraryNames'
import { LibrarySongName } from '../SettingsPanel/LibrarySongName'
import Tooltip from '../Tooltip'
import { nameStyle } from '../Settings/QuickRow'  // same look as a setting's name in Setup
import { PRACTICE_PREP_VISIBLE } from '../../utils/practiceReadiness'
import { useReadyScan, scanForPracticeReady, stopReadyScan, readyToAdd } from '../../practice/scanReady'
import { useHandPrescan } from '../../practice/handPrescan'

// ── Scan for practice-ready songs (practice/scanReady.ts): the last row of the
// queue's drop-down, in playback and in practice mode. Dev mode only until 2.0.
function ScanReadyRow({ onClear }: { onClear?: (() => void) | null }) {
  const { running, done, total, added, versions } = useReadyScan()
  // the background reading has looked at the whole Library: the answer is known, adding is instant
  const bgDone = useHandPrescan(s => !s.running && s.finished !== null)
  const queued = useStore(s => s.queue.paths)
  // how many of them aren't in the queue yet
  const bg = useMemo(() => {
    if (!bgDone) return null
    return readyToAdd(queued).add.length
  }, [bgDone, queued, added])
  const row: React.CSSProperties = {
    width: '100%', padding: '7px 10px', border: 'none', borderTop: '1px solid var(--bg-tile)', background: 'none', textAlign: 'left',
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontFamily: 'var(--font-ui)', boxSizing: 'border-box',
  }
  if (running) {
    return (
      <div style={{ ...row, color: 'var(--text-muted)' }}>
        <Sparkles size={11} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{t`Looking for songs ready to practise… ${done} of ${total}`}</span>
        <button onClick={stopReadyScan} style={{ padding: 0, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-amber)', fontSize: 10, fontFamily: 'var(--font-ui)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
          {t`Stop`}
        </button>
      </div>
    )
  }
  return (
    <div style={{ ...row, padding: '8px 10px', gap: 10 }}>
      <Tooltip title={bg !== null ? t`Add practice-ready songs` : t`Scan for practice-ready songs`}
        description={bg !== null
          ? t`Adds the songs ready to practise to the end of the queue (a piano as a left-hand and a right-hand track, or one hand throughout). Orfeo found them while reading your Library in the background.`
          : t`Reads every song in your Library and adds the ones ready to practise to the end of the queue: a piano as a left-hand and a right-hand track, or one hand throughout.`}>
        <button onClick={() => void scanForPracticeReady()}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
            border: '1px solid var(--accent-amber-strong)', background: 'var(--accent-amber-subtle)', color: 'var(--text-amber)',
            fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', fontWeight: 600, whiteSpace: 'nowrap',
          }}>
          <Sparkles size={12} /> {bg !== null ? t`Add ${bg} practice-ready songs` : t`Scan for practice-ready songs`}
        </button>
      </Tooltip>
      {added !== null && (
        <span style={{ color: 'var(--text-dim)', fontSize: 10 }}>
          {added === 0 ? t`none new found` : added === 1 ? t`1 added` : t`${added} added`}
          {versions > 0 && (versions === 1 ? t` · 1 other version of a song left out` : t` · ${versions} other versions of songs left out`)}
        </span>
      )}
      {onClear && <ClearQueueButton onClick={onClear} style={{ marginLeft: 'auto', width: 'auto', padding: 0, borderTop: 'none' }} />}
    </div>
  )
}

// ── Practice queue in the top bar (Settings › Practice queue), after the key ──
// A button showing how many songs are queued; a click drops down the queue:
// previous / next song, the list (click a song to open it, drag to reorder, × to
// take it out) and Clear queue. Songs come in from the Library with right-click ›
// Add to queue, or by dragging them onto the button or into the open list. The
// Library's folders are never replaced by it.
// While the open song is the queue's current one, hovering the button shows a
// small card instead of the plain tooltip: which song of how many, what happens
// when it ends, and a Queue settings link (a card, since a tooltip can't be clicked).

const ROW_HEIGHT = 32
const VISIBLE_ROWS = 8
const PANEL_W = 340

const label: CSSProperties = { fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--font-mono)', lineHeight: 1 }
const SONG: CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-muted)', fontFamily: 'var(--font-ui)' }
const SONG_CURRENT: CSSProperties = { fontSize: 'var(--text-sm)', color: 'var(--text-amber)', fontWeight: 500, fontFamily: 'var(--font-ui)' }

const iconBtn = (enabled: boolean): CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, padding: 0,
  border: 'none', background: 'none', borderRadius: 4, flexShrink: 0,
  color: enabled ? 'var(--text-amber)' : 'var(--text-muted)', opacity: enabled ? 1 : 0.4, cursor: enabled ? 'pointer' : 'default',
})

const norm = (p: string | undefined) => (p ?? '').replace(/\\/g, '/').toLowerCase()

// `practice`: practice mode's header look (icon + PLAYLIST), same list
export function QueueButton({ practice = false }: { practice?: boolean } = {}) {
  const count = useStore(s => s.queue.paths.length)
  // the open song is the queue's current one (opened from the queue, or Alt + ↓ / ↑)
  const queued = useStore(s => {
    const cur = s.queue.paths[s.queue.index]
    return !!cur && norm(cur) === norm((s.midi as any)?._filePath as string | undefined)
  })
  const [open, setOpen] = useState<{ x: number; y: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [card, setCard] = useState(false)
  const hideCard = useRef<ReturnType<typeof setTimeout> | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const showCard = () => { if (hideCard.current) clearTimeout(hideCard.current); setCard(true) }
  const leaveCard = () => { if (hideCard.current) clearTimeout(hideCard.current); hideCard.current = setTimeout(() => setCard(false), 180) }
  useEffect(() => () => { if (hideCard.current) clearTimeout(hideCard.current) }, [])
  useEffect(() => { if (open) setCard(false) }, [open])

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return null
    return { x: Math.max(8, Math.min(r.left, window.innerWidth - PANEL_W - 8)), y: r.bottom + 8 }
  }

  // Closes on a click outside (not a press: dragging a song in from the Library
  // keeps it open) or Esc
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      const n = e.target as Node
      if (!panelRef.current?.contains(n) && !btnRef.current?.contains(n)) setOpen(null)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(null) }
    const onResize = () => setOpen(null)
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  const takeLibraryDrop = () => {
    const paths = getLibraryDragPaths()
    if (paths?.length) useStore.getState().queueAdd(paths)
    setLibraryDragPaths(null)
  }

  const active = !!open || dragOver
  return (
    <>
      <Tooltip title={practice ? t`Playlist` : t`Practice queue`} description={practice ? t`Click to open your practice queue.` : t`Create your practice playlist.
Click to edit.`} placement="bottom" disabled={!!open || queued}>
        <button ref={btnRef} className="app-no-drag" aria-label={t`Practice queue: ${count} songs`} aria-expanded={!!open}
          onMouseEnter={() => { if (queued) showCard() }}
          onMouseLeave={leaveCard}
          onClick={() => { setCard(false); setOpen(o => o ? null : place()) }}
          onDragOver={e => { if (getLibraryDragPaths()) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOver(true) } }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); takeLibraryDrop() }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, height: 'var(--button-height)', padding: '0 var(--space-2)',
            background: dragOver ? 'var(--accent-amber-subtle)' : 'none',
            border: dragOver ? '1px dashed var(--text-amber)' : '1px solid transparent', borderRadius: 'var(--radius-md)',
            cursor: 'pointer', flexShrink: 0,
          }}>
          {practice ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ListMusic {...barIcon} />
              <span style={featValue}>{t`Playlist`}</span>
            </span>
          ) : <>
          <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 1 }}>
            <span style={{ ...label, color: active ? 'var(--text-amber)' : 'var(--text-muted)' }}>{t`PRACTICE`}</span>
            <span style={{ ...label, color: active ? 'var(--text-amber)' : 'var(--text-muted)' }}>{t`QUEUE`}</span>
          </span>
          <span style={{ color: count ? 'var(--text-amber)' : 'var(--text-active)', fontFamily: 'var(--font-mono)', fontSize: 20, fontWeight: 700, minWidth: 14, textAlign: 'right', lineHeight: 1 }}>
            {count}
          </span>
          <ChevronDown size={11} style={{ color: active ? 'var(--text-amber)' : 'var(--text-muted)', flexShrink: 0,
            transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.12s' }} />
          </>}
        </button>
      </Tooltip>
      {card && queued && !open && btnRef.current && createPortal(
        <QueuedSongCard anchor={btnRef.current.getBoundingClientRect()} onEnter={showCard} onLeave={leaveCard} onDone={() => setCard(false)} practice={practice} />,
        document.body)}
      {open && createPortal(<QueuePanel panelRef={panelRef} x={open.x} y={open.y} onOpenSong={() => setOpen(null)} />, document.body)}
    </>
  )
}

// ── The card for a song opened from the queue ────────────────────────────────
function QueuedSongCard({ anchor, onEnter, onLeave, onDone, practice = false }: { anchor: DOMRect; onEnter: () => void; onLeave: () => void; onDone: () => void; practice?: boolean }) {
  const queue = useStore(s => s.queue)
  const action = useStore(s => s.queueEndAction)
  const tooltipsOn = useStore(s => s.tooltipsEnabled)
  if (!tooltipsOn) return null
  const last = neighbour(queue, 1) === null
  const ends: Record<typeof action, string> = {
    ask: t`a small card asks whether to play it again, go to the next song or stop the queue.`,
    next: last ? t`the queue is done: this is its last song.` : t`the next song starts after a 3-second countdown.`,
    repeat: t`it plays again, until you move on.`,
    stop: t`nothing happens: move on when you're ready.`,
  }
  const W = 260
  const left = Math.max(8, Math.min(anchor.left, window.innerWidth - W - 8))
  return (
    <div className="app-no-drag orfeo-modal-glow" onMouseEnter={onEnter} onMouseLeave={onLeave}
      style={{
        position: 'fixed', top: anchor.bottom + 6, left, width: W, zIndex: 99999,
        background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)', borderRadius: 6, padding: '6px 10px',
        display: 'flex', flexDirection: 'column', gap: 5,
        '--_modal-shadow': 'var(--elevation-strip)',
      } as CSSProperties}>
      <div style={{ fontSize: 9, fontFamily: 'var(--font-ui)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-amber)', whiteSpace: 'nowrap' }}>
        {t`Practice queue`}
        <span style={{ textTransform: 'none', letterSpacing: '0.02em' }}>{t`: song ${queue.index + 1} of ${queue.paths.length}`}</span>
      </div>
      <div style={{ fontSize: 10, fontFamily: 'var(--font-ui)', lineHeight: 1.4, color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', gap: 4 }}>
        <span>{t`Press Play when you're ready. When this song ends, ${ends[action]}`}</span>
        {!practice && <span>{t`Alt + ↓ and Alt + ↑ open the next and previous song, going round at either end.`}</span>}
      </div>
      <button onClick={() => { onDone(); useStore.getState().openSettingsWindow('midi-files-library') }}
        style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, padding: 0, border: 'none', background: 'none', cursor: 'pointer',
          fontSize: 10, fontFamily: 'var(--font-ui)', color: 'var(--text-amber)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
        <Settings2 size={10} />
        {t`Queue settings`}
      </button>
    </div>
  )
}

function QueuePanel({ panelRef, x, y, onOpenSong }: { panelRef: React.RefObject<HTMLDivElement | null>; x: number; y: number; onOpenSong: () => void }) {
  const queue = useStore(s => s.queue)
  const openPath = useStore(s => (s.midi as any)?._filePath as string | undefined)
  const songFirst = useStore(s => s.librarySongFirst)
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  const [dropAt, setDropAt] = useState<number | null>(null)
  const [libraryOver, setLibraryOver] = useState(false)
  const hasPrev = stepAround(queue, -1) !== null
  const hasNext = stepAround(queue, 1) !== null

  const accepts = () => dragFrom !== null || !!getLibraryDragPaths()
  const finishDrag = () => { setDragFrom(null); setDropAt(null); setLibraryOver(false) }
  const dropOn = (index: number) => {
    const fromLibrary = getLibraryDragPaths()
    if (dragFrom !== null) useStore.getState().queueMove(dragFrom, dragFrom < index ? index - 1 : index)
    else if (fromLibrary?.length) {
      // dropped in the middle: the new songs go where they were dropped
      const before = useStore.getState().queue.paths.length
      useStore.getState().queueAdd(fromLibrary)
      const added = useStore.getState().queue.paths.length - before
      for (let k = 0; k < added; k++) useStore.getState().queueMove(before + k, index + k)
      setLibraryDragPaths(null)
    }
    finishDrag()
  }

  return (
    <div ref={panelRef} className="app-no-drag orfeo-modal-glow" role="dialog" aria-label={t`Practice queue`}
      onDragOver={e => { if (accepts()) { e.preventDefault(); if (dragFrom === null) setLibraryOver(true) } }}
      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) { setLibraryOver(false); setDropAt(null) } }}
      onDrop={e => { e.preventDefault(); dropOn(queue.paths.length) }}
      style={{
        position: 'fixed', left: x, top: y, width: PANEL_W, zIndex: 1000,
        background: 'var(--bg-modal)', border: `1px solid ${libraryOver ? 'var(--text-amber)' : 'var(--accent-amber-strong)'}`,
        borderRadius: 'var(--radius-md)', overflow: 'hidden',
        '--_modal-shadow': 'var(--elevation-popover)',
      } as React.CSSProperties}>
      {/* Header: name, count, previous / next song */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', minHeight: 30, boxSizing: 'border-box',
        background: 'var(--bg-row)', borderBottom: '1px solid var(--bg-tile)' }}>
        <ListOrdered size={12} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
        <span style={{ flex: 1, fontFamily: 'var(--font-ui)', ...nameStyle }}>{t`Your practice queue playlist`}</span>
        <Tooltip title={t`Previous song (Alt+↑)`} oneLine>
          <button aria-label={t`Previous song`} disabled={!hasPrev} style={iconBtn(hasPrev)} onClick={() => queueStep(-1)}><ChevronUp size={13} /></button>
        </Tooltip>
        <Tooltip title={t`Next song (Alt+↓)`} oneLine>
          <button aria-label={t`Next song`} disabled={!hasNext} style={iconBtn(hasNext)} onClick={() => queueStep(1)}><ChevronDown size={13} /></button>
        </Tooltip>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-amber)', fontFamily: 'var(--font-mono)', flexShrink: 0, minWidth: 14, textAlign: 'right' }}>{queue.paths.length}</span>
      </div>

      <div className="amber-scroll" style={{ maxHeight: ROW_HEIGHT * VISIBLE_ROWS, overflowY: 'auto' }}>
        {queue.paths.length === 0 ? (
          <div style={{ height: ROW_HEIGHT * 2, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 16px', textAlign: 'center',
            fontSize: 10, color: libraryOver ? 'var(--text-amber)' : 'var(--text-muted)', fontFamily: 'var(--font-ui)' }}>
            {libraryOver ? t`Drop here to add to the queue` : t`Right-click songs in the Library › Add to queue, or drag them here`}
          </div>
        ) : queue.paths.map((path, i) => {
          const current = i === queue.index
          const isOpen = current && norm(path) === norm(openPath)
          return (
            <div key={path}
              draggable
              onDragStart={e => { setDragFrom(i); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', path) }}
              onDragEnd={finishDrag}
              onDragOver={e => { if (accepts()) { e.preventDefault(); e.stopPropagation(); setDropAt(i) } }}
              onDrop={e => { e.preventDefault(); e.stopPropagation(); dropOn(i) }}
              onClick={() => { onOpenSong(); void openQueueAt(i, false) }}
              style={{ height: ROW_HEIGHT, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '18px minmax(0, 1fr) auto',
                alignItems: 'center', gap: 6, padding: '0 6px 0 10px', cursor: 'pointer',
                background: isOpen ? 'var(--accent-amber-subtle)' : 'transparent',
                borderBottom: '1px solid var(--border-row)',
                borderTop: dropAt === i ? '2px solid var(--text-amber)' : '2px solid transparent',
                opacity: dragFrom === i ? 0.5 : 1 }}
              onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = 'var(--bg-tile)' }}
              onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = 'transparent' }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', color: current ? 'var(--text-amber)' : 'var(--text-muted)', textAlign: 'right' }}>
                {current ? '▸' : i + 1}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                <LibrarySongName path={path} name={libraryDisplayName(path.split(/[\\/]/).pop() ?? path, songFirst)} spanStyle={current ? SONG_CURRENT : SONG} />
              </div>
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
      </div>
      {/* Clear queue: on the scan row, right, when that row is there */}
      {queue.paths.length > 0 && !PRACTICE_PREP_VISIBLE && <ClearQueueButton onClick={() => useStore.getState().queueClear()} />}
      {PRACTICE_PREP_VISIBLE && <ScanReadyRow onClear={queue.paths.length > 0 ? () => useStore.getState().queueClear() : null} />}
    </div>
  )
}

function ClearQueueButton({ onClick, style }: { onClick: () => void; style?: CSSProperties }) {
  return (
    <button onClick={onClick}
      style={{ width: '100%', padding: '7px 10px', border: 'none', borderTop: '1px solid var(--bg-tile)', background: 'none', textAlign: 'left', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0,
        fontSize: 10, color: 'var(--text-muted)', fontFamily: 'var(--font-ui)', ...style }}
      onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)' }}>
      {t`Clear queue`}
      <ListX size={11} style={{ color: 'var(--text-amber)', flexShrink: 0 }} />
    </button>
  )
}
