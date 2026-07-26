import { useEffect, useState, useReducer, useRef, useCallback } from 'react'
import { useStore } from '../../store'
import { NES } from '../../utils/noteEditorState'
import { editableCopyToBuffer } from '../../utils/noteEditorCommands'
import { parseMidiBuffer } from '../../utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from '../../utils/keyDetection'

// ── Toolbar SVG icons ─────────────────────────────────────────────────────────
const IconSnap = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
    <rect x="1.5" y="2" width="2" height="9" rx="1" />
    <rect x="5.5" y="4" width="2" height="5" rx="1" />
    <rect x="9.5" y="2" width="2" height="9" rx="1" />
  </svg>
)

const IconSavePlus = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-amber, #e8a027)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12.5 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h10.2a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V12" />
    <path d="M16 13H8a1 1 0 0 0-1 1v7" />
    <path d="M19 22v-6" />
    <path d="M22 19h-6" />
    <path d="M7 3v4a1 1 0 0 0 1 1h7" />
  </svg>
)

const IconReset = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m10 10-6.157 6.162a2 2 0 0 0-.5.833l-1.322 4.36a.5.5 0 0 0 .622.624l4.358-1.323a2 2 0 0 0 .83-.5L14 13.982"/>
    <path d="m12.829 7.172 4.359-4.346a1 1 0 1 1 3.986 3.986l-4.353 4.353"/>
    <path d="m15 5 4 4"/>
    <path d="m2 2 20 20"/>
  </svg>
)

const IconVelocity = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>
)

const IconInfo = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10"/>
    <path d="M12 16v-4"/>
    <path d="M12 8h.01"/>
  </svg>
)

const QUANT_LABELS: Record<number, string> = { 4: '1/4', 8: '1/8', 16: '1/16', 32: '1/32' }

// ── Compute the next versioned _ORFEO save path from the current source path ──
function computeSavePath(sourcePath: string): string {
  const norm = sourcePath.replace(/\\/g, '/')
  const slash = norm.lastIndexOf('/')
  const dir   = norm.substring(0, slash + 1)
  const base  = norm.substring(slash + 1).replace(/\.midi?$/i, '')
  const stripped = base.replace(/_ORFEO(_V\d+)?$/i, '')
  const vMatch   = base.match(/_ORFEO_V(\d+)$/i)
  const isOrfeo  = /_ORFEO$/i.test(base)
  const suffix   = vMatch ? `_ORFEO_V${parseInt(vMatch[1]) + 1}` : isOrfeo ? '_ORFEO_V2' : '_ORFEO'
  const outDir   = dir.endsWith('/Orfeo/') ? dir : `${dir}Orfeo/`
  return `${outDir}${stripped}${suffix}.mid`
}

