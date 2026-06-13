// ─── MIDI Types ───────────────────────────────────────────────────────────────

export interface MidiNote {
  id: string
  midi: number        // 0–127 MIDI note number
  time: number        // seconds from start
  duration: number    // seconds
  velocity: number    // 0–127
  trackIndex: number
  channel: number
}

export interface MidiTrack {
  index: number
  name: string
  channel: number
  instrument: number  // GM instrument number
  color: string       // hex color
  notes: MidiNote[]
  // state
  muted: boolean
  solo: boolean
  visible: boolean
  volume: number      // 0–1
  pan: number         // -1 to 1
}

export interface MidiFile {
  name: string
  path: string
  duration: number    // total seconds
  bpm: number         // original tempo
  timeSignature: { numerator: number; denominator: number }
  tracks: MidiTrack[]
  totalBars: number
}

// ─── Playback Types ───────────────────────────────────────────────────────────

export type PlaybackState = 'stopped' | 'playing' | 'paused'

export interface PlaybackPosition {
  seconds: number
  bar: number
  beat: number
}

export interface LoopRegion {
  startBar: number
  endBar: number
  active: boolean
}

// ─── Keyboard Types ───────────────────────────────────────────────────────────

export type KeyboardSize = 61 | 73 | 88

export type KeyboardMode = 'docked' | 'float'

export interface KeyState {
  midi: number
  pressed: boolean
  color: string | null  // null = not pressed
  source: 'midi-file' | 'midi-keyboard' | 'mouse' | null
}

// ─── Settings Types ───────────────────────────────────────────────────────────

export type NoteNamingSystem = 'english' | 'central-european' | 'solfege' | 'hidden'

export type NoteDirection = 'down' | 'right'  // down = Synthesia, right = DAW

export interface AppSettings {
  noteNaming: NoteNamingSystem
  noteDirection: NoteDirection
  keyboardSize: KeyboardSize
  keyboardMode: KeyboardMode
  keyboardPosition: { x: number; y: number }  // for float mode
  showChordDisplay: boolean
  showKeySignature: boolean
  showBarRuler: boolean
  metronomeEnabled: boolean
  countInBeats: number   // 0 = no count-in
  theme: 'dark'          // future: light
}

// ─── Chord Types ─────────────────────────────────────────────────────────────

export interface DetectedChord {
  name: string           // e.g. "Am7", "G/B"
  root: string           // e.g. "A"
  quality: string        // e.g. "minor seventh"
  notes: number[]        // MIDI note numbers
  inversion: number      // 0 = root, 1 = first, 2 = second
}

// ─── Soundfont Types ─────────────────────────────────────────────────────────

export interface SoundfontInfo {
  id: string
  name: string
  path: string
  isDefault: boolean
}

// ─── Window API ──────────────────────────────────────────────────────────────

// Matches what electron/preload.ts exposes
export interface OrfeoAPI {
  openMidiFile: () => Promise<{ path: string; name: string; data: number[] } | null>
  saveMidiFile: (defaultName: string) => Promise<string | null>
  openExternal: (url: string) => Promise<void>
  platform: string
}

declare global {
  interface Window {
    orfeo: OrfeoAPI
  }
}
