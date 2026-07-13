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
import { parseMidiBuffer } from './utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from './utils/keyDetection'
import { useMidiFile } from './hooks/useMidiFile'
import { usePlayback } from './hooks/usePlayback'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useMetronome } from './hooks/useMetronome'
import { useChordSequence } from './hooks/useChordSequence'
import { useMidiInput } from './hooks/useMidiInput'

export default function App() {
  const midi = useStore((s) => s.midi)
  const keyboardMode = useStore((s) => s.keyboardMode)
  const appTheme = useStore((s) => s.appTheme)
  const { openFile } = useMidiFile()
  const { play, pause, stop } = usePlayback()
  useAudioEngine()
  useMidiInput()
  useMetronome()
  useChordSequence()

  // ── Drag-and-drop state ───────────────────────────────────────────────────
  const [isDragOver, setIsDragOver]           = useState(false)
  const [dropConfirmPath, setDropConfirmPath] = useState<string | null>(null)
  const [dropError, setDropError]             = useState<string | null>(null)
  const dropErrorTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Show a timed error message, clearing any previous timer ──────────────
  const showDropError = useCallback((msg: string) => {
    if (dropErrorTimer.current) clearTimeout(dropErrorTimer.current)
    setDropError(msg)
    dropErrorTimer.current = setTimeout(() => setDropError(null), 2500)
  }, [])

  // ── Parse and load a MIDI file by OS path into the player ───────────────
  // Uses the same utilities as App.tsx's onMidiReload handler — parseMidiBuffer
  // and key detection are imported here, unlike store/index.ts where they are not.
  const loadFileIntoPlayer = useCallback(async (filePath: string) => {
    const result = await window.electronAPI.loadMidiFromPath(filePath)
    if (!result) return
    const binary = atob(result.base64)
    const bytes  = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const parsed = parseMidiBuffer(bytes.buffer, result.fileName, result.filePath ?? '')
    useStore.getState().setMidi(parsed)
    const raw = parsed as any
    if (raw._keySignature != null) {
      useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
    } else {
      useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
    }
  }, [])

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

  // ── Validate that a DataTransfer item is a .mid / .midi file ─────────────
  function isMidiFile(file: File): boolean {
    return /\.(mid|midi)$/i.test(file.name)
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

    if (!isMidiFile(file)) {
      showDropError('Only .mid / .midi files are supported.')
      return
    }

    const filePath = window.electronAPI.getPathForFile(file)

    if (useStore.getState().midi !== null) {
      // A file is already loaded — ask before replacing
      setDropConfirmPath(filePath)
    } else {
      await loadDroppedFilePath(filePath)
    }
  }, [loadDroppedFilePath, showDropError])

  useEffect(() => {
    if (!window.electronAPI?.onMidiReload) return
    window.electronAPI.onMidiReload((result: any) => {
      if (!result) return
      const binary = atob(result.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const parsed = parseMidiBuffer(bytes.buffer, result.fileName, result.filePath ?? '')
      useStore.getState().setMidi(parsed)
      const raw = parsed as any
      if (raw._keySignature) {
        useStore.getState().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
      } else {
        useStore.getState().setDetectedKey(detectKeyFromTracks(parsed.tracks))
      }
    })
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const { playbackState } = useStore.getState()
      switch (e.key) {
        case ' ':
          e.preventDefault()
          if (useStore.getState().chordExplorerOpen || useStore.getState().scaleExplorerOpen) break
          if (playbackState === 'playing') pause()
          else play()
          break
        case 'Escape':
          if (useStore.getState().chordExplorerOpen || useStore.getState().scaleExplorerOpen) break
          stop()
          break
        case 'o':
        case 'O':
          if (e.ctrlKey) { e.preventDefault(); openFile() }
          break
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [play, pause, stop, openFile])

  if (window.location.hash === '#/editor') return <MidiEditor />

  // ── Truncate long filenames for the confirm modal title ───────────────────
  const confirmFileName = dropConfirmPath
    ? dropConfirmPath.replace(/\\/g, '/').split('/').pop() ?? dropConfirmPath
    : ''
  const confirmLabel = confirmFileName.length > 40
    ? confirmFileName.slice(0, 37) + '…'
    : confirmFileName

  return (
    <div className={appTheme === 'warm' ? 'theme-warm' : ''} style={{ width: '100vw', height: '100vh', background: appTheme === 'warm' ? '#12100e' : '#0f0f12', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <TopBar />
      {/* ── Full-width separator — sibling to TopBar so it renders below the ─
          Electron native title-bar chrome and spans all columns reliably ── */}
      <div style={{ height: 1, background: '#2e2e3c', flexShrink: 0 }} />

      {/* ── Drop zone — spans the full area below TopBar including both drawers ── */}
      <div
        style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden', position: 'relative' }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <SettingsPanel />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, minHeight: 0, position: 'relative', paddingTop: 6 }}>
            {midi ? <PianoRoll /> : <EmptyState />}
          </div>
          {keyboardMode === 'docked' && <Keyboard />}
          {keyboardMode === 'docked' && <KeyboardControls />}
        </div>
        <TrackPanel />

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

      {/* ── Drop confirmation modal — shown when a file is already loaded ────── */}
      {dropConfirmPath && (
        <div
          style={{
            position: 'fixed', inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9800,
          }}
          onClick={() => setDropConfirmPath(null)}
        >
          <div
            style={{
              background: 'var(--panel)',
              border: '1px solid #404055',
              borderRadius: 8,
              padding: '24px 28px',
              minWidth: 320, maxWidth: 420,
              display: 'flex', flexDirection: 'column', gap: 8,
              boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* ── Modal header ─────────────────────────────────────────────── */}
            <div style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-active)' }}>
              Load "{confirmLabel}"?
            </div>
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-muted)', marginBottom: 12 }}>
              This will stop playback and replace the current file.
            </div>
            {/* ── Buttons ──────────────────────────────────────────────────── */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={() => setDropConfirmPath(null)}
                style={{
                  padding: '7px 18px', borderRadius: 5,
                  border: '1px solid #404055', background: 'transparent',
                  color: 'var(--text-muted)', fontSize: 'var(--text-sm)',
                  cursor: 'pointer', fontFamily: 'Inter',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text-default)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const path = dropConfirmPath
                  setDropConfirmPath(null)
                  await loadDroppedFilePath(path)
                }}
                style={{
                  padding: '7px 18px', borderRadius: 5,
                  border: 'none', background: 'var(--text-amber)',
                  color: '#0f0f12', fontSize: 'var(--text-sm)', fontWeight: 600,
                  cursor: 'pointer', fontFamily: 'Inter',
                }}
                onMouseEnter={e => e.currentTarget.style.opacity = '0.85'}
                onMouseLeave={e => e.currentTarget.style.opacity = '1'}
              >
                Load File
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
