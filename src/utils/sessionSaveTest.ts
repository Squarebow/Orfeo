import { Midi } from '@tonejs/midi'
import { parseMidiBuffer } from './midiParser'
import { useStore } from '../store'
import { collectUnsaved, trackFlagChanges, saveTrackFlags, undoMixer, keepUnsavedAround, saveAll } from './sessionSave'
import { reloadOpenSong } from './reloadOpenSong'

// Two tracks; `meta` lets a "saved version" carry Orfeo's track marks
function songBytes(meta: string[] = []) {
  const m = new Midi()
  m.header.tempos.push({ ticks: 0, bpm: 120 })
  m.header.update()
  m.addTrack().addNote({ midi: 60, ticks: 0, durationTicks: 480, velocity: 0.7 })
  m.addTrack().addNote({ midi: 40, ticks: 0, durationTicks: 480, velocity: 0.7 })
  ;(m.header as any).meta = meta.map(text => ({ type: 'text', text, ticks: 0 }))
  return m.toArray()
}
const parse = (a: Uint8Array, path: string) =>
  parseMidiBuffer(a.buffer.slice(a.byteOffset, a.byteOffset + a.byteLength) as ArrayBuffer, path.split('/').pop()!, path)
const b64 = (a: Uint8Array) => { let s = ''; for (const x of a) s += String.fromCharCode(x); return btoa(s) }

export async function runSessionSaveTest(): Promise<number> {
  console.group('[sessionSave] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const w = globalThis as any
  w.window ??= {}
  let sent: any = null
  w.window.electronAPI = {
    setPrefs: () => Promise.resolve(),
    logFileEvent: () => Promise.resolve(),
    saveMidiEditor: async (payload: any) => {
      sent = payload
      const marks = payload.includedTracks.map((tr: any, i: number) => `ORFEO_TRACK_MUTED:${i}:${tr.muted ? 1 : 0}`)
      return { ok: true, message: 'ok', fileName: 'Song_ORFEO_v1.mid', filePath: 'C:/Songs/Orfeo/Song_ORFEO_v1.mid', base64: b64(songBytes(marks)) }
    },
  }

  const s = useStore.getState()
  s.setSaveTrackChangesEnabled(true)  // off by default; most checks below save them
  s.setMidi(parse(songBytes(), 'C:/Songs/Song.mid'))
  check(collectUnsaved().length === 0, 'a freshly opened song has nothing unsaved')

  // Mute track 2, change track 1's volume
  s.setTrackMuted(1, true)
  s.updateTrack(0, { volume: 0.3 })
  const rows = collectUnsaved()
  check(rows.some(r => r.kind === 'tracks' && /1 muted/.test(r.detail)), 'the mute is listed under Tracks')
  check(rows.some(r => r.kind === 'mixer' && /1 track/.test(r.detail)), 'the volume is listed under Mixer')
  check(rows.length === 2, `two kinds of change, got ${rows.map(r => r.kind).join(', ')}`)

  // Focus mode's own mutes are only for the moment
  useStore.getState().setTrackMuteFilter(true)
  check(trackFlagChanges().muted === 1, 'Focus mode on: still only the mute you made counts')
  useStore.getState().setTrackMuteFilter(false)

  // Save shown / lights / mute: a new version, and the unsaved volume stays
  check(await saveTrackFlags(), 'saving the tracks succeeds')
  check(sent?.includedTracks?.length === 2 && sent.includedTracks[1].muted === true, 'the save sends track 2 as muted, and keeps both tracks')
  const after = useStore.getState()
  check(after.tracks[1].muted === true && after.mixerBaseline[1].muted === true, 'the new version opens with track 2 muted, now saved')
  check(after.tracks[0].volume === 0.3, 'the unsaved Mixer change is put back after the reload')
  const left = collectUnsaved()
  check(left.length === 1 && left[0].kind === 'mixer', `only the Mixer is left unsaved, got ${left.map(r => r.kind).join(', ')}`)

  undoMixer()
  check(collectUnsaved().length === 0, 'Undo on the Mixer leaves nothing unsaved')

  // The Note Editor's hand view hides the other tracks only for the moment:
  // they're neither counted nor saved as hidden
  useStore.getState().soloTrackForEdit(0, { keepPlayhead: true })
  check(useStore.getState().tracks[1].visible === false, 'the hand view hides track 2 on screen')
  check(trackFlagChanges().shown === 0, 'the hand view alone counts as no change')
  useStore.getState().updateTrack(0, { showOnKeyboard: !useStore.getState().tracks[0].showOnKeyboard })
  check(await saveTrackFlags(), 'saving tracks during the hand view succeeds')
  check(sent?.includedTracks?.[1]?.visible === true, 'track 2 is saved as shown, not hidden by the hand view')
  useStore.getState().unsoloTrackForEdit()

  // A save that merged, split or deleted tracks: tempo & key still come back,
  // per-track changes can't be matched up (the Playback Editor saves them along)
  s.setMidi(parse(songBytes(), 'C:/Songs/Song.mid'))
  const orig = useStore.getState().originalBpm
  useStore.setState({ bpm: orig * 0.5 })
  useStore.getState().updateTrack(0, { volume: 0.2 })
  await keepUnsavedAround(async () => { useStore.getState().setMidi(parse(songBytes(), 'C:/Songs/Orfeo/Song_ORFEO_v2.mid')); return true }, new Set(), false)
  const re = useStore.getState()
  check(re.bpm === re.originalBpm * 0.5, 'the slower tempo is kept after a save that changed the tracks')
  check(re.tracks[0].volume !== 0.2, 'per-track Mixer values aren\'t put on tracks they no longer match')

  // Switching "Skip empty bars at the start" reads the same song again: the
  // unsaved changes stay
  s.setMidi(parse(songBytes(), 'C:/Songs/Song.mid'))
  useStore.getState().setTrackMuted(1, true)
  useStore.getState().updateTrack(0, { volume: 0.4 })
  await reloadOpenSong()
  const rl = useStore.getState()
  check(rl.tracks[1].muted === true && rl.tracks[0].volume === 0.4, 'mute and Mixer survive reading the song again')
  check(collectUnsaved().length === 2, 'and they are still listed as unsaved')

  // "Save track changes" off: mute is only for the session — not listed, not
  // saved, but still in place after a save
  useStore.getState().setSaveTrackChangesEnabled(false)
  const offRows = collectUnsaved()
  check(offRows.length === 1 && offRows[0].kind === 'mixer', `switch off: only the Mixer is listed, got ${offRows.map(r => r.kind).join(', ')}`)
  check(await saveAll(), 'Save all with the switch off succeeds')
  check(sent?.includedTracks?.[1]?.muted === false, 'the version keeps the file\'s own mute')
  check(useStore.getState().tracks[1].muted === true, 'the session mute is still on after the save')
  check(collectUnsaved().length === 0, 'nothing left to save')
  useStore.getState().setSaveTrackChangesEnabled(false)  // back to the default

  console.log(`sessionSave: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
