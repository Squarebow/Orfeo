import { useEffect, useState, useCallback, useRef } from 'react'
import TopBar from './components/Transport/TopBar'
import PianoRoll from './components/PianoRoll/PianoRoll'
import Keyboard from './components/Keyboard/Keyboard'
import KeyboardControls from './components/Keyboard/KeyboardControls'
import TrackPanel from './components/TrackPanel/TrackPanel'
import SettingsPanel from './components/SettingsPanel/SettingsPanel'
import EmptyState from './components/EmptyState'
import { useStore } from './store'
import FloatingKeyboard from './components/Keyboard/FloatingKeyboard'
import ChordExplorer from './components/ChordExplorer'
import ScaleExplorer from './components/ScaleExplorer'
import LockedChordModal from './components/LockedChordModal'
import MidiEditor from './components/MidiEditor/MidiEditor'
import MixerConsole from './components/Mixer/MixerConsole'
import NoteEditorToolbar from './components/NoteEditor/NoteEditorToolbar'
import { ConfirmDialogHost } from './components/ConfirmDialog'
import { confirmDialog } from './utils/confirmController'
import { parseMidiBuffer } from './utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from './utils/keyDetection'
import {
  resolveAndTrackImport,
  confirmPendingImportBeforeSwitch,
  base64ToBytes,
  getCachePath,
} from './utils/foreignFormatImport'
import { useMidiFile } from './hooks/useMidiFile'
import { usePlayback } from './hooks/usePlayback'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useMetronome } from './hooks/useMetronome'
import { useChordSequence } from './hooks/useChordSequence'
import { useMidiInput } from './hooks/useMidiInput'
import { runNoteEditorRoundTripTest } from './utils/noteEditorRoundTripTest'
import { runHandAssignmentTest } from './utils/handAssignmentTest'
import { runHandMetadataTest } from './utils/handMetadataTest'
import { NES, confirmDiscardDirtyNoteEdits } from './utils/noteEditorState'
import { confirmDiscardDirtyTempoKey, saveTempoKeyChanges } from './utils/tempoKeySave'

