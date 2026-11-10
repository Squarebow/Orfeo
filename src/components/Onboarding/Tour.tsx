import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { X, ChevronLeft, ChevronRight } from 'lucide-react'
import { useStore, libraryRestored } from '../../store'
import { t } from '../../utils/i18n'
import { placeCard, nextShownStep, type Box, type CardPlace, type TourId } from '../../utils/tours'
import { tourSteps, type TourStep } from './tourSteps'

// ── A short tour: the app dims, the control in question gets an amber ring, and a
// card beside it says what it's for. Next / Back / ×, or Enter / arrows / Esc.
// Nothing behind it can be clicked or played while it runs: a full-window layer takes
// every click, and the app's keyboard shortcuts are held back. Skip, Esc and Done all
// count the tour as seen (store.endTour). ─────────────────────────────────────────

const RING_PAD = 6
const CARD_WIDTH = 300
const POINTER = 12 // the card's pointer, a square turned on its corner

const find = (mark: string) => document.querySelector<HTMLElement>(`[data-tour="${mark}"]`)
const visible = (el: HTMLElement | null): el is HTMLElement => {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 2 && r.height > 2 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth
}
const stepTargets = (step: TourStep): HTMLElement[] => {
  const found = step.targets.map(find).filter(visible)
  if (found.length) return found
  const fb = step.fallback ? find(step.fallback) : null
  return visible(fb) ? [fb] : []
}
// the ring around a control, kept inside the window so a panel at the edge shows all of it
const boxOf = (el: HTMLElement): Box => {
  const r = el.getBoundingClientRect(), edge = 2
  const left = Math.max(edge, r.left - RING_PAD), top = Math.max(edge, r.top - RING_PAD)
  const right = Math.min(window.innerWidth - edge, r.right + RING_PAD), bottom = Math.min(window.innerHeight - edge, r.bottom + RING_PAD)
  return { left, top, width: right - left, height: bottom - top }
}
// one ring round several parts of an area
const union = (bs: Box[]): Box => {
  const left = Math.min(...bs.map(b => b.left)), top = Math.min(...bs.map(b => b.top))
  const right = Math.max(...bs.map(b => b.left + b.width)), bottom = Math.max(...bs.map(b => b.top + b.height))
  return { left, top, width: right - left, height: bottom - top }
}
const sameBoxes =(a: Box[], b: Box[]) => a.length === b.length && a.every((x, i) =>
  Math.abs(x.left - b[i].left) < 0.5 && Math.abs(x.top - b[i].top) < 0.5 && Math.abs(x.width - b[i].width) < 0.5 && Math.abs(x.height - b[i].height) < 0.5)

