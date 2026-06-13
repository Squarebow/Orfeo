import { create } from 'zustand'
import type {
  ParsedMidi,
  ParsedTrack,
  PlaybackState,
  TrackState,
  KeyboardSize,
  KeyboardMode,
  NoteNaming,
} from '../types'

// ─── Store Shape ─────────────────────────────────────────────────────────────

interface OrfeoStore {
  // MIDI data
  midi: ParsedMidi | null
  setMidi: (midi: ParsedMidi | null) => void

  // Playback
  playbackState: PlaybackState
  currentTime: number       // seconds
  bpm: number               // current (possibly adjusted) BPM
  originalBpm: number       // BPM from MIDI file
  loopEnabled: boolean
  loopStart: number         // seconds
  loopEnd: number           // seconds

  setPlaybackState: (state: PlaybackState) => void
  setCurrentTime: (time: number) => void
  setBpm: (bpm: number) => void
  resetBpm: () => void
  setLoop: (enabled: boolean, start?: number, end?: number) => void

  // Tracks
  tracks: TrackState[]
  setTracks: (tracks: TrackState[]) => void
  updateTrack: (index: number, patch: Partial<TrackState>) => void

  // Keyboard
  keyboardSize: KeyboardSize
  keyboardMode: KeyboardMode
  activeKeys: Set<number>   // MIDI pitches currently lit

  setKeyboardSize: (size: KeyboardSize) => void
  setKeyboardMode: (mode: KeyboardMode) => void
  setActiveKeys: (keys: Set<number>) => void

  // Settings
  noteNaming: NoteNaming
  zoomLevel: number         // 1 = default, 0.5 = zoomed out, 2 = zoomed in

  setNoteNaming: (naming: NoteNaming) => void
  setZoomLevel: (zoom: number) => void

  // UI
  trackPanelOpen: boolean
  settingsOpen: boolean
  setTrackPanelOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
}

// ─── Track state factory ─────────────────────────────────────────────────────

function makeTrackState(track: ParsedTrack): TrackState {
  return {
    index: track.index,
    name: track.name,
    color: track.color,
    muted: false,
    solo: false,
    visible: true,
    volume: 1,
    pan: 0,
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useStore = create<OrfeoStore>((set, get) => ({
  // MIDI
  midi: null,
  setMidi: (midi) => {
    if (!midi) {
      set({ midi: null, tracks: [], currentTime: 0, playbackState: 'stopped' })
      return
    }
    const tracks = midi.tracks.map(makeTrackState)
    set({
      midi,
      tracks,
      currentTime: 0,
      playbackState: 'stopped',
      bpm: midi.bpm,
      originalBpm: midi.bpm,
    })
  },

  // Playback
  playbackState: 'stopped',
  currentTime: 0,
  bpm: 120,
  originalBpm: 120,
  loopEnabled: false,
  loopStart: 0,
  loopEnd: 0,

  setPlaybackState: (playbackState) => set({ playbackState }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setBpm: (bpm) => set({ bpm }),
  resetBpm: () => set((s) => ({ bpm: s.originalBpm })),
  setLoop: (loopEnabled, loopStart, loopEnd) =>
    set((s) => ({
      loopEnabled,
      loopStart: loopStart ?? s.loopStart,
      loopEnd: loopEnd ?? s.loopEnd,
    })),

  // Tracks
  tracks: [],
  setTracks: (tracks) => set({ tracks }),
  updateTrack: (index, patch) =>
    set((s) => ({
      tracks: s.tracks.map((t) => (t.index === index ? { ...t, ...patch } : t)),
    })),

  // Keyboard
  keyboardSize: 88,
  keyboardMode: 'docked',
  activeKeys: new Set(),

  setKeyboardSize: (keyboardSize) => set({ keyboardSize }),
  setKeyboardMode: (keyboardMode) => set({ keyboardMode }),
  setActiveKeys: (activeKeys) => set({ activeKeys }),

  // Settings
  noteNaming: 'english',
  zoomLevel: 1,

  setNoteNaming: (noteNaming) => set({ noteNaming }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),

  // UI
  trackPanelOpen: true,
  settingsOpen: false,
  setTrackPanelOpen: (trackPanelOpen) => set({ trackPanelOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}))
