import { createPortal } from 'react-dom'
import { useEffect, useState, type CSSProperties } from 'react'
import { Play, Pause, Check, PenLine } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { getPianoRollAreaRect, getPianoRollCenterX } from '../../utils/modalAnchors'
import { passagesOf, togglePassagePlay, markPassageCorrect, fixPassageByHand } from '../../utils/handCheck'

// ── The panel over the piano roll while a passage is being checked ──────────
// The passage loops (amber band on the roll); three choices: play it, keep
// the hands as they are, or fix them by hand in the Note Editor.
const W = 400

export default function HandCheckPanel() {
  const hc = useStore(s => s.handCheck)
  useStore(s => s.handCheckRev)
  const playing = useStore(s => s.playbackState === 'playing')
  const barStarts = useStore(s => s.barStarts)
  const [, setTick] = useState(0)
  // follow the window and the roll's size
  useEffect(() => {
    const on = () => setTick(x => x + 1)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  if (!hc || !hc.panel) return null
  const ps = passagesOf(hc.track)
  const p = ps[hc.index]
  if (!p) return null

  const barOf = (time: number) => { let b = 0; for (let i = 0; i < barStarts.length; i++) if (barStarts[i] <= time + 1e-6) b = i; return b + 1 }
  const b1 = barOf(p.start), b2 = barOf(p.end)
  const roll = getPianoRollAreaRect()
  const left = Math.max(8, Math.min(window.innerWidth - W - 8, getPianoRollCenterX() - W / 2))
  const top = (roll?.top ?? 120) + 12

  const btn = (primary: boolean): CSSProperties => ({
    flex: 1, height: 30, padding: '0 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', fontWeight: 600, whiteSpace: 'nowrap',
    border: primary ? 'none' : '1px solid var(--accent-amber-strong)',
    background: primary ? 'var(--text-amber)' : 'var(--bg-modal-header)',
    color: primary ? 'var(--bg-modal-header)' : 'var(--text-amber)',
  })

  return createPortal(
    <div role="dialog" aria-label={t`Check the hands`} className="orfeo-modal-glow app-no-drag"
      style={{
        position: 'fixed', top, left, width: W, zIndex: 9690, boxSizing: 'border-box',
        background: 'var(--bg-modal-header)', border: '1px solid var(--accent-amber-strong)',
        borderRadius: 'var(--radius-md)', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8,
      }}>
      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-amber)' }}>
        {b1 === b2 ? t`Passage ${hc.index + 1} of ${ps.length} · bar ${b1}` : t`Passage ${hc.index + 1} of ${ps.length} · bars ${b1}–${b2}`}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.4 }}>
        {t`Orfeo isn't sure about the hands here. Listen to the loop, then keep them or fix them.`}
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button onClick={togglePassagePlay} style={btn(false)}>
          {playing ? <Pause size={12} /> : <Play size={12} />} {playing ? t`Pause` : t`Play`}
        </button>
        <button onClick={markPassageCorrect} style={btn(true)}>
          <Check size={12} /> {t`The hands are right`}
        </button>
        <button onClick={fixPassageByHand} style={btn(false)}>
          <PenLine size={12} /> {t`Fix by hand`}
        </button>
      </div>
    </div>,
    document.body,
  )
}
