// ── The save badge's brain: what's unsaved in the open song, and how to save
// or undo each part ──────────────────────────────────────────────────────────
// Saving itself is unchanged: every save is a new _ORFEO_vN through the same
// main-process saves as before (Note Editor, tempo & key, Mixer, Playback
// Editor). What's new:
// - one list of everything unsaved (the badge in the top bar, and the one
//   window when a song goes away);
// - a save keeps the OTHER unsaved changes: a save reloads the song, which
//   used to reset everything not in that save (save the Mixer → your hidden
//   tracks came back). They're put back on top of the new version, for every
//   save in the app (keepUnsavedAround);
// - Save all: note edits first (their own save), then mixer, tempo & key and
//   shown / lights / mute together in one version.
import { useStore, playerTrackFlags } from '../store'
import type { TrackState } from '../types'
import { NES, buildNoteEditSummary } from './noteEditorState'
import { computeTempoKeyPayload, saveTempoKeyChanges } from './tempoKeySave'
import { parseMidiBuffer } from './midiParser'
import { carryCorrection } from './tempoCorrection'
import { songKey } from './songIdentity'
import { parseKeySignature, detectKeyFromTracks, formatKey } from './keyDetection'
import { getCachePath } from './foreignFormatImport'
import { confirmDialog } from './confirmController'
import { setChannelVolume, setChannelPan, setChannelReverb, setChannelChorus } from '../audio/engine'
import { t } from './i18n'
import { countUnsaved } from './unsavedChanges'

export type UnsavedKind = 'notes' | 'tempoKey' | 'mixer' | 'tracks' | 'playbackEditor' | 'import'
export interface UnsavedRow { kind: UnsavedKind; label: string; detail: string }

type Mix = 'volume' | 'pan' | 'chorus' | 'reverb'
const MIX: Mix[] = ['volume', 'pan', 'chorus', 'reverb']
type Flag = 'muted' | 'visible' | 'showOnKeyboard'

const plural = (n: number, one: string, many: string) => n === 1 ? one : many

// ── What's unsaved ───────────────────────────────────────────────────────────
function mixerChanged(): TrackState[] {
  const { tracks, mixerBaseline } = useStore.getState()
  return tracks.filter(tr => { const b = mixerBaseline[tr.index]; return !!b && MIX.some(k => b[k] !== tr[k]) })
}

/** Tracks whose eye, keyboard lights or mute differ from the file's own — as
 *  the player set them (Focus mode's and the Note Editor's hand view don't count) */
export function trackFlagChanges(): { shown: number; lights: number; muted: number; changed: Map<number, Set<Flag>> } {
  const s = useStore.getState()
  const out = { shown: 0, lights: 0, muted: 0, changed: new Map<number, Set<Flag>>() }
  if (!s.saveTrackChangesEnabled) return out  // session only: nothing to save
  for (const tr of s.tracks) {
    const b = s.mixerBaseline[tr.index]
    if (!b) continue
    const f = playerTrackFlags(tr)
    const set = new Set<Flag>()
    if (f.visible !== b.visible) { out.shown++; set.add('visible') }
    if (tr.showOnKeyboard !== b.showOnKeyboard) { out.lights++; set.add('showOnKeyboard') }
    if (f.muted !== b.muted) { out.muted++; set.add('muted') }
    if (set.size) out.changed.set(tr.index, set)
  }
  return out
}

function tempoKeyDirty(): boolean {
  const s = useStore.getState()
  return s.saveTempoKeyChangesEnabled && !!s.midi && (s.bpm !== s.originalBpm || (s.detectedKey?.transpose ?? 0) !== 0)
}

