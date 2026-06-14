import { create } from 'zustand'
import type {
  ParsedMidi, ParsedTrack, PlaybackState, TrackState,
  KeyboardSize, KeyboardMode, NoteNaming,
} from '../types'

interface OrfeoStore {
  midi: ParsedMidi | null
  setMidi: (midi: ParsedMidi | null) => void

  playbackState: PlaybackState
  currentTime: number
  bpm: number
  originalBpm: number
  loopEnabled: boolean
  loopStart: number
  loopEnd: number

  setPlaybackState: (state: PlaybackState) => void
  setCurrentTime: (time: number) => void
  setBpm: (bpm: number) => void
  resetBpm: () => void
  setLoop: (enabled: boolean, start?: number, end?: number) => void

  tracks: TrackState[]
  setTracks: (tracks: TrackState[]) => void
  updateTrack: (index: number, patch: Partial<TrackState>) => void

  keyboardSize: KeyboardSize
  keyboardMode: KeyboardMode
  activeKeys: Set<number>
  activeKeyColors: Map<number, string>  // midi -> track color

  setKeyboardSize: (size: KeyboardSize) => void
  setKeyboardMode: (mode: KeyboardMode) => void
  setActiveKeys: (keys: Set<number>) => void
  setActiveKeyColors: (colors: Map<number, string>) => void

  noteNaming: NoteNaming
  zoomLevel: number
  setNoteNaming: (naming: NoteNaming) => void
  setZoomLevel: (zoom: number) => void

  trackPanelOpen: boolean
  settingsOpen: boolean
  setTrackPanelOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
}

function makeTrackState(track: ParsedTrack): TrackState {
  return {
    index: track.index, name: track.name, color: track.color,
    muted: false, solo: false, visible: true, volume: 1, pan: 0,
  }
}

export const useStore = create<OrfeoStore>((set, get) => ({
  midi: null,
  setMidi: (midi) => {
    if (!midi) { set({ midi: null, tracks: [], currentTime: 0, playbackState: 'stopped' }); return }
    set({
      midi, tracks: midi.tracks.map(makeTrackState),
      currentTime: 0, playbackState: 'stopped',
      bpm: midi.bpm, originalBpm: midi.bpm,
    })
  },

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
    set((s) => ({ loopEnabled, loopStart: loopStart ?? s.loopStart, loopEnd: loopEnd ?? s.loopEnd })),

  tracks: [],
  setTracks: (tracks) => set({ tracks }),
  updateTrack: (index, patch) =>
    set((s) => ({ tracks: s.tracks.map((t) => (t.index === index ? { ...t, ...patch } : t)) })),

  keyboardSize: 88,
  keyboardMode: 'docked',
  activeKeys: new Set(),
  activeKeyColors: new Map(),

  setKeyboardSize: (keyboardSize) => set({ keyboardSize }),
  setKeyboardMode: (keyboardMode) => set({ keyboardMode }),
  setActiveKeys: (activeKeys) => set({ activeKeys }),
  setActiveKeyColors: (activeKeyColors) => set({ activeKeyColors }),

  noteNaming: 'english',
  zoomLevel: 1,
  setNoteNaming: (noteNaming) => set({ noteNaming }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),

  trackPanelOpen: true,
  settingsOpen: false,
  setTrackPanelOpen: (trackPanelOpen) => set({ trackPanelOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
}))