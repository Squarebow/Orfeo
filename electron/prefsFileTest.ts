import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readPrefsFile, writePrefsFile, backupPath, forgetBackupsForTest } from './prefsFile'

export function runPrefsFileTest(): number {
  console.group('[prefsFile] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }
  const dir = mkdtempSync(join(tmpdir(), 'orfeo-prefs-'))
  const file = join(dir, 'orfeo-prefs.json')
  try {
    forgetBackupsForTest()
    check(JSON.stringify(readPrefsFile(file)) === '{}', 'no file → fresh start')

    writePrefsFile(file, { a: 1 })
    check(readPrefsFile(file).a === 1, 'written and read back')
    check(!existsSync(file + '.tmp'), 'no spare file left behind')
    check(!existsSync(backupPath(file)), 'nothing to back up on the very first write')

    forgetBackupsForTest() // a new run
    writePrefsFile(file, { a: 2 })
    check(JSON.parse(readFileSync(backupPath(file), 'utf-8')).a === 1, 'first write of a run keeps the file as it was at start')
    writePrefsFile(file, { a: 3 })
    check(JSON.parse(readFileSync(backupPath(file), 'utf-8')).a === 1, 'later writes in the same run leave the backup alone')

    writeFileSync(file, '{"a": 3, "tags": [')  // half written by a power cut
    check(readPrefsFile(file).a === 1, 'a broken file is read from the backup')
    forgetBackupsForTest()
    writePrefsFile(file, { ...readPrefsFile(file), b: 1 })
    check(JSON.parse(readFileSync(backupPath(file), 'utf-8')).a === 1, 'a broken file never replaces a good backup')
    check(readPrefsFile(file).a === 1 && readPrefsFile(file).b === 1, 'the next write repairs the file from the backup')

    rmSync(file)
    check(JSON.stringify(readPrefsFile(file)) === '{}', 'deleted file (uninstall) is a fresh start, the backup is not brought back')

    writeFileSync(file, '[1, 2]')
    rmSync(backupPath(file))
    check(JSON.stringify(readPrefsFile(file)) === '{}', 'not an object and no backup → fresh start')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
  console.log(`${pass} passed, ${fail} failed`)
  console.groupEnd()
  return fail
}
