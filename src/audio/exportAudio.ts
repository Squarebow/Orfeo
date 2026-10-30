// ── Export to audio: one song → one file ────────────────────────────────────
// Loads the song (the open one as it plays now, edit buffer included, or a
// Library file read fresh), builds the chosen version, plays it offline with
// the chosen sound, finishes it (start, tail, level) and saves it to
// <library>/Orfeo/Exports. The renderers are imported on demand: Studio's
// synth stays out of the startup bundle, as the Samples engine keeps it.
import { useStore } from '../store'
import { NES } from '../utils/noteEditorState'
import { parseMidiBuffer } from '../utils/midiParser'
import { resolveToMidiBase64, base64ToBytes, detectForeignFormat, getCachePath } from '../utils/foreignFormatImport'
import { buildExportSong, exportFileName, type ExportVersion, type ExportSong } from './exportSong'
import { finishAudio, encodeWav, encodeMp3, yieldToPage, type Stereo } from './exportEncode'
import { masterKnobs } from './engine'
import type { SoundfontId, TrackState, ParsedMidi } from '../types'

export type ExportSound = 'studio' | 'native'
export type ExportFormat = 'mp3' | 'wav'
export type ExportStage = 'render' | 'encode' | 'save'
export interface ExportOptions { songPath: string; songName: string; version: ExportVersion; sound: ExportSound; soundfont: SoundfontId; format: ExportFormat }

// One step at a time, with the page getting a turn in between: playback (the
// Studio engine times its notes on this thread) never waits on a long chunk
const breathe = yieldToPage

// ── An export pauses the song (as an Explorer does) and keeps Space from
// restarting it until it's done: the export then never shares its time with playback
let _exporting = 0
export const isExporting = () => _exporting > 0
export function pauseForExport(): void {
  if (useStore.getState().playbackState !== 'playing') return
  ;(window as any).__orfeoPlayer?.pause?.()
  useStore.setState({ playbackState: 'paused' })
}

export class ExportError extends Error {
  // unreadable: the file can't be read · empty: no notes · silent: notes, but nothing
  // audible came out · soundset: the chosen sound set isn't there any more ·
  // failed: anything else (the message is the technical detail, for the log)
  constructor(public kind: 'unreadable' | 'empty' | 'silent' | 'soundset' | 'failed', message: string = kind) { super(message) }
}

// Windows paths: either slash, any letter case
const samePath = (a: string, b: string) => a.replace(/\\/g, '/').toLowerCase() === b.replace(/\\/g, '/').toLowerCase()

/** The song open in Orfeo right now is this file — or, for a Guitar Pro /
 *  MusicXML file, its converted copy (what Orfeo actually opens) */
export function isOpenSong(songPath: string): boolean {
  const { midi, libraryFolder } = useStore.getState()
  const open = (midi as any)?._filePath as string | undefined
  if (!open) return false
  if (samePath(open, songPath)) return true
  return !!detectForeignFormat(songPath) && samePath(open, getCachePath(songPath, libraryFolder ?? null))
}

async function loadSong(songPath: string, version: ExportVersion): Promise<{ midi: ParsedMidi; tracks: TrackState[] }> {
  if (isOpenSong(songPath)) {
    const s = useStore.getState()
    // unsaved note edits are part of what you hear, not of the song as written
    const midi = (version === 'heard' && NES.dirty && NES.editMidi ? NES.editMidi : s.midi) as unknown as ParsedMidi
    return { midi, tracks: s.tracks }
  }
  // read once per window: switching versions doesn't re-read the file
  if (_loaded && samePath(_loaded.path, songPath)) return _loaded.song
  const r = await window.electronAPI.loadMidiFromPath(songPath)
  if (!r) throw new ExportError('unreadable')
  try {
    const resolved = await resolveToMidiBase64(songPath, r.base64, useStore.getState().libraryFolder ?? null)
    const bytes = base64ToBytes(resolved.base64)
    const midi = parseMidiBuffer(bytes.buffer as ArrayBuffer, r.fileName)
    // a song that isn't open plays as the file has it
    const tracks = midi.tracks.map(t => ({ index: t.index, program: t.program, muted: false, solo: false, volume: 1, pan: 0, reverb: 0, chorus: 0 })) as unknown as TrackState[]
    _loaded = { path: songPath, song: { midi, tracks } }
    return _loaded.song
  } catch { throw new ExportError('unreadable') }
}
let _loaded: { path: string; song: { midi: ParsedMidi; tracks: TrackState[] } } | null = null
/** The window closed: the next one reads the file afresh */
export function forgetLoadedSong() { _loaded = null }

