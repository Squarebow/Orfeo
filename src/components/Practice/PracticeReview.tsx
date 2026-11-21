import { useEffect, type CSSProperties } from 'react'
import { UNDER_HEADER } from './practiceBar'
import { ChevronLeft, ChevronRight, Play, Square, X } from 'lucide-react'
import { useStore } from '../../store'
import { t, currentLanguage } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { useReview, type ReviewUnit, type ReviewHear } from '../../practice/reviewState'
import { closeReview, stepPassage, setUnit, hearAs, togglePassage, showTake, reviewMarks, countMarks, REVIEW_COLORS, type MarkKind } from '../../practice/review'
import type { TakeRecord } from '../../practice/take'
import { openProgress } from './PracticeProgress'

// ── The practice review (stage 5): the bar over the piano roll ───────────────
// Which bars you're looking at and how they went (a mark of its own shape per
// kind, with how many), moving on a bar or a screenful at a time, the passage
// going round with your notes, the part as written or both, and which take.
// ← → move, Space plays or stops the passage, Esc closes.

const segWrap: CSSProperties = { display: 'flex', gap: 2, padding: 2, background: 'var(--bg-tile)', borderRadius: 6 }
const seg = (active: boolean): CSSProperties => ({
  height: 22, padding: '0 8px', border: 'none', borderRadius: 4, cursor: 'pointer',
  fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap',
  background: active ? 'var(--bg-panel2)' : 'transparent', color: active ? 'var(--text-amber)' : 'var(--text-dim)',
})
const iconBtn: CSSProperties = { background: 'none', border: 'none', padding: 3, cursor: 'pointer', color: 'var(--text-default)', display: 'flex', borderRadius: 4 }
const cap: CSSProperties = { fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }

// The same shapes as on the piano roll
function Glyph({ kind }: { kind: MarkKind }) {
  const c = REVIEW_COLORS[kind]
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden style={{ flexShrink: 0 }}>
      {kind === 'fine' && <circle cx="6" cy="6" r="4.5" fill={c} />}
      {kind === 'early' && <><line x1="6" y1="1" x2="6" y2="4" stroke={c} strokeWidth="2" /><circle cx="6" cy="8" r="3.2" fill="none" stroke={c} strokeWidth="1.8" /></>}
      {kind === 'late' && <><line x1="6" y1="8" x2="6" y2="11" stroke={c} strokeWidth="2" /><circle cx="6" cy="4" r="3.2" fill="none" stroke={c} strokeWidth="1.8" /></>}
      {kind === 'missed' && <path d="M2 2 L10 10 M10 2 L2 10" stroke={c} strokeWidth="2" />}
      {kind === 'extra' && <path d="M6 1 L11 6 L6 11 L1 6 Z" fill={c} />}
    </svg>
  )
}

function takeLabel(k: TakeRecord): string {
  const d = new Date(k.at)
  const hm = d.toLocaleTimeString(currentLanguage, { hour: '2-digit', minute: '2-digit' })
  const today = new Date().toDateString() === d.toDateString()
  const when = today ? t`Today ${hm}` : `${d.toLocaleDateString(currentLanguage, { day: 'numeric', month: 'short' })} ${hm}`
  const way = k.way === 'wait' ? t`Wait for me` : k.way === 'perform' ? t`Performance` : t`Play along`
  const hand = k.hand === 'L' ? t`left hand` : k.hand === 'R' ? t`right hand` : t`both hands`
  return `${when} · ${way} · ${hand} · ${k.speed} %`
}

