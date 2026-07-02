export interface ParsedNote {
  midi: number
  time: number
  duration: number
  velocity: number
  trackIndex: number
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
  program: number
  group: string
  isDrum: boolean
  color: string
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
      loadMidiFromPath:    (path: string) => Promise<MidiFileResult | null>
      windowMinimize:      () => Promise<void>
      windowMaximize:      () => Promise<void>
      windowClose:         () => Promise<void>
      transcriptGenerate:  (midiPath: string, noteNaming: string, accidentals: string) => Promise<{ success: boolean; path?: string; error?: string }>
      splitMidiEditor:     (payload: { trackIndex: number; breakpoint: number }) => Promise<{ ok: boolean; message: string }>
    }
  }
}