function TourOverlay({ id }: { id: TourId }) {
  const [steps] = useState(() => tourSteps(id))
  const [index, setIndex] = useState<number | null>(null)
  const [boxes, setBoxes] = useState<Box[]>([])
  const [place, setPlace] = useState<CardPlace | null>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const finish = () => {
    if (id === 'firstLaunch') useStore.getState().setDrawerTab('library')
    useStore.getState().endTour()
  }

  // Open what a step needs, then wait a moment for panels to slide in before looking for it
  const goTo = (from: number, dir: 1 | -1) => {
    const tryStep = (i: number | null) => {
      if (i === null) { if (dir === 1) finish(); return }
      steps[i].prepare?.()
      setTimeout(() => {
        if (steps[i].welcome || stepTargets(steps[i]).length) { setIndex(i); return }
        tryStep(nextShownStep(i, dir, steps.length, () => true)) // nothing to point at: pass it over
      }, steps[i].prepare ? 260 : 0)
    }
    tryStep(nextShownStep(from, dir, steps.length, () => true))
  }
  useEffect(() => { goTo(-1, 1) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the control while panels slide, the window resizes or the app zooms
  useEffect(() => {
    if (index === null) return
    let frame = 0
    const tick = () => {
      const found = steps[index].welcome ? [] : stepTargets(steps[index]).map(boxOf)
      const next = steps[index].oneRing && found.length > 1 ? [union(found)] : found
      setBoxes(prev => (sameBoxes(prev, next) ? prev : next))
      frame = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(frame)
  }, [index, steps])

  useLayoutEffect(() => {
    const card = cardRef.current
    if (!card || index === null) return
    // a welcome card sits in the middle of the window
    if (steps[index].welcome) {
      const left = Math.round((window.innerWidth - card.offsetWidth) / 2), top = Math.round((window.innerHeight - card.offsetHeight) / 2)
      setPlace(p => (p && p.left === left && p.top === top && p.arrow === -1 ? p : { left, top, side: 'bottom', arrow: -1 }))
      return
    }
    if (!boxes.length) return
    const next = placeCard(boxes[0], { width: card.offsetWidth, height: card.offsetHeight }, { width: window.innerWidth, height: window.innerHeight }, steps[index ?? 0].side)
    setPlace(p => (p && p.left === next.left && p.top === next.top && p.side === next.side && p.arrow === next.arrow ? p : next))
  }, [boxes, index, steps])

  // The keyboard belongs to the tour while it runs
  const nav = useRef({ next: () => {}, back: () => {}, close: () => {} })
  nav.current = {
    next: () => index !== null && goTo(index, 1),
    back: () => index !== null && nextShownStep(index, -1, steps.length, () => true) !== null && goTo(index, -1),
    close: finish,
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault()
      e.stopPropagation()
      e.stopImmediatePropagation()
      if (e.repeat) return
      if (e.key === 'Escape') nav.current.close()
      else if (e.key === 'Enter' || e.key === 'ArrowRight') nav.current.next()
      else if (e.key === 'ArrowLeft') nav.current.back()
    }
    const hold = (e: KeyboardEvent) => { e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation() }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', hold, true)
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('keyup', hold, true) }
  }, [])

  const step = index !== null ? steps[index] : null
  // the welcome card isn't numbered: "1/4" counts the steps that point at something
  const numbered = steps.filter(s => !s.welcome).length
  const number = index === null ? 0 : steps.slice(0, index + 1).filter(s => !s.welcome).length
  const w = window.innerWidth, h = window.innerHeight
  // the dimmed layer with a hole for every ring
  const holes = boxes.map(b => {
    const r = Math.min(8, b.width / 2, b.height / 2)
    return `M${b.left + r},${b.top}h${b.width - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${b.height - 2 * r}a${r},${r} 0 0 1 -${r},${r}h-${b.width - 2 * r}a${r},${r} 0 0 1 -${r},-${r}v-${b.height - 2 * r}a${r},${r} 0 0 1 ${r},-${r}z`
  }).join('')

  const pointerStyle = (): React.CSSProperties | null => {
    if (!place || place.arrow < 0) return null
    const half = POINTER / 2
    const edge = '1px solid var(--accent-amber-strong)'
    const base: React.CSSProperties = { position: 'absolute', width: POINTER, height: POINTER, background: 'var(--bg-modal)', transform: 'rotate(45deg)' }
    // the card is below the target: the pointer sits on its top edge, and so on
    if (place.side === 'bottom') return { ...base, top: -half - 1, left: place.arrow - half, borderTop: edge, borderLeft: edge }
    if (place.side === 'top') return { ...base, bottom: -half - 1, left: place.arrow - half, borderBottom: edge, borderRight: edge }
    if (place.side === 'right') return { ...base, left: -half - 1, top: place.arrow - half, borderBottom: edge, borderLeft: edge }
    return { ...base, right: -half - 1, top: place.arrow - half, borderTop: edge, borderRight: edge }
  }

  const iconBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3, height: 24, padding: '0 6px', borderRadius: 4,
    background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text-default)', cursor: 'pointer',
    fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)',
  }
  // ‹ and ›: the same square button, › filled amber
  const arrowBtn: React.CSSProperties = { ...iconBtn, width: 28, height: 24, padding: 0 }

  return (
    <div role="dialog" aria-modal="true" aria-label={step?.title ?? t`Tour`} className="app-no-drag"
      onMouseDown={e => e.preventDefault()} onContextMenu={e => e.preventDefault()}
      style={{ position: 'fixed', inset: 0, zIndex: 99990 }}>
      <svg width={w} height={h} style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <path d={`M0,0H${w}V${h}H0Z${holes}`} fillRule="evenodd" fill="rgba(0,0,0,0.6)" />
      </svg>
      {boxes.map((b, i) => (
        // the same slow blink as "Set your MIDI folder" on a first start
        <div key={i} className="loop-nudge-blink" style={{ position: 'absolute', left: b.left, top: b.top, width: b.width, height: b.height, pointerEvents: 'none',
          borderRadius: 8, border: '1.5px dashed var(--text-amber)', boxShadow: '0 0 14px 2px var(--accent-amber-medium)' }} />
      ))}
      {step && (
        <div ref={cardRef} className="orfeo-modal-glow" onMouseDown={e => e.stopPropagation()}
          style={{ position: 'absolute', left: place?.left ?? -9999, top: place?.top ?? -9999, width: CARD_WIDTH, maxWidth: 'calc(100vw - 16px)',
            boxSizing: 'border-box', padding: '12px 14px 10px', background: 'var(--bg-modal)', border: '1px solid var(--accent-amber-strong)',
            borderRadius: 'var(--radius-md)', fontFamily: 'var(--font-ui)', '--_modal-shadow': 'var(--elevation-popover)' } as React.CSSProperties}>
          {pointerStyle() && <div style={pointerStyle()!} />}
          {step.welcome ? (
            <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-amber)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{step.title}</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr)', alignItems: 'center', columnGap: 8 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--text-amber)', color: 'var(--text-on-amber)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>{number}</span>
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-amber)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{step.title}</span>
            </div>
          )}
          <div style={{ marginTop: 8, fontSize: 'var(--text-xs)', lineHeight: 1.55, color: 'var(--text-default)', textAlign: step.welcome ? 'center' : undefined }}>{step.text}</div>
          {/* count · ‹ › in the middle of the card · Esc ✕; equal side columns keep the arrows centred */}
          <div style={{ marginTop: 12, paddingTop: 8, borderTop: '1px solid var(--border)', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto minmax(0, 1fr)', alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--text-xs)', fontFamily: 'var(--font-mono)', color: 'var(--text-faint)' }}>{step.welcome ? '' : `${number}/${numbered}`}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {/* both always there so the pair never shifts; ‹ is greyed out where there's nothing before */}
              {(() => { const canBack = nextShownStep(index!, -1, steps.length, () => true) !== null; return (
                <button onClick={() => nav.current.back()} disabled={!canBack} aria-label={t`Back`}
                  style={{ ...arrowBtn, opacity: canBack ? 1 : 0.35, cursor: canBack ? 'pointer' : 'default' }}><ChevronLeft size={14} /></button>
              ) })()}
              <button onClick={() => nav.current.next()} aria-label={index === steps.length - 1 ? t`Done` : t`Next`}
                style={{ ...arrowBtn, border: '1px solid var(--accent-amber-strong)', background: 'var(--accent-amber-medium)', color: 'var(--text-amber)' }}>
                <ChevronRight size={14} />
              </button>
            </div>
            <button onClick={() => nav.current.close()} aria-label={t`Close the tour (Esc)`} title={t`Close (Esc)`}
              style={{ ...iconBtn, justifySelf: 'end', border: 'none', color: 'var(--text-faint)', padding: '0 2px' }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--font-mono)' }}>Esc</span><X size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── When each tour starts on its own: first launch once the settings are back; first
