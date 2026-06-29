import { useEffect } from 'react'
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
import ChordPrompter from './components/ChordPrompter'
import MidiEditor from './components/MidiEditor/MidiEditor'
import { parseMidiBuffer } from './utils/midiParser'
import { detectKeyFromTracks, parseKeySignature } from './utils/keyDetection'
import { useMidiFile } from './hooks/useMidiFile'
import { usePlayback } from './hooks/usePlayback'
import { useAudioEngine } from './hooks/useAudioEngine'
import { useMetronome } from './hooks/useMetronome'
import { useChordSequence } from './hooks/useChordSequence'

export default function App() {
  const midi = useStore((s) => s.midi)
  const keyboardMode = useStore((s) => s.keyboardMode)
  const appTheme = useStore((s) => s.appTheme)
  const { openFile } = useMidiFile()
  const { play, pause, stop } = usePlayback()
  useAudioEngine()
  useMetronome()
  useChordSequence()

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

  return (
    <div className={appTheme === 'warm' ? 'theme-warm' : ''} style={{ width: '100vw', height: '100vh', background: appTheme === 'warm' ? '#12100e' : '#0f0f12', overflow: 'hidden', display: 'flex', flexDirection: 'column', fontFamily: "'Inter', system-ui, sans-serif" }}>
      <TopBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <SettingsPanel />
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, minHeight: 0, position: 'relative', paddingTop: 6 }}>
            {midi ? <PianoRoll /> : <EmptyState />}
          </div>
          {keyboardMode === 'docked' && <Keyboard />}
          {keyboardMode === 'docked' && <KeyboardControls />}
        </div>
        <TrackPanel />
      </div>
      {keyboardMode === 'floating' && <FloatingKeyboard />}
      <ChordExplorer />
      <ScaleExplorer />
      <ChordPrompter />
    </div>
  )
}
