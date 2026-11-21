import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { create } from 'zustand'
import { X } from 'lucide-react'
import { t, currentLanguage } from '../../utils/i18n'
import { usePractice } from '../../practice/practiceMode'
import { currentSession, useSession } from '../../practice/session'
import { loadHistory, cachedHistory, allTakes } from '../../practice/history'
import { useReview } from '../../practice/reviewState'
import { closeReview } from '../../practice/review'
import { daysOf, kindsOf, kindKey, kindName, progressWords, measureOf, type Day } from '../../practice/progress'
import type { TakeRecord } from '../../practice/take'

// ── Progress over days and weeks (practice stage 6) ─────────────────────────
// One point a day you practised, for one kind of practice at a time (the same
// way of playing, hand and level: like with like), and a few plain sentences
// on what's improving. In practice mode from the How it went card or the
// review; a short version in File info.

export const useProgress = create<{ open: boolean; kind: string | null; sample: TakeRecord[] | null }>(() => ({ open: false, kind: null, sample: null }))
export function openProgress(sample: TakeRecord[] | null = null) {
  if (useReview.getState().open) closeReview()
  useSession.setState({ card: null })
  useProgress.setState({ open: true, kind: null, sample })
}
export const closeProgress = () => useProgress.setState({ open: false, sample: null })
usePractice.subscribe((p, prev) => { if (!p.active && prev.active) closeProgress() })
useReview.subscribe((r, prev) => { if (r.open && !prev.open) closeProgress() })
useSession.subscribe((s, prev) => { if (s.card && !prev.card) closeProgress() })

const fmtDay = (at: number, long = false) => new Date(at).toLocaleDateString(currentLanguage, long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'numeric' })

// ── The picture: a column a day, 0–100 % ─────────────────────────────────────
// One series, one hue (the app's amber); thin columns with a rounded cap from
// one baseline, hairline grid at 50 and 100, the latest day's value on its cap,
// every day's numbers on hover.
export function ProgressChart({ days, measure, compact = false, onHover }: { days: Day[]; measure: 'right' | 'pace' | 'speed'; compact?: boolean; onHover?: (d: Day | null) => void }) {
  const W = compact ? 240 : 520, H = compact ? 44 : 128
  const left = compact ? 0 : 34, top = compact ? 4 : 14, bottom = compact ? 0 : 18
  const plotH = H - top - bottom, plotW = W - left
  const n = Math.max(days.length, 1), slot = plotW / n
  const bw = Math.min(compact ? 10 : 24, Math.max(3, slot * 0.6))
  const y = (v: number) => top + plotH * (1 - v / 100)
  const [hover, setHover] = useState<number | null>(null)
  const pick = (i: number | null) => { setHover(i); onHover?.(i === null ? null : days[i]) }
  const label = days.length > 8 ? new Set([0, days.length - 1]) : null
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: 'block', maxWidth: W, overflow: 'visible' }}
      role="img" aria-label={days.map(d => `${fmtDay(d.at)}: ${d[measure] ?? '–'} %`).join(', ')} onMouseLeave={() => pick(null)}>
      {!compact && [0, 50, 100].map(v => (
        <g key={v}>
          <line x1={left} x2={W} y1={y(v)} y2={y(v)} stroke="var(--border2)" strokeWidth={1} />
          <text x={left - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill="var(--text-muted)" fontFamily="var(--font-mono)">{v === 100 ? '100 %' : v}</text>
        </g>
      ))}
      {compact && <line x1={0} x2={W} y1={y(0)} y2={y(0)} stroke="var(--border2)" strokeWidth={1} />}
      {days.map((d, i) => {
        const v = d[measure]
        const cx = left + slot * (i + 0.5)
        const h = v === null ? 0 : Math.max(2, plotH * v / 100)
        const yTop = y(0) - h, r = Math.min(4, bw / 2, h)
        const last = i === days.length - 1
        return (
          <g key={d.date} onMouseEnter={() => pick(i)}>
            <rect x={left + slot * i} y={top} width={slot} height={plotH + bottom} fill="transparent" />
            {v !== null && (
              <path d={`M${cx - bw / 2},${y(0)} V${yTop + r} Q${cx - bw / 2},${yTop} ${cx - bw / 2 + r},${yTop} H${cx + bw / 2 - r} Q${cx + bw / 2},${yTop} ${cx + bw / 2},${yTop + r} V${y(0)} Z`}
                fill="var(--text-amber)" opacity={hover === null || hover === i ? 1 : 0.45} />
            )}
            {v === null && <circle cx={cx} cy={y(0) - 3} r={1.5} fill="var(--text-muted)" />}
            {!compact && last && v !== null && <text x={cx} y={yTop - 4} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--text-active)" fontFamily="var(--font-mono)">{v}</text>}
            {!compact && (!label || label.has(i)) && <text x={cx} y={H - 4} textAnchor="middle" fontSize={9} fill="var(--text-muted)" fontFamily="var(--font-mono)">{fmtDay(d.at)}</text>}
          </g>
        )
      })}
    </svg>
  )
}