export function collectUnsaved(): UnsavedRow[] {
  const s = useStore.getState()
  if (!s.midi) return []
  const rows: UnsavedRow[] = []

  if (s.noteEditorActive && NES.dirty) {
    const summary = buildNoteEditSummary(NES.history.appliedDescriptions())
    rows.push({ kind: 'notes', label: t`Notes`, detail: summary === 'Saved' ? t`Edited` : summary.charAt(0).toUpperCase() + summary.slice(1) })
  }
  if (tempoKeyDirty()) {
    const parts: string[] = []
    if (s.bpm !== s.originalBpm) parts.push(`${Math.round(s.originalBpm)} → ${Math.round(s.bpm)} BPM`)
    const tr = s.detectedKey?.transpose ?? 0
    if (tr !== 0 && s.detectedKey) {
      parts.push(`${formatKey({ ...s.detectedKey, transpose: 0 }, s.noteNaming, s.accidentals)} → ${formatKey(s.detectedKey, s.noteNaming, s.accidentals)}`)
    }
    rows.push({ kind: 'tempoKey', label: t`Tempo & key`, detail: parts.join(' · ') })
  }
  const mix = mixerChanged().length
  if (mix) rows.push({ kind: 'mixer', label: t`Mixer`, detail: plural(mix, t`1 track`, t`${mix} tracks`) })
  const f = trackFlagChanges()
  if (f.changed.size) {
    const parts: string[] = []
    if (f.shown) parts.push(plural(f.shown, t`1 shown or hidden`, t`${f.shown} shown or hidden`))
    if (f.lights) parts.push(plural(f.lights, t`1 lit or unlit`, t`${f.lights} lit or unlit`))
    if (f.muted) parts.push(plural(f.muted, t`1 muted or unmuted`, t`${f.muted} muted or unmuted`))
    rows.push({ kind: 'tracks', label: t`Tracks`, detail: parts.join(' · ') })
  }
  if (countUnsaved(s.tracks, s.mixerBaseline, s.focusActive).playbackEditor) rows.push({ kind: 'playbackEditor', label: t`Playback Editor`, detail: t`Open, with edits` })
  if (s.pendingImportedFile) rows.push({ kind: 'import', label: t`Imported file`, detail: t`Not saved as MIDI yet` })
  return rows
}

// ── After a save: the new version, and the rest of the session back on top ───
function sendMix(index: number, v: Pick<TrackState, Mix>) {
  const ch = (useStore.getState().midi as any)?.tracks?.[index]?.channel ?? 0
  setChannelVolume(ch, v.volume); setChannelPan(ch, v.pan); setChannelReverb(ch, v.reverb); setChannelChorus(ch, v.chorus)
}

function loadSavedVersion(base64: string, fileName: string, filePath: string, timeScale = 1) {
  const b = atob(base64)
  const bytes = new Uint8Array(b.length)
  for (let i = 0; i < b.length; i++) bytes[i] = b.charCodeAt(i)
  const parsed = parseMidiBuffer(bytes.buffer, fileName, filePath)
  const s = useStore.getState()
  const moved = carryCorrection(s.tempoCorrections, s.songKey, songKey(bytes.buffer), timeScale)
  if (moved) useStore.setState({ tempoCorrections: moved })
  s.setMidi(parsed)
  const raw = parsed as any
  s.setDetectedKey(raw._keySignature ? parseKeySignature(raw._keySignature.key, raw._keySignature.scale) : detectKeyFromTracks(parsed.tracks))
  s.notifyLibrarySaved(filePath)
}

/** Runs one save (or any reload of the open song); whatever it didn't save is
 *  put back on the reloaded song, so no save quietly drops another tool's
 *  changes. Every save goes through here: the badge, the one window, the Note
 *  Editor's and the Playback Editor's own Save. `sameTracks` false = the save
 *  merged, split or deleted tracks, so per-track changes can't be matched up
 *  (the Playback Editor saves the Mixer along then, after saying so). */
