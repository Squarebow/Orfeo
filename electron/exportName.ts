// ── Export to audio: where files go and what they're called ─────────────────
// One Exports folder inside the Library's main Orfeo folder; a name already
// there gets " (2)", " (3)"… (Windows names ignore case), so an export never
// overwrites another.
import { extname, join } from 'path'

// With no Library set (the demo songs), the Music folder: somewhere you can find
// it, never the app's own hidden data folder
export function exportsDir(libraryFolder: string | null, musicFolder: string): string {
  return join(libraryFolder ?? musicFolder, 'Orfeo', 'Exports')
}

export function nextFreeName(existing: Set<string>, fileName: string): string {
  const taken = new Set([...existing].map(n => n.toLowerCase()))
  if (!taken.has(fileName.toLowerCase())) return fileName
  const ext = extname(fileName), stem = fileName.slice(0, fileName.length - ext.length)
  for (let k = 2; ; k++) {
    const name = `${stem} (${k})${ext}`
    if (!taken.has(name.toLowerCase())) return name
  }
}
