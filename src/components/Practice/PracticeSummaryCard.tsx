import { X, GripHorizontal } from 'lucide-react'
import { UNDER_HEADER, useDragAnywhere } from './practiceBar'
import Tooltip from '../Tooltip'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { usePractice } from '../../practice/practiceMode'
import { useSession, practiseBars, currentSession } from '../../practice/session'
import { cachedHistory, allTakes } from '../../practice/history'
import { takesCsv } from '../../practice/words'
import { openReview, reviewableTakes } from '../../practice/review'
import { openProgress } from './PracticeProgress'

// ── How it went: a few words after you stop (practice stage 4) ───────────────
// Opened from HOW IT WENT in the header (it never pops up by itself), like the
// other popups, and dragged anywhere by its top; closes when you play again. Never a grade: what went well, one thing worth another
// go (with a button that loops those bars), and the numbers as a table for
// anyone who wants them. Switched off in Settings › Practice mode.

export default function PracticeSummaryCard() {
  const card = useSession(s => s.card)
  const cardOpen = useSession(s => s.cardOpen)
  const active = usePractice(s => s.active)
  const playing = useStore(s => s.playbackState === 'playing')
  // dragged anywhere but its buttons; stays where you put it
  const { off, dragProps } = useDragAnywhere('how-it-went')
  if (!card || !cardOpen || !active || playing) return null
  const close = () => useSession.setState({ cardOpen: false })
  const f = card.focus
  const goOver = () => { if (!f) return; const at = practiseBars(f.from, f.to); if (at !== null) useStore.setState({ currentTime: at }) }   // stopped: moving the playhead is all a seek is
  const saveCsv = async () => {
    const { song } = currentSession()
    if (!song) return
    const takes = allTakes(cachedHistory(song))
    if (!takes.length) return
    const base = song.replace(/\\/g, '/').split('/').pop()!.replace(/\.midi?$/i, '')
    await window.electronAPI?.practiceSaveCsv?.(`${base} - ${t`practice`}.csv`, takesCsv(takes))
  }
  const canSave = !!currentSession().song && !!window.electronAPI?.practiceSaveCsv
  const canReview = reviewableTakes().length > 0

  return (
    <div {...dragProps} className="app-no-drag orfeo-modal-glow" role="dialog" aria-label={t`Practice log`} style={{
      position: 'fixed', top: UNDER_HEADER + off.y, left: `calc(50% + ${off.x}px)`, transform: 'translateX(-50%)', zIndex: 950,
      width: 'min(440px, calc(100vw - 32px))', boxSizing: 'border-box', padding: '12px 14px 12px 16px', borderRadius: 'var(--radius-md)',
      background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)',
      fontFamily: 'var(--font-ui)', color: 'var(--text-default)',
      '--_modal-shadow': 'var(--elevation-popover)',
    } as React.CSSProperties}>
      <div
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, cursor: 'grab', touchAction: 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-amber)' }}>
          <GripHorizontal size={12} color="var(--text-muted)" />{t`Practice log`}
        </span>
        <button onClick={close} aria-label={t`Close`} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={14} /></button>
      </div>
      <div style={{ display: 'grid', rowGap: 4, fontSize: 13, lineHeight: 1.45 }}>
        {card.lines.map((l, i) => <p key={i} style={{ margin: 0 }}>{l}</p>)}
      </div>
      {(f || canReview || !!currentSession().song) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
          {f ? (
            <button onClick={goOver} style={{
              height: 26, padding: '0 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase', background: 'var(--accent-amber-subtle)', border: '1px solid var(--accent-amber-strong)', color: 'var(--text-amber)',
            }}>{f.from === f.to ? t`Practise bar ${f.from}` : t`Practise bars ${f.from}–${f.to}`}</button>
          ) : <span />}
          {canReview && (
            <Tooltip title={t`Review`} description={t`See how each note went, on the piano roll, bar by bar.`}>
            <button onClick={() => openReview(card.take, f?.from)} style={{
              height: 26, padding: '0 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase', background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text-default)',
            }}>{t`Review`}</button>
            </Tooltip>
          )}
          <span style={{ display: 'flex', gap: 14, marginLeft: 'auto' }}>
            <button onClick={() => openProgress()} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              {t`Progress`}
            </button>
            {canSave && (
              <button onClick={saveCsv} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
                {t`Save the numbers (CSV)`}
              </button>
            )}
          </span>
        </div>
      )}
    </div>
  )
}