export async function keepUnsavedAround(save: () => Promise<boolean>, saves: Set<UnsavedKind>, sameTracks = true): Promise<boolean> {
  const s = useStore.getState()
  const base = s.mixerBaseline
  const handTrack = s.noteEditorSoloTrackIndex
  const handBefore = s.preSoloTrackVisibility
  const was = new Map(s.tracks.map(tr => [tr.index, { ...tr, ...playerTrackFlags(tr) }]))
  const ratio = s.originalBpm > 0 ? s.bpm / s.originalBpm : 1
  const transpose = s.detectedKey?.transpose ?? 0
  const oldMidi = s.midi

  const ok = await save()
  const now = useStore.getState()
  if (!ok || now.midi === oldMidi) return ok  // failed, or nothing reloaded

  if (sameTracks) for (const tr of now.tracks) {
    const w = was.get(tr.index), b = base[tr.index]
    if (!w || !b) continue
    const patch: Partial<TrackState> = { solo: w.solo }
    let mixMoved = false
    if (!saves.has('mixer')) for (const k of MIX) if (w[k] !== b[k]) { patch[k] = w[k]; mixMoved = true }
    if (!saves.has('tracks')) {
      if (w.muted !== b.muted) patch.muted = w.muted
      if (w.visible !== b.visible) patch.visible = w.visible
      if (w.showOnKeyboard !== b.showOnKeyboard) patch.showOnKeyboard = w.showOnKeyboard
    }
    now.updateTrack(tr.index, patch)
    if (mixMoved) sendMix(tr.index, { ...tr, ...patch } as TrackState)
  }
  if (!saves.has('tempoKey')) {
    const after = useStore.getState()
    if (ratio !== 1) useStore.setState({ bpm: after.originalBpm * ratio })
    if (transpose !== 0 && after.detectedKey) useStore.setState({ detectedKey: { ...after.detectedKey, transpose } })
  }
  // The Note Editor's hand view: the reload showed every track again. Put it
  // back after the player's eyes above, so leaving the view later returns to
  // those (unless the Note Editor's own save already did it).
  if (sameTracks && handTrack !== null) {
    setTimeout(() => {
      const st = useStore.getState()
      if (!st.noteEditorActive || st.preSoloTrackVisibility !== handBefore || !st.tracks.some(tr => tr.index === handTrack)) return
      useStore.setState({ noteEditorSoloTrackIndex: null, preSoloTrackVisibility: null })
      useStore.getState().soloTrackForEdit(handTrack, { keepPlayhead: true })
    }, 0)
  }
  return ok
}

async function failed(message?: string) {
  await confirmDialog({ title: t`Save failed`, message: message ?? t`Could not save.`, buttons: [t`OK`] })
  return false
}

// ── Each row ─────────────────────────────────────────────────────────────────
// The Note Editor's own save already keeps the rest (keepUnsavedAround)
export const saveNotes = async () => !!(await NES.onSaveRequest?.())
export function discardNotes() { NES.onResetRequest?.(); NES.onHistoryChange?.() }

export const saveTempoKey = () => keepUnsavedAround(saveTempoKeyChanges, new Set(['tempoKey']))
export function resetTempoKey() {
  const s = useStore.getState()
  useStore.setState({ bpm: s.originalBpm })
  if (s.detectedKey) useStore.setState({ detectedKey: { ...s.detectedKey, transpose: 0 } })
}

export const saveMixer = () => keepUnsavedAround(async () => {
  const s = useStore.getState()
  const filePath = (s.midi as any)?._filePath as string | undefined
  if (!filePath) return false
  const result = await window.electronAPI.saveMixerChannels({
    filePath, channels: mixerChanged().map(tr => ({ index: tr.index, volume: tr.volume, pan: tr.pan, chorus: tr.chorus, reverb: tr.reverb })),
  })
  if (!result.ok || !result.base64 || !result.fileName || !result.filePath) return failed(result.message)
  loadSavedVersion(result.base64, result.fileName, result.filePath)
  return true
}, new Set(['mixer']))

export function undoMixer() {
  const s = useStore.getState()
  for (const tr of mixerChanged()) {
    const b = s.mixerBaseline[tr.index]
    s.updateTrack(tr.index, { volume: b.volume, pan: b.pan, chorus: b.chorus, reverb: b.reverb })
    sendMix(tr.index, b)
  }
}

