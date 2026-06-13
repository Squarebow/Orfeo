import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type {
  MidiFile, MidiTrack, PlaybackState, PlaybackPosition,
  LoopRegion, AppSettings, DetectedChord, KeyState, KeyboardSize
} from '@/types'

// ─── Playback Slice ───────────────────────────────────────────────────────────

interface PlaybackSlice {
  midiFile: MidiFile | null
  playbackState: PlaybackState
  position: PlaybackPosition
  tempo: number           // current BPM (may differ from file BPM)
  tempoPercent: number    // % of original
  loopRegion: LoopRegion
  setMidiFile: (file: MidiFile) => void
  setPlaybackState: (state: PlaybackState) => void
  setPosition: (pos: PlaybackPosition) => void
  setTempo: (bpm: number) => void
  setTempoPercent: (pct: number) => void
  resetTempo: () => void
  setLoopRegion: (region: Partial<LoopRegion>) => void
}

// ─── Track Slice ─────────────────────────────────────────────────────────────

interface TrackSlice {
  tracks: MidiTrack[]
  setTracks: (tracks: MidiTrack[]) => void
  updateTrack: (index: number, updates: Partial<MidiTrack>) => void
  toggleMute: (index: number) => void
  toggleSolo: (index: number) => void
  toggleVisible: (index: number) => void
  setTrackColor: (index: number, color: string) => void
  setTrackVolume: (index: number, volume: number) => void
  setTrackPan: (index: number, pan: number) => void
}

// ─── Keyboard Slice ───────────────────────────────────────────────────────────

interface KeyboardSlice {
  activeKeys: Map<number, KeyState>
  pressKey: (midi: number, color: string, source: KeyState['source']) => void
  releaseKey: (midi: number) => void
  releaseAllKeys: () => void
}

// ─── Chord Slice ─────────────────────────────────────────────────────────────

interface ChordSlice {
  currentChord: DetectedChord | null
  setCurrentChord: (chord: DetectedChord | null) => void
}

// ─── Settings Slice ───────────────────────────────────────────────────────────

interface SettingsSlice {
  settings: AppSettings
  updateSettings: (updates: Partial<AppSettings>) => void
  isTrackPanelOpen: boolean
  isChordLibraryOpen: boolean
  isSettingsOpen: boolean
  toggleTrackPanel: () => void
  toggleChordLibrary: () => void
  toggleSettings: () => void
}

// ─── Combined Store ───────────────────────────────────────────────────────────

type OrcheaStore = PlaybackSlice & TrackSlice & KeyboardSlice & ChordSlice & SettingsSlice

const DEFAULT_SETTINGS: AppSettings = {
  noteNaming: 'english',
  noteDirection: 'down',
  keyboardSize: 88,
  keyboardMode: 'docked',
  keyboardPosition: { x: 0, y: 0 },
  showChordDisplay: true,
  showKeySignature: false,
  showBarRuler: true,
  metronomeEnabled: false,
  countInBeats: 0,
  theme: 'dark',
}

export const useStore = create<OrcheaStore>()(
  persist(
    (set, get) => ({
      // ── Playback ──
      midiFile: null,
      playbackState: 'stopped',
      position: { seconds: 0, bar: 1, beat: 1 },
      tempo: 120,
      tempoPercent: 100,
      loopRegion: { startBar: 1, endBar: 4, active: false },

      setMidiFile: (file) => set({
        midiFile: file,
        tracks: file.tracks,
        tempo: file.bpm,
        tempoPercent: 100,
        position: { seconds: 0, bar: 1, beat: 1 },
        playbackState: 'stopped',
      }),

      setPlaybackState: (state) => set({ playbackState: state }),
      setPosition: (pos) => set({ position: pos }),

      setTempo: (bpm) => set((s) => ({
        tempo: bpm,
        tempoPercent: s.midiFile
          ? Math.round((bpm / s.midiFile.bpm) * 100)
          : 100
      })),

      setTempoPercent: (pct) => set((s) => ({
        tempoPercent: pct,
        tempo: s.midiFile ? Math.round(s.midiFile.bpm * pct / 100) : 120
      })),

      resetTempo: () => set((s) => ({
        tempo: s.midiFile?.bpm ?? 120,
        tempoPercent: 100,
      })),

      setLoopRegion: (region) => set((s) => ({
        loopRegion: { ...s.loopRegion, ...region }
      })),

      // ── Tracks ──
      tracks: [],
      setTracks: (tracks) => set({ tracks }),

      updateTrack: (index, updates) => set((s) => ({
        tracks: s.tracks.map((t, i) => i === index ? { ...t, ...updates } : t)
      })),

      toggleMute: (index) => set((s) => ({
        tracks: s.tracks.map((t, i) => i === index ? { ...t, muted: !t.muted } : t)
      })),

      toggleSolo: (index) => set((s) => ({
        tracks: s.tracks.map((t, i) => i === index ? { ...t, solo: !t.solo } : t)
      })),

      toggleVisible: (index) => set((s) => ({
        tracks: s.tracks.map((t, i) => i === index ? { ...t, visible: !t.visible } : t)
      })),

      setTrackColor: (index, color) => set((s) => ({
        tracks: s.tracks.map((t, i) => i === index ? { ...t, color } : t)
      })),

      setTrackVolume: (index, volume) => set((s) => ({
        tracks: s.tracks.map((t, i) => i === index ? { ...t, volume } : t)
      })),

      setTrackPan: (index, pan) => set((s) => ({
        tracks: s.tracks.map((t, i) => i === index ? { ...t, pan } : t)
      })),

      // ── Keyboard ──
      activeKeys: new Map(),

      pressKey: (midi, color, source) => set((s) => {
        const next = new Map(s.activeKeys)
        next.set(midi, { midi, pressed: true, color, source })
        return { activeKeys: next }
      }),

      releaseKey: (midi) => set((s) => {
        const next = new Map(s.activeKeys)
        next.delete(midi)
        return { activeKeys: next }
      }),

      releaseAllKeys: () => set({ activeKeys: new Map() }),

      // ── Chord ──
      currentChord: null,
      setCurrentChord: (chord) => set({ currentChord: chord }),

      // ── Settings ──
      settings: DEFAULT_SETTINGS,
      updateSettings: (updates) => set((s) => ({
        settings: { ...s.settings, ...updates }
      })),

      isTrackPanelOpen: false,
      isChordLibraryOpen: false,
      isSettingsOpen: false,
      toggleTrackPanel: () => set((s) => ({ isTrackPanelOpen: !s.isTrackPanelOpen })),
      toggleChordLibrary: () => set((s) => ({ isChordLibraryOpen: !s.isChordLibraryOpen })),
      toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
    }),
    {
      name: 'orfeo-settings',
      // Only persist settings, not playback state
      partialize: (s) => ({ settings: s.settings }),
    }
  )
)
