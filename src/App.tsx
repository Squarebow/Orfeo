import { useEffect } from 'react'
import { useStore } from '@/store'
import { useMidiDevice } from '@/hooks/useMidiDevice'
import { useChordDetection } from '@/hooks/useChordDetection'
import TopBar from '@/components/Transport/TopBar'
import PianoRoll from '@/components/PianoRoll/PianoRoll'
import Keyboard from '@/components/Keyboard/Keyboard'
import KeyboardControls from '@/components/Keyboard/KeyboardControls'
import TrackPanel from '@/components/TrackPanel/TrackPanel'
import BarRuler from '@/components/BarRuler/BarRuler'
import Settings from '@/components/Settings/Settings'

export default function App() {
  const { isTrackPanelOpen, isSettingsOpen, settings } = useStore()
  const { isConnected, deviceName } = useMidiDevice()
  useChordDetection()

  return (
    <div className="app-root">

      {/* Title bar drag region (custom titlebar) */}
      <div className="titlebar-drag" />

      {/* Top bar — transport, file info, chord display */}
      <TopBar midiConnected={isConnected} deviceName={deviceName} />

      {/* Main content area */}
      <div className="main-area">

        {/* Bar ruler — left edge */}
        {settings.showBarRuler && <BarRuler />}

        {/* Piano roll — center, fills remaining space */}
        <div className="piano-roll-area">
          <PianoRoll />

          {/* Keyboard — docked at bottom of piano roll */}
          {settings.keyboardMode === 'docked' && <Keyboard />}
        </div>

        {/* Track panel — collapsible right drawer */}
        <TrackPanel isOpen={isTrackPanelOpen} />
      </div>

      {/* Bottom controls strip */}
      <KeyboardControls />

      {/* Floating keyboard (when undocked) */}
      {settings.keyboardMode === 'float' && <Keyboard floating />}

      {/* Settings modal */}
      {isSettingsOpen && <Settings />}

    </div>
  )
}
