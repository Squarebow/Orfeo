import { useStore } from '../store'
import { NES } from '../utils/noteEditorState'
import { isOpenSong, previewExport } from './exportAudio'

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
  console.log(`exportAudio: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
