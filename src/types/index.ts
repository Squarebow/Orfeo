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
  program: number      // GM program 0-127, -1 for drums
  group: string        // GM group key (piano, guitar, drums, etc.)
  isDrum: boolean
  color: string
  notes: ParsedNote[]
  channel: number
}

export interface ParsedMidi {
  fileName: string
  duration: number
  bpm: number
  timeSignatureNumerator: number
  timeSignatureDenominator: number
  tracks: ParsedTrack[]
  noteCount: number
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
  showOnKeyboard: boolean   // whether notes light up the piano keyboard
  volume: number
  pan: number
}

export type KeyboardSize = 61 | 73 | 88
export type KeyboardMode = 'docked' | 'floating'
export type NoteNaming = 'english' | 'central-european' | 'solfege' | 'hidden'

export interface MidiFileResult {
  fileName: string
  filePath: string
  base64: string
}

declare global {
  interface Window {
    electronAPI: {
      openMidiFile: () => Promise<MidiFileResult | null>
    }
  }
}