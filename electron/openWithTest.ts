import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { fileFromArgs } from './openWith'

export function runOpenWithTest(): number {
  console.group('[openWith] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  // Built with this system's own path rules, so the test holds on Windows, Mac and Linux
  const cwd = resolve('/Users/me/Music')
  const song = resolve(cwd, 'Song.mid')

  check(fileFromArgs(['Orfeo.exe'], cwd) === null, 'plain start: no song')
  check(fileFromArgs(['Orfeo.exe', song], cwd) === song, 'double click: the song')
  check(fileFromArgs(['Orfeo.exe', 'Song.mid'], cwd) === song, 'a name from a terminal is found in its folder')
  check(fileFromArgs(['Orfeo.exe', '--allow-file-access-from-files', song, '--original-process-start-time=1'], cwd) === song,
    'switches around the song are skipped')
  check(fileFromArgs(['Orfeo', '-psn_0_12345'], cwd) === null, 'the macOS -psn_ id is not a song')
  check(fileFromArgs(['orfeo', pathToFileURL(song).href], cwd) === song, 'a Linux file:// address becomes a path')
  check(fileFromArgs(['orfeo', pathToFileURL(resolve(cwd, 'My Song.mid')).href], cwd) === resolve(cwd, 'My Song.mid'),
    'spaces in a file:// address come back as spaces')
  check(fileFromArgs(['Orfeo.exe', resolve(cwd, 'notes.txt')], cwd) === null, 'a file Orfeo cannot read is ignored')
  check(fileFromArgs(['Orfeo.exe', resolve(cwd, 'SONG.MIDI')], cwd) === resolve(cwd, 'SONG.MIDI'), 'capital letters in the ending')
  check(fileFromArgs(['Orfeo.exe', resolve(cwd, 'Lead.mxl')], cwd) === resolve(cwd, 'Lead.mxl'), 'MusicXML opens too')
  check(fileFromArgs(['Orfeo.exe', resolve(cwd, 'a.mid'), resolve(cwd, 'b.mid')], cwd) === resolve(cwd, 'b.mid'),
    'several songs: the last one')
  check(fileFromArgs(['Song.mid'], cwd) === null, 'the program itself is never the song')

  console.log(`openWith: ${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
