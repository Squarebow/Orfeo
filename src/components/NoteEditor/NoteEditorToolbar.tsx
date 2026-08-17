import { useEffect, useState, useReducer, useRef, useCallback, useMemo } from 'react'
import { PenLine, SquareDashed, CircleDashed, Hand, WholeWord, Music4, Save } from 'lucide-react'
import { useStore } from '../../store'
import { NES, buildNoteEditSummary, type NETool } from '../../utils/noteEditorState'
import { confirmDialog } from '../../utils/confirmController'
import { editableCopyToBuffer } from '../../utils/noteEditorCommands'
import { buildHandExportHint } from '../../utils/handMetadata'
import { parseMidiBuffer } from '../../utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from '../../utils/keyDetection'
import { getPianoRollAreaRect, getPianoRollCenterX } from '../../utils/modalAnchors'
import { modalCloseButtonStyle, modalCloseButtonHoverColor, modalCloseButtonIdleColor } from '../../utils/modalCloseButtonStyle'
import { HAND_ASSIGN_GROUPS } from '../../utils/keyboardGroups'
import OrfeoMark from '../OrfeoMark'

// ── Toolbar SVG icons ─────────────────────────────────────────────────────────
const IconSnap = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="currentColor" aria-hidden="true">
    <rect x="1.5" y="2" width="2" height="9" rx="1" />
    <rect x="5.5" y="4" width="2" height="5" rx="1" />
    <rect x="9.5" y="2" width="2" height="9" rx="1" />
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
  const soloTrackForEdit        = useStore(s => s.soloTrackForEdit)
  const noteEditorSoloTrackIndex = useStore(s => s.noteEditorSoloTrackIndex)
  // ── Display-relevant signature, not the live `tracks` array — same root
  // cause as TrackPanel.tsx/etc: the only read below (line ~402) is group/
  // isDrum, but every fader/pan/chorus/reverb drag replaced the whole array.
  const trackSignature = useStore(s => s.tracks.map(t => `${t.index}:${t.group ?? ''}:${t.isDrum}`).join('|'))
  const tracks                  = useMemo(() => useStore.getState().tracks, [trackSignature])
  const velocityPanelOpen       = useStore(s => s.velocityPanelOpen)
  const setVelocityPanelOpen    = useStore(s => s.setVelocityPanelOpen)

  // ── Force re-render on history changes (push/undo/redo) ───────────────────
  const [, forceUpdate] = useReducer((x: number) => x + 1, 0)

  // ── Local display state ───────────────────────────────────────────────────
  const [hintText,        setHintText]      = useState(NES.hoverHint)
  const [snapEnabled,     setSnapDisplay]   = useState(NES.snapRef.current)
  const [quantize,        setQuantizeDisplay] = useState(NES.quantizeDivisorRef.current)
  const [showNoteNames,   setNoteNamesDisplay] = useState(NES.showNoteNamesRef.current)
  const [activeTool,      setActiveToolDisplay] = useState<NETool>(NES.activeTool)
  const [reassignHands,   setReassignHandsDisplay] = useState(NES.reassignHandsMode)
  const [quantizeOpen,    setQuantizeOpen]  = useState(false)
  const [quantizePos,     setQuantizePos]   = useState({ top: 0, left: 0 })
  const [showCloseConfirm, setShowCloseConfirm] = useState(false)
  // ── Icon hover hint — replaces native `title` tooltips for every icon in
  // this panel. Hovering an icon shows its description in the row-3
  // tooltip section instead of a browser tooltip popup; moving off it
  // reverts to the normal tool-based context-aware text. Scoped entirely
  // to hovering inside the panel — the piano roll's own hover hints
  // (NES.hoverHint) are untouched. ───────────────────────────────────────
  const [iconHint, setIconHint] = useState<string | null>(null)
  const quantizeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const handler = () => setActiveToolDisplay(NES.activeTool)
    NES.onToolChange = handler
    return () => { if (NES.onToolChange === handler) NES.onToolChange = null }
  }, [])
  useEffect(() => {
    const handler = () => setReassignHandsDisplay(NES.reassignHandsMode)
    NES.onReassignHandsModeChange = handler
    return () => { if (NES.onReassignHandsModeChange === handler) NES.onReassignHandsModeChange = null }
  }, [])

  useEffect(() => {
    // Cleanup compared NES.onHistoryChange to `forceUpdate` (the dispatch),
    // but the assignment stores a NEW wrapper closure `() => forceUpdate()`
    // — never equal, so cleanup could never actually null the stale
    // handler. A resize/move interaction that pushed to history could then
    // silently update a detached instance's handler (left behind by an
    // earlier hot-reload) instead of the currently-rendered toolbar's, so
    // its Undo icon never re-rendered enabled — Ctrl+Z and the context
    // menu's Undo both read NES.history fresh each time, so they worked
    // regardless. Store the actual handler reference so cleanup can match it.
    const handler = () => forceUpdate()
    NES.onHistoryChange = handler
    return () => { if (NES.onHistoryChange === handler) NES.onHistoryChange = null }
  }, [])

  // ── Subscribe to hover hint changes from PianoRoll — context-aware: the
  // hint changes with tool/hover/selection state as the mouse moves. ───────
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

    // ── Inject hand-assignment export hint before encoding — same mechanism
    // the Playback Editor's editor:save uses server-side, done here instead
    // since noteEditor:save receives pre-encoded bytes with no track data of
    // its own to inject into. Without this, hand tags on NES.editMidi's
    // notes (copied in from the store at edit-mode entry — see
    // copyHandTagsOntoEditBuffer) never reach the saved file: editing
    // anything and saving silently discarded whatever hand tags existed.
    const editMidi = NES.editMidi
    const keptMeta = ((editMidi.header as any).meta ?? []).filter(
      (m: any) => !(typeof m.text === 'string' && m.text.startsWith('ORFEO_HAND_MAP:'))
    )
    ;(editMidi.header as any).meta = keptMeta
    editMidi.tracks.forEach(track => {
      if (!track.notes.some((n: any) => n.hand !== undefined)) return
      // (track as any).index — the compacted (non-empty-tracks-only) index
      // midiToEditableCopy() stamps on this exact object, NOT the raw
      // forEach position. restoreHandTagsFromHints() on reload matches
      // ORFEO_HAND_MAP's trackIndex against ParsedTrack.index, which is
      // that same compacted numbering — using the raw loop index here
      // (as this used to) wrote the hint under the wrong track whenever an
      // empty filler track preceded the real one, so the manual/computed
      // tags silently failed to restore on the very next load.
      const hint = buildHandExportHint((track as any).index, track.name, track.notes as any)
      track.name = hint.name
      if (hint.meta) (editMidi.header as any).meta.push(hint.meta)
    })

    const buf    = editableCopyToBuffer(NES.editMidi)
    const bytes  = new Uint8Array(buf)
    let binary   = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const base64 = btoa(binary)

    const saveSummary = buildNoteEditSummary(NES.history.appliedDescriptions())

    // Silent auto-version into the source's sibling Orfeo/ folder — same
    // convention as the Playback Editor and Mixer Console saves, no save
    // dialog (a dialog defaulting to a not-yet-created folder can silently
    // fall back to wherever the OS last had one open, e.g. Downloads).
    const result = await window.electronAPI.saveNoteEditor({ filePath: sourcePath, base64, summary: saveSummary })
    if (!result.ok) return false

    NES.dirty = false
    // Once saved, edits are no longer "unsaved" — clear the new/edited
    // note markers so the roll drops the outline-only fill and pulsing
    // border and everything renders with normal properties again.
    NES.newNotes.clear()
    NES.editedNotes.clear()
    NES.needsFlatRebuild = true
    NES.onHistoryChange?.()
    useStore.getState().setLibraryNeedsRefresh(true)

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
      // setMidi() just rebuilt `tracks` fresh from the reloaded file (all
      // visible by default) — it has no memory of the Hand toggle's visual
      // isolation, which lived only in the old (now-replaced) tracks array.
      // Re-solo the piano track post-reload if Hand mode is still on, or
      // the roll silently un-isolates back to all-11-tracks-visible right
      // after every save. noteEditorSoloTrackIndex is cleared first since
      // it may still equal the new piano track's index from before reload
      // — soloTrackForEdit would read that as "already soloed" and toggle
      // it OFF instead of re-applying it.
      // Deferred one tick — setMidi's `tracks` replacement can still be
      // getting picked up by other subscribers/effects reacting to the
      // same state change (e.g. TrackPanel, PianoRoll's store-ref sync);
      // running this synchronously right after setMidi risked a later
      // effect's own re-render clobbering the isolation right back.
      setTimeout(() => {
        if (!NES.reassignHandsMode) return
        const freshTracks = useStore.getState().tracks
        const kbTrack = freshTracks.find(t => HAND_ASSIGN_GROUPS.has(t.group) && !t.isDrum)
        if (kbTrack) {
          useStore.setState({ noteEditorSoloTrackIndex: null, preSoloTrackVisibility: null })
          useStore.getState().soloTrackForEdit(kbTrack.index)
        }
      }, 0)
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

  // ── Default position: horizontally centered on the piano roll. Always
  // recomputed on open, same as every other modal in the app. ──────────────
  useEffect(() => {
    const roll = getPianoRollAreaRect()
    if (!roll) return
    const w = panelRef.current?.offsetWidth ?? 400
    const next = { x: Math.max(0, Math.round(getPianoRollCenterX() - w / 2) + 320), y: Math.max(44, Math.round(roll.top + 12)) }
    posRef.current = next
    setPos(next)
  }, [])

  // ── Clamp into the current viewport — a position saved while the window
  // was larger (e.g. OS fullscreen) can otherwise render half off-screen
  // once the window shrinks back down. Runs on mount and on resize/
  // fullscreen transitions, for both the default and a user-dragged
  // position alike. ─────────────────────────────────────────────────────────
  useEffect(() => {
    const clamp = () => {
      const panelW = panelRef.current?.offsetWidth ?? 400
      const panelH = panelRef.current?.offsetHeight ?? 44
      setPos(p => {
        const next = {
          x: Math.max(0, Math.min(window.innerWidth - panelW, p.x)),
          // 44, not 0 — keeps the top edge (and its close button) clear of
          // the 40px titleBarOverlay (electron/main.ts) where Windows draws
          // its own window controls on top of everything in the DOM.
          y: Math.max(44, Math.min(window.innerHeight - panelH, p.y)),
        }
        if (next.x === p.x && next.y === p.y) return p
        posRef.current = next
        return next
      })
    }
    clamp()
    const raf = requestAnimationFrame(clamp) // re-clamp once the panel's real size is measured
    window.addEventListener('resize', clamp)
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', clamp) }
  }, [])

  const onMouseMove = useCallback((e: MouseEvent) => {
    const ds = dragState.current
    if (!ds) return
    const panelW = panelRef.current?.offsetWidth ?? 400
    const panelH = panelRef.current?.offsetHeight ?? 44
    const next = {
      x: Math.max(0, Math.min(window.innerWidth - panelW, ds.startPosX + (e.clientX - ds.startX))),
      y: Math.max(44, Math.min(window.innerHeight - panelH, ds.startPosY + (e.clientY - ds.startY))),
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
  const doReset = async () => {
    if (NES.dirty) {
      const choice = await confirmDialog({
        title: 'Reset Note Editor',
        message: 'Discard all changes in this editing session?',
        buttons: ['Discard', 'Cancel'],
        destructiveIndex: 0,
      })
      if (choice !== 0) return
    }
    NES.onResetRequest?.()
  }
  const openQuantize = () => {
    if (quantizeBtnRef.current) {
      const r = quantizeBtnRef.current.getBoundingClientRect()
      setQuantizePos({ top: r.bottom + 4, left: r.left })
    }
    setQuantizeOpen(v => !v)
  }
  // Clicking the already-active tool turns it back off (returns to Select,
  // the default) instead of doing nothing — click = active, click again =
  // inactive, same toggle behavior every other mode button here already has.
  const setTool = (t: NETool) => {
    const next = NES.activeTool === t ? 'select' : t
    NES.activeTool = next
    setActiveToolDisplay(next)
  }
  // ── Reassign-hands toggle — separate from the Settings LH/RH algorithm
  // toggle; this only controls whether the editor shows hand colors and
  // Assign LH/RH right now. Turning it on visually isolates the piano/keys
  // track on the roll and keyboard (soloTrackForEdit hides every other
  // track's `visible` — audio is untouched, purely visual), forcing it even
  // if some other track happens to be soloed — correction always happens on
  // exactly one track anyway, so there's never a reason to be looking at 11
  // others while doing it. Turning it back off restores whatever was
  // visible before — the isolation is scoped to Hand mode, not a permanent
  // visibility change. ──────────────────────────────────────────────────
  const toggleReassignHands = () => {
    const next = !NES.reassignHandsMode
    NES.reassignHandsMode = next
    setReassignHandsDisplay(next)
    if (next) {
      const kbTrack = tracks.find(t => HAND_ASSIGN_GROUPS.has(t.group) && !t.isDrum)
      if (kbTrack && noteEditorSoloTrackIndex !== kbTrack.index) soloTrackForEdit(kbTrack.index)
    } else {
      unsoloTrackForEdit()
    }
  }

  const canUndo = NES.history.canUndo
  const canRedo = NES.history.canRedo

  // ── Static per-tool blurb (line 1) + live hover-driven hint (line 2) —
  // context-aware: line 2 changes with tool/hover/selection state as
  // PianoRoll's updateHoverState reports it, falling back to a per-tool
  // idle blurb when the cursor is outside the roll (NES.defaultHint). ──────
  const toolTooltip: Record<NETool, [string, string]> = {
    select: ['Select — click/shift-click notes, drag to move/resize', 'Drag empty space to pan · Shift+wheel to scrub finely'],
    pen:    ['Pen — Alt+click empty space to add a note', 'Click a note to mark it for delete'],
    marquee:['Marquee — drag a box over a cluster to select it', 'Shift+drag adds to the current selection'],
    lasso:  ['Lasso — drag through notes to select them', 'Shift+drag adds to the current selection'],
  }
  const [tipLine1, tipLine2] = toolTooltip[activeTool]

  // ── Renders "Label — description" text with the label dimmed-amber —
  // shared by tipLine1 and every icon's hover hint so they read as one
  // consistent system. ──────────────────────────────────────────────────
  const renderTip = (text: string) => {
    const dashIdx = text.indexOf(' — ')
    if (dashIdx === -1) return text
    return (
      <>
        <span style={{ color: 'var(--text-amber-dimmest)', fontWeight: 700 }}>{text.slice(0, dashIdx)}</span>
        {text.slice(dashIdx)}
      </>
    )
  }
  // ── Icon hover handlers — set/clear the row-3 hint instead of a native
  // `title` tooltip. ────────────────────────────────────────────────────
  const hintHandlers = (hint: string) => ({
    onMouseEnter: () => setIconHint(hint),
    onMouseLeave: () => setIconHint(null),
  })

  return (
    <div
      ref={panelRef}
      role="toolbar"
      aria-label="Note Editor toolbar"
      className="orfeo-modal-glow"
      style={{
        position: 'fixed',
        left: pos.x, top: pos.y,
        zIndex: 9700,
        width: 570,
        background: 'var(--panel)',
        border: '1px solid var(--state-hover-border)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        userSelect: 'none',
        cursor: 'default',
      }}
    >
      {/* ── Row 1: header — logo+title, permanent solo hint (centered), info
          (disabled)+close. Three minmax(0,1fr) grid tracks — not flex+
          absolute-centering — so the middle hint stays truly centered
          regardless of title/button-group width (see CLAUDE.md's CSS Grid
          layout convention). ────────────────────────────────────────────── */}
      {/* Side columns measured live: left (logo+title) needs ~126px, right
          (2 icon buttons) needs ~62px — 130px each keeps both symmetric
          (required for the center hint to stay truly centered) while
          freeing enough width that "for editing" no longer wraps its last
          word onto its own line. */}
      <div
        onMouseDown={e => {
          e.preventDefault()
          dragState.current = { startX: e.clientX, startY: e.clientY, startPosX: pos.x, startPosY: pos.y }
        }}
        title="Drag to move"
        style={{ display: 'grid', gridTemplateColumns: '130px 1fr 130px', alignItems: 'center', minHeight: 32, padding: '4px 6px 4px 8px', gap: 6, cursor: 'grab' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <OrfeoMark height={16} />
          </div>
          <span style={{
            fontSize: 14, fontWeight: 700, letterSpacing: '0.08em',
            color: 'var(--text-amber)', textTransform: 'uppercase',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            MIDI NOTE EDITOR
          </span>
        </div>
        <div style={{
          fontSize: 11, color: 'var(--text-dim-control)', textAlign: 'center',
          whiteSpace: 'normal', lineHeight: 1.3,
        }}>
          Click a track in the Tracks panel to solo it for editing
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
          <button
            disabled
            style={{ ...iconBtnStyle(true), opacity: 0.2, cursor: 'default', pointerEvents: 'none' }}
          >
            <IconInfo />
          </button>
          <button
            onMouseDown={e => e.stopPropagation()}
            onClick={() => void doClose()}
            style={modalCloseButtonStyle}
            onMouseEnter={e => { e.currentTarget.style.color = modalCloseButtonHoverColor; setIconHint('Close — exit edit mode') }}
            onMouseLeave={e => { e.currentTarget.style.color = modalCloseButtonIdleColor; setIconHint(null) }}
          >
            ✕
          </button>
        </div>
      </div>

      {/* ── Row 2: TOOLS + MODES — one row, two groups with breathing room
          between them, instead of stacked rows that fought the panel for
          height and made the tooltip row below feel cramped. ─────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', height: 32, padding: '0 8px', gap: 10, borderTop: '1px solid var(--state-hover-bg)' }}>
        <span style={rowLabelStyle}>TOOLS</span>
        <ToolBtn active={activeTool === 'marquee'} onClick={() => setTool('marquee')} onHint={setIconHint} hint="Marquee — drag a box over a cluster to select it">
          <SquareDashed size={13} />
        </ToolBtn>
        <ToolBtn active={activeTool === 'lasso'} onClick={() => setTool('lasso')} onHint={setIconHint} hint="Freehand select — drag through notes to select them">
          <CircleDashed size={13} />
        </ToolBtn>
        <ToolBtn active={activeTool === 'pen'} onClick={() => setTool('pen')} onHint={setIconHint} hint="Pen — Alt+click to add, click a note to mark for delete">
          <PenLine size={13} />
        </ToolBtn>
        <button onClick={doUndo} disabled={!canUndo} {...hintHandlers('Undo — revert the last edit (Ctrl+Z)')} style={iconBtnStyle(!canUndo)}><span style={{ display: 'inline-block', transform: 'rotate(-45deg)' }}>↺</span></button>
        <button onClick={doRedo} disabled={!canRedo} {...hintHandlers('Redo — reapply the last undone edit (Ctrl+Y)')} style={iconBtnStyle(!canRedo)}><span style={{ display: 'inline-block', transform: 'rotate(45deg)' }}>↻</span></button>

        <div style={{ flex: 1 }} />

        <span style={rowLabelStyle}>MODES</span>
        <ToolBtn active={showNoteNames} onClick={toggleNoteNames} onHint={setIconHint} hint="Note names — show pitch labels on notes">
          <WholeWord size={16} />
        </ToolBtn>

        <ToolBtn active={reassignHands} onClick={toggleReassignHands} onHint={setIconHint} hint="Reassign hands — show LH/RH colors and enable Assign LH/RH">
          <Hand size={13} />
        </ToolBtn>

        {/* ── Velocity lane toggle — no blink/nudge, ever: static white,
            amber only while the lane is actually open. ────────────────── */}
        <button
          onClick={() => setVelocityPanelOpen(!velocityPanelOpen)}
          {...hintHandlers(velocityPanelOpen ? 'Velocity lane — hide the velocity editor' : noteEditorSoloTrackIndex !== null ? 'Velocity lane — edit velocity for the soloed track' : 'Velocity lane — solo a track to edit its velocity')}
          style={{
            ...btnBase,
            width: 28, padding: 0, justifyContent: 'center',
            // Amber only when the lane is actually open (truly "active") —
            // a soloed track alone used to turn this amber too, which read
            // as "on" even though nothing was toggled. The blink nudge
            // below still pulses (as a white icon now) to draw attention
            // when a track's soloed and the lane isn't open yet.
            color:       velocityPanelOpen ? 'var(--text-amber)' : 'var(--text-muted)',
            borderColor: velocityPanelOpen ? 'var(--accent-amber-active-border)' : 'var(--state-hover-bg)',
            background:  velocityPanelOpen ? 'var(--accent-amber-active-bg)'     : 'transparent',
          }}
        >
          <IconVelocity />
        </button>

        <ToolBtn active={snapEnabled} onClick={() => setSnap(!snapEnabled)} onHint={setIconHint} hint={snapEnabled ? 'Snap — ON, click to disable' : 'Snap — OFF, click to enable'}>
          <IconSnap />
        </ToolBtn>

        <div style={{ position: 'relative' }}>
          <button
            ref={quantizeBtnRef}
            onClick={openQuantize}
            aria-haspopup="listbox"
            aria-expanded={quantizeOpen}
            {...hintHandlers('Quantize grid — set the snap resolution')}
            style={{ ...btnBase, minWidth: 44, gap: 6, fontFamily: 'var(--font-mono)', fontSize: 10 }}
          >
            <Music4 size={12} color="var(--text-amber)" />
            <span style={{ display: 'inline-block', width: 24, textAlign: 'left' }}>{QUANT_LABELS[quantize]}</span>
          </button>
          {quantizeOpen && (
            <div
              role="listbox"
              aria-label="Quantize grid resolution"
              onMouseDown={e => e.stopPropagation()}
              style={{
                position: 'fixed',
                top: quantizePos.top, left: quantizePos.left,
                zIndex: 50001,
                background: 'var(--panel)', border: '1px solid var(--state-hover-border)',
                borderRadius: 4, overflow: 'hidden', minWidth: 64,
                boxShadow: '0 4px 16px rgba(0,0,0,0.55)',
              }}
            >
              {([4, 8, 16, 32] as const).map(d => (
                <div
                  key={d}
                  role="option"
                  aria-selected={d === quantize}
                  onClick={() => setQuantize(d)}
                  style={{
                    padding: '6px 14px', cursor: 'pointer', fontSize: 12,
                    fontFamily: 'var(--font-mono)',
                    color:      d === quantize ? 'var(--text-amber)' : 'var(--text-default)',
                    background: d === quantize ? 'var(--accent-amber-selected-bg)' : 'transparent',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--state-hover-overlay-white)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = d === quantize ? 'var(--accent-amber-selected-bg)' : 'transparent' }}
                >
                  1/{d}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Row 3: dynamic tooltip (left, ~2/3) + Reset/Save (right, ~1/3) ──
          Both columns are fixed-fraction (flex-basis on a fixed-width
          parent), never resizing the panel itself — long tooltip text wraps
          within its column (normally 2 lines; a 3rd only grows the row's
          height, never the panel's width) instead of forcing the toolbar
          wider or truncating with an ellipsis. ─────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8, padding: '6px 8px', borderTop: '1px solid var(--state-hover-bg)' }}>
        <div style={{
          flex: '2 1 0%', minWidth: 0, fontSize: 12, color: 'var(--text-muted)',
          fontStyle: 'italic', lineHeight: 1.4, whiteSpace: 'normal', wordBreak: 'break-word',
        }}>
          {iconHint ? (
            <div>{renderTip(iconHint)}</div>
          ) : (
            <>
              <div>{renderTip(tipLine1)}</div>
              <div>{hintText || tipLine2}</div>
            </>
          )}
        </div>
        <div style={{ flex: '1 1 0%', display: 'flex', gap: 6, minWidth: 0 }}>
          {/* ── Colors/icon/behavior match the Playback Editor's Cancel/Save &
              Reload footer buttons exactly (MidiEditor.tsx) — just not their
              fixed width, this row's two columns stay equal-flex. ────────── */}
          <button
            onClick={() => void doReset()}
            style={{
              ...btnBase, flex: 1, justifyContent: 'center', fontSize: 12,
              color: 'var(--text-muted)', borderColor: 'var(--border2)', background: 'transparent',
              whiteSpace: 'nowrap', padding: '0 4px', transition: 'all 0.12s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = 'var(--text-amber)'; e.currentTarget.style.borderColor = 'var(--accent-amber-strong)'; setIconHint('Reset — discard all edits and restore original') }}
            onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border2)'; setIconHint(null) }}
          >
            Reset
          </button>
          <button
            onClick={() => void handleSave()}
            {...hintHandlers('Save & Reload — save edits as a new versioned copy (_ORFEO_vN)')}
            style={{
              ...btnBase, flex: 1, justifyContent: 'center', fontSize: 12, fontWeight: 600,
              color: 'var(--text-near-black)', border: 'none', background: 'var(--text-amber)',
              whiteSpace: 'nowrap', padding: '0 4px', gap: 5,
            }}
          >
            <Save size={12} /> Save &amp; Reload
          </button>
        </div>
      </div>

      {/* ── Unsaved-changes close confirmation strip ──────────────────────── */}
      {showCloseConfirm && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          height: 32, padding: '0 10px',
          borderTop: '1px solid var(--state-hover-bg)',
          background: 'var(--accent-amber-tint-bg)',
        }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
            Unsaved changes —
          </span>
          <button
            onClick={() => void doConfirmSaveAndClose()}
            style={{ ...btnBase, borderColor: 'var(--accent-amber-active-border)', color: 'var(--text-amber)', background: 'var(--accent-amber-active-bg)', fontSize: 11 }}
          >
            Save & Exit
          </button>
          <button
            onClick={doConfirmDiscardAndClose}
            style={{ ...btnBase, borderColor: 'var(--status-error-border)', color: 'var(--status-error)', fontSize: 11 }}
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

    </div>
  )
}

// ── Shared style atoms ────────────────────────────────────────────────────────
// fontSize matches the Reset/Save & Reload buttons below (9.5) — was 9,
// visibly smaller than the button row's text.
const rowLabelStyle: React.CSSProperties = {
  fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
  color: 'var(--text-dimmest)', textTransform: 'uppercase', flexShrink: 0,
}

const btnBase: React.CSSProperties = {
  height: 26, padding: '0 8px', fontSize: 11,
  fontFamily: 'var(--font-ui)',
  background: 'transparent', border: '1px solid var(--state-hover-bg)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-default)',
  cursor: 'pointer', display: 'flex', alignItems: 'center',
  transition: 'border-color 0.1s, color 0.1s', flexShrink: 0,
}

function iconBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 28, height: 26, padding: 0, fontSize: 16, lineHeight: 1,
    fontFamily: 'system-ui, sans-serif',
    background: 'transparent', border: '1px solid var(--state-hover-bg)',
    borderRadius: 'var(--radius-sm)',
    color:   disabled ? 'var(--text-disabled-icon)' : 'var(--text-default)',
    cursor:  disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.65 : 1,
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  }
}

// `hint` replaces the native `title` tooltip — shown in the row-3 tooltip
// section on hover instead of a browser popup, via `onHint`.
function ToolBtn({ active, onClick, hint, onHint, children, wide }: {
  active: boolean; onClick: () => void; hint: string; onHint: (h: string | null) => void
  children: React.ReactNode; wide?: boolean
}) {
  return (
    <button
      onClick={onClick}
      style={{
        ...btnBase,
        width: wide ? 'auto' : 28, padding: wide ? '0 8px' : 0, justifyContent: 'center',
        color:       active ? 'var(--text-amber)' : 'var(--text-muted)',
        borderColor: active ? 'var(--accent-amber-active-border)' : 'var(--state-hover-bg)',
        background:  active ? 'var(--accent-amber-active-bg)'     : 'transparent',
      }}
      onMouseEnter={e => { if (!active) e.currentTarget.style.color = 'var(--text-amber)'; onHint(hint) }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.color = 'var(--text-muted)'; onHint(null) }}
    >
      {children}
    </button>
  )
}

function VSep() {
  return <div style={{ width: 1, height: 20, background: 'var(--state-hover-bg)', margin: '0 3px', flexShrink: 0 }} />
}
