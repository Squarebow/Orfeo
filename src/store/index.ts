import { create } from 'zustand'
import type {
  ParsedMidi, ParsedTrack, PlaybackState, TrackState,
  KeyboardSize, KeyboardMode, NoteNaming, Accidentals, ChordEvent, TranscriptEntry,
} from '../types'
import type { DetectedKey } from '../utils/keyDetection'
import { isKeyboardInstrument } from '../utils/gmInstruments'

// Groups that are muted by default when a file opens (too distracting)
const DEFAULT_MUTED_GROUPS = new Set([
  'strings', 'ensemble', 'brass', 'reed', 'pipe',
  'synth_lead', 'synth_pad', 'synth_fx', 'ethnic',
  'percussive', 'sfx',
])

// Only these groups light up the piano keyboard
const KEYBOARD_DISPLAY_GROUPS = new Set(['piano', 'chromatic', 'organ'])

interface OrfeoStore {
  midi: ParsedMidi | null
  setMidi: (midi: ParsedMidi | null) => void
  barStarts: number[]

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
  muteGroup: (group: string, muted: boolean) => void

  keyboardSize: KeyboardSize
  keyboardMode: KeyboardMode
  activeKeys: Set<number>
  activeKeyColors: Map<number, string>

  setKeyboardSize: (size: KeyboardSize) => void
  setKeyboardMode: (mode: KeyboardMode) => void
  setActiveKeys: (keys: Set<number>) => void
  setActiveKeyColors: (colors: Map<number, string>) => void

  noteNaming: NoteNaming
  accidentals: Accidentals
  zoomLevel: number
  appTheme: AppTheme
  showBarNumbers: boolean
  setNoteNaming: (naming: NoteNaming) => void
  setAccidentals: (accidentals: Accidentals) => void
  setZoomLevel: (zoom: number) => void
  setAppTheme: (theme: AppTheme) => void
  setShowBarNumbers: (v: boolean) => void

  detectedKey: DetectedKey | null
  setDetectedKey: (key: DetectedKey | null) => void
  setTranspose: (semitones: number) => void

  metronomeEnabled: boolean
  setMetronomeEnabled: (enabled: boolean) => void

  midiDeviceConnected: boolean
  midiDeviceName: string
  setMidiDevice: (connected: boolean, name?: string) => void

  trackPanelOpen: boolean
  settingsOpen: boolean
  settingsPanelOpen: boolean
  setTrackPanelOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setSettingsPanelOpen: (open: boolean) => void

  chordExplorerOpen: boolean
  setChordExplorerOpen: (open: boolean) => void
  scaleExplorerOpen: boolean
  setScaleExplorerOpen: (open: boolean) => void
  explorerKeys: Set<number>
  explorerKeyColors: Map<number, string>
  setExplorerKeys: (keys: Set<number>, colors: Map<number, string>) => void
  clearExplorerKeys: () => void
  displayedChord: string | null
  setDisplayedChord: (chord: string | null) => void
  clearDisplayedChord: () => void

  lockedKeys: Set<number>
  lockedColors: Map<number, string>
  setLockedKeys: (keys: Set<number>, colors: Map<number, string>) => void
  clearLockedKeys: () => void
  // ── Original chord identity preserved across inversion cycling ────────────
  originalLockedChordName: string | null
  setOriginalLockedChordName: (name: string | null) => void
  lockedInversionCount: number
  setLockedInversionCount: (n: number) => void
  lockedChordNoteCount: number
  setLockedChordNoteCount: (n: number) => void

  // ── Explorer chord display — name + inversion tracking for above-keyboard ─
  explorerChordDisplay: { name: string; invCount: number; noteCount: number } | null
  setExplorerChordDisplay: (d: { name: string; invCount: number; noteCount: number } | null) => void
  clearExplorerChordDisplay: () => void

  masterVolume: number
  setMasterVolume: (v: number) => void

  audioEngine: 'gm' | 'samples'
  setAudioEngine: (engine: 'gm' | 'samples') => void

  chordPrompterEnabled: boolean
  chordPrompterOpen: boolean
  chordSequence: ChordEvent[]
  setChordPrompterEnabled: (v: boolean) => void
  setChordPrompterOpen: (v: boolean) => void
  setChordSequence: (seq: ChordEvent[]) => void

  hideDemoFolder: boolean
  setHideDemoFolder: (v: boolean) => void

