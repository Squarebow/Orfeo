import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStore } from '../../store'
import { t } from '../../utils/i18n'
import Tooltip from '../Tooltip'
import { ContextMenu, ContextMenuItem } from '../ContextMenu'
import { confirmDialog } from '../../utils/confirmController'
import { useTapTempo } from '../../hooks/useTapTempo'
import {
  armTapSession, registerTap, finishTapping, shiftPreviewDownbeat,
  keepTap, tapAgain, cancelTap, resetSongTempo,
} from '../../utils/tapTempoSession'

// ── Tap Tempo pad — red round TAP button beside the BPM box (Settings →
// "Show Tap Tempo pad"). Click arms a session; while armed, every click on
// the pad (or Space / a MIDI key) is a tap — finishing is via Done or a 2 s
// pause, never a pad click. A small panel under the pad shows the tap count,
// then the fitted tempo with Keep / Tap again / Cancel and the ◀ 1 ▶
// downbeat nudge. Right-click → reset the song's correction. ──────────────
export function TapTempoPad() {
  useTapTempo()
  const enabled = useStore((s) => s.tapTempoPadEnabled)
  const midi = useStore((s) => s.midi)
  const noteEditorActive = useStore((s) => s.noteEditorActive)
  const ses = useStore((s) => s.tapSession)
  const hasCorrection = useStore((s) => !!s.songKey && !!s.tempoCorrections[s.songKey])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => {
    if (!menu) return
    const onDown = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenu(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null) }
    const id = setTimeout(() => {
      window.addEventListener('mousedown', onDown, true)
      window.addEventListener('keydown', onKey, true)
    }, 0)
    return () => {
      clearTimeout(id)
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('keydown', onKey, true)
    }
  }, [menu])

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
    else if (capturing) registerTap()
  }

  const onReset = async () => {
    setMenu(null)
    const choice = await confirmDialog({
      title: t`Reset tempo`,
      message: t`Go back to this song's own tempo and bar lines?`,
      detail: t`Your tapped tempo corrections for this song will be removed.`,
      buttons: [t`Reset`, t`Cancel`],
    })
    if (choice === 0) resetSongTempo()
  }

  const fittedBpm = ses?.segment ? (60 / ses.segment.period).toFixed(1) : null
  const btn: React.CSSProperties = {
    background: 'none', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    color: 'var(--text-default)', fontSize: 'var(--text-xs)', padding: '2px 8px', cursor: 'pointer',
  }

  return (
    <div ref={padWrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      <Tooltip
        title={t`Tap Tempo`}
        description={capturing
          ? t`Tap on the beat — click here, press Space, or hit any key on your MIDI keyboard. Your first tap is beat 1.`
          : t`Click, then tap along to fix this song's bar lines and metronome from the playhead onward. Right-click to reset.`}
        placement="bottom"
      >
        <button
          // re-keyed per tap so the pop replays for pad, Space and MIDI taps alike
          key={ses?.taps.length ?? 0}
          className={`app-no-drag${capturing && ses!.taps.length > 0 ? ' orfeo-tap-pulse' : ''}`}
          onMouseDown={onPadDown}
          onContextMenu={(e) => { e.preventDefault(); if (!disabled) setMenu({ x: e.clientX, y: e.clientY }) }}
          disabled={disabled}
          aria-label={t`Tap Tempo`}
          style={{
            width: 30, height: 30, borderRadius: '50%', border: 'none',
            background: 'var(--status-error)', color: '#fff',
            fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700, letterSpacing: '0.05em',
            cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.4 : 1,
            boxShadow: ses ? '0 0 0 2px var(--accent-amber-strong)' : 'none',
          }}
        >
          {capturing ? ses!.taps.length : t`TAP`}
        </button>
      </Tooltip>

      {ses && panelPos && createPortal(
        <div
          className="app-no-drag orfeo-modal-glow"
          style={{
            position: 'fixed', top: panelPos.y, left: panelPos.x, transform: 'translateX(-50%)',
            background: 'var(--bg-tooltip)', border: '1px solid var(--accent-amber-strong)', borderRadius: 'var(--radius-md)',
            padding: '8px 10px', zIndex: 9400, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'center',
            whiteSpace: 'nowrap', fontSize: 'var(--text-xs)', color: 'var(--text-default)',
          }}
        >
          {capturing ? (
            <>
              <span>{ses.message ?? (ses.taps.length === 0 ? t`Tap on the beat — first tap is beat 1` : t`Taps: ${ses.taps.length}`)}</span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={btn} onClick={finishTapping} disabled={ses.taps.length === 0}>{t`Done`}</button>
                <button style={btn} onClick={cancelTap}>{t`Cancel`}</button>
              </div>
            </>
          ) : (
            <>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text-amber)' }}>
                {fittedBpm} {t`bpm`} · {ses.segment?.beatsPerBar}/{ses.segment?.den}
              </span>
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <button style={btn} onClick={() => shiftPreviewDownbeat(-1)} aria-label={t`Move the 1 earlier`}>◀</button>
                <span style={{ fontFamily: 'var(--font-mono)' }}>1</span>
                <button style={btn} onClick={() => shiftPreviewDownbeat(1)} aria-label={t`Move the 1 later`}>▶</button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ ...btn, borderColor: 'var(--accent-amber-strong)', color: 'var(--text-amber)' }} onClick={keepTap}>{t`Keep`}</button>
                <button style={btn} onClick={tapAgain}>{t`Tap again`}</button>
                <button style={btn} onClick={cancelTap}>{t`Cancel`}</button>
              </div>
            </>
          )}
        </div>,
        document.body,
      )}

      {menu && (
        <ContextMenu ref={menuRef} x={menu.x} y={menu.y} ariaLabel={t`Tap Tempo menu`} className="app-no-drag">
          <ContextMenuItem onClick={onReset} disabled={!hasCorrection} danger>{t`Reset to the file's own tempo`}</ContextMenuItem>
        </ContextMenu>
      )}
    </div>
  )
}
