import { useEffect, useCallback } from 'react'
import TopBar from './components/Transport/TopBar'
import PianoRoll from './components/PianoRoll/PianoRoll'
import Keyboard from './components/Keyboard/Keyboard'
import KeyboardControls from './components/Keyboard/KeyboardControls'
import TrackPanel from './components/TrackPanel/TrackPanel'
import EmptyState from './components/EmptyState'
import { useStore } from './store'
import { useMidiFile } from './hooks/useMidiFile'
import { usePlayback } from './hooks/usePlayback'
import { useAudioEngine } from './hooks/useAudioEngine'

export default function App() {
  const midi = useStore((s) => s.midi)
  const playbackState = useStore((s) => s.playbackState)
  const { openFile } = useMidiFile()
  const { play, pause, stop } = usePlayback()

  // Wire up audio engine — runs silently in background
  useAudioEngine()

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
    switch (e.key) {
      case ' ':
        e.preventDefault()
        if (playbackState === 'playing') pause()
        else play()
        break
      case 'Escape':
        stop()
        break
      case 'o':
      case 'O':
        if (e.ctrlKey) { e.preventDefault(); openFile() }
        break
    }
  }, [playbackState, play, pause, stop, openFile])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  return (
    <div
      style={{
        width: '100vw', height: '100vh',
        background: '#0f0f12', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      <TopBar />
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, overflow: 'hidden' }}>
          <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
            {midi ? <PianoRoll /> : <EmptyState />}
          </div>
          <Keyboard />
          <KeyboardControls />
        </div>
        <TrackPanel />
      </div>
    </div>
  )
}
