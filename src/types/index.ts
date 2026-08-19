// L = left hand, R = right hand. Canonical location for this type — the hand
// engine (utils/handAssignment.ts) and metadata round-trip (utils/handMetadata.ts)
// both import it from here rather than declaring their own.
export type Hand = 'L' | 'R'

// Canonical location for the note-hit visual effect pattern — the store and
// components/PianoRoll/HitEffects.ts both import it from here.
export type HitEffectPattern =
  | 'glowBloom' | 'rippleRing' | 'particleBurst'
  | 'smokePlume' | 'colorAura' | 'starburstNova' | 'cometTrail'

// Downloadable extra SF2/SF3 sound libraries (Samples engine). 'generaluser-gs'
// is the always-bundled default and is never downloaded/deleted. User-imported
// soundfonts get a dynamic 'custom:<filename>' id, so this is a plain string
// rather than a fixed union.
export type SoundfontId = string

export interface SoundfontInfo {
  id: SoundfontId
  name: string
  sizeMB: number
  downloaded: boolean
  custom?: boolean
}

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
  // ── 'computed' = algorithm decided this (default once `hand` is set).
  // 'manual' = a human confirmed it via Note Editor's Assign LH/RH — from
  // then on authoritative: assignHands()/auto-tag-on-load must never
  // overwrite it, and Split partitions it by tag instead of recomputing.
  // Absent has the same meaning as 'computed' for any note that predates
  // this field (old hints, notes assigned before this existed). ────────────
  handSource?: 'computed' | 'manual'
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
  chorus: number
  reverb: number
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
  // ── Root-position identity for this chord — null when structured detection
  // fails even though basic detection succeeded (rare). Lets consumers (the
  // playback chord-display context menu) reconstruct a canonical voicing via
  // buildChordMidi() without re-parsing the localized display name. ─────────
  structured: { rootPitchClass: number; intervals: string[]; rawRootName: string } | null
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
      saveFileDialog:      (opts: { defaultPath: string; filters: { name: string; extensions: string[] }[] }) => Promise<string | null>
      saveMidiEditor:      (payload: { filePath: string; outputPath: string; includedTracks: { index: number; newProgram: number; name?: string; color?: string; splitHand?: 'L' | 'R'; visible?: boolean; showOnKeyboard?: boolean }[]; mergeGroups: number[][]; rhMaxFingers?: number; lhMaxFingers?: number; bpmRatio?: number; transposeSemitones?: number; finalKey?: { semitone: number; isMinor: boolean } }) => Promise<{ ok: boolean; message: string; filePath?: string; fileName?: string; base64?: string }>
      saveMixerChannels:   (payload: { filePath: string; channels: { index: number; volume: number; pan: number; chorus: number; reverb: number }[] }) => Promise<{ ok: boolean; message?: string; filePath?: string; fileName?: string; base64?: string }>
      saveNoteEditor:      (payload: { filePath: string; base64: string; summary?: string }) => Promise<{ ok: boolean; message?: string; filePath?: string; fileName?: string; base64?: string }>
      saveTempoKey:        (payload: { filePath: string; bpmRatio: number; transposeSemitones: number; summary: string; finalKey?: { semitone: number; isMinor: boolean } }) => Promise<{ ok: boolean; message?: string; filePath?: string; fileName?: string; base64?: string }>
      showMessageBox:      (opts: { type?: string; buttons: string[]; defaultId?: number; cancelId?: number; message: string; detail?: string }) => Promise<{ response: number }>
      confirmClose:        () => Promise<void>
      setFullScreen:       (value: boolean) => Promise<void>
      onSaveBeforeClose:   (fn: () => void) => void
      offSaveBeforeClose:  () => void
      openExternal:        (url: string) => Promise<void>
      openFolderInExplorer: (folderPath: string) => Promise<string>
      showItemInFolder:    (filePath: string) => Promise<void>
      // Library folder management — create/rename/delete/move, scoped to libraryFolder
      listLibraryFolders:  (libraryFolder: string) => Promise<string[]>
      createLibraryFolder: (libraryFolder: string, name: string) => Promise<string>
      renameLibraryFolder: (libraryFolder: string, oldName: string, newName: string) => Promise<{ ok: boolean; reason?: string; name?: string; pairs?: { oldPath: string; newPath: string }[] }>
      deleteLibraryFolder: (libraryFolder: string, name: string) => Promise<{ ok: boolean; reason?: string }>
      renameLibraryFile: (filePath: string, newName: string) => Promise<{ ok: boolean; reason?: string; newPath?: string }>
      getFileLog:  (filePath: string) => Promise<{ type: string; timestamp: number; summary: string }[]>
      logFileEvent: (filePath: string, type: string, summary: string) => Promise<void>
      listFileVersions: (filePath: string) => Promise<{ name: string; path: string; version: number; mtime: number }[]>
      moveLibraryFiles:    (filePaths: string[], libraryFolder: string, destFolderName: string | null) => Promise<{ oldPath: string; newPath: string }[]>
      // Downloadable extra soundfonts (Samples engine)
      listSoundfonts:      () => Promise<SoundfontInfo[]>
      downloadSoundfont:   (id: SoundfontId) => Promise<{ ok: boolean; error?: string }>
      deleteSoundfont:     (id: SoundfontId) => Promise<void>
      readSoundfont:       (id: SoundfontId) => Promise<ArrayBuffer | null>
      importSoundfont:     () => Promise<SoundfontId | null>
      onSoundfontProgress: (fn: (data: { id: SoundfontId; progress: number }) => void) => void
      offSoundfontProgress: () => void
      // Drag-and-drop file import
      getPathForFile:      (file: File) => string
      copyMidiToLibrary:   (sourcePath: string, libraryFolder: string) => Promise<string>
      // Foreign format import cache
      getCachedImport:     (sourcePath: string, cachePath: string) => Promise<string | null>
      writeCachedImport:   (destPath: string, base64: string) => Promise<void>
      // Auto-update (GitHub Releases)
      checkForUpdates:     () => Promise<void>
      installUpdate:       () => Promise<void>
      onUpdateStatus:      (fn: (data: UpdateStatus) => void) => void
      offUpdateStatus:     () => void
    }
  }
}

export type UpdateStatus = {
  state: 'idle' | 'checking' | 'up-to-date' | 'downloading' | 'ready' | 'error' | 'unavailable'
  version?: string
  percent?: number
  reason?: string
  message?: string
}
