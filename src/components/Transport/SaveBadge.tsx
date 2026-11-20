import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { Save } from 'lucide-react'
import { useStore } from '../../store'
import Tooltip from '../Tooltip'
import { ContextMenu, ContextMenuDivider, useMenuDismiss } from '../ContextMenu'
import { t } from '../../utils/i18n'
import {
  collectUnsaved, saveAll, saveNotes, discardNotes, saveTempoKey, resetTempoKey, saveMixer, undoMixer,
  saveTrackFlags, undoTrackFlags, saveImportedFile, type UnsavedRow,
} from '../../utils/sessionSave'

// ── Save badge — right of the song's length, under the play controls ────────
// A small grey save icon with an amber count of how many kinds of change are
// unsaved (notes, tempo & key, Mixer, tracks…) and an amber EDITS
// label. Hover explains and lists them; a click opens the list with Save / Undo for each and Save
// all. It sits outside the centred column, so showing it moves nothing.
const MENU_W = 380

export function SaveBadge({ style }: { style?: CSSProperties } = {}) {
  const [rows, setRows] = useState<UnsavedRow[]>([])
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const sig = useRef('')

  // The Note Editor's edits live outside the store, so look a few times a second
  useEffect(() => {
    const look = () => {
      const next = collectUnsaved()
      const s = next.map(r => r.kind + r.detail).join('|')
      if (s !== sig.current) { sig.current = s; setRows(next) }
    }
    look()
    const id = setInterval(look, 400)
    return () => clearInterval(id)
  }, [])
  useEffect(() => { if (!rows.length) setMenu(null) }, [rows.length])

  if (!rows.length) return null
  const n = rows.length
  const amber = <span style={{ color: 'var(--text-amber)', fontWeight: 700 }}>{n}</span>
  const body = (
    <span style={{ display: 'flex', flexDirection: 'column', gap: 10, whiteSpace: 'normal' }}>
      <span>{n === 1 ? <>{t`You've made`} {amber} {t`change to this song.`}</> : <>{t`You've made`} {amber} {t`changes to this song.`}</>}</span>
      <span style={{ display: 'flex', flexDirection: 'column' }}>
        {rows.map(r => <span key={r.kind}><b style={{ color: 'var(--text-default)', fontWeight: 600 }}>{r.label}</b>: {r.detail}</span>)}
      </span>
      <i>{t`Keep working and save everything at once when you're done, or undo changes here.`}</i>
      <span>{t`Click to open saving options.`}</span>
    </span>
  )
  return (
    <>
      <Tooltip title={t`Unsaved changes`} body={body} placement="bottom" disabled={!!menu} wrapperStyle={{ flexShrink: 0, ...style }}>
        <button className="app-no-drag" aria-label={t`Unsaved changes: ${rows.length}`}
          onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenu(m => m ? null : { x: Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8)), y: r.bottom + 6 }) }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, height: 24, padding: '0 2px',
            background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)',
          }}>
          <span style={{ position: 'relative', display: 'flex' }}>
            <Save size={14} strokeWidth={1.75} />
            <span style={{
              position: 'absolute', top: -5, right: -6, minWidth: 10, height: 10, borderRadius: 5, padding: '0 2px', boxSizing: 'border-box',
              background: 'var(--text-amber)', color: 'var(--bg-tooltip)', fontSize: 7, fontWeight: 700,
              fontFamily: 'var(--font-mono)', lineHeight: '10px', textAlign: 'center',
            }}>{rows.length}</span>
          </span>
          <span style={{ fontSize: 9, fontFamily: 'var(--font-mono)', letterSpacing: '0.08em', lineHeight: 1, color: 'var(--text-amber)', marginLeft: 2, whiteSpace: 'nowrap' }}>{t`EDITS`}</span>
        </button>
      </Tooltip>
      {menu && <SaveMenu x={menu.x} y={menu.y} rows={rows} onClose={() => setMenu(null)} />}
    </>
  )
}

function SaveMenu({ x, y, rows, onClose }: { x: number; y: number; rows: UnsavedRow[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  useMenuDismiss(!busy, ref, onClose)
  const run = useCallback(async (fn: () => unknown) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }, [])

  const actions = (r: UnsavedRow): [string, () => unknown][] => {
    switch (r.kind) {
      case 'notes': return [[t`Save`, saveNotes], [t`Discard`, discardNotes]]
      case 'tempoKey': return [[t`Save`, saveTempoKey], [t`Reset`, resetTempoKey]]
      case 'mixer': return [[t`Save`, saveMixer], [t`Undo`, undoMixer], [t`Open`, () => { useStore.getState().setMixerOpen(true); onClose() }]]
      case 'tracks': return [[t`Save`, saveTrackFlags], [t`Undo`, undoTrackFlags]]
      case 'import': return [[t`Save as MIDI`, saveImportedFile]]
      default: return []
    }
  }
  const link = (label: string, fn: () => unknown) => (
    <button key={label} disabled={busy} onClick={() => run(fn)}
      style={{ background: 'none', border: 'none', padding: 0, cursor: busy ? 'default' : 'pointer', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', color: label === t`Save` || label === t`Save as MIDI` ? 'var(--text-amber)' : 'var(--text-muted)', opacity: busy ? 0.5 : 1 }}>
      {label}
    </button>
  )
  const savable = rows.some(r => r.kind !== 'playbackEditor')
  return (
    <ContextMenu ref={ref} x={x} y={y} minWidth={MENU_W} ariaLabel={t`Unsaved changes`} className="app-no-drag">
      <div style={{ width: MENU_W, boxSizing: 'border-box', padding: '6px 12px 4px' }}>
        <div style={{ fontSize: 9, color: 'var(--text-amber)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 6 }}>{t`Unsaved changes`}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', columnGap: 12, rowGap: 7, alignItems: 'baseline' }}>
          {rows.map(r => (
            <div key={r.kind} style={{ display: 'contents' }}>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-default)', fontWeight: 600, whiteSpace: 'nowrap' }}>{r.label}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', minWidth: 0 }}>{r.detail}</span>
              <span style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                {r.kind === 'playbackEditor'
                  ? <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-faint)', fontStyle: 'italic' }}>{t`Save it there`}</span>
                  : actions(r).map(([label, fn]) => link(label, fn))}
              </span>
            </div>
          ))}
        </div>
      </div>
      <ContextMenuDivider />
      <div style={{ width: MENU_W, boxSizing: 'border-box', padding: '2px 12px 8px', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) auto', columnGap: 12, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: 'var(--text-faint)', lineHeight: 1.4 }}>{t`Changes to the music make a new version, the rest saves into the same Orfeo copy; the original stays as it is.`}</span>
        <button disabled={busy || !savable} onClick={() => run(async () => { if (await saveAll()) onClose() })}
          style={{ padding: '5px 12px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent-amber-strong)', background: 'var(--accent-amber-subtle)', color: 'var(--text-amber)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)', cursor: busy || !savable ? 'default' : 'pointer', opacity: busy || !savable ? 0.5 : 1, whiteSpace: 'nowrap' }}>
          {busy ? t`Saving…` : t`Save all`}
        </button>
      </div>
    </ContextMenu>
  )
}
