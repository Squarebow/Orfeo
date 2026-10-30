import { useStore } from '../store'
import { NES } from '../utils/noteEditorState'
import { readFileSync } from 'node:fs'
import { Midi } from '@tonejs/midi'
import * as EA from './exportAudio'
const { isOpenSong, previewExport, pauseForExport, isExporting, exportToAudio, ExportError } = EA
const finishOrExplain = EA.finishOrExplain

// The open song as Orfeo holds it, with an unsaved note edit in the editor
function song(path: string, pitch: number) {
  return { fileName: 'x.mid', duration: 1, bpm: 120, timeSignatureNumerator: 4, timeSignatureDenominator: 4, noteCount: 1, _filePath: path,
    tracks: [{ index: 0, name: 'Piano', gmName: 'Piano', program: 0, group: 'piano', isDrum: false, color: '#000000', channel: 0,
      notes: [{ midi: pitch, time: 0, duration: 0.5, velocity: 0.8 }] }] } as any
}
const firstPitch = (s: any) => s.events.find((e: any) => (e.status & 0xf0) === 0x90).d1

export async function runExportAudioTest(): Promise<number> {
  console.group('[exportAudio] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const path = 'D:\\Lib\\Pop\\Song.mid'
  useStore.setState({ midi: song(path, 60), tracks: [{ index: 0, program: 0, muted: false, solo: false, volume: 1, pan: 0, reverb: 0, chorus: 0 }] as any,
    libraryFolder: 'D:\\Lib', bpm: 120, originalBpm: 120, detectedKey: null, loopRegionActive: false })
  NES.editMidi = song(path, 72) as any
  NES.dirty = true

  // 1. Unsaved note edits belong to "As I hear it" only
  check(firstPitch(await previewExport(path, 'original')) === 60, 'Original ignores unsaved edits')
  check(firstPitch(await previewExport(path, 'focus')) === 60, 'Focus ignores unsaved edits')
  check(firstPitch(await previewExport(path, 'heard')) === 72, 'As I hear it includes them')

  // 2. The open song is recognised however its path is spelled
  check(isOpenSong('d:/lib/pop/song.MID'), 'slashes and letter case don\'t matter')
  check(!isOpenSong('D:\\Lib\\Pop\\Other.mid'), 'another song is not the open one')
  // a Guitar Pro song plays from its converted copy in the Library's Orfeo folder
  useStore.setState({ midi: song('D:/Lib/Orfeo/Riff_ORFEO_IMPORTED.mid', 60) })
  check(isOpenSong('D:\\Lib\\Tabs\\Riff.gp5'), 'an open Guitar Pro song counts as open from its Library entry')

  NES.dirty = false; NES.editMidi = null

  // 3. An export pauses the song (the player too, as an Explorer does)
  let playerPaused = false
  ;(globalThis as any).window.__orfeoPlayer = { pause: () => { playerPaused = true } }
  useStore.setState({ playbackState: 'playing' })
  pauseForExport()
  check(useStore.getState().playbackState === 'paused' && playerPaused, 'a playing song is paused for the export')
  playerPaused = false
  pauseForExport()
  check(useStore.getState().playbackState === 'paused' && !playerPaused, 'a paused song is left as it is')
  check(isExporting() === false, 'not exporting outside an export')
  // 4. A song that isn't open is read once per window, not on every version switch
  const demo = readFileSync('public/Demo/Scott Joplin - Entertainer.mid')
  let reads = 0
  const api: any = (globalThis as any).window.electronAPI = {
    loadMidiFromPath: async () => { reads++; return { fileName: 'Entertainer.mid', base64: demo.toString('base64') } },
    readSoundfont: async () => null,
    nativeSoundfontPaths: async () => ['GeneralUser-GS.sf2'],
  }
  const other = 'D:\\Lib\\Entertainer.mid'
  await previewExport(other, 'original'); await previewExport(other, 'focus'); await previewExport(other, 'original')
  check(reads === 1, `read once for three version switches, read ${reads} times`)

  // 5. A sound set that isn't there any more is reported, not quietly swapped for another
  ;(globalThis as any).fetch = async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) })
  ;(globalThis as any).location = { href: 'http://localhost/' }
  const kindOf = async (o: any) => { try { await exportToAudio({ songPath: other, songName: 'x', version: 'original', format: 'wav', ...o }, () => {}, () => false); return 'none' } catch (e: any) { return e instanceof ExportError ? e.kind : 'other: ' + e.message } }
  check(await kindOf({ sound: 'studio', soundfont: 'fluidr3-gm' }) === 'soundset', 'Studio: missing sound set → told, not swapped')
  check(await kindOf({ sound: 'native', soundfont: 'fluidr3-gm' }) === 'soundset', 'Native: missing sound set → told, not swapped')
  void api

  // 6. Notes, but nothing audible came out (master volume at zero, every part muted)
  const silent = { l: new Float32Array(44100), r: new Float32Array(44100), rate: 44100 }
  let kind = ''
  try { finishOrExplain(silent, 1) } catch (e: any) { kind = e?.kind }
  check(kind === 'silent', `silence → "silent", got "${kind}"`)

  // 7. With "Skip empty bars at the start" on, an export starts where the music
  // starts (three silent 4/4 bars at 100 BPM = 7.2 s); off, as the file has it
  const lm = new Midi()
  lm.header.tempos.push({ ticks: 0, bpm: 100 })
  lm.header.timeSignatures.push({ ticks: 0, timeSignature: [4, 4] })
  lm.header.update()
  const lt = lm.addTrack()
  for (let i = 0; i < 8; i++) lt.addNote({ midi: 60, ticks: 12 * 480 + i * 480, durationTicks: 480, velocity: 0.7 })
  api.loadMidiFromPath = async () => ({ fileName: 'Lead.mid', base64: Buffer.from(lm.toArray()).toString('base64') })
  const firstOn = (s: any) => s.events.find((e: any) => (e.status & 0xf0) === 0x90).time
  const leadPath = 'D:\\Lib\\Lead.mid'
  useStore.setState({ skipEmptyBars: true, keepDrumCountIn: true })
  EA.forgetLoadedSong()
  const on = firstOn(await previewExport(leadPath, 'original'))
  check(on < 0.05, `switch on: the music starts at once, got ${on}`)
  useStore.setState({ skipEmptyBars: false })
  EA.forgetLoadedSong()
  const offAt = firstOn(await previewExport(leadPath, 'original'))
  check(Math.abs(offAt - 7.2) < 0.05, `switch off: as the file has it, got ${offAt}`)

  console.log(`exportAudio: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