// ── NoteEditorToolbar ─────────────────────────────────────────────────────────
// Floating draggable toolbar — appears when noteEditorActive is true.
// Reads/writes NES.* directly; subscribes to NES.onHistoryChange for re-renders.
export default function NoteEditorToolbar() {
  const noteEditorActive        = useStore(s => s.noteEditorActive)
  const setNoteEditorActive     = useStore(s => s.setNoteEditorActive)
  const noteEditorEnabled       = useStore(s => s.noteEditorEnabled)
  const noteEditorToolbarX      = useStore(s => s.noteEditorToolbarX)
  const noteEditorToolbarY      = useStore(s => s.noteEditorToolbarY)
  const setNoteEditorToolbarPos = useStore(s => s.setNoteEditorToolbarPos)
  const unsoloTrackForEdit      = useStore(s => s.unsoloTrackForEdit)

  // ── Force re-render on history changes (push/undo/redo) ───────────────────
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // ── Local display state ───────────────────────────────────────────────────
  const [hintText,        setHintText]      = useState(NES.hoverHint)
  const [snapEnabled,     setSnapDisplay]   = useState(NES.snapRef.current)
  const [quantize,        setQuantizeDisplay] = useState(NES.quantizeDivisorRef.current)
  const [showNoteNames,   setNoteNamesDisplay] = useState(NES.showNoteNamesRef.current)
  const [quantizeOpen,    setQuantizeOpen]  = useState(false)
  const [quantizePos,     setQuantizePos]   = useState({ top: 0, left: 0 })
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  const quantizeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    NES.onHistoryChange = () => forceUpdate()
    return () => { if (NES.onHistoryChange === forceUpdate as unknown as (() => void)) NES.onHistoryChange = null }
  }, [])

  // ── Subscribe to hover hint changes from PianoRoll ───────────────────────
  useEffect(() => {
    const handler = () => setHintText(NES.hoverHint)
    NES.onHintChange = handler
    return () => { if (NES.onHintChange === handler) NES.onHintChange = null }
  }, [])

  // ── Force-exit edit mode when noteEditorEnabled is toggled off ────────────
  useEffect(() => {
    if (!noteEditorEnabled && noteEditorActive) {
      setNoteEditorActive(false)
      NES.reset()
    }
  }, [noteEditorEnabled, noteEditorActive, setNoteEditorActive])

  // ── Save handler — shown as a button in the toolbar, also registered on NES ──
  // Returns true on successful save, false if cancelled or failed.
  const handleSave = useCallback(async (): Promise<boolean> => {
    const sourcePath = (useStore.getState().midi as any)?._filePath as string | undefined
    if (!sourcePath || !NES.editMidi) return false

    const defaultPath = computeSavePath(sourcePath)
    const outputPath  = await window.electronAPI.saveFileDialog({
      defaultPath,
      filters: [{ name: 'MIDI Files', extensions: ['mid', 'midi'] }],
    })
    if (!outputPath) return false

    const buf    = editableCopyToBuffer(NES.editMidi)
    const bytes  = new Uint8Array(buf)
    let binary   = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const base64 = btoa(binary)

    const result = await window.electronAPI.saveNoteEditor({ outputPath, base64 })
    if (!result.ok) return false

    NES.dirty = false
    NES.onHistoryChange?.()

    if (result.base64 && result.fileName && result.filePath) {
      const b   = atob(result.base64)
      const arr = new Uint8Array(b.length)
      for (let i = 0; i < b.length; i++) arr[i] = b.charCodeAt(i)
      const parsed = parseMidiBuffer(arr.buffer, result.fileName, result.filePath)
      useStore.getState().setMidi(parsed)
      const raw = parsed as any
      if (raw._keySignature != null) {
        useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
      } else {
        useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
      }
    }
    return true
  }, [])

  // ── Register save handler on NES so SettingsPanel and app-close can call it ──
  useEffect(() => {
    NES.onSaveRequest = handleSave
    return () => { if (NES.onSaveRequest === handleSave) NES.onSaveRequest = null }
  }, [handleSave])

  // ── Close handler — defined before early return (it's a useCallback/hook) ─
  const doClose = useCallback(async () => {
    if (NES.dirty) {
      setShowCloseConfirm(true)
      return
    }
    unsoloTrackForEdit()
    setNoteEditorActive(false)
    NES.reset()
  }, [setNoteEditorActive, unsoloTrackForEdit])

  const doConfirmSaveAndClose = useCallback(async () => {
    setShowCloseConfirm(false)
    const saved = await handleSave()
    if (!saved) return   // user cancelled save dialog — stay in editor
    unsoloTrackForEdit()
    setNoteEditorActive(false)
    NES.reset()
  }, [handleSave, setNoteEditorActive, unsoloTrackForEdit])

  const doConfirmDiscardAndClose = useCallback(() => {
    setShowCloseConfirm(false)
    unsoloTrackForEdit()
    setNoteEditorActive(false)
    NES.reset()
  }, [setNoteEditorActive, unsoloTrackForEdit])

  // ── Drag state ────────────────────────────────────────────────────────────
  const [pos, setPos]   = useState({ x: noteEditorToolbarX, y: noteEditorToolbarY })
  const posRef          = useRef({ x: noteEditorToolbarX, y: noteEditorToolbarY })
  const panelRef        = useRef<HTMLDivElement>(null)
  const dragState       = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)

  const onMouseMove = useCallback((e: MouseEvent) => {
    const ds = dragState.current
    if (!ds) return
    const panelW = panelRef.current?.offsetWidth ?? 400
    const panelH = panelRef.current?.offsetHeight ?? 44
    const next = {
      x: Math.max(0, Math.min(window.innerWidth - panelW, ds.startPosX + (e.clientX - ds.startX))),
      y: Math.max(0, Math.min(window.innerHeight - panelH, ds.startPosY + (e.clientY - ds.startY))),
    }
    posRef.current = next
    setPos(next)
  }, [])
  const onMouseUp = useCallback(() => {
    if (dragState.current) {
      dragState.current = null
      setNoteEditorToolbarPos(posRef.current.x, posRef.current.y)
    }
  }, [setNoteEditorToolbarPos])

  useEffect(() => {
    window.addEventListener('mousemove', onMouseMove)
    window.addEventListener('mouseup',   onMouseUp)
    return () => {
      window.removeEventListener('mousemove', onMouseMove)
      window.removeEventListener('mouseup',   onMouseUp)
    }
  }, [onMouseMove, onMouseUp])

  // ── Close quantize dropdown on outside click ──────────────────────────────
  useEffect(() => {
    if (!quantizeOpen) return
    const handle = (e: MouseEvent) => {
      if (quantizeBtnRef.current && !quantizeBtnRef.current.contains(e.target as Node)) {
        setQuantizeOpen(false)
      }
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [quantizeOpen])

  if (!noteEditorActive) return null

  // ── Setters — update NES ref AND local display state ──────────────────────
  const setSnap = (v: boolean) => {
    NES.snapRef.current = v
    setSnapDisplay(v)
  }
  const setQuantize = (d: typeof NES.quantizeDivisorRef.current) => {
    NES.quantizeDivisorRef.current = d
    setQuantizeDisplay(d)
    setQuantizeOpen(false)
  }
  const toggleNoteNames = () => {
    const next = !NES.showNoteNamesRef.current
    NES.showNoteNamesRef.current = next
    setNoteNamesDisplay(next)
  }
  const doUndo = () => {
    if (NES.history.undo()) { NES.needsFlatRebuild = true; NES.onHistoryChange?.() }
  }
  const doRedo = () => {
    if (NES.history.redo()) { NES.needsFlatRebuild = true; NES.onHistoryChange?.() }
  }
  const doReset = () => {
    if (NES.dirty && !window.confirm('Discard all edits and reset to original?')) return
    NES.onResetRequest?.()
  }
  const openQuantize = () => {
    if (quantizeBtnRef.current) {
      const r = quantizeBtnRef.current.getBoundingClientRect()
      setQuantizePos({ top: r.bottom + 4, left: r.left })
    }
    setQuantizeOpen(v => !v)
  }

  const canUndo = NES.history.canUndo
  const canRedo = NES.history.canRedo
  const dirty   = NES.dirty

  return (
    <div
      ref={panelRef}
      className="orfeo-modal-glow"
      style={{
        position: 'fixed',
        left: pos.x, top: pos.y,
        zIndex: 9700,
        background: 'var(--panel, #1e1e1e)',
        border: '1px solid #3a3a4c',
        borderRadius: 'var(--radius-md, 5px)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        cursor: 'default',
        minWidth: 0,
      }}
    >
      {/* ── Icon row ─────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', height: 38, padding: '0 6px', gap: 3 }}>

        {/* ── Drag handle ────────────────────────────────────────────────── */}
        <div
          onMouseDown={e => {
            e.preventDefault()
            dragState.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y }
          }}
          title="Drag to move"
          style={{
            width: 16, height: 28,
            display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3,
            cursor: 'grab', flexShrink: 0, padding: '0 2px',
          }}
        >
          {[0,1,2].map(i => (
            <div key={i} style={{ width: 12, height: 2, borderRadius: 1, background: '#404055' }} />
          ))}
        </div>

        {/* ── Edit label ─────────────────────────────────────────────────── */}
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
          color: 'var(--text-amber, #e8a027)', textTransform: 'uppercase',
          paddingRight: 4, flexShrink: 0,
        }}>
          EDIT{dirty ? ' ●' : ''}
        </span>

        <VSep />

        {/* ── Snap toggle ────────────────────────────────────────────────── */}
        <button
          onClick={() => setSnap(!snapEnabled)}
          title={snapEnabled ? 'Snap: ON — click to disable' : 'Snap: OFF — click to enable'}
          style={{
            ...btnBase,
            gap: 4, paddingLeft: 7, paddingRight: 7,
            color:       snapEnabled ? 'var(--text-amber, #e8a027)' : 'var(--text-muted, #94979e)',
            borderColor: snapEnabled ? 'rgba(232,160,39,0.35)'      : '#2e2e3c',
          }}
        >
          <IconSnap />
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.06em' }}>SNAP</span>
        </button>

        {/* ── Quantize dropdown ──────────────────────────────────────────── */}
        <div style={{ position: 'relative' }}>
          <button
            ref={quantizeBtnRef}
            onClick={openQuantize}
            title="Quantize grid"
            style={{ ...btnBase, minWidth: 44, fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}
          >
            {QUANT_LABELS[quantize]} ▾
          </button>
          {quantizeOpen && (
            <div
              onMouseDown={e => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: quantizePos.top, left: quantizePos.left,
                zIndex: 50001,
                background: '#1e1e1e', border: '1px solid #3a3a4c',
                borderRadius: 4, overflow: 'hidden', minWidth: 64,
                boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
              }}
            >
              {([4, 8, 16, 32] as const).map(d => (
                <div
                  key={d}
                  onClick={() => setQuantize(d)}
                  style={{
                    padding: '6px 14px', cursor: 'pointer', fontSize: 12,
                    fontFamily: "'JetBrains Mono', monospace",
                    color:      d === quantize ? 'var(--text-amber, #e8a027)' : 'var(--text-default, #c6c8c8)',
                    background: d === quantize ? 'rgba(232,160,39,0.08)' : 'transparent',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.05)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = d === quantize ? 'rgba(232,160,39,0.08)' : 'transparent' }}
                >
                  1/{d}
                </div>
              ))}
            </div>
          )}
        </div>

        <VSep />

        {/* ── Undo / Redo / Reset ────────────────────────────────────────── */}
        <button onClick={doUndo} disabled={!canUndo} title="Undo (Ctrl+Z)" style={iconBtnStyle(!canUndo)}>↺</button>
        <button onClick={doRedo} disabled={!canRedo} title="Redo (Ctrl+Y)" style={iconBtnStyle(!canRedo)}>↻</button>
        <button
          onClick={doReset}
          title="Reset — discard all edits and restore original"
          style={iconBtnStyle(false)}
        >
          <IconReset />
        </button>

        <VSep />

        {/* ── Note names toggle ──────────────────────────────────────────── */}
        <ToolBtn active={showNoteNames} onClick={toggleNoteNames} title="Show note names on notes" wide>
          <span style={{ fontSize: 10, fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, letterSpacing: '0.03em' }}>
            Note names
          </span>
        </ToolBtn>

        <VSep />

        {/* ── Velocity placeholder (coming soon) ─────────────────────────── */}
        <button
          disabled
          title="Velocity editing (coming soon)"
          style={{ ...iconBtnStyle(true), opacity: 0.3, cursor: 'default', pointerEvents: 'none' }}
        >
          <IconVelocity />
        </button>

        {/* ── Save ───────────────────────────────────────────────────────── */}
        <ToolBtn active={false} onClick={() => void handleSave()} title="Save note edits as new MIDI file (_ORFEO versioned copy)">
          <IconSavePlus />
        </ToolBtn>

        <VSep />

        {/* ── Info placeholder (coming soon) ─────────────────────────────── */}
        <button
          disabled
          title="Help (coming soon)"
          style={{ ...iconBtnStyle(true), opacity: 0.2, cursor: 'default', pointerEvents: 'none' }}
        >
          <IconInfo />
        </button>

        {/* ── Close ──────────────────────────────────────────────────────── */}
        <button
          onClick={() => void doClose()}
          title="Exit edit mode"
          style={{ ...btnBase, paddingLeft: 10, paddingRight: 10, color: 'var(--text-muted, #94979e)' }}
          onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber, #e8a027)' }}
          onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted, #94979e)' }}
        >
          ✕
        </button>
      </div>

      {/* ── Unsaved-changes close confirmation strip ──────────────────────── */}
      {showCloseConfirm && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 10px',
          borderTop: '1px solid #2e2e3c',
          background: 'rgba(232,160,39,0.06)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted, #94979e)', flexShrink: 0 }}>
            Unsaved changes —
          </span>
          <button
            onClick={() => void doConfirmSaveAndClose()}
            style={{ ...btnBase, borderColor: 'rgba(232,160,39,0.45)', color: 'var(--text-amber, #e8a027)', background: 'rgba(232,160,39,0.07)', fontSize: 11 }}
          >
            Save & Exit
          </button>
          <button
            onClick={doConfirmDiscardAndClose}
            style={{ ...btnBase, borderColor: 'rgba(192,57,43,0.4)', color: '#c0392b', fontSize: 11 }}
          >
            Discard
          </button>
          <button
            onClick={() => setShowCloseConfirm(false)}
            style={{ ...btnBase, fontSize: 11 }}
          >
            Cancel
          </button>
        </div>
      )}

      {/* ── Hint line ────────────────────────────────────────────────────── */}
      {hintText && (
        <div style={{
          fontSize: 'var(--text-xs, 0.6875rem)',
          color: 'var(--text-muted, #94979e)',
          fontStyle: 'italic',
          padding: '2px 24px 4px',
          borderTop: '1px solid #2e2e3c',
          whiteSpace: 'nowrap',
        }}>
          {hintText}
        </div>
      )}
    </div>
  )
}

