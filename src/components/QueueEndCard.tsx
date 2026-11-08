import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { t } from '../utils/i18n'
import { libraryDisplayName } from '../utils/libraryNames'
import { nextQueueSong, openQueueAt, openSongIsQueued } from '../utils/queueControl'

// ── When a queued song plays to its end (Settings › Practice queue › When a song
// ends). Repeat and Stop need no card. Ask shows Again · Next · Stop queue; Play
// the next song shows the same card counting down 3 s, so it can still be changed.
// After the last song: Queue finished · Start again.
// It sits centred on the piano roll's top edge and can be dragged anywhere; the spot it
// was dragged to holds for the rest of the session. It's a notice, not a popup: nothing is dimmed, the keyboard stays
// with the song (Space, arrows), and it goes away by itself as soon as anything is
// played or opened, so ignoring it is always fine. ─────────────────────────────
const COUNTDOWN_S = 3
const SAME_END_MS = 1500 // two clocks can both report one ending
let dragged = { x: 0, y: 0 } // where it was dragged to, for the rest of the session

export default function QueueEndCard({ replay }: { replay: () => void }) {
  const endedAt = useStore(s => s.songEndedAt)
  const [card, setCard] = useState<{ next: { index: number; path: string } | null; countdown: number | null } | null>(null)
  const lastHandled = useRef(0)

  // A song reached its end
  useEffect(() => {
    if (!endedAt || endedAt - lastHandled.current < SAME_END_MS) return
    lastHandled.current = endedAt
    const s = useStore.getState()
    if (!s.queueEnabled || !openSongIsQueued()) return
    const next = nextQueueSong()
    if (s.queueEndAction === 'stop') return
    if (s.queueEndAction === 'repeat') { replay(); return }
    setCard({ next, countdown: s.queueEndAction === 'next' && next ? COUNTDOWN_S : null })
  }, [endedAt, replay])

  // Anything played or opened puts the card away
  useEffect(() => {
    if (!card) return
    const startMidi = useStore.getState().midi
    return useStore.subscribe(s => {
      if (s.playbackState === 'playing' || s.midi !== startMidi) setCard(null)
    })
  }, [card !== null]) // eslint-disable-line react-hooks/exhaustive-deps

  // Play the next song: count down, then go
  useEffect(() => {
    if (!card || card.countdown === null || !card.next) return
    if (card.countdown <= 0) { const n = card.next; setCard(null); void openQueueAt(n.index, true); return }
    const id = setTimeout(() => setCard(c => (c && c.countdown !== null ? { ...c, countdown: c.countdown - 1 } : c)), 1000)
    return () => clearTimeout(id)
  }, [card])

  const songFirst = useStore(s => s.librarySongFirst)

  // Anchored to the piano roll's top edge, centred; follows the window as it resizes
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null)
  const [offset, setOffset] = useState(dragged)
  const boxRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (!card) return
    const place = () => {
      const roll = document.querySelector('[data-piano-roll-area]')?.getBoundingClientRect()
      setAnchor(roll ? { x: roll.left + roll.width / 2, y: roll.top + 10 } : { x: window.innerWidth / 2, y: 56 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [card !== null]) // eslint-disable-line react-hooks/exhaustive-deps
  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const sx = e.clientX, sy = e.clientY, start = offset
    const r = boxRef.current?.getBoundingClientRect()
    const onMove = (ev: MouseEvent) => {
      let x = start.x + ev.clientX - sx, y = start.y + ev.clientY - sy
      if (r) {
        // stays fully in the window, below the title-bar strip
        x = Math.min(Math.max(x, start.x - r.left), start.x + (window.innerWidth - r.right))
        y = Math.min(Math.max(y, start.y + (44 - r.top)), start.y + (window.innerHeight - r.bottom))
      }
      dragged = { x, y }
      setOffset(dragged)
    }
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  if (!card || !anchor) return null
  const name = (p: string) => libraryDisplayName(p.split(/[\\/]/).pop() ?? p, songFirst)
  const btn = (label: string, onClick: () => void, strong = false) => (
    <button onClick={onClick}
      style={{ padding: '4px 10px', borderRadius: 4, fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', cursor: 'pointer', whiteSpace: 'nowrap',
        maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis',
        border: `1px solid ${strong ? 'var(--accent-amber-strong)' : 'var(--border2)'}`,
        background: strong ? 'var(--accent-amber-medium)' : 'transparent', color: strong ? 'var(--text-amber)' : 'var(--text-default)' }}>
      {label}
    </button>
  )
  return (
    <div ref={boxRef} role="status" aria-label={t`Queue`} className="orfeo-modal-glow app-no-drag" onMouseDown={startDrag}
      style={{ position: 'fixed', top: anchor.y, left: anchor.x, transform: `translate(calc(-50% + ${offset.x}px), ${offset.y}px)`, zIndex: 9900, cursor: 'grab',
        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', maxWidth: 'calc(100vw - 48px)',
        // the look of Orfeo's other floating windows: dark, amber edge and glow
        background: 'var(--bg-modal)', border: '1px solid var(--accent-amber-strong)', borderRadius: 'var(--radius-md)',
        '--_modal-shadow': 'var(--elevation-popover)' } as React.CSSProperties}>
      <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-amber)', flexShrink: 0 }}>{t`Queue`}</span>
      {card.next ? (
        <>
          {btn(t`Again`, () => { setCard(null); replay() })}
          {btn(card.countdown !== null ? t`Next in ${card.countdown} s: ${name(card.next.path)}` : t`Next: ${name(card.next.path)}`,
            () => { const n = card.next!; setCard(null); void openQueueAt(n.index, true) }, true)}
          {btn(card.countdown !== null ? t`Cancel` : t`Stop queue`, () => setCard(null))}
        </>
      ) : (
        <>
          <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-default)', fontFamily: 'var(--font-ui)' }}>{t`Queue finished`}</span>
          {btn(t`Start again`, () => { setCard(null); void openQueueAt(0, true) }, true)}
          {btn(t`Close`, () => setCard(null))}
        </>
      )}
    </div>
  )
}
