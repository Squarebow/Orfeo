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
  resolveToMidiBase64,
  confirmPendingImportBeforeSwitch,
  detectForeignFormat,
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
import { NES } from './utils/noteEditorState'

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
    const proceed = await confirmPendingImportBeforeSwitch(filePath)
    if (!proceed) return // user cancelled — stay on current file

    const result = await window.electronAPI.loadMidiFromPath(filePath)
    if (!result) return

    let base64    = result.base64
    const parseName = result.fileName
    const libraryFolder = (useStore.getState() as any).libraryFolder as string | null ?? null

    try {
      const resolved = await resolveToMidiBase64(filePath, base64, libraryFolder)
      base64 = resolved.base64

      if (resolved.isPendingSave) {
        useStore.getState().setPendingImportedFile({
          sourcePath: filePath,
          format: detectForeignFormat(filePath)!,
          midiBase64: base64,
          fileName: result.fileName,
        })
      } else {
        useStore.getState().setPendingImportedFile(null)
      }
    } catch (e: any) {
      showDropError(e?.message ?? 'Could not convert this file to MIDI.')
      return
    }

    const bytes  = base64ToBytes(base64)
    const parsed = parseMidiBuffer(bytes.buffer as ArrayBuffer, parseName, filePath) // _filePath = original source
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
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  // ── dragleave: only clear highlight when leaving the container entirely ────
  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return
    setIsDragOver(false)
  }, [])

  // ── drop: validate, then load or confirm ─────────────────────────────────
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
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

      // 2. Pending imported file (MusicXML/GP converted but not yet saved as .mid)
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
          if (useStore.getState().chordExplorerOpen || useStore.getState().scaleExplorerOpen) break
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
            // Minimized → restore; Open → close; Closed → open
            if (s.mixerOpen && s.mixerMinimized) s.setMixerMinimized(false)
            else if (s.mixerOpen) s.setMixerOpen(false)
            else s.setMixerOpen(true)
          }
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [play, pause, stop, openFile, enterPresentationMode])

  return (
    <div className={appTheme === 'warm' ? 'theme-warm' : ''} style={{ width: '100vw', height: '100vh', background: appTheme === 'warm' ? '#12100e' : '#0f0f12', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif" }}>

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
            <div style={{ height: 1, background: '#2e2e3c' }} />
          </div>
        </>
      ) : (
        <>
          <TopBar />
          {/* ── Full-width separator — sibling to TopBar so it renders below the ─
              Electron native title-bar chrome and spans all columns reliably ── */}
          <div style={{ height: 1, background: '#2e2e3c', flexShrink: 0 }} />
        </>
      )}

      {/* ── Drop zone — spans the full area below TopBar including both drawers ── */}
      <div
        style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {!presentationMode && <SettingsPanel />}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, minHeight: 0, position: 'relative', paddingTop: 6 }}>
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
            background: 'rgba(232, 160, 39, 0.06)',
            pointerEvents: 'none',
            zIndex: 9000,
          }} />
        )}
      </div>

      {keyboardMode === 'floating' && <FloatingKeyboard />}
      <ChordExplorer />
      <ScaleExplorer />
      <LockedChordModal />

      {/* ── Drop error toast — briefly shown for invalid file types ─────────── */}
      {dropError && (
        <div style={{
          position: 'fixed', bottom: 32, left: '50%', transform: 'translateX(-50%)',
          background: '#2d2d2d', border: '1px solid #404055',
          borderRadius: 6, padding: '8px 18px',
          color: 'var(--text-default)', fontSize: 'var(--text-sm)',
          pointerEvents: 'none', zIndex: 9900,
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