// song the first time a song has finished opening and isn't playing, after the first
// tour is done or skipped. A replay (Settings › Appearance › Tours) just calls startTour.
export default function Tour() {
  const active = useStore(s => s.tourActive)
  const seen = useStore(s => s.toursSeen)
  const midi = useStore(s => s.midi)
  const playing = useStore(s => s.playbackState === 'playing')
  const [restored, setRestored] = useState(false)
  useEffect(() => { void libraryRestored.then(() => setRestored(true)) }, [])

  useEffect(() => {
    if (!restored || active) return
    const due: TourId | null = !seen.firstLaunch ? 'firstLaunch' : !seen.firstSong && midi && !playing ? 'firstSong' : null
    if (!due) return
    const id = setTimeout(() => {
      const s = useStore.getState()
      if (s.tourActive || s.settingsWindowOpen || (due === 'firstSong' && (!s.midi || s.playbackState === 'playing'))) return
      s.startTour(due)
    }, due === 'firstLaunch' ? 700 : 1200)
    return () => clearTimeout(id)
  }, [restored, active, seen, midi, playing])

  // a song playing behind a tour is paused (a replay can start mid-song)
  useEffect(() => {
    if (!active || useStore.getState().playbackState !== 'playing') return
    ;(window as any).__orfeoPlayer?.pause?.()
    useStore.setState({ playbackState: 'paused' })
  }, [active])

  return active ? <TourOverlay key={active} id={active} /> : null
}
