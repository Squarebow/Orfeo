// ── Export to audio: where files go and what they're called ─────────────────
// One Exports folder inside the Library's main Orfeo folder; a name already
// there gets " (2)", " (3)"… (Windows names ignore case), so an export never
// overwrites another. The name itself always stays inside that folder.
import { basename, extname, isAbsolute, join, relative, resolve } from 'path'

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

// Characters Windows refuses in a file name (and control characters). Orfeo
// ships Windows binaries, so a name that is legal here and illegal there would
// be a file the user cannot open.
const ILLEGAL_ON_WINDOWS = /[<>:"|?*\u0000-\u001f]/g

/** The export's file name as one plain name — never a path. Separators of
 *  either kind are cut away first: what arrives here is derived from a song's
 *  name, and on Windows `..\..\x` is a path, not a name. Nothing in the app
 *  builds such a name today, and that is exactly why the check belongs here
 *  rather than in each caller. */
export function safeExportName(fileName: string): string {
  const last = String(fileName ?? '').replace(/[\\/]/g, '/').split('/').pop() ?? ''
  let name = last.replace(ILLEGAL_ON_WINDOWS, '').replace(/^\.+$/, '').trim()
  if (!name) throw new Error('the export name is empty')
  // Names Windows keeps for itself (CON, PRN, AUX, NUL, COM1…, LPT1…) fail or
  // behave oddly there even with an extension. A Library song can carry one.
  // An underscore reads as what it is and costs nothing to remember, and an
  // export already renames itself when the name is taken (" (2)").
  if (/^(con|prn|aux|nul|(com|lpt)[1-9])(\..*)?$/i.test(name)) name = '_' + name
  return name
}

/** The folder plus the safe name, then checked to still lie inside the folder.
 *  The check is not redundant with safeExportName: it is what turns any later
 *  change there into a loud error instead of a file somewhere the user never
 *  clicked. */
export function safeExportPath(dir: string, fileName: string): string {
  const name = safeExportName(fileName)
  const target = join(dir, name)
  const rel = relative(resolve(dir), resolve(target))
  if (!rel || rel === '..' || rel.startsWith('..' + '/') || rel.startsWith('..' + '\\') || isAbsolute(rel))
    throw new Error(`an export name must stay inside its folder, got "${fileName}"`)
  return target
}

/** Just the file name of that path — what the " (2)" search below needs. */
export const safeExportBaseName = (dir: string, fileName: string): string => basename(safeExportPath(dir, fileName))
