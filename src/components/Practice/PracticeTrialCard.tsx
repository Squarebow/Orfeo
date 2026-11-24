import { X, GripHorizontal } from 'lucide-react'
import { useMemo } from 'react'
import { UNDER_HEADER, useDragAnywhere, AMBER } from './practiceBar'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { usePractice, setTrialCard, prepareFromPractice, leavePractice } from '../../practice/practiceMode'
import { trialReport } from '../../practice/trialReport'

// ── Why it isn't a lesson yet (Try it as it is) ─────────────────────────────
// Opened when you stop after trying a song as it is, and from the header's
// "Why not a lesson?": what the song is as a lesson sees it, what that holds
// back (one hand alone, the score, the practice log), what the Lesson check
// found, and the next step with its button. Dragged anywhere but its buttons.

export default function PracticeTrialCard() {
  const open = usePractice(s => s.trialCard && s.trial && s.active)
  const playing = useStore(s => s.playbackState === 'playing')
  const midi = useStore(s => s.midi)
  const editorOn = useStore(s => s.noteEditorEnabled)
  const { off, dragProps } = useDragAnywhere('trial-card')
  const report = useMemo(() => (open ? trialReport() : null), [open, midi])   // eslint-disable-line react-hooks/exhaustive-deps
  if (!open || playing || !report) return null
  const close = () => setTrialCard(false)
  const doIt = () => {
    if (report.action === 'prepare') { if (!prepareFromPractice()) return }
    else { leavePractice(); useStore.getState().setMidiEditorOpen(true) }
  }
  const disabled = report.action === 'prepare' && !editorOn
  const btn: React.CSSProperties = {
    height: 26, padding: '0 12px', borderRadius: 4, cursor: disabled ? 'default' : 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11, fontWeight: 600,
    letterSpacing: '0.06em', textTransform: 'uppercase', background: disabled ? 'var(--bg-tile)' : 'var(--accent-amber-subtle)',
    border: `1px solid ${disabled ? 'var(--border2)' : 'var(--accent-amber-strong)'}`, color: disabled ? 'var(--text-dim)' : 'var(--text-amber)',
  }
  return (
    <div {...dragProps} className="app-no-drag orfeo-modal-glow" role="dialog" aria-label={t`Not a lesson yet`} style={{
      position: 'fixed', top: UNDER_HEADER + off.y, left: `calc(50% + ${off.x}px)`, transform: 'translateX(-50%)', zIndex: 950, cursor: 'grab',
      width: 'min(480px, calc(100vw - 32px))', boxSizing: 'border-box', padding: '12px 14px 12px 16px', borderRadius: 'var(--radius-md)',
      background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)', fontFamily: 'var(--font-ui)', color: 'var(--text-default)',
      '--_modal-shadow': 'var(--elevation-popover)',
    } as React.CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: AMBER }}>
          <GripHorizontal size={12} color="var(--text-muted)" />{t`Not a lesson yet`}
        </span>
        <button onClick={close} aria-label={t`Close`} style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={14} /></button>
      </div>
      <div style={{ display: 'grid', rowGap: 8, fontSize: 13, lineHeight: 1.45 }}>
        <p style={{ margin: 0 }}>{report.why}</p>
        <p style={{ margin: 0, color: 'var(--text-muted)' }}>{t`So for now it plays with both hands only, without the score, and your playing isn't kept for the practice log or your progress.`}</p>
        {report.found.length > 0 && (
          <div>
            <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 3 }}>{t`What Orfeo found`}</div>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', rowGap: 3, fontSize: 12 }}>
              {report.found.map((f, i) => <li key={i}>{f}</li>)}
            </ul>
          </div>
        )}
        <p style={{ margin: 0 }}>{report.todo}</p>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
        {report.action && (
          <button onClick={disabled ? undefined : doIt} disabled={disabled} style={btn}
            title={disabled ? t`Turn on MIDI Note Editor in Settings › Editing` : undefined}>
            {report.action === 'prepare' ? t`Prepare it` : t`Open the Lesson check`}
          </button>
        )}
        <button onClick={close} style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 11, color: 'var(--text-muted)', textDecoration: 'underline', textUnderlineOffset: 2 }}>
          {t`Keep trying it`}
        </button>
      </div>
    </div>
  )
}