  transcriptHistory: TranscriptEntry[]
  addTranscriptEntry: (entry: TranscriptEntry) => void

  resetAll: () => void
}

function makeTrackState(track: ParsedTrack): TrackState {
  const isKeyboard = isKeyboardInstrument(track.program)
  const autoMuted = !track.isDrum && DEFAULT_MUTED_GROUPS.has(track.group ?? '')
  const showOnKeyboard = KEYBOARD_DISPLAY_GROUPS.has(track.group ?? '') && !track.isDrum

  return {
    index: track.index,
    name: track.name,
    gmName: track.gmName,
    program: track.program,
    group: track.group,
    isDrum: track.isDrum,
    color: track.color,
    muted: autoMuted,
    solo: false,
    visible: true,
    showOnKeyboard,
    volume: 1,
    pan: 0,
  }
}

export const useStore = create<OrfeoStore>((set, get) => ({
  midi: null,
  barStarts: [],
  setMidi: (midi) => {
    if (!midi) { set({ midi: null, tracks: [], currentTime: 0, playbackState: 'stopped', trackPanelOpen: false, barStarts: [], chordSequence: [], chordPrompterOpen: false }); return }
    set({
      midi,
      tracks: midi.tracks.map(makeTrackState),
      currentTime: 0,
      playbackState: 'stopped',
      bpm: midi.bpm,
      originalBpm: midi.bpm,
      trackPanelOpen: true,   // auto-open drawer when file loads
      barStarts: (midi as any)._barStarts ?? [],
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
  muteGroup: (group, muted) =>
    set((s) => ({ tracks: s.tracks.map((t) => t.group === group ? { ...t, muted } : t) })),

  keyboardSize: 73,
  keyboardMode: 'docked',
  activeKeys: new Set(),
  activeKeyColors: new Map(),

  setKeyboardSize: (keyboardSize) => set({ keyboardSize }),
  setKeyboardMode: (keyboardMode) => set({ keyboardMode }),
  setActiveKeys: (activeKeys) => set({ activeKeys }),
  setActiveKeyColors: (activeKeyColors) => set({ activeKeyColors }),

  noteNaming: 'english',
  accidentals: 'flat',
  zoomLevel: 1,
  appTheme: 'dark',
  showBarNumbers: true,
  setNoteNaming: (noteNaming) => set({ noteNaming }),
  setAccidentals: (accidentals) => set({ accidentals }),
  setZoomLevel: (zoomLevel) => set({ zoomLevel }),
  setAppTheme: (appTheme) => set({ appTheme }),
  setShowBarNumbers: (showBarNumbers) => set({ showBarNumbers }),

  detectedKey: null,
  setDetectedKey: (detectedKey) => set({ detectedKey }),
  setTranspose: (semitones) => set((s) => ({
    detectedKey: s.detectedKey ? { ...s.detectedKey, transpose: s.detectedKey.transpose + semitones } : null
  })),

  metronomeEnabled: false,
  setMetronomeEnabled: (metronomeEnabled) => set({ metronomeEnabled }),

  midiDeviceConnected: false,
  midiDeviceName: '',
  setMidiDevice: (midiDeviceConnected, midiDeviceName = '') => set({ midiDeviceConnected, midiDeviceName }),

  trackPanelOpen: false,
  settingsOpen: false,
  settingsPanelOpen: false,
  setTrackPanelOpen: (trackPanelOpen) => set({ trackPanelOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSettingsPanelOpen: (settingsPanelOpen) => set({ settingsPanelOpen }),

  chordExplorerOpen: false,
  scaleExplorerOpen: false,
  explorerKeys: new Set(),
  explorerKeyColors: new Map(),
  setChordExplorerOpen: (chordExplorerOpen) => set({ chordExplorerOpen }),
  setScaleExplorerOpen: (scaleExplorerOpen) => set({ scaleExplorerOpen }),
  setExplorerKeys: (explorerKeys, explorerKeyColors) => set({ explorerKeys, explorerKeyColors }),
  clearExplorerKeys: () => set({ explorerKeys: new Set(), explorerKeyColors: new Map() }),
  displayedChord: null,
  setDisplayedChord: (displayedChord) => set({ displayedChord }),
  clearDisplayedChord: () => set({ displayedChord: null }),

  lockedKeys: new Set(),
  lockedColors: new Map(),
  setLockedKeys: (lockedKeys, lockedColors) => set({ lockedKeys, lockedColors }),
  // ── Clears keys + resets all locked chord identity state ─────────────────
  clearLockedKeys: () => set({
    lockedKeys: new Set(), lockedColors: new Map(),
    originalLockedChordName: null, lockedInversionCount: 0, lockedChordNoteCount: 0,
  }),
  originalLockedChordName: null,
  setOriginalLockedChordName: (originalLockedChordName) => set({ originalLockedChordName }),
  lockedInversionCount: 0,
  setLockedInversionCount: (lockedInversionCount) => set({ lockedInversionCount }),
  lockedChordNoteCount: 0,
  setLockedChordNoteCount: (lockedChordNoteCount) => set({ lockedChordNoteCount }),

  explorerChordDisplay: null,
  setExplorerChordDisplay: (explorerChordDisplay) => set({ explorerChordDisplay }),
  clearExplorerChordDisplay: () => set({ explorerChordDisplay: null }),

  masterVolume: 0.8,
  setMasterVolume: (masterVolume) => set({ masterVolume: Math.max(0, Math.min(1, masterVolume)) }),

  resetAll: () => {
    ;(window as any).__orfeoPlayer?.stop?.()
    set({
      midi: null, tracks: [], barStarts: [],
      bpm: 120, originalBpm: 120, detectedKey: null,
      activeKeys: new Set(), activeKeyColors: new Map(),
      explorerKeys: new Set(), explorerKeyColors: new Map(),
      lockedKeys: new Set(), lockedColors: new Map(),
      originalLockedChordName: null, lockedInversionCount: 0, lockedChordNoteCount: 0,
      explorerChordDisplay: null,
      displayedChord: null,
      chordExplorerOpen: false, scaleExplorerOpen: false, playbackState: 'stopped',
      currentTime: 0, trackPanelOpen: false, settingsPanelOpen: false,
      chordSequence: [], chordPrompterOpen: false,
    })
  },

  audioEngine: 'gm',
  setAudioEngine: (audioEngine) => set({ audioEngine }),

  chordPrompterEnabled: false,
  chordPrompterOpen: false,
  chordSequence: [],
  setChordPrompterEnabled: (chordPrompterEnabled) => set({ chordPrompterEnabled }),
  setChordPrompterOpen: (chordPrompterOpen) => set({ chordPrompterOpen }),
  setChordSequence: (chordSequence) => set({ chordSequence }),

  // ── Demo folder visibility — persisted, default visible ───────────────────
  hideDemoFolder: false,
  setHideDemoFolder: (hideDemoFolder) => set({ hideDemoFolder }),

  // ── Transcript history — max 20 entries, oldest dropped when full ─────────
  transcriptHistory: [],
  addTranscriptEntry: (entry) => {
    const next = [entry, ...get().transcriptHistory].slice(0, 20)
    set({ transcriptHistory: next })
    window.electronAPI?.setPrefs?.({ transcriptHistory: next }).catch(() => {})
  },

  libraryFolder: null,
  libraryFiles: [],
  libraryFavourites: new Set(),
  setLibraryFolder: (libraryFolder) => set({ libraryFolder }),
  setLibraryFiles: (libraryFiles) => set({ libraryFiles }),
  setLibraryFolderAndFiles: (libraryFolder, libraryFiles) => set({ libraryFolder, libraryFiles }),
  toggleFavourite: (path) => set((s) => {
    const next = new Set(s.libraryFavourites)
    if (next.has(path)) next.delete(path); else next.add(path)
    return { libraryFavourites: next }
  }),
  loadLibraryFile: async (filePath) => {
    try {
      const result = await window.electronAPI.loadMidiFromPath(filePath)
      if (!result) return
      const binary = atob(result.base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
      const parsed = parseMidiBuffer(bytes.buffer, result.fileName, result.filePath ?? '')
      get().setMidi(parsed)
      const raw = parsed as any
      if (raw._keySignature != null) {
        get().setDetectedKey(parseKeySignature(raw._keySignature.key, raw._keySignature.scale))
      } else {
        get().setDetectedKey(detectKeyFromTracks(parsed.tracks))
      }
    } catch (err) {
      console.error('loadLibraryFile error:', err)
    }
  },
}))

// ── Restore persisted library on startup ──────────────────────────────────────
async function restoreLibraryPrefs() {
  try {
    const prefs = await window.electronAPI?.getPrefs?.()
    if (!prefs) return
    const store = useStore.getState()
    if (prefs.libraryFolder) {
      const files = await window.electronAPI.scanMidiFolder(prefs.libraryFolder)
      store.setLibraryFolderAndFiles(prefs.libraryFolder, files)
    }
    if (Array.isArray(prefs.libraryFavourites)) {
      prefs.libraryFavourites.forEach((p: string) => store.toggleFavourite(p))
    }
    if (prefs.noteNaming) store.setNoteNaming(prefs.noteNaming)
    if (prefs.accidentals) store.setAccidentals(prefs.accidentals)
    if (typeof prefs.masterVolume === 'number') store.setMasterVolume(prefs.masterVolume)
    if (prefs.audioEngine === 'samples') store.setAudioEngine('samples')
    if (typeof prefs.showBarNumbers === 'boolean') store.setShowBarNumbers(prefs.showBarNumbers)
    if (typeof prefs.chordPrompterEnabled === 'boolean') store.setChordPrompterEnabled(prefs.chordPrompterEnabled)
    if (typeof prefs.hideDemoFolder === 'boolean') store.setHideDemoFolder(prefs.hideDemoFolder)
    if (Array.isArray(prefs.transcriptHistory)) useStore.setState({ transcriptHistory: prefs.transcriptHistory })
  } catch (e) {
    console.error('[Orfeo] restoreLibraryPrefs:', e)
  }
}
setTimeout(restoreLibraryPrefs, 500)

let _favTimer: ReturnType<typeof setTimeout> | null = null
useStore.subscribe((state) => {
  if (!state.libraryFolder) return
  if (_favTimer) clearTimeout(_favTimer)
  _favTimer = setTimeout(() => {
    window.electronAPI?.setPrefs?.({ libraryFavourites: Array.from(state.libraryFavourites) }).catch(() => {})
  }, 1000)
})

// Persist display settings when they change
// Use null sentinel so we never save on first subscriber fire (which would
// overwrite the restored value before restoreLibraryPrefs has run)
let _prevNoteNaming: string | null = null
let _prevAccidentals: string | null = null
let _prevMasterVolume: number | null = null
let _prevAudioEngine: string | null = null
let _prevShowBarNumbers: boolean | null = null
let _prevChordPrompterEnabled: boolean | null = null
let _prevHideDemoFolder: boolean | null = null
useStore.subscribe((state) => {
  // Skip the very first fire (app init) — restore handles loading saved values
  if (_prevNoteNaming === null) {
    _prevNoteNaming = state.noteNaming
    _prevAccidentals = state.accidentals
    _prevMasterVolume = state.masterVolume
    _prevAudioEngine = state.audioEngine
    _prevShowBarNumbers = state.showBarNumbers
    _prevChordPrompterEnabled = state.chordPrompterEnabled
    _prevHideDemoFolder = state.hideDemoFolder
    return
  }
  if (
    state.noteNaming !== _prevNoteNaming ||
    state.accidentals !== _prevAccidentals ||
    state.masterVolume !== _prevMasterVolume ||
    state.audioEngine !== _prevAudioEngine ||
    state.showBarNumbers !== _prevShowBarNumbers ||
    state.chordPrompterEnabled !== _prevChordPrompterEnabled ||
    state.hideDemoFolder !== _prevHideDemoFolder
  ) {
    _prevNoteNaming = state.noteNaming
    _prevAccidentals = state.accidentals
    _prevMasterVolume = state.masterVolume
    _prevAudioEngine = state.audioEngine
    _prevShowBarNumbers = state.showBarNumbers
    _prevChordPrompterEnabled = state.chordPrompterEnabled
    _prevHideDemoFolder = state.hideDemoFolder
    window.electronAPI?.setPrefs?.({
      noteNaming: state.noteNaming,
      accidentals: state.accidentals,
      masterVolume: state.masterVolume,
      audioEngine: state.audioEngine,
      showBarNumbers: state.showBarNumbers,
      chordPrompterEnabled: state.chordPrompterEnabled,
      hideDemoFolder: state.hideDemoFolder,
    }).catch(() => {})
  }
})

// ── Theme ─────────────────────────────────────────────────────────────────────
// Exported so PianoRoll and App.tsx can read it without subscribing to full store
export type AppTheme = 'dark' | 'warm'
