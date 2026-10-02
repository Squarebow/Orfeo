import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { useMenuDismiss } from '../ContextMenu'
import { useCurrentTempoTrust } from '../../hooks/useTempoTrustScan'
import { armTapSession, fmtSongTime } from '../../utils/tapTempoSession'
import type { TrustResult } from '../../utils/tempoTrust'

// ── Tempo warning (Settings → Playback & Editing → Tempo warnings) — a
// pulsing amber dot beside Key/Transpose when the open song's bar lines and
// metronome miss its steady beat (utils/tempoTrust.ts). Click → what's off,
// "Fix with Tap Tempo", or "It's fine, don't warn me for this song". ─────

export function warningText(r: TrustResult): string {
  const where = r.throughout ? t`through most of the song` : t`from ${fmtSongTime(r.from ?? 0)} onward`
  if (r.shifted) return t`The beat's speed looks right, but the bar lines and metronome clicks sit off the played notes ${where}.`
  const base = t`The bar lines and metronome drift off the music's beat ${where}.`
  return r.hintBpm ? base + ' ' + t`The beat sounds closer to about ${r.hintBpm} than the file's ${r.fileBpm} — check by ear.` : base + ' ' + t`Check by ear.`
}

export function TempoWarning() {
  useCurrentTempoTrust()
  const enabled = useStore((s) => s.tempoWarningsEnabled)
  const trust = useStore((s) => s.currentTrust)
  const key = useStore((s) => s.songKey)
  const dismissed = useStore((s) => (s.songKey ? !!s.tempoWarningDismissed[s.songKey] : false))
  const tapping = useStore((s) => !!s.tapSession)
  const [panel, setPanel] = useState<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setPanel(null), [])
  useMenuDismiss(!!panel, panelRef, close)

  if (!enabled || !trust?.flagged || dismissed || tapping || !key) return null

  const fix = () => {
    close()
    const s = useStore.getState()
    if (!s.tapTempoPadEnabled) s.setTapTempoPadEnabled(true)
    armTapSession()
  }
  const btn: React.CSSProperties = {
    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-default)', fontSize: 'var(--text-xs)', padding: '3px 8px', cursor: 'pointer',
  }
  const keepFocus = (e: React.MouseEvent) => e.preventDefault()

  return (
    <>
      <Tooltip title={t`Tempo looks off`} description={t`The bar lines don't match the music's beat. Click for details.`} placement="bottom" disabled={!!panel}>
        <button
          className="app-no-drag"
          aria-label={t`Tempo looks off`}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setPanel(panel ? null : { x: r.left + r.width / 2, y: r.bottom + 8 }) }}
          style={{ background: 'none', border: 'none', padding: 6, cursor: 'pointer', display: 'flex', flexShrink: 0 }}
        >
          <span className="orfeo-warn-pulse" style={{ width: 9, height: 9, borderRadius: '50%', background: 'var(--text-amber)' }} />
        </button>
      </Tooltip>
      {panel && createPortal(
        <div
          ref={panelRef}
          className="app-no-drag orfeo-modal-glow"
          role="dialog"
          aria-label={t`Tempo looks off`}
          style={{
            position: 'fixed', top: panel.y, left: panel.x, transform: 'translateX(-50%)', zIndex: 9400, width: 300,
            background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)', borderRadius: 'var(--radius-md)',
            padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 'var(--text-xs)', color: 'var(--text-default)',
          }}
        >
          <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-amber)' }}>{t`Tempo looks off`}</span>
          <span style={{ lineHeight: 1.45 }}>{warningText(trust)}</span>
          <span style={{ color: 'var(--text-faint)', fontSize: 10, lineHeight: 1.4 }}>{t`Tap Tempo fixes this: park the playhead where it goes wrong and tap along. Your MIDI file isn't changed.`}</span>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button onMouseDown={keepFocus} style={{ ...btn, borderColor: 'var(--accent-amber-strong)', color: 'var(--text-amber)' }} onClick={fix}>{t`Fix with Tap Tempo`}</button>
            <button onMouseDown={keepFocus} style={btn} onClick={() => { useStore.getState().dismissTempoWarning(key); close() }}>{t`It's fine, don't warn me for this song`}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ── Library row mark — same verdict, read from the background scan's cache ──
export function TempoWarningDot({ path }: { path: string }) {
  const show = useStore((s) => {
    if (!s.tempoWarningsEnabled) return false
    const key = s.libraryTrustIndex[path]?.songKey
    if (!key || s.tempoWarningDismissed[key]) return false
    return !!s.tempoTrustCache[key]?.flagged
  })
  if (!show) return null
  return (
    <Tooltip title={t`Tempo looks off`} description={t`Open it and use Tap Tempo to fix its bar lines and metronome.`} placement="right">
      <span aria-label={t`Tempo looks off`} style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-amber)', flexShrink: 0, display: 'inline-block' }} />
    </Tooltip>
  )
}