/** What would play for this version — for the window's notes (no keys part, nothing to export) */
export async function previewExport(songPath: string, version: ExportVersion): Promise<ExportSong> {
  const { midi, tracks } = await loadSong(songPath, version)
  return build(midi, tracks, version)
}

function build(midi: ParsedMidi, tracks: TrackState[], version: ExportVersion): ExportSong {
  if (version !== 'heard') return buildExportSong(midi, tracks, version)
  const s = useStore.getState()
  const k = masterKnobs()
  // the Mixer's master reverb/chorus, once turned, play for every track (as live)
  const heardTracks = tracks.map(t => ({ ...t, reverb: k.reverb ?? t.reverb, chorus: k.chorus ?? t.chorus }))
  return buildExportSong(midi, heardTracks, 'heard', {
    tempoRatio: s.originalBpm > 0 ? s.bpm / s.originalBpm : 1,
    transpose: s.detectedKey?.transpose ?? 0,
    master: { gain: s.masterVolume, toneDb: k.tone * 12, comp: { enabled: s.masterCompEnabled, preset: s.masterCompPreset } },
    loop: s.loopRegionActive && s.loopStart != null && s.loopEnd != null ? { start: s.loopStart, end: s.loopEnd } : null,
  })
}

async function studioBanks(soundfont: SoundfontId): Promise<ArrayBuffer[]> {
  const res = await fetch(new URL('./GeneralUser-GS.sf2', location.href).href)
  if (!res.ok) throw new ExportError('failed', `built-in sound set not found (${res.status})`)
  const banks = [await res.arrayBuffer()]
  if (soundfont !== 'generaluser-gs') {
    const extra = await window.electronAPI.readSoundfont(soundfont)
    if (!extra) throw new ExportError('soundset')
    banks.push(extra)
  }
  return banks
}

/** The finished audio, or why there is none: the version has notes (checked
 *  before playing), so an all-silent result means nothing could be heard */
export function finishOrExplain(dry: Stereo, songDuration: number): Stereo {
  const finished = finishAudio(dry, songDuration)
  if (!finished.l.length) throw new ExportError('silent')
  return finished
}

/** Exports one song; resolves to the saved file's path, or null when cancelled */
export async function exportToAudio(o: ExportOptions, onProgress: (stage: ExportStage, p: number) => void, isCancelled: () => boolean): Promise<string | null> {
  pauseForExport()
  _exporting++
  try { return await runExport(o, onProgress, isCancelled) } finally { _exporting-- }
}

async function runExport(o: ExportOptions, onProgress: (stage: ExportStage, p: number) => void, isCancelled: () => boolean): Promise<string | null> {
  if (o.version === 'heard' && !isOpenSong(o.songPath)) throw new ExportError('failed', 'open the song first')
  const { midi, tracks } = await loadSong(o.songPath, o.version)
  const song = build(midi, tracks, o.version)
  if (!song.events.some(e => (e.status & 0xf0) === 0x90)) throw new ExportError('empty')

  onProgress('render', 0)
  let dry: Stereo
  try {
    if (o.sound === 'native') {
      const extra = o.soundfont !== 'generaluser-gs'
      const paths = await window.electronAPI.nativeSoundfontPaths(extra ? o.soundfont : null)
      // the extra set comes on top of the built-in one: missing = not installed any more
      if (extra && paths.length < 2) throw new ExportError('soundset')
      const { renderNative } = await import('./exportNative')
      dry = await renderNative(song, paths, p => onProgress('render', p), isCancelled)
    } else {
      const banks = await studioBanks(o.soundfont)
      const { renderStudio } = await import('./exportStudio')
      dry = await renderStudio(song, banks, p => onProgress('render', p), isCancelled)
    }
  } catch (e: any) {
    if (e instanceof ExportError) throw e
    throw new ExportError('failed', String(e?.message ?? e))
  }
  if (isCancelled() || !dry.l.length) return null

  await breathe()
  const finished = finishOrExplain(dry, song.duration)
  onProgress('encode', 0)
  await breathe()
  const bytes = o.format === 'mp3'
    ? await encodeMp3(finished, p => onProgress('encode', p), isCancelled)
    : encodeWav(finished)
  if (isCancelled() || !bytes.length) return null

  onProgress('save', 0)
  await breathe()
  const path = await window.electronAPI.saveExport(o.songPath, useStore.getState().libraryFolder ?? null, exportFileName(o.songName, o.version, o.format), bytes)
  onProgress('save', 1)
  return path
}
