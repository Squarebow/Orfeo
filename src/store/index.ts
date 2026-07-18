import { create } from 'zustand'
import type {
  ParsedMidi, ParsedTrack, PlaybackState, TrackState,
  KeyboardSize, KeyboardMode, NoteNaming, Accidentals, ChordEvent, TranscriptEntry,
} from '../types'
import type { DetectedKey } from '../utils/keyDetection'
import { isKeyboardInstrument } from '../utils/gmInstruments'

// Groups muted when autoMuteNonKeyboard is on — exported so TrackPanel can read them
// Unmuted by default: piano, chromatic, organ, bass, drums
export const DEFAULT_MUTED_GROUPS = new Set([
  'guitar', 'strings', 'ensemble', 'brass', 'reed', 'pipe',
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
  loopStart: number | null
  loopEnd: number | null
  loopRegionEnabled: boolean
  loopRegionActive: boolean

  setPlaybackState: (state: PlaybackState) => void
  setCurrentTime: (time: number) => void
  setBpm: (bpm: number) => void
  resetBpm: () => void
  setLoop: (enabled: boolean, start?: number, end?: number) => void
  setLoopRegionEnabled: (v: boolean) => void
  setLoopRegionActive: (v: boolean) => void
  setLoopRegion: (start: number, end: number) => void
  clearLoopRegion: () => void

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

  chordTranscriptionEnabled: boolean
  setChordTranscriptionEnabled: (v: boolean) => void

  hideDemoFolder: boolean
  setHideDemoFolder: (v: boolean) => void

  demoFiles: { name: string; path: string }[]
  setDemoFiles: (files: { name: string; path: string }[]) => void

  splitBreakpointType: 'single' | 'range'
  setSplitBreakpointType: (t: 'single' | 'range') => void
  splitBreakpointNote: number
  setSplitBreakpointNote: (n: number) => void
  splitBreakpointRangeStart: number
  setSplitBreakpointRangeStart: (n: number) => void
  splitBreakpointRangeEnd: number
  setSplitBreakpointRangeEnd: (n: number) => void

  autoMuteNonKeyboard: boolean
  setAutoMuteNonKeyboard: (v: boolean) => void
  // ── Instantly applies or clears the auto-mute filter on currently loaded tracks ──
  setTrackMuteFilter: (filtered: boolean) => void

  settingsGroupsCollapsed: Record<string, boolean>
  setSettingsGroupCollapsed: (id: string, collapsed: boolean) => void

  showHandLabels: boolean
  setShowHandLabels: (v: boolean) => void

  showOctaveLabels: boolean
  setShowOctaveLabels: (v: boolean) => void
  showNoteNamesOnKeyboard: boolean
  setShowNoteNamesOnKeyboard: (v: boolean) => void

  handLabelMode: 'practice' | 'performance'
  setHandLabelMode: (mode: 'practice' | 'performance') => void
  handBoundaryCurve: { time: number; boundary: number | null }[]
  setHandBoundaryCurve: (curve: { time: number; boundary: number | null }[]) => void

  performanceSplitSensitivity: number
  setPerformanceSplitSensitivity: (n: number) => void

  transcriptHistory: TranscriptEntry[]
  addTranscriptEntry: (entry: TranscriptEntry) => void

  resetAll: () => void
}

// ── makeTrackState — builds initial TrackState for a parsed track ────────────
// All tracks start unmuted; selective filtering is applied via the quick-toggle button.
function makeTrackState(track: ParsedTrack): TrackState {
  const showOnKeyboard = KEYBOARD_DISPLAY_GROUPS.has(track.group ?? '') && !track.isDrum

  return {
    index: track.index,
    name: track.name,
    gmName: track.gmName,
    program: track.program,
    group: track.group,
    isDrum: track.isDrum,
    color: track.color,
    muted: false,
    solo: false,
    visible: true,
    showOnKeyboard,
    volume: (track as any)._cc7 ?? 1,
    pan: (track as any)._cc10 != null ? ((track as any)._cc10 - 0.5) * 2 : 0,
  }
}

export const useStore = create<OrfeoStore>((set, get) => ({
  midi: null,
  barStarts: [],
  setMidi: (midi) => {
    if (!midi) { set({ midi: null, tracks: [], currentTime: 0, playbackState: 'stopped', trackPanelOpen: false, barStarts: [], chordSequence: [], chordPrompterOpen: false, loopStart: null, loopEnd: null, loopRegionActive: false }); return }
    set({
      midi,
      tracks: midi.tracks.map(t => makeTrackState(t)),
      currentTime: 0,
      playbackState: 'stopped',
      bpm: midi.bpm,
      originalBpm: midi.bpm,
      trackPanelOpen: true,   // auto-open drawer when file loads
      barStarts: (midi as any)._barStarts ?? [],
      loopStart: null,
      loopEnd: null,
      loopRegionActive: false,
    })
  },

  playbackState: 'stopped',
  currentTime: 0,
  bpm: 120,
  originalBpm: 120,
  loopEnabled: false,
  loopStart: null,
  loopEnd: null,
  loopRegionEnabled: false,
  loopRegionActive: false,

  setPlaybackState: (playbackState) => set({ playbackState }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setBpm: (bpm) => set({ bpm }),
  resetBpm: () => set((s) => ({ bpm: s.originalBpm })),
  setLoop: (loopEnabled, loopStart, loopEnd) =>
    set((s) => ({ loopEnabled, loopStart: loopStart ?? s.loopStart, loopEnd: loopEnd ?? s.loopEnd })),
  // ── Loop region setters ───────────────────────────────────────────────────
  setLoopRegionEnabled: (v) => set(v
    ? { loopRegionEnabled: true }
    : { loopRegionEnabled: false, loopRegionActive: false, loopStart: null, loopEnd: null }
  ),
  setLoopRegionActive: (loopRegionActive) => set({ loopRegionActive }),
  setLoopRegion: (start, end) => set({ loopStart: start, loopEnd: end }),
  clearLoopRegion: () => set({ loopStart: null, loopEnd: null, loopRegionActive: false }),

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
      loopStart: null, loopEnd: null, loopRegionActive: false,
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

  // ── Chord Transcription — per-file PDF generation, persisted ─────────────
  chordTranscriptionEnabled: false,
  setChordTranscriptionEnabled: (chordTranscriptionEnabled) => set({ chordTranscriptionEnabled }),

  // ── Demo folder visibility — persisted, default visible ───────────────────
  hideDemoFolder: false,
  setHideDemoFolder: (hideDemoFolder) => set({ hideDemoFolder }),

  // ── Standalone demo files (shown when no library folder is set) ───────────
  demoFiles: [],
  setDemoFiles: (demoFiles) => set({ demoFiles }),

  // ── MIDI Editor split breakpoint — type and note values, all persisted ──────
  splitBreakpointType: 'single' as 'single' | 'range',
  setSplitBreakpointType: (splitBreakpointType) => set({ splitBreakpointType }),
  splitBreakpointNote: 60,
  setSplitBreakpointNote: (n) => set({ splitBreakpointNote: Math.max(48, Math.min(60, n)) }),
  splitBreakpointRangeStart: 52,
  setSplitBreakpointRangeStart: (n) => set((s) => ({ splitBreakpointRangeStart: Math.max(48, Math.min(s.splitBreakpointRangeEnd - 1, n)) })),
  splitBreakpointRangeEnd: 60,
  setSplitBreakpointRangeEnd: (n) => set((s) => ({ splitBreakpointRangeEnd: Math.max(s.splitBreakpointRangeStart + 1, Math.min(60, n)) })),

  // ── Selective playback button visibility — true = show quick-toggle in Track Panel ──
  autoMuteNonKeyboard: true,
  setAutoMuteNonKeyboard: (autoMuteNonKeyboard) => set({ autoMuteNonKeyboard }),
  // ── setTrackMuteFilter — instant one-shot toggle on currently loaded tracks ─
  setTrackMuteFilter: (filtered) => set((s) => ({
    tracks: s.tracks.map(t => ({
      ...t,
      muted: filtered ? (!t.isDrum && DEFAULT_MUTED_GROUPS.has(t.group ?? '')) : false,
    })),
  })),

  // ── Settings group collapse state — keyed by group id; true = collapsed ────
  settingsGroupsCollapsed: {
    'midi-files-library': false,
    notation: true,
    keyboard: true,
    'playback-practice': true,
    audio: true,
    'piano-roll': true,
    appearance: true,
  },
  setSettingsGroupCollapsed: (id, collapsed) => set((s) => ({
    settingsGroupsCollapsed: { ...s.settingsGroupsCollapsed, [id]: collapsed },
  })),

  // ── Hand labels — show LEFT/RIGHT HAND labels on the keyboard ────────────
  showHandLabels: false,
  setShowHandLabels: (showHandLabels) => set({ showHandLabels }),

  // ── Keyboard label visibility — octave numbers and note name labels ────────
  showOctaveLabels: true,
  setShowOctaveLabels: (showOctaveLabels) => set({ showOctaveLabels }),
  showNoteNamesOnKeyboard: true,
  setShowNoteNamesOnKeyboard: (showNoteNamesOnKeyboard) => set({ showNoteNamesOnKeyboard }),

  // ── Hand label mode — practice (static breakpoint) or performance (dynamic) ─
  handLabelMode: 'practice' as 'practice' | 'performance',
  setHandLabelMode: (handLabelMode) => set({ handLabelMode }),
  // ── Precomputed boundary curve for Performance mode — not persisted ────────
  handBoundaryCurve: [],
  setHandBoundaryCurve: (handBoundaryCurve) => set({ handBoundaryCurve }),

  // ── Performance split sensitivity — semitone gap threshold, persisted ──────
  performanceSplitSensitivity: 8,
  setPerformanceSplitSensitivity: (n) => set({ performanceSplitSensitivity: Math.max(2, Math.min(16, n)) }),

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
  // ── Persisted client-side exclusion list — file stays on disk, just hidden ─
  hiddenLibraryFiles: [] as string[],
  hideLibraryFile: (path: string) => set(((s: any) => ({
    hiddenLibraryFiles: (s.hiddenLibraryFiles as string[]).includes(path)
      ? s.hiddenLibraryFiles
      : [...s.hiddenLibraryFiles, path],
  })) as any),
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
    // ── Always load demo files so they appear even before a library is chosen ─
    const demoFolder = await window.electronAPI.getDemoFolder?.()
    if (demoFolder) {
      const demoFiles = await window.electronAPI.scanMidiFolder(demoFolder)
      store.setDemoFiles(demoFiles)
    }
    if (Array.isArray(prefs.libraryFavourites)) {
      prefs.libraryFavourites.forEach((p: string) => store.toggleFavourite(p))
    }
    if (Array.isArray(prefs.hiddenLibraryFiles)) {
      useStore.setState({ hiddenLibraryFiles: prefs.hiddenLibraryFiles } as any)
    }
    if (prefs.noteNaming) store.setNoteNaming(prefs.noteNaming)
    if (prefs.accidentals) store.setAccidentals(prefs.accidentals)
    if (typeof prefs.masterVolume === 'number') store.setMasterVolume(prefs.masterVolume)
    if (prefs.audioEngine === 'samples') store.setAudioEngine('samples')
    if (typeof prefs.showBarNumbers === 'boolean') store.setShowBarNumbers(prefs.showBarNumbers)
    if (typeof prefs.chordPrompterEnabled === 'boolean') store.setChordPrompterEnabled(prefs.chordPrompterEnabled)
    if (typeof prefs.chordTranscriptionEnabled === 'boolean') store.setChordTranscriptionEnabled(prefs.chordTranscriptionEnabled)
    if (typeof prefs.hideDemoFolder === 'boolean') store.setHideDemoFolder(prefs.hideDemoFolder)
    if (prefs.splitBreakpointType === 'single' || prefs.splitBreakpointType === 'range') store.setSplitBreakpointType(prefs.splitBreakpointType)
    if (typeof prefs.splitBreakpointNote === 'number') store.setSplitBreakpointNote(prefs.splitBreakpointNote)
    if (typeof prefs.splitBreakpointRangeStart === 'number') store.setSplitBreakpointRangeStart(prefs.splitBreakpointRangeStart)
    if (typeof prefs.splitBreakpointRangeEnd === 'number') store.setSplitBreakpointRangeEnd(prefs.splitBreakpointRangeEnd)
    if (typeof prefs.showHandLabels === 'boolean') store.setShowHandLabels(prefs.showHandLabels)
    if (typeof prefs.loopRegionEnabled === 'boolean') store.setLoopRegionEnabled(prefs.loopRegionEnabled)
    if (prefs.handLabelMode === 'practice' || prefs.handLabelMode === 'performance') store.setHandLabelMode(prefs.handLabelMode)
    if (typeof prefs.performanceSplitSensitivity === 'number') store.setPerformanceSplitSensitivity(prefs.performanceSplitSensitivity)
    if (typeof prefs.showOctaveLabels === 'boolean') store.setShowOctaveLabels(prefs.showOctaveLabels)
    if (typeof prefs.showNoteNamesOnKeyboard === 'boolean') store.setShowNoteNamesOnKeyboard(prefs.showNoteNamesOnKeyboard)
    if (typeof prefs.autoMuteNonKeyboard === 'boolean') store.setAutoMuteNonKeyboard(prefs.autoMuteNonKeyboard)
    if (prefs.settingsGroupsCollapsed && typeof prefs.settingsGroupsCollapsed === 'object' && !Array.isArray(prefs.settingsGroupsCollapsed)) {
      const defaults = store.settingsGroupsCollapsed
      useStore.setState({ settingsGroupsCollapsed: { ...defaults, ...prefs.settingsGroupsCollapsed } })
    }
    if (Array.isArray(prefs.transcriptHistory)) useStore.setState({ transcriptHistory: prefs.transcriptHistory })
  } catch (e) {
    console.error('[Orfeo] restoreLibraryPrefs:', e)
  }
}
setTimeout(restoreLibraryPrefs, 500)

// ── Persist library-list state — favourites + hidden exclusions ───────────────
// Debounced 1 s; gated on libraryFolder so it only fires once a library is set.
let _favTimer: ReturnType<typeof setTimeout> | null = null
useStore.subscribe((state) => {
  if (!state.libraryFolder) return
  if (_favTimer) clearTimeout(_favTimer)
  _favTimer = setTimeout(() => {
    window.electronAPI?.setPrefs?.({
      libraryFavourites:   Array.from(state.libraryFavourites),
      hiddenLibraryFiles:  (state as any).hiddenLibraryFiles,
    }).catch(() => {})
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
let _prevChordTranscriptionEnabled: boolean | null = null
let _prevHideDemoFolder: boolean | null = null
let _prevSplitBreakpointType: string | null = null
let _prevSplitBreakpointNote: number | null = null
let _prevSplitBreakpointRangeStart: number | null = null
let _prevSplitBreakpointRangeEnd: number | null = null
let _prevShowHandLabels: boolean | null = null
let _prevLoopRegionEnabled: boolean | null = null
let _prevHandLabelMode: string | null = null
let _prevPerformanceSplitSensitivity: number | null = null
let _prevShowOctaveLabels: boolean | null = null
let _prevShowNoteNamesOnKeyboard: boolean | null = null
let _prevAutoMuteNonKeyboard: boolean | null = null
let _prevSettingsGroupsCollapsed: string | null = null
useStore.subscribe((state) => {
  // Skip the very first fire (app init) — restore handles loading saved values
  if (_prevNoteNaming === null) {
    _prevNoteNaming = state.noteNaming
    _prevAccidentals = state.accidentals
    _prevMasterVolume = state.masterVolume
    _prevAudioEngine = state.audioEngine
    _prevShowBarNumbers = state.showBarNumbers
    _prevChordPrompterEnabled = state.chordPrompterEnabled
    _prevChordTranscriptionEnabled = state.chordTranscriptionEnabled
    _prevHideDemoFolder = state.hideDemoFolder
    _prevSplitBreakpointType = state.splitBreakpointType
    _prevSplitBreakpointNote = state.splitBreakpointNote
    _prevSplitBreakpointRangeStart = state.splitBreakpointRangeStart
    _prevSplitBreakpointRangeEnd = state.splitBreakpointRangeEnd
    _prevShowHandLabels = state.showHandLabels
    _prevLoopRegionEnabled = state.loopRegionEnabled
    _prevHandLabelMode = state.handLabelMode
    _prevPerformanceSplitSensitivity = state.performanceSplitSensitivity
    _prevShowOctaveLabels = state.showOctaveLabels
    _prevShowNoteNamesOnKeyboard = state.showNoteNamesOnKeyboard
    _prevAutoMuteNonKeyboard = state.autoMuteNonKeyboard
    _prevSettingsGroupsCollapsed = JSON.stringify(state.settingsGroupsCollapsed)
    return
  }
  if (
    state.noteNaming !== _prevNoteNaming ||
    state.accidentals !== _prevAccidentals ||
    state.masterVolume !== _prevMasterVolume ||
    state.audioEngine !== _prevAudioEngine ||
    state.showBarNumbers !== _prevShowBarNumbers ||
    state.chordPrompterEnabled !== _prevChordPrompterEnabled ||
    state.chordTranscriptionEnabled !== _prevChordTranscriptionEnabled ||
    state.hideDemoFolder !== _prevHideDemoFolder ||
    state.splitBreakpointType !== _prevSplitBreakpointType ||
    state.splitBreakpointNote !== _prevSplitBreakpointNote ||
    state.splitBreakpointRangeStart !== _prevSplitBreakpointRangeStart ||
    state.splitBreakpointRangeEnd !== _prevSplitBreakpointRangeEnd ||
    state.showHandLabels !== _prevShowHandLabels ||
    state.loopRegionEnabled !== _prevLoopRegionEnabled ||
    state.handLabelMode !== _prevHandLabelMode ||
    state.performanceSplitSensitivity !== _prevPerformanceSplitSensitivity ||
    state.showOctaveLabels !== _prevShowOctaveLabels ||
    state.showNoteNamesOnKeyboard !== _prevShowNoteNamesOnKeyboard ||
    state.autoMuteNonKeyboard !== _prevAutoMuteNonKeyboard ||
    JSON.stringify(state.settingsGroupsCollapsed) !== _prevSettingsGroupsCollapsed
  ) {
    _prevNoteNaming = state.noteNaming
    _prevAccidentals = state.accidentals
    _prevMasterVolume = state.masterVolume
    _prevAudioEngine = state.audioEngine
    _prevShowBarNumbers = state.showBarNumbers
    _prevChordPrompterEnabled = state.chordPrompterEnabled
    _prevChordTranscriptionEnabled = state.chordTranscriptionEnabled
    _prevHideDemoFolder = state.hideDemoFolder
    _prevSplitBreakpointType = state.splitBreakpointType
    _prevSplitBreakpointNote = state.splitBreakpointNote
    _prevSplitBreakpointRangeStart = state.splitBreakpointRangeStart
    _prevSplitBreakpointRangeEnd = state.splitBreakpointRangeEnd
    _prevShowHandLabels = state.showHandLabels
    _prevLoopRegionEnabled = state.loopRegionEnabled
    _prevHandLabelMode = state.handLabelMode
    _prevPerformanceSplitSensitivity = state.performanceSplitSensitivity
    _prevShowOctaveLabels = state.showOctaveLabels
    _prevShowNoteNamesOnKeyboard = state.showNoteNamesOnKeyboard
    _prevAutoMuteNonKeyboard = state.autoMuteNonKeyboard
    _prevSettingsGroupsCollapsed = JSON.stringify(state.settingsGroupsCollapsed)
    window.electronAPI?.setPrefs?.({
      noteNaming: state.noteNaming,
      accidentals: state.accidentals,
      masterVolume: state.masterVolume,
      audioEngine: state.audioEngine,
      showBarNumbers: state.showBarNumbers,
      chordPrompterEnabled: state.chordPrompterEnabled,
      chordTranscriptionEnabled: state.chordTranscriptionEnabled,
      hideDemoFolder: state.hideDemoFolder,
      splitBreakpointType: state.splitBreakpointType,
      splitBreakpointNote: state.splitBreakpointNote,
      splitBreakpointRangeStart: state.splitBreakpointRangeStart,
      splitBreakpointRangeEnd: state.splitBreakpointRangeEnd,
      showHandLabels: state.showHandLabels,
      loopRegionEnabled: state.loopRegionEnabled,
      handLabelMode: state.handLabelMode,
      performanceSplitSensitivity: state.performanceSplitSensitivity,
      showOctaveLabels: state.showOctaveLabels,
      showNoteNamesOnKeyboard: state.showNoteNamesOnKeyboard,
      autoMuteNonKeyboard: state.autoMuteNonKeyboard,
      settingsGroupsCollapsed: state.settingsGroupsCollapsed,
    }).catch(() => {})
  }
})

// ── Theme ─────────────────────────────────────────────────────────────────────
// Exported so PianoRoll and App.tsx can read it without subscribing to full store
export type AppTheme = 'dark' | 'warm'