const measureTitle = (m: 'right' | 'pace' | 'speed') =>
  m === 'right' ? t`Notes right, day by day` : m === 'pace' ? t`How close to the tempo it flowed, day by day` : t`The tempo you practised at, day by day`
function readout(d: Day, m: 'right' | 'pace' | 'speed'): string {
  const v = d[m]
  const what = v === null ? '–' : m === 'right' ? t`${v} % right` : m === 'pace' ? t`${v} % of the tempo` : t`at ${v} % of the tempo`
  return `${fmtDay(d.at, true)} · ${what} · ${d.takes === 1 ? t`1 take` : t`${d.takes} takes`}`
}

function useSongTakes(): TakeRecord[] {
  const { song, session } = currentSession()
  const [, bump] = useState(0)
  useEffect(() => { if (song) loadHistory(song).then(() => bump(x => x + 1)) }, [song])
  return song ? allTakes(cachedHistory(song)) : session?.takes ?? []
}

const segWrap: CSSProperties = { display: 'flex', gap: 2, padding: 2, background: 'var(--bg-tile)', borderRadius: 6, flexWrap: 'wrap' }
const seg = (active: boolean): CSSProperties => ({
  height: 22, padding: '0 8px', border: 'none', borderRadius: 4, cursor: 'pointer',
  fontFamily: 'var(--font-ui)', fontSize: 10, fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap',
  background: active ? 'var(--bg-panel2)' : 'transparent', color: active ? 'var(--text-amber)' : 'var(--text-dim)',
})
const capTitle: CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }

export default function PracticeProgress() {
  const { open, kind, sample } = useProgress()
  const active = usePractice(s => s.active)
  const songTakes = useSongTakes()
  const takes = sample ?? songTakes
  const kinds = useMemo(() => kindsOf(takes), [takes])
  const [hoverDay, setHoverDay] = useState<Day | null>(null)
  if (!open || !active) return null
  const g = kinds.find(k => kindKey(k.kind) === kind) ?? kinds[0]
  const days = g ? daysOf(g.takes) : []
  const m = g ? measureOf(g.kind) : 'right'
  const speedVaries = days.filter(d => d.speed !== null).length >= 2 && new Set(days.map(d => d.speed)).size > 1
  const words = progressWords(days)

  return (
    <div className="app-no-drag" role="region" aria-label={t`Progress`} style={{
      position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 950,
      width: 'min(580px, calc(100vw - 32px))', boxSizing: 'border-box', padding: '12px 14px 14px 16px', borderRadius: 8,
      background: 'var(--bg-modal)', border: '1px solid var(--border2)', boxShadow: '0 8px 28px rgba(0,0,0,.35)',
      fontFamily: 'var(--font-ui)', color: 'var(--text-default)', display: 'grid', rowGap: 10,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ ...capTitle, color: 'var(--text-amber)' }}>{t`Progress`}{sample ? ' · made up (Dev Tools)' : ''}</span>
        <button onClick={closeProgress} aria-label={t`Close`} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={14} /></button>
      </div>
      {!g ? <div style={{ fontSize: 13 }}>{t`Nothing played on this song in practice mode yet.`}</div> : (
        <>
          {kinds.length > 1 && (
            <div style={segWrap}>
              {kinds.map(k => <button key={kindKey(k.kind)} style={seg(k === g)} onClick={() => useProgress.setState({ kind: kindKey(k.kind) })}>{kindName(k.kind)}</button>)}
            </div>
          )}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
              <span style={capTitle}>{measureTitle(m)}</span>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{hoverDay ? readout(hoverDay, m) : ''}</span>
            </div>
            <ProgressChart days={days} measure={m} onHover={setHoverDay} />
          </div>
          {speedVaries && (
            <div>
              <div style={{ ...capTitle, marginBottom: 6 }}>{measureTitle('speed')}</div>
              <ProgressChart days={days} measure="speed" onHover={setHoverDay} />
            </div>
          )}
          <div style={{ display: 'grid', rowGap: 4, fontSize: 13, lineHeight: 1.45 }}>
            {words.map((l, i) => <p key={i} style={{ margin: 0 }}>{l}</p>)}
          </div>
        </>
      )}
    </div>
  )
}

/** File info: a short version for a song, from its kept numbers */
export function PracticeProgressSummary({ path }: { path: string }) {
  const [takes, setTakes] = useState<TakeRecord[] | null>(null)
  useEffect(() => { let live = true; loadHistory(path).then(h => { if (live) setTakes(allTakes(h)) }); return () => { live = false } }, [path])
  if (!takes?.length) return null
  const g = kindsOf(takes)[0]
  const days = daysOf(g.takes)
  const words = progressWords(days)
  return (
    <div style={{ marginTop: 12, borderTop: '1px solid var(--border-row)', paddingTop: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent-amber-icon-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
        {t`Practice`} · {kindName(g.kind)}
      </div>
      <ProgressChart days={days} measure={measureOf(g.kind)} compact />
      <div style={{ marginTop: 6, fontSize: 11, lineHeight: 1.4, color: 'var(--text-default)' }}>{words.slice(0, 2).join(' ')}</div>
    </div>
  )
}
