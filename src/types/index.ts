// ─── MIDI / Note Types ───────────────────────────────────────────────────────

export interface ParsedNote {
  /** MIDI pitch 0–127 */
  midi: number
  /** Start time in seconds */
  time: number
  /** Duration in seconds */
  duration: number
  /** Velocity 0–1 */
  velocity: number
  /** Track index this note belongs to */
  trackIndex: number
}

export interface ParsedTrack {
  index: number
  name: string
  /** Assigned display color (hex) */
  color: string
  notes: ParsedNote[]
  /** Channel 0–15 */
  channel: number
}

export interface ParsedMidi {
  fileName: string
  /** Total duration in seconds */
  duration: number
  /** Tempo in beats per minute */
  bpm: number
  /** Time signature numerator */
  timeSignatureNumerator: number
  /** Time signature denominator */
  timeSignatureDenominator: number
  tracks: ParsedTrack[]
  /** Total note count across all tracks */
  noteCount: number
}

// ─── Playback ────────────────────────────────────────────────────────────────

export type PlaybackState = 'stopped' | 'playing' | 'paused'

// ─── Track Panel ─────────────────────────────────────────────────────────────

export interface TrackState {
  index: number
  name: string
  color: string
  muted: boolean
  solo: boolean
  visible: boolean
  volume: number  // 0–1
  pan: number     // -1 to 1
}

// ─── Keyboard ────────────────────────────────────────────────────────────────

export type KeyboardSize = 61 | 73 | 88

export type KeyboardMode = 'docked' | 'floating'

// ─── Settings ────────────────────────────────────────────────────────────────

export type NoteNaming = 'english' | 'central-european' | 'solfege' | 'hidden'

// ─── Electron bridge ─────────────────────────────────────────────────────────

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
