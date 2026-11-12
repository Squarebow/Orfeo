import { readdirSync, statSync, realpathSync } from 'fs'
import { join } from 'path'
import type { LibraryFile } from '../src/types'

// ── Library scan — the recursive walk behind the Library folder picker.
// Follows symlinks: Dirent reports the entry's own type, never its target,
// so a linked .mid is neither a file nor a directory and would be skipped
// without the statSync below. Broken links are skipped silently, as
// unreadable directories are. ─────────────────────────────────────────────
const LIBRARY_EXT = /\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx|cap)$/i

export function scanMidiFolder(folderPath: string): LibraryFile[] {
  // Directories already visited, by real path — a symlinked subfolder that
  // points back at an ancestor (or a symlink cycle) would otherwise recurse
  // forever. It also dedups a directory reached twice (real path and link):
  // its files are listed once, under the first path reached.
  const visited = new Set<string>()
  function scanDir(dir: string): LibraryFile[] {
    let real: string
    try { real = realpathSync(dir) } catch { return [] }
    if (visited.has(real)) return []
    visited.add(real)
    try {
      const results: LibraryFile[] = []
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        let isDir = e.isDirectory()
        let isFile = e.isFile()
        if (e.isSymbolicLink()) {
          try {
            const st = statSync(join(dir, e.name))
            isDir  = st.isDirectory()
            isFile = st.isFile()
          } catch { continue }
        }
        if (isDir) {
          results.push(...scanDir(join(dir, e.name)))
        } else if (isFile && LIBRARY_EXT.test(e.name)) {
          results.push({ name: e.name, path: join(dir, e.name) })
        }
      }
      return results
    } catch { return [] }
  }
  return scanDir(folderPath).sort((a, b) => a.name.localeCompare(b.name))
}
