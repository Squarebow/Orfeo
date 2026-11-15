// ── Orfeo's settings file, written so a crash or power cut can't wipe it ────
// The file used to be rewritten in place: a power cut mid-write left it half
// written, Orfeo read nothing back, started on defaults and soon saved over
// it — tags, favourites, tapped tempos and measured keyboards gone. Now:
// - each write goes to a spare file, flushed to disk, then swapped in, so the
//   real file is always either the old version or the new one, never half;
// - the first write of each run keeps the file as it was at start as
//   `<file>.bak`;
// - a settings file that's there but unreadable is read from that backup.
//   A missing file stays a fresh start (the uninstaller deletes it on purpose).
import { readFileSync, writeFileSync, existsSync, renameSync, copyFileSync, openSync, writeSync, fsyncSync, closeSync, unlinkSync } from 'fs'

type Prefs = Record<string, any>

function readJson(path: string): Prefs | null {
  try {
    if (!existsSync(path)) return null
    const value = JSON.parse(readFileSync(path, 'utf-8'))
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null
  } catch { return null }
}

export const backupPath = (path: string) => path + '.bak'

export function readPrefsFile(path: string): Prefs {
  if (!existsSync(path)) return {}
  return readJson(path) ?? readJson(backupPath(path)) ?? {}
}

const backedUp = new Set<string>()

export function writePrefsFile(path: string, data: Prefs): void {
  // Once per run: keep the last good file before changing it. A broken file
  // never replaces a good backup.
  if (!backedUp.has(path)) {
    backedUp.add(path)
    if (readJson(path)) { try { copyFileSync(path, backupPath(path)) } catch {} }
  }
  const text = JSON.stringify(data, null, 2)
  const spare = path + '.tmp'
  try {
    const fd = openSync(spare, 'w')
    try { writeSync(fd, text); fsyncSync(fd) } finally { closeSync(fd) }
    renameSync(spare, path)
  } catch {
    // The swap can be refused while something else holds the file open
    // (antivirus): write it the old way rather than lose the change.
    try { unlinkSync(spare) } catch {}
    writeFileSync(path, text)
  }
}

/** For the self-check: start a run afresh */
export function forgetBackupsForTest(): void { backedUp.clear() }