export default function App() {
  const midi = useStore((s) => s.midi)
  const keyboardMode = useStore((s) => s.keyboardMode)
  const appTheme = useStore((s) => s.appTheme)
  const presentationMode = useStore((s) => s.presentationMode)
  const { openFile } = useMidiFile()
  const { play, pause, stop } = usePlayback()
  useAudioEngine()
  useMidiInput()
  useMetronome()
  useChordSequence()

  // ── Mixer Console — Ctrl+Shift+M toggles open; also wired to the Console drawer icon ──

  // ── Drag-and-drop state ───────────────────────────────────────────────────
  const [isDragOver, setIsDragOver] = useState(false)
  const [dropError, setDropError]   = useState<string | null>(null)
  const dropErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Presentation Mode header hover reveal ─────────────────────────────────
  const [headerVisible, setHeaderVisible] = useState(false)
  const hideHeaderTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Show a timed error message, clearing any previous timer ──────────────
  const showDropError = useCallback((msg: string) => {
    if (dropErrorTimer.current) clearTimeout(dropErrorTimer.current)
    setDropError(msg)
    dropErrorTimer.current = setTimeout(() => setDropError(null), 2500)
  }, [])

  // ── Parse and load a MIDI file by OS path into the player ───────────────
  // Handles foreign formats (MusicXML, Guitar Pro) by converting via alphaTab.
  // Checks for a valid on-disk cache before converting; sets pendingImportedFile
  // when conversion is done in-memory and not yet written to disk.
  const loadFileIntoPlayer = useCallback(async (filePath: string) => {
    const canDiscard = await confirmDiscardDirtyNoteEdits('Save changes before opening this file?')
    if (!canDiscard) return
    const canDiscardTempoKey = await confirmDiscardDirtyTempoKey('Save tempo/key changes before opening this file?')
    if (!canDiscardTempoKey) return

    const proceed = await confirmPendingImportBeforeSwitch(filePath)
    if (!proceed) return // user cancelled — stay on current file

    const result = await window.electronAPI.loadMidiFromPath(filePath)
    if (!result) return

    let base64    = result.base64
    let resolvedFilePath = filePath
    let parseName = result.fileName
    const libraryFolder = (useStore.getState() as any).libraryFolder as string | null ?? null

    try {
      const resolved = await resolveAndTrackImport(filePath, base64, result.fileName, libraryFolder)
      base64 = resolved.base64
      resolvedFilePath = resolved.filePath
      parseName = resolved.fileName
    } catch (e: any) {
      showDropError(e?.message ?? 'Could not convert this file to MIDI.')
      return
    }

    const bytes  = base64ToBytes(base64)
    // _filePath = original source, or the on-disk .mid cache once a foreign-format
    // import has been saved — editing tools must save against a real .mid, not
    // the foreign source file (see resolveAndTrackImport).
    const parsed = parseMidiBuffer(bytes.buffer as ArrayBuffer, parseName, resolvedFilePath)
    useStore.getState().setMidi(parsed)
    const raw = parsed as any
    if (raw._keySignature != null) {
      useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
    } else {
      useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
    }
  }, [showDropError])

  // ── Load a dropped file by its real OS path ───────────────────────────────
  // Stops playback, copies into the library if the file is external, rescans,
  // then parses and loads directly — does not call store.loadLibraryFile because
  // parseMidiBuffer is not imported in store/index.ts and would fail at runtime.
  const loadDroppedFilePath = useCallback(async (filePath: string) => {
    stop()

    // Cast needed: library fields are implemented but not declared in OrfeoStore interface
    const store         = useStore.getState() as any
    const libraryFolder = store.libraryFolder as string | null

    if (!libraryFolder) {
      // No library configured — load directly from wherever the file lives
      await loadFileIntoPlayer(filePath)
      return
    }

    const normLib  = libraryFolder.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()
    const normFile = filePath.replace(/\\/g, '/').toLowerCase()
    const isInside = normFile.startsWith(normLib + '/')

    if (isInside) {
      await loadFileIntoPlayer(filePath)
      return
    }

    // File is outside the library — copy in, rescan, then load the copy
    try {
      const destPath = await window.electronAPI.copyMidiToLibrary(filePath, libraryFolder)
      const files    = await window.electronAPI.scanMidiFolder(libraryFolder)
      store.setLibraryFiles(files)
      await loadFileIntoPlayer(destPath)
    } catch (err) {
      console.error('[Orfeo] copyMidiToLibrary failed:', err)
      showDropError('Could not copy file into library.')
    }
  }, [stop, showDropError, loadFileIntoPlayer])

  // ── Validate that a DataTransfer item is a supported file format ─────────────
  function isSupportedFile(file: File): boolean {
    return /\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx)$/i.test(file.name)
  }

  // ── dragover: prevent browser default navigation + show highlight ─────────
  // OS file drags trigger the import overlay. Internal drags (TrackPanel/
  // Console/Library row reorders — no 'Files' type) still get preventDefault
  // here so the cursor stays a plain 'move' whenever the pointer crosses a
  // gap between row-level drop targets — without it, Chromium falls back to
  // the native no-drop icon in every such gap, which reads as a blinking
  // red circle during any internal drag.
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) { e.preventDefault(); return }
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  // ── dragleave: only clear highlight when leaving the container entirely ────
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }, [])

  // ── drop: validate, then load or confirm ─────────────────────────────────
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes('Files')) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const file = e.dataTransfer.files[0]
    if (!file) return

    if (!isSupportedFile(file)) {
      showDropError('Unsupported file type. Orfeo accepts .mid, .musicxml, .mxl, .gp/.gp5, and .kar files.')
      return
    }

    const filePath = window.electronAPI.getPathForFile(file)

    if (useStore.getState().midi !== null) {
      // A file is already loaded — ask before replacing
      const fileName = filePath.replace(/\\/g, '/').split('/').pop() ?? filePath
      const label    = fileName.length > 40 ? fileName.slice(0, 37) + '…' : fileName
      const choice   = await confirmDialog({
        message: `Load "${label}"? This will replace the currently open file.`,
        buttons: ['Load File', 'Cancel'],
      })
      if (choice === 0) await loadDroppedFilePath(filePath)
    } else {
      await loadDroppedFilePath(filePath)
    }
  }, [loadDroppedFilePath, showDropError])


  // ── Dev-only: expose Phase 0 round-trip test on window ───────────────────
  useEffect(() => {
    if (import.meta.env.DEV) {
      (window as any).__orfeoNoteEditorRoundTripTest = runNoteEditorRoundTripTest
      ;(window as any).__orfeoHandAssignmentTest = runHandAssignmentTest
      ;(window as any).__orfeoHandMetadataTest = runHandMetadataTest
    }
  }, [])

  // ── Resolve all pending state before closing — single authoritative handler ─
  // main.ts sends app:save-before-close on every close attempt; this handler
  // runs each check in sequence via confirmDialog() and only calls confirmClose()
  // when everything is resolved. Returning without calling confirmClose() leaves
  // the app open (user cancelled one of the dialogs).
  useEffect(() => {
    const handler = async () => {
      // 1. Note Editor unsaved changes
      if (NES.dirty) {
        const choice = await confirmDialog({
          title: 'Unsaved Changes',
          message: 'You have unsaved changes in the Note Editor.',
          buttons: ['Save', 'Discard', 'Cancel'],
        })
        if (choice === 2) return  // Cancel — leave app open
        if (choice === 0) {
          const ok = await NES.onSaveRequest?.()
          if (!ok) return         // save failed or cancelled — leave app open
        }
        // Discard (1) or successful save — fall through
      }

      // 2. Tempo/Key unsaved changes (only if the Settings toggle is on)
      {
        const s = useStore.getState()
        const tempoKeyDirty = s.saveTempoKeyChangesEnabled && !!s.midi &&
          (s.bpm !== s.originalBpm || (s.detectedKey?.transpose ?? 0) !== 0)
        if (tempoKeyDirty) {
          const choice = await confirmDialog({
            title: 'Unsaved Tempo/Key Changes',
            message: 'You have unsaved tempo/key changes.',
            buttons: ['Save', 'Discard', 'Cancel'],
          })
          if (choice === 2) return  // Cancel — leave app open
          if (choice === 0) {
            const ok = await saveTempoKeyChanges()
            if (!ok) return
          }
        }
      }

      // 3. Pending imported file (MusicXML/GP converted but not yet saved as .mid)
      const pending = useStore.getState().pendingImportedFile
      if (pending) {
        const libraryFolder = (useStore.getState() as any).libraryFolder as string | null ?? null
        const cachePath = getCachePath(pending.sourcePath, libraryFolder)
        const choice = await confirmDialog({
          message: `Save imported file "${pending.fileName}" as a MIDI file?`,
          detail: `The original file is never modified.`,
          buttons: ['Save as MID', "Don't Save", 'Cancel'],
        })
        if (choice === 2) return  // Cancel — leave app open
        if (choice === 0) {
          await (window.electronAPI as any).writeCachedImport(cachePath, pending.midiBase64)
        }
        useStore.getState().setPendingImportedFile(null)
      }

      // Nothing left pending — tell main process it is safe to close
      window.electronAPI.confirmClose()
    }
    window.electronAPI.onSaveBeforeClose(handler)
    return () => window.electronAPI.offSaveBeforeClose()
  }, [])

  // ── Presentation Mode side effects — OS fullscreen + Note Editor teardown ──
  useEffect(() => {
    window.electronAPI.setFullScreen(presentationMode)
    if (presentationMode) {
      setHeaderVisible(false)
      useStore.getState().setNoteEditorActive(false)
    }
  }, [presentationMode])

  // ── Unsolo edit track when Note Editor exits ─────────────────────────────
  useEffect(() => {
    let prev = useStore.getState().noteEditorActive
    return useStore.subscribe((s) => {
      if (!s.noteEditorActive && prev) useStore.getState().unsoloTrackForEdit()
      prev = s.noteEditorActive
    })
  }, [])

  // ── Enter Presentation Mode with NES dirty-check guard ───────────────────
  // If Note Editor has unsaved changes, prompts Save/Discard/Cancel before
  // entering. Mirrors the pattern in SettingsPanel.handleLoadFile.
  const enterPresentationMode = useCallback(async () => {
    const { noteEditorActive } = useStore.getState()
    if (noteEditorActive && NES.dirty) {
      const choice = await confirmDialog({
        title: 'Unsaved Changes',
        message: 'Save note editor changes before entering Presentation Mode?',
        detail: 'Your edits will be preserved in the file.',
        buttons: ['Save', 'Discard', 'Cancel'],
      })
      if (choice === 2) return
      if (choice === 0) {
        const ok = await NES.onSaveRequest?.()
        if (!ok) return
      }
      NES.dirty = false
    }
    useStore.getState().setPresentationMode(true)
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const { playbackState } = useStore.getState()
      switch (e.key) {
        case 'F11':
          e.preventDefault()
          if (useStore.getState().presentationMode) useStore.getState().setPresentationMode(false)
          else enterPresentationMode()
          break
        case ' ':
          e.preventDefault()
          if (useStore.getState().chordExplorerOpen || useStore.getState().scaleExplorerOpen) break
          if (playbackState === 'playing') pause()
          else play()
          break
        case 'Escape':
          if (useStore.getState().presentationMode) { useStore.getState().setPresentationMode(false); break }
          // Chord Explorer, Scale Explorer, and the Locked Chord modal all have
          // their own Escape handler (closes the panel without stopping
          // playback) — none of them call stopPropagation, and this listener
          // (registered at app mount) fires before theirs, so skip stop() here
          // while any is open or it would fire in addition to the close.
          if (useStore.getState().chordExplorerOpen || useStore.getState().scaleExplorerOpen || useStore.getState().lockedChordModalOpen) break
          stop()
          break
        case 'o':
        case 'O':
          if (e.ctrlKey) { e.preventDefault(); openFile() }
          break
        case 'm':
        case 'M':
          if (e.ctrlKey && e.shiftKey) {
            e.preventDefault()
            const s = useStore.getState()
            s.setMixerOpen(!s.mixerOpen)
          }
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [play, pause, stop, openFile, enterPresentationMode])

  // ── Global: blur non-text controls after a real mouse click ─────────────
  // `:focus-visible` (index.css) is spec-correct, not buggy — but it isn't
  // "did THIS keypress activate THIS element," it's "is the page's input
  // modality currently keyboard AND does this element currently have
  // focus." A mouse click leaves a button focused (normal browser
  // behavior); the very next keypress ANYWHERE — including Space for
  // play/pause, which is a global shortcut here and doesn't even depend on
  // focus — flips that modality flag and the stale-focused button suddenly
  // shows its ring, for a keypress that had nothing to do with it. Blurring
  // right after a genuine mouse click removes the stale focus so there's
  // nothing left for a later keypress to light up.
  // `event.detail === 0` is what distinguishes a real pointer click from a
  // synthetic 'click' the browser fires when Enter/Space activates a
  // focused element via the keyboard — that case is skipped so real
  // keyboard activation keeps its ring exactly as intended. Text-entry
  // elements are excluded since clicking into an input must keep it
  // focused to type. ─────────────────────────────────────────────────────
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (e.detail === 0) return
      const el = e.target
      // Element, not HTMLElement — most of this app's buttons render an SVG
      // icon as their visible content, and a click's real target is often
      // that <svg>/<path>, not the <button> itself. SVGElement is NOT an
      // HTMLElement (separate DOM interfaces), so the HTMLElement check
      // silently rejected every icon-button click before ever reaching
      // .closest() — confirmed live via a real CDP-dispatched click on the
      // Play button, which stayed focused because of exactly this. .closest()
      // itself works fine starting from an SVG element in any current browser.
      if (!(el instanceof Element)) return
      const focusable = el.closest<HTMLElement>('button, a[href], [role="button"], [tabindex]')
      if (!focusable) return
      if (focusable.matches('input, textarea, select') || focusable.isContentEditable) return
      focusable.blur()
    }
    document.addEventListener('click', handleClick, true)
    return () => document.removeEventListener('click', handleClick, true)
  }, [])

  return (
    <div className={appTheme === 'warm' ? 'theme-warm' : ''} style={{ width: '100vw', height: '100vh', background: appTheme === 'warm' ? 'var(--bg-warm)' : 'var(--bg-modal-header)', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: 'var(--font-ui)' }}>

      {/* ── Presentation Mode: TopBar slides in from top on hover ─────────────
          In normal mode TopBar is in-flow; in PM it becomes a fixed overlay. ── */}
      {presentationMode ? (
        <>
          {/* Hover zone — 8px strip at top edge that reveals the header ────── */}
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, height: 8,
              zIndex: 10001,
              pointerEvents: headerVisible ? 'none' : 'auto',
            }}
            onMouseEnter={() => {
              if (hideHeaderTimerRef.current) clearTimeout(hideHeaderTimerRef.current)
              setHeaderVisible(true)
            }}
          />
          {/* Sliding TopBar wrapper — translates up when hidden ────────────── */}
          <div
            style={{
              position: 'fixed', top: 0, left: 0, right: 0, zIndex: 10000,
              transform: headerVisible ? 'translateY(0)' : 'translateY(-100%)',
              transition: 'transform 0.25s ease',
            }}
            onMouseEnter={() => {
              if (hideHeaderTimerRef.current) clearTimeout(hideHeaderTimerRef.current)
            }}
            onMouseLeave={() => {
              if (hideHeaderTimerRef.current) clearTimeout(hideHeaderTimerRef.current)
              hideHeaderTimerRef.current = setTimeout(() => setHeaderVisible(false), 400)
            }}
          >
            <TopBar />
            <div style={{ height: 1, background: 'var(--state-hover-bg)' }} />
          </div>
        </>
      ) : (
        <>
          <TopBar />
          {/* ── Full-width separator — sibling to TopBar so it renders below the ─
              Electron native title-bar chrome and spans all columns reliably ── */}
          <div style={{ height: 1, background: 'var(--state-hover-bg)', flexShrink: 0 }} />
        </>
      )}

      {/* ── Drop zone — spans the full area below TopBar including both drawers ── */}
      <div
        style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}
        onDragEnter={handleDragOver}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!presentationMode && <SettingsPanel />}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div data-piano-roll-area style={{ flex: 1, minHeight: 0, position: 'relative', paddingTop: 6 }}>
            {midi ? <PianoRoll /> : <EmptyState />}
          </div>
          {keyboardMode === 'docked' && <Keyboard />}
          {keyboardMode === 'docked' && <KeyboardControls />}
        </div>
        {!presentationMode && <TrackPanel />}

        {/* ── Drag-over highlight overlay — pointer-events none so it doesn't ─
            block any child interaction; visible only while dragging ── */}
        {isDragOver && (
          <div style={{
            position: 'absolute', inset: 0,
            border: '2px solid var(--text-amber)',
            borderRadius: 4,
            background: 'var(--accent-amber-tint-bg)',
            pointerEvents: 'none',
            zIndex: 9000,
          }} />
        )}
      </div>

      {keyboardMode === 'floating' && <FloatingKeyboard />}
      <ChordExplorer />
      <ScaleExplorer />
      <LockedChordModal />

      {/* ── Drop error toast — briefly shown for invalid file types. Click-to-
          dismiss alongside the 2.5s auto-clear timeout — if the user's eyes
          were on the file they dropped rather than this bottom-center toast,
          the explanation could otherwise vanish before it's read. ────────── */}
      {dropError && (
        <div
          role="alert"
          onClick={() => {
            if (dropErrorTimer.current) clearTimeout(dropErrorTimer.current)
            setDropError(null)
          }}
          title="Click to dismiss"
          style={{
            position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
            background: 'var(--bg-panel2)', border: '1px solid var(--drag-handle-dot)',
            borderRadius: 6, padding: '8px 18px',
            color: 'var(--text-default)', fontSize: 'var(--text-sm)',
            cursor: 'pointer', zIndex: 9900,
            boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
          }}>
          {dropError}
        </div>
      )}

      {/* ── Mixer Console — floating modal, toggled via Ctrl+Shift+M or Console drawer icon ── */}
      <MixerConsole />

      {/* ── MIDI Playback Editor — floating modal, opened via Track Panel pencil icon ── */}
      <MidiEditor />

      {/* ── Note Editor Toolbar — floating draggable toolbar, toggled via pencil icon or Ctrl+Shift+N ── */}
      <NoteEditorToolbar />

      {/* ── Confirm Dialog — themed replace for all native confirm/messageBox popups ── */}
      <ConfirmDialogHost />

    </div>
  )
}
