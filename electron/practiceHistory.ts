// ── Practice numbers, kept per song (practice stage 4) ──────────────────────
// Each song's practice history is its own small file in <userData>/practice/,
// never written into the MIDI file and never in the settings file (it grows,
// and the settings file is read on every start). index.json maps a song's
// place in the Library to its file, so a rename or a move in Orfeo only
// rewrites the index, like tags and the file log follow a song.
import { readFileSync, writeFileSync, existsSync, mkdirSync, renameSync, unlinkSync } from 'fs'
import { join } from 'path'

const norm = (p: string) => p.replace(/\\/g, '/').toLowerCase()

type Index = Record<string, string>   // song path (normalised) → file name

function readJson<T>(path: string): T | null {
  try { return existsSync(path) ? JSON.parse(readFileSync(path, 'utf-8')) as T : null } catch { return null }
}
// a spare file swapped in, so a power cut never leaves half a file
function writeJson(path: string, data: unknown) {
  const spare = path + '.tmp'
  writeFileSync(spare, JSON.stringify(data))
  renameSync(spare, path)
}

export function practiceStore(dir: string) {
  const indexPath = join(dir, 'index.json')
  const index = (): Index => readJson<Index>(indexPath) ?? {}
  const ensure = () => { if (!existsSync(dir)) mkdirSync(dir, { recursive: true }) }
  return {
    load(song: string): unknown | null {
      const f = index()[norm(song)]
      return f ? readJson(join(dir, f)) : null
    },
    save(song: string, data: unknown): void {
      ensure()
      const ix = index()
      let f = ix[norm(song)]
      if (!f) {
        f = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.json`
        ix[norm(song)] = f
        writeJson(indexPath, ix)
      }
      writeJson(join(dir, f), data)
    },
    forget(song: string): void {
      const ix = index()
      const f = ix[norm(song)]
      if (!f) return
      delete ix[norm(song)]
      writeJson(indexPath, ix)
      try { unlinkSync(join(dir, f)) } catch {}
    },
    /** A song saved as a new version (_ORFEO_vN): the new one starts with a
     *  copy of the history so far, so weeks of progress carry on; the earlier
     *  version keeps its own. A version that already has history keeps it. */
    carry(from: string, to: string): void {
      if (norm(from) === norm(to)) return
      const ix = index()
      const f = ix[norm(from)]
      if (!f || ix[norm(to)]) return
      const data = readJson(join(dir, f))
      if (data === null) return
      const g = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.json`
      writeJson(join(dir, g), data)
      ix[norm(to)] = g
      writeJson(indexPath, ix)
    },
    /** Songs renamed or moved in Orfeo: their history goes with them */
    remap(pairs: { oldPath: string; newPath: string }[]): void {
      if (!pairs.length || !existsSync(indexPath)) return
      const ix = index()
      let changed = false
      for (const { oldPath, newPath } of pairs) {
        const f = ix[norm(oldPath)]
        if (!f || norm(oldPath) === norm(newPath)) continue
        // a song already there keeps its own history
        if (!ix[norm(newPath)]) ix[norm(newPath)] = f
        delete ix[norm(oldPath)]
        changed = true
      }
      if (changed) writeJson(indexPath, ix)
    },
  }
}
