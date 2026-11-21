import { X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { usePractice } from '../../practice/practiceMode'
import { useSession, practiseBars, currentSession } from '../../practice/session'
import { cachedHistory, allTakes } from '../../practice/history'
import { takesCsv } from '../../practice/words'

// ── How it went: a few words after you stop (practice stage 4) ───────────────
// Over the top of the piano roll while the song is stopped; gone when you play
// again or close it. Never a grade: what went well, one thing worth another
// go (with a button that loops those bars), and the numbers as a table for
// anyone who wants them. Switched off in Settings › Practice mode.

export default function PracticeSummaryCard() {
  const card = useSession(s => s.card)
  const active = usePractice(s => s.active)
  const playing = useStore(s => s.playbackState === 'playing')
  if (!card || !active || playing) return null
  const close = () => useSession.setState({ card: null })
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

  return (
    <div className="app-no-drag" role="status" style={{
      position: 'fixed', top: 52, left: '50%', transform: 'translateX(-50%)', zIndex: 950,
      width: 'min(440px, calc(100vw - 32px))', boxSizing: 'border-box', padding: '12px 14px 12px 16px', borderRadius: 8,
      background: 'var(--bg-modal)', border: '1px solid var(--border2)', boxShadow: '0 8px 28px rgba(0,0,0,.35)',
      fontFamily: 'var(--font-ui)', color: 'var(--text-default)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-amber)' }}>{t`How it went`}</span>
        <button onClick={close} aria-label={t`Close`} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={14} /></button>
      </div>
      <div style={{ display: 'grid', rowGap: 4, fontSize: 13, lineHeight: 1.45 }}>
        {card.lines.map((l, i) => <p key={i} style={{ margin: 0 }}>{l}</p>)}
      </div>
      {(f || canSave) && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 10 }}>
          {f ? (
            <button onClick={goOver} style={{
              height: 26, padding: '0 12px', borderRadius: 4, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase', background: 'var(--accent-amber-subtle)', border: '1px solid var(--accent-amber-strong)', color: 'var(--text-amber)',
            }}>{f.from === f.to ? t`Practise bar ${f.from}` : t`Practise bars ${f.from}–${f.to}`}</button>
          ) : <span />}
          {canSave && (
            <button onClick={saveCsv} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
              {t`Save the numbers (CSV)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
