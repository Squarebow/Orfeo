// L = left hand, R = right hand. Canonical location for this type — the hand
// engine (utils/handAssignment.ts) and metadata round-trip (utils/handMetadata.ts)
// both import it from here rather than declaring their own.
export type Hand = 'L' | 'R'

export interface ParsedNote {
  midi: number
  time: number
  duration: number
  velocity: number
  trackIndex: number
  // ── Hand-assignment sidecar — authoritative in-memory source of truth ──────
  // Set either by utils/handAssignment.ts (assignHands()) or restored from an
  // exported hint on reimport (utils/handMetadata.ts). Absent until one of
  // those has run; absence is not itself meaningful (not yet decided, not "no hand").
  hand?: Hand
  // 0..1, present only alongside `hand`. Sidecar-only — never written to the
  // exported MIDI file. Re-derivable from the algorithm, not authoritative
  // once a human has accepted a split, so there's no case for spending an
  // SMF meta-event slot on it.
  handConfidence?: number
}

export interface ParsedTrack {
  index: number
  name: string
  gmName: string
  program: number
  group: string
  isDrum: boolean
  color: string
  notes: ParsedNote[]
  channel: number
}

export interface TempoEvent {
  bpm: number
  time: number
}

export interface ParsedMidi {
  fileName: string
  duration: number
  bpm: number
  timeSignatureNumerator: number
  timeSignatureDenominator: number
  tracks: ParsedTrack[]
  noteCount: number
  _tempoMap?: TempoEvent[]
}

export type PlaybackState = 'stopped' | 'playing' | 'paused'

export interface TrackState {
  index: number
  name: string
  gmName: string
  trackName: string  // user-visible label; defaults to gmName, editable in MIDI Playback Editor
  program: number
  group: string
  isDrum: boolean
  color: string
  colorSource: 'default' | 'palette' | 'custom'
  muted: boolean
  solo: boolean
  visible: boolean
  showOnKeyboard: boolean
  volume: number
  pan: number
}

export type KeyboardSize = 61 | 73 | 88
export type KeyboardMode = 'docked' | 'floating'
export type NoteNaming = 'english' | 'central-european' | 'solfege' | 'hidden'
export type Accidentals = 'flat' | 'sharp'

export interface MidiFileResult {
  fileName: string
  filePath: string
  base64: string
}

export interface LibraryFile {
  name: string
  path: string
}

export interface ChordEvent {
  time: number
  name: string
  notes: string[]
}

export interface TranscriptEntry {
  midiPath: string
  transcriptPath: string
  date: string
}

declare global {
  interface Window {
    electronAPI: {
      openMidiFile:        () => Promise<MidiFileResult | null>
      getPrefs:            () => Promise<Record<string, any>>
      setPrefs:            (data: Record<string, any>) => Promise<void>
      openFolder:          () => Promise<string | null>
      scanMidiFolder:      (path: string) => Promise<LibraryFile[]>
      getDemoFolder:       () => Promise<string | null>
      loadMidiFromPath:    (path: string) => Promise<MidiFileResult | null>
      windowMinimize:      () => Promise<void>
      windowMaximize:      () => Promise<void>
      windowClose:         () => Promise<void>
      transcriptGenerate:  (midiPath: string, noteNaming: string, accidentals: string) => Promise<{ success: boolean; path?: string; error?: string }>
      splitMidiEditor:     (payload: { filePath: string; trackIndex: number; breakpointType: 'single' | 'range'; breakpoint: number; rangeStart: number; rangeEnd: number }) => Promise<{ ok: boolean; message: string; filePath?: string; fileName?: string; base64?: string }>
      saveFileDialog:      (opts: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>
      saveMidiEditor:      (payload: { filePath: string; outputPath: string; includedTracks: { index: number; newProgram: number }[]; mergeGroups: number[][]; trackNames?: Record<number, string> }) => Promise<{ ok: boolean; message: string; filePath?: string; fileName?: string; base64?: string }>
      saveNoteEditor:      (payload: { outputPath: string; base64: string }) => Promise<{ ok: boolean; message?: string; filePath?: string; fileName?: string; base64?: string }>
      showMessageBox:      (opts: { type?: string; buttons: string[]; defaultId?: number; cancelId?: number; message: string; detail?: string }) => Promise<{ response: number }>
      confirmClose:        () => Promise<void>
      setFullScreen:       (value: boolean) => Promise<void>
      onSaveBeforeClose:   (fn: () => void) => void
      offSaveBeforeClose:  () => void
      openExternal:        (url: string) => Promise<void>
      // Drag-and-drop file import
      getPathForFile:      (file: File) => string
      copyMidiToLibrary:   (sourcePath: string, libraryFolder: string) => Promise<string>
      // Foreign format import cache
      getCachedImport:     (sourcePath: string, cachePath: string) => Promise<string | null>
      writeCachedImport:   (destPath: string, base64: string) => Promise<void>
    }
  }
}
