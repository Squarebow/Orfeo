import { create } from 'zustand'
import type {
  ParsedMidi, ParsedTrack, PlaybackState, TrackState,
  KeyboardSize, KeyboardMode, NoteNaming, Accidentals, ChordEvent, TranscriptEntry, LibraryFile, HitEffectPattern, SoundfontId,
} from '../types'
import type { DetectedKey } from '../utils/keyDetection'
import { detectKeyFromTracks, parseKeySignature } from '../utils/keyDetection'
import { isKeyboardInstrument } from '../utils/gmInstruments'
import { parseMidiBuffer } from '../utils/midiParser'

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
  chordExplorerMinimized: boolean
  setChordExplorerOpen: (open: boolean) => void
  setChordExplorerMinimized: (v: boolean) => void
  scaleExplorerOpen: boolean
  scaleExplorerMinimized: boolean
  setScaleExplorerOpen: (open: boolean) => void
  setScaleExplorerMinimized: (v: boolean) => void
  mixerOpen: boolean
  mixerMinimized: boolean
  setMixerOpen: (open: boolean) => void
  setMixerMinimized: (v: boolean) => void
  midiEditorOpen: boolean
  setMidiEditorOpen: (open: boolean) => void
  pendingImportedFile: {
    sourcePath: string;
    format: 'musicxml' | 'guitarpro';
    midiBase64: string;
    fileName: string;
  } | null
  setPendingImportedFile: (
    value: {
      sourcePath: string;
      format: 'musicxml' | 'guitarpro';
      midiBase64: string;
      fileName: string;
    } | null
  ) => void
  presentationMode: boolean
  setPresentationMode: (v: boolean) => void
  noteEditorEnabled: boolean
  setNoteEditorEnabled: (v: boolean) => void
  noteEditorActive: boolean
  setNoteEditorActive: (v: boolean) => void
  noteEditorToolbarX: number
  noteEditorToolbarY: number
  setNoteEditorToolbarPos: (x: number, y: number) => void
  noteEditorSoloTrackIndex: number | null
  preSoloTrackVisibility: boolean[] | null
  soloTrackForEdit: (index: number) => void
  unsoloTrackForEdit: () => void
  noteEditorWalkthroughSeen: boolean
  setNoteEditorWalkthroughSeen: (v: boolean) => void
  vuDisplayMode: 'bars' | 'wave'
  setVuDisplayMode: (mode: 'bars' | 'wave') => void
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

  libraryFolder: string | null
  libraryFiles: LibraryFile[]
  libraryFavourites: Set<string>
  setLibraryFolder: (folder: string | null) => void
  setLibraryFiles: (files: LibraryFile[]) => void
  setLibraryFolderAndFiles: (folder: string | null, files: LibraryFile[]) => void
  toggleFavourite: (path: string) => void
  setFavourites: (paths: string[], starred: boolean) => void
  hiddenLibraryFiles: string[]
  hideLibraryFile: (path: string) => void
  remapLibraryPaths: (pairs: { oldPath: string; newPath: string }[]) => void
  lastFolderOf: Map<string, string | null>
  setLastFolderOf: (map: Map<string, string | null>) => void
  foldersWithUndo: Set<string>
  setFoldersWithUndo: (folders: Set<string>) => void
  loadLibraryFile: (filePath: string) => Promise<void>

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

  // ── Hidable playbar (Phase 1) — off (hidden) means the piano roll's hit
  // line tracks the live keyboard position instead of a fixed line; default
  // true keeps today's behavior byte-for-byte unchanged.
  playbarVisible: boolean
  setPlaybarVisible: (v: boolean) => void
  // Viewport-space Y of the keyboard's top edge, kept live by whichever
  // Keyboard instance is mounted (docked or floating) while playbarVisible
  // is false. Null until measured, or whenever playbarVisible is true (no
  // measurement loop runs — zero overhead when the feature is off).
  keyboardTopY: number | null
  setKeyboardTopY: (y: number | null) => void

  // ── Note-hit visual effects (Phase 2) — additive layer on top of the
  // existing lightKey() glow; off by default.
  hitEffectsEnabled: boolean
  setHitEffectsEnabled: (v: boolean) => void
  hitEffectPattern: HitEffectPattern
  setHitEffectPattern: (p: HitEffectPattern) => void

  // ── Bloom controls (AdvancedBloomFilter, applied to the whole effects layer) ─
  hitEffectBloomThreshold: number
  setHitEffectBloomThreshold: (v: number) => void
  hitEffectBloomIntensity: number
  setHitEffectBloomIntensity: (v: number) => void
  hitEffectBloomSpread: number
  setHitEffectBloomSpread: (v: number) => void

  // ── Which tracks spawn effects: only ones actively lit on the keyboard
  // (default, matches existing key-glow scoping), or every track in the file
  // regardless of showOnKeyboard — purely visual, doesn't touch key lighting. ──
  hitEffectScope: 'keyboard' | 'all'
  setHitEffectScope: (v: 'keyboard' | 'all') => void
  // ── Overrides the effect particle color for every track at once — null means
  // "inherit each note's track color" (existing/default behavior). Never touches
  // the falling-note color or the key glow, only what HitEffects.spawn() renders. ──
  hitEffectColor: string | null
  setHitEffectColor: (v: string | null) => void

  // ── Active soundfont (Samples engine) — 'generaluser-gs' is always bundled;
  // the other two are downloaded on demand via window.electronAPI.
  selectedSoundfont: SoundfontId
  setSelectedSoundfont: (id: SoundfontId) => void

  showOctaveLabels: boolean
  setShowOctaveLabels: (v: boolean) => void
  showNoteNamesOnKeyboard: boolean
  setShowNoteNamesOnKeyboard: (v: boolean) => void

  // ── Auto-collapse left/right drawers (library/settings + tracks) while
  // playing, restore them on pause/stop/new-file-load. _preAutoCollapse*
  // remembers what was actually open before auto-collapse hid it, so we
  // only reopen what the user had open, not force both open unconditionally.
  autoCollapseDrawers: boolean
  setAutoCollapseDrawers: (v: boolean) => void

  handLabelMode: 'practice' | 'performance'
  setHandLabelMode: (mode: 'practice' | 'performance') => void

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
    trackName: track.gmName,  // user label — defaults to GM name, overridden on load if file has ORFEO_TRACK_NAME
    program: track.program,
    group: track.group,
    isDrum: track.isDrum,
    color: track.color,
    colorSource: 'default' as const,
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
    // ── Apply ORFEO_TRACK_NAME / ORFEO_TRACK_COLOR overrides from header meta ──
    const orfeoNames = (midi as any)._orfeoTrackNames as Record<number, string> | undefined
    const orfeoColors = (midi as any)._orfeoTrackColors as Record<number, string> | undefined
    set({
      midi,
      tracks: midi.tracks.map((t, i) => {
        const ts = makeTrackState(t)
        if (orfeoNames?.[i]) ts.trackName = orfeoNames[i]
        if (orfeoColors?.[i]) { ts.color = orfeoColors[i]; ts.colorSource = 'custom' }
        return ts
      }),
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
  chordExplorerMinimized: false,
  scaleExplorerOpen: false,
  scaleExplorerMinimized: false,
  mixerOpen: false,
  mixerMinimized: false,
  vuDisplayMode: 'bars',
  explorerKeys: new Set(),
  explorerKeyColors: new Map(),
  // ── Opening always clears the minimized flag so restore-from-minimize works ──
  setChordExplorerOpen: (chordExplorerOpen) =>
    set(chordExplorerOpen ? { chordExplorerOpen, chordExplorerMinimized: false } : { chordExplorerOpen }),
  setChordExplorerMinimized: (chordExplorerMinimized) => set({ chordExplorerMinimized }),
  setScaleExplorerOpen: (scaleExplorerOpen) =>
    set(scaleExplorerOpen ? { scaleExplorerOpen, scaleExplorerMinimized: false } : { scaleExplorerOpen }),
  setScaleExplorerMinimized: (scaleExplorerMinimized) => set({ scaleExplorerMinimized }),
  setMixerOpen: (mixerOpen) =>
    set(mixerOpen ? { mixerOpen, mixerMinimized: false } : { mixerOpen }),
  setMixerMinimized: (mixerMinimized) => set({ mixerMinimized }),
  midiEditorOpen: false,
  setMidiEditorOpen: (midiEditorOpen) => set({ midiEditorOpen }),
  // ── Pending imported file — session-only, not persisted ──────────────────
  // Set when a foreign format (MusicXML, GP) is converted in-memory but not
  // yet saved to disk as a .mid cache file. Cleared on save or discard.
  pendingImportedFile: null,
  setPendingImportedFile: (value) => set({ pendingImportedFile: value }),
  presentationMode: false,
  setPresentationMode: (presentationMode) => set({ presentationMode }),
  setVuDisplayMode: (vuDisplayMode) => set({ vuDisplayMode }),
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

  noteEditorEnabled: false,
  setNoteEditorEnabled: (noteEditorEnabled) => set({ noteEditorEnabled }),
  noteEditorActive: false,
  setNoteEditorActive: (noteEditorActive) => set({ noteEditorActive }),
  noteEditorToolbarX: 24,
  noteEditorToolbarY: 80,
  setNoteEditorToolbarPos: (noteEditorToolbarX, noteEditorToolbarY) => set({ noteEditorToolbarX, noteEditorToolbarY }),

  // ── Note Editor: track solo + first-run walkthrough ───────────────────────
  noteEditorSoloTrackIndex: null,
  preSoloTrackVisibility: null,
  soloTrackForEdit: (index) => {
    const s = get()
    if (s.noteEditorSoloTrackIndex === index) {
      // ── Un-solo: restore pre-solo visibility ────────────────────────────
      const restored = s.preSoloTrackVisibility
        ? s.tracks.map((t, i) => ({ ...t, visible: s.preSoloTrackVisibility![i] ?? true }))
        : s.tracks
      set({ tracks: restored, noteEditorSoloTrackIndex: null, preSoloTrackVisibility: null })
    } else {
      // ── Solo: snapshot visibility, hide all tracks except target ────────
      const preSolo   = s.tracks.map(t => t.visible)
      const soloed    = s.tracks.map(t => ({ ...t, visible: t.index === index }))
      set({ tracks: soloed, noteEditorSoloTrackIndex: index, preSoloTrackVisibility: preSolo })

      // ── Jump playback to just before this track's first note — otherwise
      // soloing a track whose notes start much later than the current
      // playhead (or sit outside the currently-visible pitch range) shows an
      // apparently-empty piano roll until playback catches up on its own. ──
      const rawTrack = (s.midi as any)?.tracks?.find((t: any) => t.index === index)
      const firstNoteTime = rawTrack?.notes?.[0]?.time
      if (typeof firstNoteTime === 'number') {
        set({ currentTime: Math.max(0, firstNoteTime - 2) })
      }
    }
  },
  unsoloTrackForEdit: () => {
    const s = get()
    if (s.noteEditorSoloTrackIndex === null) return
    const restored = s.preSoloTrackVisibility
      ? s.tracks.map((t, i) => ({ ...t, visible: s.preSoloTrackVisibility![i] ?? true }))
      : s.tracks
    set({ tracks: restored, noteEditorSoloTrackIndex: null, preSoloTrackVisibility: null })
  },
  noteEditorWalkthroughSeen: false,
  setNoteEditorWalkthroughSeen: (noteEditorWalkthroughSeen) => set({ noteEditorWalkthroughSeen }),

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

  playbarVisible: true,
  setPlaybarVisible: (playbarVisible) => set({ playbarVisible }),
  keyboardTopY: null,
  setKeyboardTopY: (keyboardTopY) => set({ keyboardTopY }),

  hitEffectsEnabled: false,
  setHitEffectsEnabled: (hitEffectsEnabled) => set({ hitEffectsEnabled }),
  hitEffectPattern: 'glowBloom',
  setHitEffectPattern: (hitEffectPattern) => set({ hitEffectPattern }),

  hitEffectBloomThreshold: 0.4,
  setHitEffectBloomThreshold: (v) => set({ hitEffectBloomThreshold: Math.max(0, Math.min(1, v)) }),
  hitEffectBloomIntensity: 1.5,
  setHitEffectBloomIntensity: (v) => set({ hitEffectBloomIntensity: Math.max(0, Math.min(4, v)) }),

  selectedSoundfont: 'generaluser-gs',
  setSelectedSoundfont: (selectedSoundfont) => set({ selectedSoundfont }),
  hitEffectBloomSpread: 4,
  setHitEffectBloomSpread: (v) => set({ hitEffectBloomSpread: Math.max(0, Math.min(12, v)) }),
  hitEffectScope: 'keyboard',
  setHitEffectScope: (hitEffectScope) => set({ hitEffectScope }),
  hitEffectColor: null,
  setHitEffectColor: (hitEffectColor) => set({ hitEffectColor }),

  // ── Keyboard label visibility — octave numbers and note name labels ────────
  showOctaveLabels: true,
  setShowOctaveLabels: (showOctaveLabels) => set({ showOctaveLabels }),
  showNoteNamesOnKeyboard: true,
  setShowNoteNamesOnKeyboard: (showNoteNamesOnKeyboard) => set({ showNoteNamesOnKeyboard }),

  autoCollapseDrawers: false,
  setAutoCollapseDrawers: (autoCollapseDrawers) => set({ autoCollapseDrawers }),

  // ── Hand label mode — practice (static, tag-based) or performance (per-note, live) ─
  handLabelMode: 'practice' as 'practice' | 'performance',
  setHandLabelMode: (handLabelMode) => set({ handLabelMode }),

  // ── Performance split sensitivity — hardware-input fallback only (file notes
  // read their exact stored tag, no sensitivity involved); semitone gap
  // threshold, persisted ──────────────────────────────────────────────────────
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
  // ── Bulk favourite/unfavourite — used by "star all files in this folder" ──
  setFavourites: (paths, starred) => set((s) => {
    const next = new Set(s.libraryFavourites)
    for (const p of paths) { if (starred) next.add(p); else next.delete(p) }
    return { libraryFavourites: next }
  }),
  // ── Per-session "undo last move" map — lives in the store (not component
  // state) so it survives LibraryPanel unmounting when Settings tabs switch.
  // Never persisted; resets on app restart. ─────────────────────────────────
  lastFolderOf: new Map(),
  setLastFolderOf: (lastFolderOf) => set({ lastFolderOf }),
  // ── Folder-level "has an undoable move" flag — tracked directly by folder name
  // rather than derived by matching file paths against lastFolderOf, so it can't
  // drift out of sync with a rescan. Session-only, same lifetime as lastFolderOf. ──
  foldersWithUndo: new Set(),
  setFoldersWithUndo: (foldersWithUndo) => set({ foldersWithUndo }),
  // ── Persisted client-side exclusion list — file stays on disk, just hidden ─
  hiddenLibraryFiles: [],
  hideLibraryFile: (path) => set((s) => ({
    hiddenLibraryFiles: s.hiddenLibraryFiles.includes(path)
      ? s.hiddenLibraryFiles
      : [...s.hiddenLibraryFiles, path],
  })),
  // ── Applies old→new path pairs after a folder move/rename, so a starred or
  // hidden file doesn't silently lose that state when its path changes. ──────
  remapLibraryPaths: (pairs) => set((s) => {
    if (pairs.length === 0) return {}
    const map = new Map(pairs.map(p => [p.oldPath, p.newPath]))
    const nextFavourites = new Set(
      Array.from(s.libraryFavourites, p => map.get(p) ?? p),
    )
    const nextHidden = s.hiddenLibraryFiles.map(p => map.get(p) ?? p)
    return { libraryFavourites: nextFavourites, hiddenLibraryFiles: nextHidden }
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
      useStore.setState({ hiddenLibraryFiles: prefs.hiddenLibraryFiles })
    }
    if (prefs.noteNaming) store.setNoteNaming(prefs.noteNaming)
    if (prefs.accidentals) store.setAccidentals(prefs.accidentals)
    if (typeof prefs.masterVolume === 'number') store.setMasterVolume(prefs.masterVolume)
    if (prefs.audioEngine === 'samples') store.setAudioEngine('samples')
    if (typeof prefs.showBarNumbers === 'boolean') store.setShowBarNumbers(prefs.showBarNumbers)
    if (typeof prefs.noteEditorEnabled === 'boolean') store.setNoteEditorEnabled(prefs.noteEditorEnabled)
    if (typeof prefs.noteEditorToolbarX === 'number' && typeof prefs.noteEditorToolbarY === 'number') store.setNoteEditorToolbarPos(prefs.noteEditorToolbarX, prefs.noteEditorToolbarY)
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
    if (typeof prefs.autoCollapseDrawers === 'boolean') store.setAutoCollapseDrawers(prefs.autoCollapseDrawers)
    if (typeof prefs.autoMuteNonKeyboard === 'boolean') store.setAutoMuteNonKeyboard(prefs.autoMuteNonKeyboard)
    if (prefs.settingsGroupsCollapsed && typeof prefs.settingsGroupsCollapsed === 'object' && !Array.isArray(prefs.settingsGroupsCollapsed)) {
      const defaults = store.settingsGroupsCollapsed
      useStore.setState({ settingsGroupsCollapsed: { ...defaults, ...prefs.settingsGroupsCollapsed } })
    }
    if (Array.isArray(prefs.transcriptHistory)) useStore.setState({ transcriptHistory: prefs.transcriptHistory })
    if (typeof prefs.noteEditorWalkthroughSeen === 'boolean') store.setNoteEditorWalkthroughSeen(prefs.noteEditorWalkthroughSeen)
    if (typeof prefs.playbarVisible === 'boolean') store.setPlaybarVisible(prefs.playbarVisible)
    if (typeof prefs.hitEffectsEnabled === 'boolean') store.setHitEffectsEnabled(prefs.hitEffectsEnabled)
    const validPatterns: HitEffectPattern[] = ['glowBloom', 'rippleRing', 'particleBurst', 'smokePlume', 'colorAura', 'starburstNova', 'cometTrail']
    if (validPatterns.includes(prefs.hitEffectPattern)) store.setHitEffectPattern(prefs.hitEffectPattern)
    if (typeof prefs.hitEffectBloomThreshold === 'number') store.setHitEffectBloomThreshold(prefs.hitEffectBloomThreshold)
    if (typeof prefs.hitEffectBloomIntensity === 'number') store.setHitEffectBloomIntensity(prefs.hitEffectBloomIntensity)
    if (typeof prefs.hitEffectBloomSpread === 'number') store.setHitEffectBloomSpread(prefs.hitEffectBloomSpread)
    if (prefs.hitEffectScope === 'keyboard' || prefs.hitEffectScope === 'all') store.setHitEffectScope(prefs.hitEffectScope)
    if (typeof prefs.hitEffectColor === 'string' || prefs.hitEffectColor === null) store.setHitEffectColor(prefs.hitEffectColor)
    if (prefs.selectedSoundfont === 'fluidr3-gm' || prefs.selectedSoundfont === 'musescore-general') store.setSelectedSoundfont(prefs.selectedSoundfont)
  } catch (e) {
    console.error('[Orfeo] restoreLibraryPrefs:', e)
  }
}
setTimeout(restoreLibraryPrefs, 500)

// ── Persist library-list state — favourites + hidden exclusions ───────────────
// Debounced 1 s; gated on libraryFolder so it only fires once a library is set.
let _favTimer: ReturnType<typeof setTimeout> | null = null
const _unsubFav = useStore.subscribe((state) => {
  if (!state.libraryFolder) return
  if (_favTimer) clearTimeout(_favTimer)
  _favTimer = setTimeout(() => {
    window.electronAPI?.setPrefs?.({
      libraryFavourites:   Array.from(state.libraryFavourites),
      hiddenLibraryFiles:  state.hiddenLibraryFiles,
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
let _prevNoteEditorEnabled:    boolean | null = null
let _prevNoteEditorToolbarX:   number  | null = null
let _prevNoteEditorToolbarY:   number  | null = null
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
let _prevAutoCollapseDrawers: boolean | null = null
let _prevAutoMuteNonKeyboard: boolean | null = null
let _prevSettingsGroupsCollapsed: string | null = null
let _prevNoteEditorWalkthroughSeen: boolean | null = null
let _prevPlaybarVisible: boolean | null = null
let _prevHitEffectsEnabled: boolean | null = null
let _prevHitEffectPattern: string | null = null
let _prevHitEffectBloomThreshold: number | null = null
let _prevHitEffectBloomIntensity: number | null = null
let _prevHitEffectBloomSpread: number | null = null
let _prevHitEffectScope: string | null = null
let _prevHitEffectColor: string | null | undefined = undefined
let _prevSelectedSoundfont: string | null = null
const _unsubPrefs = useStore.subscribe((state) => {
  // Skip the very first fire (app init) — restore handles loading saved values
  if (_prevNoteNaming === null) {
    _prevNoteNaming = state.noteNaming
    _prevAccidentals = state.accidentals
    _prevMasterVolume = state.masterVolume
    _prevAudioEngine = state.audioEngine
    _prevShowBarNumbers = state.showBarNumbers
    _prevNoteEditorEnabled = state.noteEditorEnabled
    _prevNoteEditorToolbarX = state.noteEditorToolbarX
    _prevNoteEditorToolbarY = state.noteEditorToolbarY
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
    _prevAutoCollapseDrawers = state.autoCollapseDrawers
    _prevAutoMuteNonKeyboard = state.autoMuteNonKeyboard
    _prevSettingsGroupsCollapsed = JSON.stringify(state.settingsGroupsCollapsed)
    _prevNoteEditorWalkthroughSeen = state.noteEditorWalkthroughSeen
    _prevPlaybarVisible = state.playbarVisible
    _prevHitEffectsEnabled = state.hitEffectsEnabled
    _prevHitEffectPattern = state.hitEffectPattern
    _prevHitEffectBloomThreshold = state.hitEffectBloomThreshold
    _prevHitEffectBloomIntensity = state.hitEffectBloomIntensity
    _prevHitEffectBloomSpread = state.hitEffectBloomSpread
    _prevHitEffectScope = state.hitEffectScope
    _prevHitEffectColor = state.hitEffectColor
    _prevSelectedSoundfont = state.selectedSoundfont
    return
  }
  if (
    state.noteNaming !== _prevNoteNaming ||
    state.accidentals !== _prevAccidentals ||
    state.masterVolume !== _prevMasterVolume ||
    state.audioEngine !== _prevAudioEngine ||
    state.showBarNumbers !== _prevShowBarNumbers ||
    state.noteEditorEnabled !== _prevNoteEditorEnabled ||
    state.noteEditorToolbarX !== _prevNoteEditorToolbarX ||
    state.noteEditorToolbarY !== _prevNoteEditorToolbarY ||
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
    state.autoCollapseDrawers !== _prevAutoCollapseDrawers ||
    state.autoMuteNonKeyboard !== _prevAutoMuteNonKeyboard ||
    JSON.stringify(state.settingsGroupsCollapsed) !== _prevSettingsGroupsCollapsed ||
    state.noteEditorWalkthroughSeen !== _prevNoteEditorWalkthroughSeen ||
    state.playbarVisible !== _prevPlaybarVisible ||
    state.hitEffectsEnabled !== _prevHitEffectsEnabled ||
    state.hitEffectPattern !== _prevHitEffectPattern ||
    state.hitEffectBloomThreshold !== _prevHitEffectBloomThreshold ||
    state.hitEffectBloomIntensity !== _prevHitEffectBloomIntensity ||
    state.hitEffectBloomSpread !== _prevHitEffectBloomSpread ||
    state.hitEffectScope !== _prevHitEffectScope ||
    state.hitEffectColor !== _prevHitEffectColor ||
    state.selectedSoundfont !== _prevSelectedSoundfont
  ) {
    _prevNoteNaming = state.noteNaming
    _prevAccidentals = state.accidentals
    _prevMasterVolume = state.masterVolume
    _prevAudioEngine = state.audioEngine
    _prevShowBarNumbers = state.showBarNumbers
    _prevNoteEditorEnabled = state.noteEditorEnabled
    _prevNoteEditorToolbarX = state.noteEditorToolbarX
    _prevNoteEditorToolbarY = state.noteEditorToolbarY
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
    _prevAutoCollapseDrawers = state.autoCollapseDrawers
    _prevAutoMuteNonKeyboard = state.autoMuteNonKeyboard
    _prevSettingsGroupsCollapsed = JSON.stringify(state.settingsGroupsCollapsed)
    _prevNoteEditorWalkthroughSeen = state.noteEditorWalkthroughSeen
    _prevPlaybarVisible = state.playbarVisible
    _prevHitEffectsEnabled = state.hitEffectsEnabled
    _prevHitEffectPattern = state.hitEffectPattern
    _prevHitEffectBloomThreshold = state.hitEffectBloomThreshold
    _prevHitEffectBloomIntensity = state.hitEffectBloomIntensity
    _prevHitEffectBloomSpread = state.hitEffectBloomSpread
    _prevHitEffectScope = state.hitEffectScope
    _prevHitEffectColor = state.hitEffectColor
    _prevSelectedSoundfont = state.selectedSoundfont
    window.electronAPI?.setPrefs?.({
      noteNaming: state.noteNaming,
      accidentals: state.accidentals,
      masterVolume: state.masterVolume,
      audioEngine: state.audioEngine,
      showBarNumbers: state.showBarNumbers,
      noteEditorEnabled: state.noteEditorEnabled,
      noteEditorToolbarX: state.noteEditorToolbarX,
      noteEditorToolbarY: state.noteEditorToolbarY,
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
      autoCollapseDrawers: state.autoCollapseDrawers,
      autoMuteNonKeyboard: state.autoMuteNonKeyboard,
      settingsGroupsCollapsed: state.settingsGroupsCollapsed,
      noteEditorWalkthroughSeen: state.noteEditorWalkthroughSeen,
      playbarVisible: state.playbarVisible,
      hitEffectsEnabled: state.hitEffectsEnabled,
      hitEffectPattern: state.hitEffectPattern,
      hitEffectBloomThreshold: state.hitEffectBloomThreshold,
      hitEffectBloomIntensity: state.hitEffectBloomIntensity,
      hitEffectBloomSpread: state.hitEffectBloomSpread,
      hitEffectScope: state.hitEffectScope,
      hitEffectColor: state.hitEffectColor,
      selectedSoundfont: state.selectedSoundfont,
    }).catch(() => {})
  }
})

// ── Auto-collapse drawers on playback — closes both the Tracks panel and
// the Settings/Library panel while playing, restores whichever were
// actually open on pause, stop, or a new file loading. ─────────────────────
let _prevPlaybackStateForCollapse: PlaybackState | null = null
let _prevMidiForCollapse: unknown = null
let _drawersAutoCollapsed = false
let _preCollapseTrackPanelOpen = false
let _preCollapseSettingsPanelOpen = false
// Seek operations (wheel-scrub, skip buttons) force a brief real
// playing->paused->playing transition to get the audio engine to rebuild at
// the new position — without this debounce, every one of those ~20ms blips
// would restore the panels and immediately re-collapse them, visibly
// flashing open. Only actually restore if playback is still non-playing
// after the debounce window.
let _restoreTimer: ReturnType<typeof setTimeout> | null = null
const RESTORE_DEBOUNCE_MS = 150
const _unsubCollapse = useStore.subscribe((state) => {
  if (!state.autoCollapseDrawers) { _drawersAutoCollapsed = false; return }

  if (state.midi !== _prevMidiForCollapse) {
    _prevMidiForCollapse = state.midi
    if (_drawersAutoCollapsed) {
      if (_restoreTimer) { clearTimeout(_restoreTimer); _restoreTimer = null }
      _drawersAutoCollapsed = false
      if (_preCollapseTrackPanelOpen) state.setTrackPanelOpen(true)
      if (_preCollapseSettingsPanelOpen) state.setSettingsPanelOpen(true)
    }
  }

  if (state.playbackState !== _prevPlaybackStateForCollapse) {
    const wasPlaying = _prevPlaybackStateForCollapse === 'playing'
    const isPlaying = state.playbackState === 'playing'
    _prevPlaybackStateForCollapse = state.playbackState

    if (isPlaying) {
      if (_restoreTimer) { clearTimeout(_restoreTimer); _restoreTimer = null }
      if (!_drawersAutoCollapsed) {
        _preCollapseTrackPanelOpen = state.trackPanelOpen
        _preCollapseSettingsPanelOpen = state.settingsPanelOpen
        _drawersAutoCollapsed = true
        if (state.trackPanelOpen) state.setTrackPanelOpen(false)
        if (state.settingsPanelOpen) state.setSettingsPanelOpen(false)
      }
    } else if (wasPlaying && _drawersAutoCollapsed) {
      if (_restoreTimer) clearTimeout(_restoreTimer)
      _restoreTimer = setTimeout(() => {
        _restoreTimer = null
        if (useStore.getState().playbackState === 'playing') return // was just a blip
        _drawersAutoCollapsed = false
        if (_preCollapseTrackPanelOpen) useStore.getState().setTrackPanelOpen(true)
        if (_preCollapseSettingsPanelOpen) useStore.getState().setSettingsPanelOpen(true)
      }, RESTORE_DEBOUNCE_MS)
    }
  }
})

// ── HMR safety — this module registers module-scope useStore.subscribe()
// listeners above. Vite hot-reloading this file re-runs all of that top-level
// code without tearing down the previous run's subscriptions first, so
// repeated edits during a dev session accumulate duplicate listeners, each
// with its own stale closure state (e.g. _drawersAutoCollapsed out of sync
// with a newer copy) — fighting each other and visibly flickering panel
// open/close state. Disposing the old module's subscriptions before Vite
// swaps it in prevents that pile-up. ──────────────────────────────────────────
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    _unsubFav()
    _unsubPrefs()
    _unsubCollapse()
    if (_restoreTimer) clearTimeout(_restoreTimer)
  })
}

// ── Theme ─────────────────────────────────────────────────────────────────────
// Exported so PianoRoll and App.tsx can read it without subscribing to full store
export type AppTheme = 'dark' | 'warm'
