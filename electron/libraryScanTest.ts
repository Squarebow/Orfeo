import { mkdirSync, writeFileSync, symlinkSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { scanMidiFolder, listFolderNames } from './libraryScan'

// A temporary tree with regular files and — where the OS allows it —
// symlinks. Making symlinks needs a privilege on Windows, so when creation
// fails the link checks are dropped, not counted as failures (the SKIP
// table in runAllTests.ts works per file; this is the per-check version).
// No assertion depends on readdir order: which surface a deduped directory
// is reported under is filesystem-dependent, so only the counts are checked.
export function runLibraryScanTest(): number {
  console.group('[libraryScan] self-check')
  let pass = 0, fail = 0
  const check = (c: boolean, m: string) => { c ? pass++ : (fail++, console.error('FAIL:', m)) }

  const root = join(tmpdir(), `orfeo-scan-test-${process.pid}-${Date.now()}`)
  rmSync(root, { recursive: true, force: true })
  mkdirSync(join(root, 'real', 'sub'), { recursive: true })
  mkdirSync(join(root, 'outside'), { recursive: true })
  writeFileSync(join(root, 'real', 'a.mid'), '')
  writeFileSync(join(root, 'real', 'sub', 'b.mid'), '')
  writeFileSync(join(root, 'real', 'note.txt'), '')
  writeFileSync(join(root, 'outside', 'd.mid'), '')

  mkdirSync(join(root, 'empty'), { recursive: true })

  let links = true
  try {
    symlinkSync(join(root, 'real', 'a.mid'), join(root, 'linkfile.mid'))  // linked file
    symlinkSync(join(root, 'real'), join(root, 'linkdir'))                 // linked dir → dedup
    symlinkSync(join(root, 'outside'), join(root, 'real', 'sub', 'out'))   // link out of the tree
    symlinkSync('nowhere', join(root, 'broken.mid'))                       // broken link
    symlinkSync(root, join(root, 'self'))                                  // cycle: link to own root
  } catch { links = false }
  // A junction needs no privilege on Windows (elsewhere it is an ordinary
  // directory link), so the linked-folder check below runs on every machine.
  let junction = true
  try { symlinkSync(join(root, 'outside'), join(root, 'joined'), 'junction') } catch { junction = false }

  try {
    const files = scanMidiFolder(root)
    const count = (n: string) => files.filter(f => f.name === n).length

    check(count('a.mid') === 1, 'regular file found')
    check(count('note.txt') === 0, 'non-library extension ignored')
    if (links) {
      check(count('linkfile.mid') === 1, 'symlinked file found (Dirent says neither file nor dir)')
      check(count('b.mid') === 1, 'dir reached as real path and as link → listed once')
      check(count('d.mid') === 1, 'dir out of the tree, reached real and via link → listed once')
      check(count('broken.mid') === 0, 'broken symlink skipped')
      check(files.length === 4, `a, linkfile, b, d in all — got ${files.length}`)
    } else {
      check(files.length === 3, `a, b, d without links — got ${files.length}`)
    }
    if (junction) check(count('d.mid') === 1, 'folder reached through a junction is listed once')

    const folders = listFolderNames(root).sort()
    check(folders.includes('empty'), 'empty folder listed')
    check(folders.includes('real') && folders.includes('outside'), 'real folders listed')
    check(!folders.includes('note.txt') && !folders.includes('broken.mid'), 'files and broken links are not folders')
    if (junction) check(folders.includes('joined'), 'linked folder listed as a folder')
    if (links) check(folders.includes('linkdir') && !folders.includes('linkfile.mid'), 'symlinked folder listed, symlinked file not')
    check(listFolderNames(join(root, 'missing')).length === 0, 'missing Library folder gives no folders')
    check(files.every(f => f.name && f.path.startsWith(root)), 'names and absolute paths only')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }

  console.log(`libraryScan: ${pass} passed, ${fail} failed${links ? '' : ' (symlink checks skipped: not permitted here)'}`)
  console.groupEnd()
  return fail
}
