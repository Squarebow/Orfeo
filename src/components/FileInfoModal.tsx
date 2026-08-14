// ── File info — metadata table, change log, and version chain for a library
// file, opened via the Library's right-click context menu. Works on any
// file, not just the loaded one: reads it fresh over IPC rather than
// touching the app's loaded state. Artist/Song are the only editable fields
// (inline, staged locally); Save commits one real rename on disk.
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { X, ArrowLeftRight, ChevronDown, Save, FolderOpen } from 'lucide-react'
import { useStore } from '../store'
import OrfeoMark from './OrfeoMark'
import { MarqueeText } from './MarqueeText'
import { PENCIL_CURSOR } from '../utils/cursors'
import { parseMidiMetadata, buildRenamedFileName, formatKeyOrDash, type MidiFileMetadata } from '../utils/midiMetadata'
import { modalCloseButtonStyle, modalCloseButtonHoverColor, modalCloseButtonIdleColor } from '../utils/modalCloseButtonStyle'
import { useFocusTrap } from '../hooks/useFocusTrap'

interface FileLogEvent { type: string; timestamp: number; summary: string }
interface FileVersion { name: string; path: string; version: number; mtime: number }

// ── 'en-GB' pinned deliberately — this is Orfeo-internal bookkeeping, not
// user-facing content, and a system locale abbreviating "Aug" as "avg." (or
// similar) reads as broken here regardless of the user's actual language. ──
function formatLogDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}
function formatLogTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}
function formatLogTimestamp(ts: number): string {
  return `${formatLogDate(ts)}\n${formatLogTime(ts)}`
}

function base64ToBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

interface Props {
  filePath: string
  fileName: string
  onClose: () => void
  onRenamed: (oldPath: string, newPath: string, newName: string) => void
}

