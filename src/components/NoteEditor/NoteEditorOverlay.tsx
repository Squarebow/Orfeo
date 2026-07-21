import { useEffect, useState, useReducer, useCallback } from 'react'
import { Midi } from '@tonejs/midi'
import { useStore } from '../../store'
import { midiToEditableCopy } from '../../utils/noteEditorCommands'
import { createNoteEditorHistory } from '../../utils/noteEditorHistory'
import type { NoteEditorHistory } from '../../utils/noteEditorHistory'
import NoteEditorCanvas from './NoteEditorCanvas'

// ── Session — created fresh each time the overlay opens ───────────────────────
interface EditorSession {
  midiCopy:   Midi
  history:    NoteEditorHistory
  trackIndex: number   // index into midiCopy.tracks (first non-empty track)
}

function buildSession(rawBuffer: ArrayBuffer): EditorSession | null {
  const midiCopy = midiToEditableCopy(rawBuffer)
  const trackIndex = midiCopy.tracks.findIndex(t => t.notes.length > 0)
  if (trackIndex === -1) return null
  return { midiCopy, history: createNoteEditorHistory(), trackIndex }
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  open:    boolean
  onClose: () => void
}

// ── NoteEditorOverlay ─────────────────────────────────────────────────────────
// Dev-only full-screen overlay.  Session is created on open, discarded on close.
// Toggle via Ctrl+Shift+N (wired in App.tsx).
export default function NoteEditorOverlay({ open, onClose }: Props) {
  const midi         = useStore(s => s.midi)
  const tracks       = useStore(s => s.tracks)
  const keyboardSize = useStore(s => s.keyboardSize)

  const [session, setSession] = useState<EditorSession | null>(null)

  // ── Force-update trigger — tells React to re-render after history changes ──
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)
  const handleHistoryChange = useCallback(() => forceUpdate(), [])

  // ── Create / destroy session on open / close ──────────────────────────────
  useEffect(() => {
    if (open && midi) {
      const raw = (midi as any)._raw as ArrayBuffer | undefined
      if (!raw) return
      setSession(buildSession(raw))
    } else {
      setSession(null)
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps — midi is intentionally excluded: session is fixed for the duration of a single open

  if (!open || !session) {
    // Render nothing when closed; re-creating session on next open is intentional
    return null
  }

  const { midiCopy, history, trackIndex } = session

  // Track colour — borrow from store's first track (corresponds to first non-empty @tonejs/midi track)
  const trackColor = tracks[0]?.color ?? '#e8a027'

  // Track metadata for toolbar display
  const editTrack = midiCopy.tracks[trackIndex]
  const trackLabel = editTrack
    ? (editTrack.name || tracks[trackIndex]?.gmName || `Track ${trackIndex + 1}`)
    : '—'
  const noteCount = editTrack?.notes.length ?? 0

  const canUndo = history.canUndo
  const canRedo = history.canRedo

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9600,
        background: 'rgba(8, 8, 12, 0.92)',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
      onKeyDown={e => e.stopPropagation()} // prevent global shortcuts firing inside overlay
    >
      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div style={{
        height: 44, flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '0 12px',
        background: 'var(--panel, #1e1e1e)',
        borderBottom: '1px solid #2e2e3c',
      }}>
        {/* Title */}
        <span style={{
          fontSize: 'var(--text-sm, 12px)',
          fontWeight: 600,
          color: 'var(--text-amber, #e8a027)',
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          marginRight: 4,
        }}>
          Note Editor
        </span>
        <span style={{ color: '#404055', fontSize: 'var(--text-xs, 11px)' }}>·</span>
        <span style={{
          fontSize: 'var(--text-sm, 12px)',
          color: 'var(--text-default, #c6c8c8)',
          fontFamily: "'JetBrains Mono', monospace",
        }}>
          {trackLabel}
        </span>
        <span style={{ color: '#404055', fontSize: 'var(--text-xs, 11px)', marginLeft: 2 }}>
          ({noteCount} notes)
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Undo / Redo */}
        <button
          onClick={() => { if (history.undo()) handleHistoryChange() }}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
          style={btnStyle(!canUndo)}
        >
          ↩ Undo
        </button>
        <button
          onClick={() => { if (history.redo()) handleHistoryChange() }}
          disabled={!canRedo}
          title="Redo (Ctrl+Y)"
          style={btnStyle(!canRedo)}
        >
          Redo ↪
        </button>

        <div style={{ width: 1, height: 20, background: '#2e2e3c', margin: '0 4px' }} />

        {/* Close */}
        <button
          onClick={onClose}
          title="Close Note Editor (Ctrl+Shift+N)"
          style={{ ...btnStyle(false), color: 'var(--text-muted, #94979e)' }}
        >
          ✕ Close
        </button>
      </div>

      {/* ── Hint bar ─────────────────────────────────────────────────────────── */}
      <div style={{
        height: 24, flexShrink: 0,
        display: 'flex', alignItems: 'center',
        padding: '0 12px',
        background: '#131318',
        borderBottom: '1px solid #1e1e28',
        gap: 16,
      }}>
        {[
          'Click empty space → add note',
          'Drag note up/down → retime',
          'Drag note left/right → repitch',
          'Right-click or Delete → remove',
          'Scroll → navigate time',
        ].map(hint => (
          <span key={hint} style={{ fontSize: 'var(--text-xs, 11px)', color: '#504a4a' }}>
            {hint}
          </span>
        ))}
      </div>

      {/* ── Canvas — fills remaining height ──────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <NoteEditorCanvas
          midi={midiCopy}
          trackIndex={trackIndex}
          trackColor={trackColor}
          keyboardSize={keyboardSize}
          history={history}
          onHistoryChange={handleHistoryChange}
        />
      </div>
    </div>
  )
}

// ── Shared button style ───────────────────────────────────────────────────────
function btnStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 26,
    padding: '0 10px',
    fontSize: 'var(--text-xs, 11px)',
    fontFamily: "'Inter', system-ui, sans-serif",
    background: 'transparent',
    border: '1px solid #2e2e3c',
    borderRadius: 'var(--radius-sm, 3px)',
    color: disabled ? '#404055' : 'var(--text-default, #c6c8c8)',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'border-color 0.1s, color 0.1s',
  }
}
