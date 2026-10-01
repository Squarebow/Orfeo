import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { ContextMenu, ContextMenuItem, ContextMenuDivider, useMenuDismiss } from '../ContextMenu'
import { confirmDialog } from '../../utils/confirmController'
import { useTapTempo } from '../../hooks/useTapTempo'
import { describeCorrection } from '../../utils/tempoCorrection'
import {
  armTapSession, finishFromPad, shiftPreviewDownbeat, nudgePreview,
  keepTap, tapAgain, cancelTap, resetSongTempo, removeTappedTempo, fmtSongTime,
} from '../../utils/tapTempoSession'

const NUDGE_SEC = 0.01

// Panel buttons never take keyboard focus — a focused button would also be
// "clicked" by the next Space press (Space is the tap / listen-back key).
const keepFocus = (e: React.MouseEvent) => e.preventDefault()

// ── Tap Tempo pad — red round TAP button beside the BPM box (Settings →
// Playback & Editing → "Tap Tempo"). Click #1 starts a session from the
// playhead; taps come from Space or any MIDI key (never the mouse — the
// mouse is needed for everything else). Click #2 finishes: the song pauses
// and a panel shows the measured tempo, where the "1" sits, a fine-tune
// nudge, and Keep / Tap again / Cancel. A small amber dot on the pad means
// this song has saved tapped tempos; right-click lists them (each removable)
// and offers a full reset. ───────────────────────────────────────────────
export function TapTempoPad() {
  useTapTempo()
  const enabled = useStore((s) => s.tapTempoPadEnabled)
  const mode = useStore((s) => s.tapTempoMode)
  const midi = useStore((s) => s.midi)
  const noteEditorActive = useStore((s) => s.noteEditorActive)
  const ses = useStore((s) => s.tapSession)
  const correction = useStore((s) => (s.songKey ? s.tempoCorrections[s.songKey] : undefined))
  const saved = describeCorrection(correction)
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const closeMenu = useCallback(() => setMenu(null), [])
  const padWrapRef = useRef<HTMLDivElement>(null)
  // Panel is portalled to <body> with fixed coords — TopBar clips anything
  // that hangs below it, so an absolutely-positioned child was cut off.
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null)
  const sessionOpen = !!ses
  useLayoutEffect(() => {
    if (!sessionOpen) { setPanelPos(null); return }
    const place = () => {
      const r = padWrapRef.current?.getBoundingClientRect()
      if (r) setPanelPos({ x: r.left + r.width / 2, y: r.bottom + 6 })
    }
    place()
    window.addEventListener('resize', place)
    return () => window.removeEventListener('resize', place)
  }, [sessionOpen])

  useMenuDismiss(!!menu, menuRef, closeMenu)

  // A session must never outlive its pad (Settings toggle off, Note Editor
  // opened) — Space/MIDI keys would stay captured with no panel on screen
  const padUsable = enabled && !!midi && !noteEditorActive
  useEffect(() => { if (!padUsable && sessionOpen) cancelTap() }, [padUsable, sessionOpen])

  if (!enabled) return null
  const disabled = !midi || noteEditorActive
  const capturing = !!ses && ses.phase !== 'preview'

  const onPadDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || disabled) return
    e.preventDefault()
    if (!ses) armTapSession()
    else if (capturing) finishFromPad()
  }

  const onReset = async () => {
    setMenu(null)
    const choice = await confirmDialog({
      title: t`Reset tempo`,
      message: t`Go back to this song's own tempo and bar lines?`,
      detail: t`All tapped tempos saved for this song will be removed.`,
      buttons: [t`Reset`, t`Cancel`],
    })
    if (choice === 0) resetSongTempo()
  }

  const seg = ses?.segment ?? null
  const fittedBpm = seg ? (60 / seg.period).toFixed(1) : null
  const btn: React.CSSProperties = {
    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-default)', fontSize: 'var(--text-xs)', padding: '2px 8px', cursor: 'pointer',
  }
  const rowLabel: React.CSSProperties = { color: 'var(--text-muted)', fontSize: 10, minWidth: 84 }
  const hint: React.CSSProperties = { color: 'var(--text-faint)', fontSize: 10, whiteSpace: 'normal', textAlign: 'center', maxWidth: 260, lineHeight: 1.4 }

  const savedText = saved.length
    ? t`Saved for this song: ` + saved.map(x => `${x.bpm.toFixed(1)} bpm from ${fmtSongTime(x.start)}`).join(', ') + '. ' + t`Right-click to view or remove.`
    : ''

  const pad = (
    <button
      // re-keyed per tap so the pop replays on every Space / MIDI tap
      key={ses?.taps.length ?? 0}
      className={`app-no-drag${capturing && ses!.taps.length > 0 ? ' orfeo-tap-pulse' : ''}`}
      onMouseDown={onPadDown}
      onContextMenu={(e) => { e.preventDefault(); if (!disabled && !ses) setMenu({ x: e.clientX, y: e.clientY }) }}
      disabled={disabled}
      aria-label={t`Tap Tempo`}
      style={{
        position: 'relative',
        width: 30, height: 30, borderRadius: '50%', border: 'none',
        background: 'var(--status-error)', color: '#fff',
        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
        cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
        boxShadow: ses ? '0 0 0 2px var(--accent-amber-strong)' : 'none',
      }}
    >
      {capturing ? ses!.taps.length : t`TAP`}
      {saved.length > 0 && !ses && (
        <span aria-hidden style={{
          position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderRadius: '50%',
          background: 'var(--text-amber)', border: '1px solid var(--bg-tooltip)',
        }} />
      )}
    </button>
  )

  return (
    <div ref={padWrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* No tooltip while a session is open — it would cover the panel */}
      {ses ? pad : (
        <Tooltip
          title={t`Tap Tempo`}
          description={(savedText ? savedText + ' ' : '') + (mode === 'bar'
            ? t`Fix this song's bar lines and metronome: click, then tap Space or any MIDI key once per bar, on the 1. Click again when done.`
            : t`Fix this song's bar lines and metronome: click, then tap Space or any MIDI key on every beat. Click again when done.`)}
          placement="bottom"
        >
          {pad}
        </Tooltip>
      )}

      {ses && panelPos && createPortal(
        <div
          className="app-no-drag orfeo-modal-glow"
          style={{
            position: 'fixed', top: panelPos.y, left: panelPos.x, transform: 'translateX(-50%)',
            background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)', borderRadius: 'var(--radius-md)',
            padding: '10px 12px', zIndex: 9400, display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center',
            whiteSpace: 'nowrap', fontSize: 'var(--text-xs)', color: 'var(--text-default)',
          }}
        >
          {capturing ? (
            <>
              <span style={{ fontWeight: 600 }}>
                {mode === 'bar' ? t`Tap once per bar, on the 1` : t`Tap on every beat — 1, 2, 3, 4`}
              </span>
              <span style={hint}>
                {t`Space or any MIDI key. Start on a 1, whenever you're ready.`}
              </span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>
                {ses.message ?? t`Taps: ${ses.taps.length}`}
              </span>
              <span style={hint}>{t`Click TAP again when you're done · Esc cancels`}</span>
            </>
          ) : seg && (
            <>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-amber)' }}>
                {fittedBpm} {t`bpm`} · {seg.beatsPerBar}/{seg.den}
              </span>
              <span style={hint}>{t`From ${fmtSongTime(seg.start)} onward. Press Space to listen with the metronome.`}</span>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={rowLabel}>{t`Bar lines`}</span>
                <button onMouseDown={keepFocus} style={btn} onClick={() => shiftPreviewDownbeat(-1)}>{t`◀ 1 beat earlier`}</button>
                <button onMouseDown={keepFocus} style={btn} onClick={() => shiftPreviewDownbeat(1)}>{t`1 beat later ▶`}</button>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={rowLabel}>{t`Clicks`}</span>
                <button onMouseDown={keepFocus} style={btn} onClick={() => nudgePreview(-NUDGE_SEC)}>{t`◀ 10 ms earlier`}</button>
                <button onMouseDown={keepFocus} style={btn} onClick={() => nudgePreview(NUDGE_SEC)}>{t`10 ms later ▶`}</button>
              </div>
              <span style={hint}>{t`Bar lines: use if the 1 landed on the wrong beat. Clicks: use if the metronome is slightly ahead of or behind the music.`}</span>

              <div style={{ display: 'flex', gap: 6 }}>
                <button onMouseDown={keepFocus} style={{ ...btn, borderColor: 'var(--accent-amber-strong)', color: 'var(--text-amber)' }} onClick={keepTap}>{t`Keep for this song`}</button>
                <button onMouseDown={keepFocus} style={btn} onClick={tapAgain}>{t`Tap again`}</button>
                <button onMouseDown={keepFocus} style={btn} onClick={cancelTap}>{t`Cancel`}</button>
              </div>
              <span style={hint}>{t`Kept tempos are remembered by Orfeo every time you open this song. Your MIDI file isn't changed.`}</span>
            </>
          )}
        </div>,
        document.body,
      )}

      {menu && (
        <ContextMenu ref={menuRef} x={menu.x} y={menu.y} minWidth={240} ariaLabel={t`Tap Tempo menu`} className="app-no-drag">
          <div style={{ padding: '6px 14px 4px', fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {saved.length ? t`Tapped tempos for this song` : t`No tapped tempos for this song`}
          </div>
          {saved.map((x, i) => (
            <ContextMenuItem key={i} onClick={() => { removeTappedTempo(i); if (saved.length <= 1) setMenu(null) }} title={t`Remove this tapped tempo`}>
              <span style={{ fontFamily: 'var(--font-mono)', flex: 1 }}>{x.bpm.toFixed(1)} {t`bpm from`} {fmtSongTime(x.start)}</span>
              <X size={11} />
            </ContextMenuItem>
          ))}
          <ContextMenuDivider />
          <ContextMenuItem onClick={onReset} disabled={saved.length === 0} danger>{t`Reset to the file's own tempo`}</ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  )
}
