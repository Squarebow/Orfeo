import { nextFreeName, exportsDir } from './exportName'

export function runExportNameTest(): number {
  console.group('[exportName] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const set = (...n: string[]) => new Set(n)

  check(nextFreeName(set(), 'Song.mp3') === 'Song.mp3', 'free name kept')
  check(nextFreeName(set('Song.mp3'), 'Song.mp3') === 'Song (2).mp3', 'Song.mp3 taken → Song (2).mp3')
  check(nextFreeName(set('Song.mp3', 'Song (2).mp3'), 'Song.mp3') === 'Song (3).mp3', '→ Song (3).mp3')
  check(nextFreeName(set('Song (Focus).mp3'), 'Song (Focus).mp3') === 'Song (Focus) (2).mp3', 'version names count on: Song (Focus) (2).mp3')
  check(nextFreeName(set('song.MP3'), 'Song.mp3') === 'Song (2).mp3', 'case-insensitive (Windows)')
  check(nextFreeName(set('Song.wav'), 'Song.mp3') === 'Song.mp3', 'another format is no clash')

  check(exportsDir('D:/Midi', 'D:/Midi/Pop/Song.mid').replace(/\\/g, '/') === 'D:/Midi/Orfeo/Exports', 'library set → <library>/Orfeo/Exports')
  check(exportsDir(null, 'D:/Elsewhere/Song.mid').replace(/\\/g, '/') === 'D:/Elsewhere/Orfeo/Exports', 'no library → <song folder>/Orfeo/Exports')
  check(exportsDir(null, 'D:/Elsewhere/Orfeo/Song_ORFEO_v2.mid').replace(/\\/g, '/') === 'D:/Elsewhere/Orfeo/Exports', 'song already in an Orfeo folder → that one')

  console.log(`exportName: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
