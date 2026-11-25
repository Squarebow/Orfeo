import { useState } from 'react'
import { ListMusic, X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import { libraryDisplayName } from '../../utils/libraryNames'
import { openQueueAt } from '../../utils/queueControl'
import { usePractice, prepareFromPractice, startTrial, trialHands } from '../../practice/practiceMode'
import { reasonText } from './PracticeButton'
import { AMBER, featLabel, UNDER_HEADER, useDragAnywhere } from './practiceBar'

// ── Practice mode with no song ready to practise open: pick one from the
// practice queue (also in the header's Playlist). Says why the open song can't
// be practised, when one is open. ─────────────────────────────────────────────
export default function PracticePickSong() {
  const songReady = usePractice(s => s.songReady)
  const notReady = usePractice(s => s.notReady)
  const paths = useStore(s => s.queue.paths)
  const index = useStore(s => s.queue.index)
  const songFirst = useStore(s => s.librarySongFirst)
  const open = useStore(s => s.midi?.fileName ?? null)
  const editorOn = useStore(s => s.noteEditorEnabled)
  // a song that isn't a lesson can still be tried as it is (its piano or keyboard part)
  const canTry = !!open && notReady !== null && notReady !== 'no-keyboard' && notReady !== 'off' && notReady !== 'editing' && !!trialHands()
  const { off, dragProps } = useDragAnywhere('pick-a-song')
  // closed with ×: away until another song opens (the Playlist in the header still picks one)
  const [closedFor, setClosedFor] = useState<string | null | undefined>(undefined)
  if (songReady || closedFor === open) return null
  return (
    <div {...dragProps} role="dialog" aria-label={t`Pick a song to practise`} className="orfeo-modal-glow app-no-drag" style={{
      position: 'fixed', top: UNDER_HEADER + 40 + off.y, left: `calc(50% + ${off.x}px)`, transform: 'translateX(-50%)', cursor: 'grab', zIndex: 950, width: 440,
      maxHeight: `calc(100vh - ${UNDER_HEADER + 200}px)`, overflowY: 'auto', boxSizing: 'border-box', padding: '14px 0 8px',
      background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)', borderRadius: 'var(--radius-md)',
      '--_modal-shadow': 'var(--elevation-popover)',
    } as React.CSSProperties}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 8px' }}>
        <ListMusic size={18} strokeWidth={1.6} color={AMBER} />
        <span style={featLabel}>{t`Pick a song to practise`}</span>
        <button onClick={() => setClosedFor(open)} aria-label={t`Close`} style={{ marginLeft: 'auto', background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}><X size={14} /></button>
      </div>
      {open && notReady && (
        <div style={{ padding: '0 16px 10px', fontSize: 12, lineHeight: 1.45, color: 'var(--text-muted)' }}>
          {t`${open.replace(/\.(mid|midi)$/i, '')} can't be practised yet.`} {notReady === 'prepare'
            ? t`The piano needs a track for each hand first: check the hands, then Split & Save, and you're back here.`
            : reasonText(notReady)}
          {(notReady === 'prepare' || canTry) && (
            <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {canTry && (
                <button onClick={() => { startTrial() }}
                  title={t`Play it now with Orfeo's guess at the hands: both hands, no score, nothing kept. Afterwards Orfeo says what makes it a lesson.`}
                  style={{
                    padding: '4px 12px', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    border: '1px solid var(--accent-amber-strong)', background: 'var(--accent-amber-subtle)', color: AMBER,
                  }}>{t`Try it as it is`}</button>
              )}
              {notReady === 'prepare' && <button disabled={!editorOn} onClick={() => { prepareFromPractice() }}
                title={editorOn ? undefined : t`Turn on MIDI Note Editor in Settings › Editing`}
                style={{
                  padding: '4px 12px', borderRadius: 'var(--radius-sm)', fontFamily: 'var(--font-ui)', fontSize: 12, fontWeight: 600,
                  cursor: editorOn ? 'pointer' : 'default', border: 'none',
                  background: editorOn ? AMBER : 'var(--bg-tile)', color: editorOn ? 'var(--text-near-black)' : 'var(--text-dim)',
                }}>{t`Prepare it now`}</button>}
            </div>
          )}
        </div>
      )}
      {paths.length === 0 && (
        <div style={{ padding: '0 16px 10px', fontSize: 13, color: 'var(--text-default)' }}>{reasonText('no-queue')}</div>
      )}
      {paths.map((path, i) => (
        <button key={path} onClick={() => void openQueueAt(i, false)}
          style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 16px', border: 'none', textAlign: 'left',
            background: 'none', cursor: 'pointer', fontFamily: 'var(--font-ui)', fontSize: 13,
            color: i === index ? AMBER : 'var(--text-default)',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-tile)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', minWidth: 18, textAlign: 'right' }}>{i + 1}</span>
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {libraryDisplayName(path.split(/[\\/]/).pop() ?? path, songFirst)}
          </span>
        </button>
      ))}
    </div>
  )
}