export default function PracticeReview() {
  const { open, takes, idx, unit, from, to, hear, playing } = useReview()
  useStore(s => s.barStarts)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return
      const act = e.key === 'ArrowLeft' ? () => stepPassage(-1) : e.key === 'ArrowRight' ? () => stepPassage(1)
        : e.key === ' ' ? togglePassage : e.key === 'Escape' ? closeReview : null
      if (!act) return
      e.preventDefault(); e.stopImmediatePropagation()
      act()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open])

  if (!open) return null
  const take = takes[idx]
  const s = useStore.getState()
  const start = s.barStarts[from - 1] ?? 0
  const end = to < s.barStarts.length ? s.barStarts[to] : s.midi?.duration ?? 0
  const c = countMarks(reviewMarks(), start, end)
  const kinds: [MarkKind, string][] = [['fine', t`Fine`], ['early', t`A little early`], ['late', t`A little late`], ['missed', t`Missed`], ['extra', t`Extra`]]
  const units: [ReviewUnit, string, string][] = [['bar', t`Bar`, t`Move a bar at a time.`], ['screen', t`Screen`, t`Move a screenful of bars at a time.`]]
  const hears: [ReviewHear, string, string][] = [
    ['mine', t`Yours`, t`Your own notes, as you played them, with what you heard then.`],
    ['written', t`Written`, t`The part as written, to compare.`],
    ['both', t`Both`, t`Your notes and the part as written together.`],
  ]
  const atStart = take && from <= take.fromBar, atEnd = take && to >= take.toBar

  return (
    <div className="app-no-drag" role="region" aria-label={t`Review`} style={{
      position: 'fixed', top: UNDER_HEADER, left: '50%', transform: 'translateX(-50%)', zIndex: 950,
      width: 'min(640px, calc(100vw - 32px))', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8,
      background: 'var(--bg-modal)', border: '1px solid var(--border2)', boxShadow: '0 8px 28px rgba(0,0,0,.35)',
      fontFamily: 'var(--font-ui)', color: 'var(--text-default)', display: 'grid', rowGap: 8,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flexWrap: 'wrap' }}>
        <span style={{ ...cap, color: 'var(--text-amber)' }}>{t`Review`}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Tooltip title={t`Back`} description={t`The bars before (←).`} oneLine>
            <button style={{ ...iconBtn, opacity: atStart ? 0.35 : 1 }} disabled={!!atStart} onClick={() => stepPassage(-1)} aria-label={t`Back`}><ChevronLeft size={16} /></button>
          </Tooltip>
          <span style={{ fontSize: 13, fontWeight: 600, minWidth: 92, textAlign: 'center', whiteSpace: 'nowrap' }}>{from === to ? t`Bar ${from}` : t`Bars ${from}–${to}`}</span>
          <Tooltip title={t`On`} description={t`The bars after (→).`} oneLine>
            <button style={{ ...iconBtn, opacity: atEnd ? 0.35 : 1 }} disabled={!!atEnd} onClick={() => stepPassage(1)} aria-label={t`On`}><ChevronRight size={16} /></button>
          </Tooltip>
        </div>
        <div style={segWrap}>
          {units.map(([u, label, tip]) => <Tooltip key={u} title={label} description={tip}><button style={seg(unit === u)} onClick={() => setUnit(u)}>{label}</button></Tooltip>)}
        </div>
        <Tooltip title={playing ? t`Stop` : t`Play these bars`} description={t`The bars go round and round until you stop them (Space).`}>
          <button onClick={togglePassage} aria-label={playing ? t`Stop` : t`Play these bars`} style={{
            ...iconBtn, width: 26, height: 26, justifyContent: 'center', alignItems: 'center', padding: 0, borderRadius: 13,
            background: 'var(--text-amber)', color: 'var(--bg-modal)',
          }}>{playing ? <Square size={11} fill="currentColor" /> : <Play size={13} fill="currentColor" style={{ marginLeft: 2 }} />}</button>
        </Tooltip>
        <div style={segWrap}>
          {hears.map(([h, label, tip]) => <Tooltip key={h} title={label} description={tip}><button style={seg(hear === h)} onClick={() => hearAs(h)}>{label}</button></Tooltip>)}
        </div>
        <Tooltip title={t`Progress`} description={t`How this song has come along, day by day.`}>
          <button onClick={() => openProgress()} style={{ ...seg(false), marginLeft: 'auto', background: 'var(--bg-tile)' }}>{t`Progress`}</button>
        </Tooltip>
        <button onClick={closeReview} aria-label={t`Close`} style={{ ...iconBtn, color: 'var(--text-muted)' }}><X size={14} /></button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
        {kinds.map(([k, label]) => (
          <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, opacity: c[k] ? 1 : 0.45, whiteSpace: 'nowrap' }}>
            <Glyph kind={k} />{label}<span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-active)' }}>{c[k]}</span>
          </span>
        ))}
      </div>

      {take && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--text-muted)' }}>
          <Tooltip title={t`An earlier time`} oneLine>
            <button style={{ ...iconBtn, color: 'var(--text-muted)', opacity: idx > 0 ? 1 : 0.35 }} disabled={idx === 0} onClick={() => showTake(idx - 1)} aria-label={t`An earlier time`}><ChevronLeft size={13} /></button>
          </Tooltip>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{takeLabel(take)}</span>
          <Tooltip title={t`A later time`} oneLine>
            <button style={{ ...iconBtn, color: 'var(--text-muted)', opacity: idx < takes.length - 1 ? 1 : 0.35 }} disabled={idx >= takes.length - 1} onClick={() => showTake(idx + 1)} aria-label={t`A later time`}><ChevronRight size={13} /></button>
          </Tooltip>
          <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 4 }}>{idx + 1} / {takes.length}</span>
        </div>
      )}
    </div>
  )
}