export default function FileInfoModal({ filePath, fileName, onClose, onRenamed }: Props) {
  const noteNaming   = useStore((s) => s.noteNaming)
  const accidentals  = useStore((s) => s.accidentals)

  const [currentPath, setCurrentPath] = useState(filePath)
  const [currentName, setCurrentName] = useState(fileName)
  const [meta, setMeta] = useState<MidiFileMetadata | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [artistDraft, setArtistDraft] = useState('')
  const [songDraft, setSongDraft] = useState('')
  // ── Double-click-to-edit — same pattern as track renaming in the Playback
  // Editor: a plain label until double-clicked, then an inline input; blur
  // or Enter commits into the draft, Escape discards the in-progress edit.
  const [editingArtist, setEditingArtist] = useState(false)
  const [artistEditValue, setArtistEditValue] = useState('')
  const [editingSong, setEditingSong] = useState(false)
  const [songEditValue, setSongEditValue] = useState('')
  const artistInputRef = useRef<HTMLInputElement>(null)
  const songInputRef = useRef<HTMLInputElement>(null)
  const [log, setLog] = useState<FileLogEvent[] | null>(null)
  const [versions, setVersions] = useState<FileVersion[] | null>(null)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const versionsRef = useRef<HTMLDivElement>(null)

  // ── Draggable — starts centered (backdrop flex-centers it); once dragged,
  // switches to an explicit fixed position that escapes that centering. ────
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const dragState = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  // ── Only rendered while a file-info target is set (see SettingsPanel) —
  // always active while this component exists. ─────────────────────────────
  useFocusTrap(panelRef, true)

  const startDrag = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('[data-no-drag]')) return
    e.preventDefault()
    const rect = panelRef.current?.getBoundingClientRect()
    const startPos = pos ?? { x: rect?.left ?? 0, y: rect?.top ?? 0 }
    if (!pos) setPos(startPos)
    dragState.current = { startX: e.clientX, startY: e.clientY, startPosX: startPos.x, startPosY: startPos.y }
  }

  const onDragMove = useCallback((e: MouseEvent) => {
    const ds = dragState.current
    if (!ds) return
    // y floor of 44, not 0 — keeps the top edge clear of the 40px
    // titleBarOverlay (electron/main.ts) where Windows draws its own window
    // controls on top of everything in the DOM.
    setPos({ x: ds.startPosX + (e.clientX - ds.startX), y: Math.max(44, ds.startPosY + (e.clientY - ds.startY)) })
  }, [])
  const onDragEnd = useCallback(() => { dragState.current = null }, [])

  useEffect(() => {
    window.addEventListener('mousemove', onDragMove)
    window.addEventListener('mouseup', onDragEnd)
    return () => {
      window.removeEventListener('mousemove', onDragMove)
      window.removeEventListener('mouseup', onDragEnd)
    }
  }, [onDragMove, onDragEnd])

  useEffect(() => {
    window.electronAPI.getFileLog(currentPath).then(setLog).catch(() => setLog([]))
    window.electronAPI.listFileVersions(currentPath).then(setVersions).catch(() => setVersions([]))
  }, [currentPath])

  useEffect(() => {
    let cancelled = false
    setMeta(null); setError(null)
    ;(async () => {
      try {
        const result = await window.electronAPI.loadMidiFromPath(currentPath)
        if (!result) throw new Error('Could not read file')
        const buffer = base64ToBuffer(result.base64)
        const parsed = parseMidiMetadata(buffer, currentName)
        if (!cancelled) {
          setMeta(parsed)
          setArtistDraft(parsed.artist ?? '')
          setSongDraft(parsed.song ?? '')
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Could not read file')
      }
    })()
    return () => { cancelled = true }
  }, [currentPath, currentName])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!versionsOpen) return
    const handler = (e: MouseEvent) => {
      if (versionsRef.current && !versionsRef.current.contains(e.target as Node)) setVersionsOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [versionsOpen])

  const dirty = !!meta && (artistDraft !== (meta.artist ?? '') || songDraft !== (meta.song ?? ''))
  const swapDrafts = () => { setArtistDraft(songDraft); setSongDraft(artistDraft) }

  const startEditArtist = () => { setArtistEditValue(artistDraft); setEditingArtist(true) }
  const commitArtist = () => { setArtistDraft(artistEditValue.trim()); setEditingArtist(false) }
  const cancelArtist = () => setEditingArtist(false)
  const startEditSong = () => { setSongEditValue(songDraft); setEditingSong(true) }
  const commitSong = () => { setSongDraft(songEditValue.trim()); setEditingSong(false) }
  const cancelSong = () => setEditingSong(false)

  useEffect(() => { if (editingArtist) artistInputRef.current?.select() }, [editingArtist])
  useEffect(() => { if (editingSong) songInputRef.current?.select() }, [editingSong])

  // ── Save — the only point that actually touches disk. Artist/Song are
  // staged in local state (and the swap icon just swaps those two staged
  // values) so a run of edits produces one real rename, not one per
  // keystroke or swap click. ─────────────────────────────────────────────
  const handleSaveRename = async () => {
    if (!dirty || saving) return
    const newName = buildRenamedFileName(currentName, artistDraft, songDraft)
    if (!newName) { setError('Song is required'); return }
    if (newName === currentName) return
    setSaving(true)
    try {
      const result = await window.electronAPI.renameLibraryFile(currentPath, newName)
      if (result.ok && result.newPath) {
        onRenamed(currentPath, result.newPath, newName)
        setCurrentPath(result.newPath)
        setCurrentName(newName)
      } else {
        setError(result.reason === 'exists' ? 'A file with that name already exists' : 'Rename failed')
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Switch the popup to view a different version — navigation only, never
  // loads the file into the app. Read-only per design: no delete here. ──────
  const openVersion = (v: FileVersion) => {
    setVersionsOpen(false)
    if (v.path === currentPath) return
    setCurrentPath(v.path)
    setCurrentName(v.name)
  }
  const currentVersion = versions?.find(v => v.path === currentPath)
  const currentVersionLabel = currentVersion ? (currentVersion.version === 0 ? 'Original' : `v${currentVersion.version}`) : null

  const rows: { label: string; value: string }[] = meta ? [
    { label: 'Key', value: formatKeyOrDash(meta.key, noteNaming, accidentals) },
    { label: 'BPM', value: String(meta.bpm) },
    { label: 'Time', value: meta.timeSignature },
    { label: 'Tracks', value: String(meta.trackCount) },
    { label: 'Copyright', value: meta.copyright ?? '—' },
  ] : []

  return createPortal(
    <div
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 99999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="File info"
        className="orfeo-modal-glow"
        style={{
          background: 'var(--bg-modal)', border: '1px solid var(--border2)',
          borderRadius: 'var(--radius-lg)', padding: '16px 18px', width: 360,
          '--_modal-shadow': 'var(--elevation-modal)',
          ...(pos ? { position: 'fixed', left: pos.x, top: pos.y } : {}),
        } as CSSProperties}
        onMouseDown={e => e.stopPropagation()}
      >
        <div onMouseDown={startDrag} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, cursor: 'grab' }}>
          <OrfeoMark height={14} />
          <span style={{
            flex: 1, minWidth: 0, fontFamily: "'JetBrains Mono', monospace", fontSize: 'var(--text-sm)',
            color: 'var(--text-amber)', letterSpacing: '0.08em', textTransform: 'uppercase',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }} title={currentName}>
            File info
          </span>
          <button
            data-no-drag onClick={onClose} title="Close"
            style={modalCloseButtonStyle}
            onMouseEnter={e => e.currentTarget.style.color = modalCloseButtonHoverColor}
            onMouseLeave={e => e.currentTarget.style.color = modalCloseButtonIdleColor}
          >
            <X size={14} />
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <MarqueeText name={currentName} spanStyle={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'JetBrains Mono' }} />
          {versions && versions.length > 1 && (
            <div ref={versionsRef} style={{ position: 'relative', flexShrink: 0 }}>
              <button
                onClick={() => setVersionsOpen(o => !o)}
                title="View a different saved version — navigates this popup only, doesn't load the file"
                style={{
                  display: 'flex', alignItems: 'center', gap: 3, padding: '3px 6px', borderRadius: 4,
                  border: `1px solid ${versionsOpen ? 'var(--accent-amber-strong)' : 'var(--border2)'}`,
                  background: versionsOpen ? 'var(--accent-amber-subtle)' : 'transparent',
                  color: 'var(--text-amber)', fontSize: 10, fontFamily: 'JetBrains Mono', cursor: 'pointer',
                }}
              >
                {currentVersionLabel ?? '—'} <ChevronDown size={10} style={{ transform: versionsOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
              </button>
              {versionsOpen && (
                <div style={{
                  position: 'absolute', top: '100%', right: 0, marginTop: 4, zIndex: 1,
                  background: 'var(--bg-modal-header)', border: '1px solid var(--border2)', borderRadius: 4,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)', minWidth: 90, overflow: 'hidden',
                }}>
                  {versions.map(v => (
                    <button
                      key={v.path}
                      onClick={() => openVersion(v)}
                      title={formatLogTimestamp(v.mtime)}
                      style={{
                        display: 'block', width: '100%', textAlign: 'left', padding: '5px 10px',
                        background: v.path === currentPath ? 'var(--accent-amber-subtle)' : 'transparent',
                        border: 'none', color: v.path === currentPath ? 'var(--text-amber)' : 'var(--text-default)',
                        fontSize: 10, fontFamily: 'JetBrains Mono', cursor: 'pointer',
                      }}
                      onMouseEnter={e => { if (v.path !== currentPath) e.currentTarget.style.background = 'var(--bg-tile)' }}
                      onMouseLeave={e => { if (v.path !== currentPath) e.currentTarget.style.background = 'transparent' }}
                    >
                      {v.version === 0 ? 'Original' : `v${v.version}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && (
          <div style={{ fontSize: 11, color: 'var(--status-error-banner-text)', marginBottom: 10 }}>{error}</div>
        )}

        {!meta && !error && (
          <div style={{ fontSize: 11, color: 'var(--text-inactive)', padding: '8px 0' }}>Reading file…</div>
        )}

        {meta && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* ── Artist/Song — double-click to edit, same interaction as track
                renaming in the Playback Editor. Staged in local state; a real
                file rename only happens on Save below, never per keystroke. ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', minHeight: 24, boxSizing: 'border-box' }}>
              <span style={{ width: 70, flexShrink: 0, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-amber-icon-dim)' }}>
                Artist
              </span>
              {editingArtist ? (
                <input
                  ref={artistInputRef}
                  value={artistEditValue}
                  onChange={e => setArtistEditValue(e.target.value)}
                  onBlur={commitArtist}
                  onKeyDown={e => { if (e.key === 'Enter') commitArtist(); if (e.key === 'Escape') cancelArtist() }}
                  style={{
                    flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', fontWeight: 500, fontFamily: 'Inter, sans-serif',
                    color: 'var(--text-active)', background: 'var(--bg-row)',
                    border: '1px solid var(--accent-amber-strong)', borderRadius: 3,
                    padding: '1px 5px', outline: 'none',
                  }}
                />
              ) : (
                <span
                  title="Double-click to rename"
                  onDoubleClick={startEditArtist}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-default)' }}
                  style={{
                    flex: 1, minWidth: 0, fontSize: 9, fontFamily: 'JetBrains Mono', color: 'var(--text-default)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    cursor: PENCIL_CURSOR, transition: 'color 0.12s',
                  }}
                >
                  {artistDraft || '—'}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', minHeight: 24, boxSizing: 'border-box', borderTop: '1px solid var(--border-row)' }}>
              <span style={{ width: 70, flexShrink: 0, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-amber-icon-dim)' }}>
                Song
              </span>
              {editingSong ? (
                <input
                  ref={songInputRef}
                  value={songEditValue}
                  onChange={e => setSongEditValue(e.target.value)}
                  onBlur={commitSong}
                  onKeyDown={e => { if (e.key === 'Enter') commitSong(); if (e.key === 'Escape') cancelSong() }}
                  style={{
                    flex: 1, minWidth: 0, fontSize: 'var(--text-sm)', fontWeight: 500, fontFamily: 'Inter, sans-serif',
                    color: 'var(--text-active)', background: 'var(--bg-row)',
                    border: '1px solid var(--accent-amber-strong)', borderRadius: 3,
                    padding: '1px 5px', outline: 'none',
                  }}
                />
              ) : (
                <span
                  title="Double-click to rename"
                  onDoubleClick={startEditSong}
                  onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)' }}
                  onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-default)' }}
                  style={{
                    flex: 1, minWidth: 0, fontSize: 9, fontFamily: 'JetBrains Mono', color: 'var(--text-default)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    cursor: PENCIL_CURSOR, transition: 'color 0.12s',
                  }}
                >
                  {songDraft || '—'}
                </span>
              )}
              <button
                onClick={swapDrafts}
                title="Swap Artist and Song"
                style={{
                  flexShrink: 0, background: 'none', border: '1px solid var(--border2)', borderRadius: 4,
                  padding: '3px 5px', display: 'flex', alignItems: 'center',
                  color: 'var(--text-dim-control)', cursor: 'pointer', transition: 'all 0.12s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--accent-amber-strong)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-dim-control)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
              >
                <ArrowLeftRight size={11} />
              </button>
            </div>

            {rows.map(row => (
              <div key={row.label} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', minHeight: 24, boxSizing: 'border-box',
                borderTop: '1px solid var(--border-row)',
              }}>
                <span style={{ width: 70, flexShrink: 0, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--accent-amber-icon-dim)' }}>
                  {row.label}
                </span>
                <span style={{
                  flex: 1, minWidth: 0, fontSize: 9, fontFamily: 'JetBrains Mono',
                  color: row.value === '—' ? 'var(--text-inactive)' : 'var(--text-default)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }} title={row.value}>
                  {row.value}
                </span>
              </div>
            ))}

            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button
                onClick={handleSaveRename}
                disabled={!dirty || saving}
                title={dirty ? 'Save — renames the file on disk' : 'No changes to save'}
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 'var(--radius-md)',
                  background: dirty ? 'var(--text-amber)' : 'var(--bg-tile)',
                  border: 'none', color: dirty ? 'var(--text-near-black)' : 'var(--text-inactive)',
                  fontSize: 'var(--text-sm)', fontWeight: 600, cursor: dirty && !saving ? 'pointer' : 'default',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <Save size={13} /> {saving ? 'Saving…' : 'Save changes'}
              </button>
              <button
                onClick={() => window.electronAPI.showItemInFolder(currentPath)}
                title="Opens Windows Explorer with this file highlighted"
                style={{
                  flex: 1, padding: '6px 0', borderRadius: 'var(--radius-md)',
                  background: 'transparent', border: '1px solid var(--border2)', color: 'var(--text-muted)',
                  fontSize: 'var(--text-sm)', fontWeight: 600, cursor: 'pointer', transition: 'all 0.12s',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
                onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--accent-amber-strong)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border2)' }}
              >
                <FolderOpen size={13} /> Show in folder
              </button>
            </div>
          </div>
        )}

        {/* ── Orfeo History — bookkeeping local to the app (saves, renames,
            moves). Persists in a sidecar JSON, not in the .mid file itself.
            Fixed height (~2 entries) so the popup's own height never grows
            with a longer history — extra entries scroll inside it instead. ── */}
        {meta && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border-row)', paddingTop: 10 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent-amber-icon-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
              Orfeo History
            </div>
            <div style={{ height: 52, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
              {log === null ? (
                <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: 'var(--text-inactive)' }}>Loading…</div>
              ) : log.length === 0 ? (
                <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: 'var(--text-inactive)' }}>No recorded changes yet.</div>
              ) : (
                [...log].reverse().map((ev, i) => (
                  <div key={i} style={{ display: 'flex', gap: 8, fontSize: 9, fontFamily: 'JetBrains Mono', flexShrink: 0 }}>
                    <span style={{ flexShrink: 0, color: 'var(--text-inactive)', whiteSpace: 'nowrap', display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                      <span>{formatLogDate(ev.timestamp)}</span>
                      <span>{formatLogTime(ev.timestamp)}</span>
                    </span>
                    <span style={{ color: 'var(--text-default)' }}>{ev.summary}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  )
}
