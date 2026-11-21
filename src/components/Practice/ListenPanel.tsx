import { useListen } from '../../practice/listen'
import { useDevPractice } from '../../practice/devPlay'
import { usePractice } from '../../practice/practiceMode'
import type { Outcome } from '../../practice/matcher'
import { useStore } from '../../store'

// ── Dev Tools: what Orfeo heard, live (practice stage 2) ─────────────────────
// A dashed floating panel in practice mode, on from Settings › Dev Tools ›
// Orfeo listens. Dev mode only: the player never sees counts like these
// (never punish); it's here to check the pairing against what was played.

const NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']
const nn = (m: number) => NAMES[m % 12] + (Math.floor(m / 12) - 1)

function line(o: Outcome, r: number): { text: string; color: string } {
  if (o.kind === 'hit') {
    const ms = Math.round(o.offset / r * 1000)
    const when = Math.abs(ms) < 15 ? 'on time' : ms < 0 ? `${-ms} ms early` : `${ms} ms late`
    return { text: `✓ ${nn(o.exp.midi)} ${o.exp.hand} · bar ${o.exp.bar} · ${when}`, color: 'var(--text-active)' }
  }
  if (o.kind === 'missed') return { text: `· missed ${nn(o.exp.midi)} ${o.exp.hand} · bar ${o.exp.bar}`, color: 'var(--text-muted)' }
  return { text: `+ extra ${nn(o.played.midi)} · bar ${o.bar}`, color: 'var(--text-amber)' }
}

export default function ListenPanel() {
  const show = useDevPractice(s => s.listenPanel)
  const active = usePractice(s => s.active)
  const { listening, summary, recent } = useListen()
  const bpm = useStore(s => s.bpm), orig = useStore(s => s.originalBpm)
  if (!show || !active) return null
  const r = orig > 0 ? bpm / orig : 1
  const avg = summary && summary.hit ? Math.round(summary.meanOffset / r * 1000) : null
  const box: React.CSSProperties = {
    position: 'fixed', top: 52, right: 12, width: 250, zIndex: 900, padding: 8, borderRadius: 4,
    border: '1px dashed var(--border2)', background: 'var(--bg-modal)', fontFamily: 'var(--font-ui)', fontSize: 10, color: 'var(--text-muted)',
    pointerEvents: 'none',
  }
  return (
    <div style={box} className="app-no-drag">
      <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 6 }}>Orfeo listens · dev only</div>
      {!listening || !summary ? <div>Not listening (no song or part)</div> : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr 1fr 1fr', columnGap: 8, rowGap: 2, fontFamily: 'var(--font-mono)' }}>
            <span /><span>right</span><span>missed</span><span>extra</span>
            <span>all</span><span style={{ color: 'var(--text-active)' }}>{summary.hit}</span><span>{summary.missed}</span><span style={{ color: 'var(--text-amber)' }}>{summary.extra}</span>
            <span>L</span><span>{summary.perHand.L.hit}</span><span>{summary.perHand.L.missed}</span><span />
            <span>R</span><span>{summary.perHand.R.hit}</span><span>{summary.perHand.R.missed}</span><span />
          </div>
          <div style={{ marginTop: 4 }}>
            {summary.pending} still to play{avg !== null && ` · on average ${Math.abs(avg) < 15 ? 'on time' : avg < 0 ? `${-avg} ms early` : `${avg} ms late`}`}
          </div>
          <div style={{ marginTop: 6, display: 'grid', rowGap: 1, fontFamily: 'var(--font-mono)' }}>
            {recent.map((o, i) => { const l = line(o, r); return <span key={i} style={{ color: l.color, opacity: 1 - i * 0.05, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.text}</span> })}
          </div>
        </>
      )}
    </div>
  )
}
