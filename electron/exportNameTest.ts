import { nextFreeName, exportsDir, safeExportName, safeExportPath } from './exportName'

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

  check(exportsDir('D:/Midi', 'C:/Users/Me/Music').replace(/\\/g, '/') === 'D:/Midi/Orfeo/Exports', 'library set → <library>/Orfeo/Exports')
  check(exportsDir(null, 'C:/Users/Me/Music').replace(/\\/g, '/') === 'C:/Users/Me/Music/Orfeo/Exports', 'no library (demo songs) → Music/Orfeo/Exports, never a hidden app folder')

  const throws = (f: () => unknown) => { try { f(); return false } catch { return true } }
  const DIR = 'D:/Music/Orfeo/Exports'
  const inside = (name: string) => safeExportPath(DIR, name).replace(/\\/g, '/').startsWith(DIR + '/')

  check(safeExportName('Song.mp3') === 'Song.mp3', 'plain name kept')
  check(safeExportName('Song (As I hear it).mp3') === 'Song (As I hear it).mp3', 'name with brackets and spaces kept')
  check(safeExportName('C:\\Lib\\Midi\\Song.mid') === 'Song.mid', 'Windows path in one piece → only its last part')
  check(safeExportName('Sub/Folder/Song.mp3') === 'Song.mp3', 'folders cut away')
  check(safeExportName('../../etc/passwd') === 'passwd' && inside('../../etc/passwd'), 'no .. climb out of Exports')
  check(safeExportName('..\\..\\evil.mp3') === 'evil.mp3' && inside('..\\..\\evil.mp3'), 'no ..-climb with backslashes either')
  check(safeExportName(DIR + '/Song.mp3') === 'Song.mp3' && inside(DIR + '/Song.mp3'), 'an absolute path is a name, not a destination')
  check(throws(() => safeExportName('..')), 'a bare .. is refused, not written')
  check(throws(() => safeExportName('   ')) && throws(() => safeExportName('')), 'an empty name is refused')
  check(safeExportName('Song: 2?.mp3') === 'Song 2.mp3', 'characters Windows refuses are dropped')
  check(safeExportName('CON.mp3') === '_CON.mp3' && safeExportName('nul.wav') === '_nul.wav', 'Windows device names stay openable')
  check(safeExportPath(DIR, 'Song.mp3').replace(/\\/g, '/') === `${DIR}/Song.mp3`, 'the path is dir + name')

  console.log(`exportName: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
