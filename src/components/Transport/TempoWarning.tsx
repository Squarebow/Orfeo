import { useCallback, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { useMenuDismiss } from '../ContextMenu'
import { warningVisible } from '../../utils/tempoWarningRules'
import { armTapSession, fmtSongTime } from '../../utils/tapTempoSession'
import type { TrustResult } from '../../utils/tempoTrust'

// ── Tempo warning (Settings → Playback & Editing → Tempo warnings) — a
// pulsing amber dot (centred under the TAP pad when the pad is on, else on
// the Key/Transpose box's corner) when the open song's bar lines and
// metronome miss its steady beat (utils/tempoTrust.ts). Click → what's off,
// "Fix with Tap Tempo", or "It's fine, don't warn me for this song". ─────

export function warningText(r: TrustResult, tapped = false): string {
  const where = r.throughout ? t`through most of the song` : t`from ${fmtSongTime(r.from ?? 0)} onward`
  if (r.shifted) return t`The beat's speed looks right, but the bar lines and metronome clicks sit off the played notes ${where}.`
  const base = t`The bar lines and metronome drift off the music's beat ${where}.`
  if (!r.hintBpm) return base + ' ' + t`Check by ear.`
  return base + ' ' + (tapped
    ? t`The beat sounds closer to about ${r.hintBpm} than your tapped ${r.fileBpm} — check by ear.`
    : t`The beat sounds closer to about ${r.hintBpm} than the file's ${r.fileBpm} — check by ear.`)
}

export function TempoWarning({ anchor }: { anchor: 'pad' | 'key' }) {
  const padOn = useStore((s) => s.tapTempoPadEnabled)
  const trust = useStore((s) => s.currentTrust)
  const key = useStore((s) => s.songKey)
  const visible = useStore((s) => warningVisible(s, s.songKey))
  const tapping = useStore((s) => !!s.tapSession)
  const hasMidi = useStore((s) => !!s.midi)
  const noteEditorActive = useStore((s) => s.noteEditorActive)
  const [panel, setPanel] = useState<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  // the outside-click that closes the panel also lands on the light — don't
  // let that same click reopen it
  const closedAt = useRef(0)
  const close = useCallback(() => { closedAt.current = performance.now(); setPanel(null) }, [])
  useMenuDismiss(!!panel, panelRef, close)

  if ((anchor === 'pad') !== padOn) return null
  if (!visible || !hasMidi || !trust?.flagged || tapping || !key) return null

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
      {/* Absolutely positioned — no layout width (the left top-bar group has no
          spare room at 1366 px): centred under the TAP circle, or on the
          Key/Transpose box's corner when the pad is off */}
      <Tooltip title={t`Tempo looks off`} description={t`The bar lines don't match the music's beat. Click for details.`} placement="bottom" disabled={!!panel}
        wrapperStyle={anchor === 'pad'
          // the top-bar row clips ~6 px below the circle — a 7 px dot fits there
          ? { position: 'absolute', top: 'calc(100% - 1px)', left: '50%', transform: 'translateX(-50%)', zIndex: 1 }
          : { position: 'absolute', top: -4, right: 0, zIndex: 1 }}>
        <button
          className="app-no-drag"
          aria-label={t`Tempo looks off`}
          onClick={(e) => {
            if (panel || performance.now() - closedAt.current < 250) return
            const r = e.currentTarget.getBoundingClientRect()
            setPanel({ x: r.left + r.width / 2, y: r.bottom + 8 })
          }}
          style={{ background: 'none', border: 'none', padding: anchor === 'pad' ? '0 4px' : 4, cursor: 'pointer', display: 'flex' }}
        >
          <span className="orfeo-warn-pulse" style={{ width: anchor === 'pad' ? 7 : 9, height: anchor === 'pad' ? 7 : 9, borderRadius: '50%', background: 'var(--text-amber)' }} />
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
            <button onMouseDown={keepFocus} disabled={noteEditorActive} title={noteEditorActive ? t`Close the Note Editor first` : undefined}
              style={{ ...btn, borderColor: 'var(--accent-amber-strong)', color: 'var(--text-amber)', opacity: noteEditorActive ? 0.4 : 1, cursor: noteEditorActive ? 'default' : 'pointer' }} onClick={fix}>{t`Fix with Tap Tempo`}</button>
            <button onMouseDown={keepFocus} style={btn} onClick={() => { useStore.getState().dismissTempoWarning(key); close() }}>{t`It's fine, don't warn me for this song`}</button>
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}

// ── Library row mark — same verdict, read from the background scan's cache ──
export function TempoWarningDot({ path, onHoverChange }: { path: string; onHoverChange?: (hovering: boolean) => void }) {
  const show = useStore((s) => warningVisible(s, s.libraryTrustIndex[path]?.songKey))
  if (!show) return null
  return (
    <Tooltip title={t`Tempo looks off`} description={t`Open it and use Tap Tempo to fix its bar lines and metronome.`} placement="right">
      <span
        aria-label={t`Tempo looks off`}
        // hide the row's own "Right-click for options" tooltip while over the dot
        onMouseEnter={() => onHoverChange?.(true)}
        onMouseLeave={() => onHoverChange?.(false)}
        style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--text-amber)', flexShrink: 0, display: 'inline-block' }}
      />
    </Tooltip>
  )
}