// ── Shared style atoms ────────────────────────────────────────────────────────
const btnBase: React.CSSProperties = {
  height: 26, padding: '0 8px', fontSize: 11,
  fontFamily: "'Inter', system-ui, sans-serif",
  background: 'transparent', border: '1px solid #2e2e3c',
  borderRadius: 'var(--radius-sm, 3px)',
  color: 'var(--text-default, #c6c8c8)',
  cursor: 'pointer', display: 'flex', alignItems: 'center',
  transition: 'border-color 0.1s, color 0.1s', flexShrink: 0,
}

function iconBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 26, padding: 0, fontSize: 16, lineHeight: 1,
    fontFamily: 'system-ui, sans-serif',
    background: 'transparent', border: '1px solid #2e2e3c',
    borderRadius: 'var(--radius-sm, 3px)',
    color:   disabled ? '#666688' : 'var(--text-default, #c6c8c8)',
    cursor:  disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.65 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }
}

function ToolBtn({ active, onClick, title, children, wide }: {
  active: boolean; onClick: () => void; title: string; children: React.ReactNode; wide?: boolean
}) {
  return (
    <button
      onClick={onClick} title={title}
      style={{
        ...btnBase,
        width: wide ? 'auto' : 28, padding: wide ? '0 8px' : 0, justifyContent: 'center',
        color:       active ? 'var(--text-amber, #e8a027)' : 'var(--text-muted, #94979e)',
        borderColor: active ? 'rgba(232,160,39,0.45)'      : '#2e2e3c',
        background:  active ? 'rgba(232,160,39,0.07)'      : 'transparent',
      }}
    >
      {children}
    </button>
  )
}

function VSep() {
  return <div style={{ width: 1, height: 20, background: '#2e2e3c', margin: '0 3px', flexShrink: 0 }} />
}