export function undoTrackFlags() {
  const s = useStore.getState()
  if (s.focusActive) s.setTrackMuteFilter(false)  // Focus mode puts its own back first
  const now = useStore.getState()
  for (const tr of now.tracks) {
    const b = now.mixerBaseline[tr.index]
    if (b) now.updateTrack(tr.index, { muted: b.muted, visible: b.visible, showOnKeyboard: b.showOnKeyboard })
  }
}

/** Mixer, tempo & key and shown / lights / mute in one new version, through the
 *  Playback Editor's save (the song's track layout stays as it is) */
async function saveTogether(kinds: Set<UnsavedKind>): Promise<boolean> {
  const s = useStore.getState()
  const filePath = (s.midi as any)?._filePath as string | undefined
  if (!filePath) return false
  const tempo = kinds.has('tempoKey') ? computeTempoKeyPayload() : null
  const mixer = kinds.has('mixer') ? mixerChanged().map(tr => ({ index: tr.index, volume: tr.volume, pan: tr.pan, chorus: tr.chorus, reverb: tr.reverb })) : undefined
  // "Save track changes" off: the version keeps the file's own shown / lights /
  // mute; the session's are put back on top afterwards (keepUnsavedAround)
  const own = !s.saveTrackChangesEnabled
  const includedTracks = s.tracks.map(tr => {
    const f = playerTrackFlags(tr), b = s.mixerBaseline[tr.index]
    const flags = own && b ? { visible: b.visible, showOnKeyboard: b.showOnKeyboard, muted: b.muted } : { visible: f.visible, showOnKeyboard: tr.showOnKeyboard, muted: f.muted }
    return { index: tr.index, newProgram: tr.program, name: tr.trackName, color: tr.color, ...flags }
  })
  const summary: string[] = []
  if (mixer?.length) summary.push(`Mixer: ${mixer.length} track${mixer.length === 1 ? '' : 's'}`)
  if (tempo?.summary) summary.push(tempo.summary)
  if (kinds.has('tracks')) summary.push('Shown, lights and mute')

  const result = await window.electronAPI.saveMidiEditor({
    filePath, outputPath: '', includedTracks, mergeGroups: [], mixer,
    rhMaxFingers: s.rhMaxFingers, lhMaxFingers: s.lhMaxFingers,
    bpmRatio: tempo?.bpmRatio, transposeSemitones: tempo?.transposeSemitones, finalKey: tempo?.finalKey,
  })
  if (!result.ok || !result.base64 || !result.fileName || !result.filePath) return failed(result.message)
  loadSavedVersion(result.base64, result.fileName, result.filePath, 1 / (tempo?.bpmRatio ?? 1))
  window.electronAPI.logFileEvent(result.filePath, 'save', summary.join(', ') || 'Saved')
  return true
}

export const saveTrackFlags = () => keepUnsavedAround(() => saveTogether(new Set(['tracks'])), new Set(['tracks']))

export async function saveImportedFile(): Promise<boolean> {
  const s = useStore.getState()
  const pending = s.pendingImportedFile
  if (!pending) return true
  await (window.electronAPI as any).writeCachedImport(getCachePath(pending.sourcePath, (s as any).libraryFolder ?? null), pending.midiBase64)
  s.setPendingImportedFile(null)
  return true
}

/** Everything that can be saved from here (the Playback Editor saves its own) */
export async function saveAll(opts: { includeImport?: boolean } = {}): Promise<boolean> {
  const kinds = new Set(collectUnsaved().map(r => r.kind))
  if (kinds.has('notes') && !(await saveNotes())) return false
  const rest = new Set([...kinds].filter(k => k === 'mixer' || k === 'tempoKey' || k === 'tracks'))
  if (rest.size && !(await keepUnsavedAround(() => saveTogether(rest), rest))) return false
  if (opts.includeImport !== false && kinds.has('import')) await saveImportedFile()
  return true
}
