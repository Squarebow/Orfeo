import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { join, basename, dirname, extname } from 'path'
import { readFileSync, writeFileSync, existsSync, readdirSync, createWriteStream, statSync } from 'fs'
import { mkdir, access, copyFile, readdir, writeFile, rename, rmdir } from 'fs/promises'
import { Midi } from '@tonejs/midi'
import { Chord, Note } from 'tonal'
import PDFDocument from 'pdfkit'
import { assignHands } from '../src/utils/handAssignment'
import { buildHandExportHint, withHandSuffix } from '../src/utils/handMetadata'
import { getGMGroup } from '../src/utils/gmInstruments'
import { KEYBOARD_GROUPS } from '../src/utils/keyboardGroups'
import { nextOrfeoBaseName, stripOrfeoSuffix } from '../src/utils/orfeoVersioning'
import type { Hand } from '../src/types'

// ── Module-level window reference — needed by the close handler and IPC send ──────
let mainWin: BrowserWindow | null = null
// ── Set by app:confirm-close so the renderer-triggered re-close passes through ──
let allowClose = false

// ── Copy bundled demo MIDI files into the user's library on first launch ─────────
// Writes a flag file to userData so this runs exactly once.
// Target: libraryFolder/Demo/ if a library is configured, otherwise userData/Demo/.
// Individual files are skipped if they already exist — no user file is overwritten.
async function ensureDemoFolder(): Promise<void> {
  const flagPath  = join(app.getPath('userData'), '.demo-installed')
  const installed = await access(flagPath).then(() => true).catch(() => false)
  if (installed) return

  const prefs   = loadPrefs()
  const libRoot = prefs.libraryFolder || app.getPath('userData')
  const targetDir = join(libRoot, 'Demo')
  await mkdir(targetDir, { recursive: true })

  // ── Source path: extraResources lands at resources/demo/ in production ───
  const srcDir = app.isPackaged
    ? join(process.resourcesPath, 'demo')
    : join(app.getAppPath(), 'public', 'demo')

  const files = await readdir(srcDir)
  for (const file of files) {
    if (!/\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx)$/i.test(file)) continue
    const dest   = join(targetDir, file)
    const exists = await access(dest).then(() => true).catch(() => false)
    if (!exists) await copyFile(join(srcDir, file), dest)
  }

  await writeFile(flagPath, 'true')
}

// ── Resolve (and auto-create) the Orfeo output subfolder for a given source file ──
// If the source is already inside an Orfeo/ subfolder, step up to its parent so
// output always lands in a single Orfeo/ level — never Orfeo/Orfeo/.
async function getOrfeoOutputDir(sourceFilePath: string): Promise<string> {
  const sourceDir = dirname(sourceFilePath)
  const baseDir   = basename(sourceDir).toLowerCase() === 'orfeo' ? dirname(sourceDir) : sourceDir
  const orfeoDir  = join(baseDir, 'Orfeo')
  await mkdir(orfeoDir, { recursive: true })
  return orfeoDir
}

// ── Main window ────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#111116',
    show: false,
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#111116', symbolColor: '#e8a027', height: 40 },
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, webSecurity: false,
    },
  })
  mainWin = win
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
  // ── Show maximized once renderer is ready — avoids white flash on launch ───
  win.once('ready-to-show', () => {
    win.maximize()
    win.show()
  })
  // ── Intercept close: delegate all confirm dialogs to the renderer ─────────
  // Prevents the close, tells the renderer to resolve any pending state
  // (Note Editor unsaved edits, pending imported file), then waits for the
  // renderer to call app:confirm-close when it is safe to actually close.
  win.on('close', (e) => {
    if (allowClose) return // set by app:confirm-close — let it through
    e.preventDefault()
    win.webContents.send('app:save-before-close')
  })
}

// ── Prefs ──────────────────────────────────────────────────────────────────
function getPrefsPath() { return join(app.getPath('userData'), 'orfeo-prefs.json') }
function loadPrefs(): Record<string, any> {
  try { const p = getPrefsPath(); if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8')) } catch {}
  return {}
}
function savePrefs(data: Record<string, any>) {
  try { writeFileSync(getPrefsPath(), JSON.stringify({ ...loadPrefs(), ...data }, null, 2)) } catch {}
}
ipcMain.handle('prefs:get', async () => loadPrefs())
ipcMain.handle('prefs:set', async (_e, data) => savePrefs(data))

// ── File info change log — sidecar JSON, keyed by normalized absolute path.
// Deliberately NOT written into the .mid file itself: this is Orfeo-only
// bookkeeping (renames, hides, save summaries, import provenance), not
// portable data other tools should see. Kept separate from orfeo-prefs.json
// so a large library's growing log never drags general-settings I/O along
// with it. ────────────────────────────────────────────────────────────────
interface FileLogEvent { type: string; timestamp: number; summary: string }
function normLogPath(p: string) { return p.replace(/\\/g, '/') }
function getFileLogPath() { return join(app.getPath('userData'), 'orfeo-file-log.json') }
function loadFileLog(): Record<string, FileLogEvent[]> {
  try { const p = getFileLogPath(); if (existsSync(p)) return JSON.parse(readFileSync(p, 'utf-8')) } catch {}
  return {}
}
function saveFileLog(log: Record<string, FileLogEvent[]>) {
  try { writeFileSync(getFileLogPath(), JSON.stringify(log, null, 2)) } catch {}
}
function appendFileLogEvent(filePath: string, event: FileLogEvent) {
  const log = loadFileLog()
  const key = normLogPath(filePath)
  log[key] = [...(log[key] ?? []), event]
  saveFileLog(log)
}
// Rekeys log entries after a rename/move — same {oldPath,newPath} pairs shape
// the renderer's remapLibraryPaths (favourites/hidden) already uses.
function remapFileLog(pairs: { oldPath: string; newPath: string }[]) {
  if (pairs.length === 0) return
  const log = loadFileLog()
  let changed = false
  for (const { oldPath, newPath } of pairs) {
    const oldKey = normLogPath(oldPath)
    if (!(oldKey in log)) continue
    const newKey = normLogPath(newPath)
    log[newKey] = [...(log[newKey] ?? []), ...log[oldKey]]
    delete log[oldKey]
    changed = true
  }
  if (changed) saveFileLog(log)
}

ipcMain.handle('fileinfo:getLog', async (_e, filePath: string) => loadFileLog()[normLogPath(filePath)] ?? [])
ipcMain.handle('fileinfo:logEvent', async (_e, filePath: string, type: string, summary: string) => {
  appendFileLogEvent(filePath, { type, timestamp: Date.now(), summary })
})

// ── Version chain — no separate storage, just siblings in the same folder
// that share the stripped base name (see src/utils/orfeoVersioning.ts).
// version 0 = the original, unsuffixed file. ────────────────────────────
ipcMain.handle('fileinfo:listVersions', async (_e, filePath: string) => {
  try {
    const dir = dirname(filePath)
    const strippedTarget = stripOrfeoSuffix(basename(filePath).replace(/\.midi?$/i, ''))
    const versions: { name: string; path: string; version: number; mtime: number }[] = []
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.midi?$/i.test(entry.name)) continue
      const base = entry.name.replace(/\.midi?$/i, '')
      if (stripOrfeoSuffix(base) !== strippedTarget) continue
      const m = base.match(/_ORFEO_v(\d+)$/i)
      const entryPath = join(dir, entry.name)
      versions.push({ name: entry.name, path: entryPath, version: m ? parseInt(m[1], 10) : 0, mtime: statSync(entryPath).mtimeMs })
    }
    return versions.sort((a, b) => a.version - b.version)
  } catch {
    return []
  }
})
// ── Returns path to userData/Demo/ if demo files were installed, else null ───
ipcMain.handle('app:getDemoFolder', async () => {
  const demoPath = join(app.getPath('userData'), 'Demo')
  return existsSync(demoPath) ? demoPath : null
})

// ── Open MIDI file ─────────────────────────────────────────────────────────
ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
ipcMain.handle('shell:openFolder', (_e, folderPath: string) => shell.openPath(folderPath))
ipcMain.handle('shell:showItemInFolder', (_e, filePath: string) => shell.showItemInFolder(filePath))

// ── Downloadable extra soundfonts (Samples engine) ────────────────────────────
// Both are MIT-licensed GM soundfonts — safe to redistribute. Never bundled at
// build time (148MB / 38MB would bloat the installer); downloaded on demand
// into userData/soundfonts/ and loaded at runtime via soundBankManager.
const SOUNDFONT_CATALOG: Record<string, { name: string; filename: string; sizeMB: number; url: string }> = {
  'fluidr3-gm': {
    name: 'FluidR3 GM',
    filename: 'FluidR3_GM.sf2',
    sizeMB: 142,
    url: 'https://github.com/fhunleth/midi_synth/releases/download/v0.1.0/FluidR3_GM.sf2',
  },
  'musescore-general': {
    name: 'MuseScore General',
    filename: 'MuseScore_General.sf3',
    sizeMB: 38,
    url: 'https://ftp.osuosl.org/pub/musescore/soundfont/MuseScore_General/MuseScore_General.sf3',
  },
}
function soundfontsDir() {
  const dir = join(app.getPath('userData'), 'soundfonts')
  if (!existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true })
  return dir
}
// Custom (user-uploaded) soundfonts are identified by 'custom:<filename>' rather
// than a catalog key — soundfontPath resolves both forms to the same directory.
const CUSTOM_SF_PREFIX = 'custom:'
function soundfontPath(id: string): string | null {
  if (id.startsWith(CUSTOM_SF_PREFIX)) {
    const filename = id.slice(CUSTOM_SF_PREFIX.length)
    const p = join(soundfontsDir(), filename)
    // Guard against a filename smuggling a path traversal — must resolve to a
    // direct child of soundfontsDir(), same defense used by the library-folder IPC.
    return basename(p) === filename && dirname(p) === soundfontsDir() ? p : null
  }
  const entry = SOUNDFONT_CATALOG[id]
  return entry ? join(soundfontsDir(), entry.filename) : null
}

ipcMain.handle('soundfont:list', () => {
  const catalogEntries = Object.entries(SOUNDFONT_CATALOG).map(([id, entry]) => ({
    id, name: entry.name, sizeMB: entry.sizeMB,
    downloaded: existsSync(join(soundfontsDir(), entry.filename)),
    custom: false,
  }))
  const knownFilenames = new Set(Object.values(SOUNDFONT_CATALOG).map(e => e.filename))
  const customEntries = readdirSync(soundfontsDir())
    .filter(f => /\.(sf2|sf3)$/i.test(f) && !knownFilenames.has(f))
    .map(f => {
      const stat = require('fs').statSync(join(soundfontsDir(), f))
      return {
        id: `${CUSTOM_SF_PREFIX}${f}`,
        name: f.replace(/\.(sf2|sf3)$/i, ''),
        sizeMB: Math.round((stat.size / (1024 * 1024)) * 10) / 10,
        downloaded: true,
        custom: true,
      }
    })
  return [...catalogEntries, ...customEntries]
})

ipcMain.handle('soundfont:delete', (_e, id: string) => {
  const p = soundfontPath(id)
  if (p && existsSync(p)) require('fs').unlinkSync(p)
})

ipcMain.handle('soundfont:read', (_e, id: string) => {
  const p = soundfontPath(id)
  if (!p || !existsSync(p)) return null
  return readFileSync(p)
})

// ── Import a user's own .sf2/.sf3 into soundfontsDir(), collision-safe — same
// copy pattern as fs:copyMidiToLibrary. Returns the new entry's id, or null if
// the user cancelled the picker. ───────────────────────────────────────────────
ipcMain.handle('soundfont:import', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Import SoundFont',
    filters: [{ name: 'SoundFont', extensions: ['sf2', 'sf3'] }],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null

  const sourcePath = result.filePaths[0]
  const origName = basename(sourcePath)
  const ext = extname(origName)
  const stem = origName.slice(0, origName.length - ext.length)
  let destName = origName
  let destPath = join(soundfontsDir(), destName)
  let counter = 2
  while (await access(destPath).then(() => true).catch(() => false)) {
    destName = `${stem} (${counter})${ext}`
    destPath = join(soundfontsDir(), destName)
    counter++
  }
  await copyFile(sourcePath, destPath)
  return `${CUSTOM_SF_PREFIX}${destName}`
})

// Follows redirects manually (GitHub release assets 302 to a signed CDN URL).
function httpsGetFollow(url: string, onResponse: (res: import('http').IncomingMessage) => void, hopsLeft = 5) {
  const https = require('https')
  https.get(url, (res: import('http').IncomingMessage) => {
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hopsLeft > 0) {
      res.resume()
      httpsGetFollow(res.headers.location, onResponse, hopsLeft - 1)
      return
    }
    onResponse(res)
  }).on('error', (e: Error) => onResponse({ statusCode: 0, message: e.message } as any))
}

ipcMain.handle('soundfont:download', (e, id: string) => {
  const entry = SOUNDFONT_CATALOG[id]
  const destPath = soundfontPath(id)
  if (!entry || !destPath) return Promise.resolve({ ok: false, error: 'Unknown soundfont' })
  return new Promise<{ ok: boolean; error?: string }>((resolve) => {
    httpsGetFollow(entry.url, (res) => {
      if (!res.statusCode || res.statusCode >= 400) {
        resolve({ ok: false, error: `Download failed: HTTP ${res.statusCode ?? (res as any).message ?? 'unknown'}` })
        return
      }
      const total = Number(res.headers?.['content-length'] ?? 0)
      let loaded = 0
      const tmpPath = destPath + '.download'
      const file = createWriteStream(tmpPath)
      res.on('data', (chunk: Buffer) => {
        loaded += chunk.length
        if (total > 0) e.sender.send('soundfont:progress', { id, progress: loaded / total })
      })
      res.pipe(file)
      file.on('finish', () => {
        file.close(() => {
          require('fs').renameSync(tmpPath, destPath)
          e.sender.send('soundfont:progress', { id, progress: 1 })
          resolve({ ok: true })
        })
      })
      file.on('error', (err: Error) => resolve({ ok: false, error: err.message }))
    })
  })
})
ipcMain.handle('dialog:openMidi', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open MIDI File',
    filters: [
      { name: 'MIDI & Score Files', extensions: ['mid', 'midi', 'kar', 'musicxml', 'xml', 'mxl', 'gp', 'gp3', 'gp4', 'gp5', 'gpx'] },
    ],
    properties: ['openFile'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const filePath = result.filePaths[0]
  const fileName = filePath.split(/[\\/]/).pop() ?? filePath
  return { fileName, filePath, base64: readFileSync(filePath).toString('base64') }
})

// ── Library folder ─────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select MIDI Library Folder', properties: ['openDirectory'],
  })
  if (result.canceled || !result.filePaths[0]) return null
  const folderPath = result.filePaths[0]
  savePrefs({ libraryFolder: folderPath })
  return folderPath
})
ipcMain.handle('fs:scanMidiFolder', async (_e, folderPath: string) => {
  function scanDir(dir: string): { name: string; path: string }[] {
    try {
      const results: { name: string; path: string }[] = []
      const entries = readdirSync(dir, { withFileTypes: true })
      for (const e of entries) {
        if (e.isDirectory()) {
          results.push(...scanDir(join(dir, e.name)))
        } else if (e.isFile() && /\.(mid|midi|kar|musicxml|xml|mxl|gp|gp3|gp4|gp5|gpx)$/i.test(e.name)) {
          results.push({ name: e.name, path: join(dir, e.name) })
        }
      }
      return results
    } catch { return [] }
  }
  return scanDir(folderPath).sort((a, b) => a.name.localeCompare(b.name))
})
ipcMain.handle('fs:loadMidiFromPath', async (_e, filePath: string) => {
  try {
    const fileName = filePath.split(/[\\/]/).pop() ?? filePath
    return { fileName, filePath, base64: readFileSync(filePath).toString('base64') }
  } catch { return null }
})

// ── Foreign format import cache — read ────────────────────────────────────────
// Returns base64 of the cached MIDI if it exists and is not stale
// (cache mtime >= source mtime). Returns null if conversion is needed.
ipcMain.handle('fs:getCachedImport',
  async (_e, sourcePath: string, cachePath: string): Promise<string | null> => {
  try {
    const { statSync: s } = require('fs') as typeof import('fs')
    const srcMtime   = s(sourcePath).mtimeMs
    const cacheMtime = s(cachePath).mtimeMs
    if (cacheMtime < srcMtime) return null // stale
    return readFileSync(cachePath).toString('base64')
  } catch {
    return null // source or cache doesn't exist
  }
})

// ── Foreign format import cache — write ───────────────────────────────────────
// Writes converted MIDI bytes (base64-encoded) to destPath.
ipcMain.handle('fs:writeCachedImport',
  async (_e, destPath: string, base64: string): Promise<void> => {
  writeFileSync(destPath, Buffer.from(base64, 'base64'))
})

// ── Copy a MIDI file into the library folder with collision-safe renaming ──────
// Never moves or overwrites — source file is always left intact.
// Returns the final destination path so the renderer can load it directly.
ipcMain.handle('fs:copyMidiToLibrary', async (_e, sourcePath: string, libraryFolder: string) => {
  const origName = basename(sourcePath)
  const ext      = extname(origName)                     // '.mid' / '.midi'
  const stem     = origName.slice(0, origName.length - ext.length)

  let destName   = origName
  let destPath   = join(libraryFolder, destName)
  let counter    = 2
  while (await access(destPath).then(() => true).catch(() => false)) {
    destName = `${stem} (${counter})${ext}`
    destPath = join(libraryFolder, destName)
    counter++
  }

  await copyFile(sourcePath, destPath)
  return destPath
})

// ── Library folder management — create/rename/delete/move, all scoped to
// libraryFolder. `Demo` and `Orfeo` are reserved: never renamed, deleted, or
// used as a move destination. ──────────────────────────────────────────────
function isProtectedFolderName(name: string): boolean {
  const n = name.toLowerCase()
  return n === 'demo' || n === 'orfeo'
}

// ── Narrower than isProtectedFolderName — for FILES inside a protected
// folder, not the folder itself. "Orfeo" isn't actually one well-known
// folder: getOrfeoOutputDir() creates one beside every source file, so
// literally every saved version lives inside a folder named "Orfeo". Using
// isProtectedFolderName for file-level checks blocked renaming/moving any
// version ever saved. Demo is genuinely read-only bundled content and stays
// blocked; Orfeo is the user's own generated output and shouldn't be. ───────
function isReadOnlyFolderName(name: string): boolean {
  return name.toLowerCase() === 'demo'
}

function listFilesRecursive(dir: string): string[] {
  const results: string[] = []
  try {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, e.name)
      if (e.isDirectory()) results.push(...listFilesRecursive(full))
      else results.push(full)
    }
  } catch { /* folder vanished mid-walk — skip */ }
  return results
}

// Finds a collision-free name for `libraryFolder/<baseName>` (or its "(2)" etc. variants).
async function uniqueFolderName(libraryFolder: string, baseName: string): Promise<string> {
  let name = baseName
  let counter = 2
  while (await access(join(libraryFolder, name)).then(() => true).catch(() => false)) {
    name = `${baseName} (${counter})`
    counter++
  }
  return name
}

// Real subfolder names at libraryFolder root (one level) — includes empty folders,
// unlike the file-derived grouping the renderer builds from scanMidiFolder results.
ipcMain.handle('fs:listLibraryFolders', async (_e, libraryFolder: string) => {
  try {
    return readdirSync(libraryFolder, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => e.name)
  } catch { return [] }
})

ipcMain.handle('fs:createLibraryFolder', async (_e, libraryFolder: string, name: string) => {
  const baseName = basename(name).trim() || 'New Folder'
  const finalName = await uniqueFolderName(libraryFolder, baseName)
  await mkdir(join(libraryFolder, finalName))
  return finalName
})

ipcMain.handle('fs:renameLibraryFolder', async (_e, libraryFolder: string, oldName: string, newName: string) => {
  if (isProtectedFolderName(oldName) || isProtectedFolderName(newName)) {
    return { ok: false, reason: 'protected' }
  }
  const oldPath = join(libraryFolder, basename(oldName))
  const baseName = basename(newName).trim() || oldName
  const finalName = await uniqueFolderName(libraryFolder, baseName)
  const newPath = join(libraryFolder, finalName)

  const oldFiles = listFilesRecursive(oldPath)
  await rename(oldPath, newPath)
  const pairs = oldFiles.map(f => ({ oldPath: f, newPath: join(newPath, f.slice(oldPath.length + 1)) }))
  remapFileLog(pairs)
  return { ok: true, name: finalName, pairs }
})

// Renames a single library file in place (same folder). Used by the File
// info popup's artist/song swap. Refuses protected-folder files, same rule
// as every other organize action.
ipcMain.handle('fs:renameLibraryFile', async (_e, filePath: string, newName: string) => {
  if (isReadOnlyFolderName(basename(dirname(filePath)))) return { ok: false, reason: 'protected' }
  const dir = dirname(filePath)
  const finalName = basename(newName).trim()
  if (!finalName) return { ok: false, reason: 'empty' }
  const newPath = join(dir, finalName)
  if (newPath === filePath) return { ok: true, newPath }
  if (await access(newPath).then(() => true).catch(() => false)) return { ok: false, reason: 'exists' }
  try {
    await rename(filePath, newPath)
    remapFileLog([{ oldPath: filePath, newPath }])
    appendFileLogEvent(newPath, { type: 'rename', timestamp: Date.now(), summary: `Renamed from "${basename(filePath)}" to "${finalName}"` })
    return { ok: true, newPath }
  } catch {
    return { ok: false, reason: 'error' }
  }
})

ipcMain.handle('fs:deleteLibraryFolder', async (_e, libraryFolder: string, name: string) => {
  if (isProtectedFolderName(name)) return { ok: false, reason: 'protected' }
  const target = join(libraryFolder, basename(name))
  try {
    if (readdirSync(target).length > 0) return { ok: false, reason: 'not-empty' }
    await rmdir(target)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'error' }
  }
})

// Moves files (by absolute source path) into libraryFolder/destFolderName, or
// library root if destFolderName is null. Per-file try/catch — one failure
// doesn't abort the batch. Returns only the {oldPath,newPath} pairs that succeeded.
ipcMain.handle('fs:moveLibraryFiles', async (
  _e, filePaths: string[], libraryFolder: string, destFolderName: string | null,
) => {
  if (destFolderName && isProtectedFolderName(destFolderName)) return []
  const destDir = destFolderName ? join(libraryFolder, basename(destFolderName)) : libraryFolder

  const results: { oldPath: string; newPath: string }[] = []
  for (const srcPath of filePaths) {
    if (isReadOnlyFolderName(basename(dirname(srcPath)))) continue
    try {
      const origName = basename(srcPath)
      const ext      = extname(origName)
      const stem     = origName.slice(0, origName.length - ext.length)
      let destName   = origName
      let destPath   = join(destDir, destName)
      let counter    = 2
      while (await access(destPath).then(() => true).catch(() => false)) {
        destName = `${stem} (${counter})${ext}`
        destPath = join(destDir, destName)
        counter++
      }
      await rename(srcPath, destPath)
      results.push({ oldPath: srcPath, newPath: destPath })
    } catch { /* skip this file, continue with the rest */ }
  }
  remapFileLog(results)
  for (const { newPath } of results) {
    appendFileLogEvent(newPath, { type: 'moved', timestamp: Date.now(), summary: destFolderName ? `Moved to "${destFolderName}"` : 'Moved to library root' })
  }
  return results
})

ipcMain.handle('dialog:saveFile', async (_e, opts: { defaultPath: string; filters: any[] }) => {
  const result = await dialog.showSaveDialog({ defaultPath: opts.defaultPath, filters: opts.filters })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('editor:save', async (_e, payload: {
  filePath: string
  outputPath: string
  includedTracks: { index: number; newProgram: number; name?: string; color?: string; splitHand?: 'L' | 'R'; visible?: boolean; showOnKeyboard?: boolean }[]
  mergeGroups: number[][]
  rhMaxFingers?: number
  lhMaxFingers?: number
}) => {
  try {
    if (!payload.filePath) return { ok: false, message: 'No source file loaded' }
    const midi = new Midi(readFileSync(payload.filePath))

    // ── Resolve output path into Orfeo/ subfolder — always the next _ORFEO_vN,
    // never overwrites a prior save (see src/utils/orfeoVersioning.ts). ────────
    const orfeoDir   = await getOrfeoOutputDir(payload.filePath)
    const rawBase    = basename(payload.filePath).replace(/\.midi?$/i, '')
    const outputPath = join(orfeoDir, `${nextOrfeoBaseName(rawBase)}.mid`)

    const noteTrackIndices: number[] = []
    midi.tracks.forEach((t, i) => { if (t.notes.length > 0) noteTrackIndices.push(i) })

    const handsByRawIdx = new Map<number, Hand[]>()

    // ── Staged hand-splits — a track carrying one or two `splitHand` entries
    // gets partitioned via the same hand-assignment engine the old standalone
    // "editor:split" IPC used, but folded into this one save instead of its
    // own separate disk write. This is what makes split a staged edit like
    // merge/color/instrument reassignment: nothing hits disk until Save &
    // Reload, and the whole session becomes exactly one _ORFEO_vN. ──────────
    const splitByOrigin = new Map<number, { L?: typeof payload.includedTracks[0]; R?: typeof payload.includedTracks[0] }>()
    for (const it of payload.includedTracks) {
      if (!it.splitHand) continue
      const entry = splitByOrigin.get(it.index) ?? {}
      entry[it.splitHand] = it
      splitByOrigin.set(it.index, entry)
    }
    // rawIdx of the newly-appended RH track, keyed by origin editor index —
    // only set when BOTH hands survived as separate output tracks; when only
    // RH was kept, its notes replace the origin track in place instead.
    const rhRawIdxByOrigin = new Map<number, number>()

    for (const [edIdx, halves] of splitByOrigin) {
      const origRaw = noteTrackIndices[edIdx]
      if (origRaw === undefined) continue
      const srcTrack = midi.tracks[origRaw]
      const { assignments } = assignHands(srcTrack.notes, { rhMaxFingers: payload.rhMaxFingers, lhMaxFingers: payload.lhMaxFingers })
      const lhNotes = assignments.filter(a => a.hand === 'L').map(a => a.note)
      const rhNotes = assignments.filter(a => a.hand === 'R').map(a => a.note)
      const origName = srcTrack.name || 'Piano'

      if (halves.L && halves.R) {
        srcTrack.notes.splice(0)
        lhNotes.forEach(n => srcTrack.notes.push(n))
        srcTrack.name = halves.L.name || withHandSuffix(origName, 'L')
        if (halves.L.newProgram >= 0 && (srcTrack as any).channel !== 9) srcTrack.instrument.number = halves.L.newProgram
        handsByRawIdx.set(origRaw, srcTrack.notes.map(() => 'L' as Hand))

        const rhTrack = midi.addTrack()
        rhTrack.name = halves.R.name || withHandSuffix(origName, 'R')
        rhTrack.instrument.number = halves.R.newProgram >= 0 ? halves.R.newProgram : srcTrack.instrument.number
        rhNotes.forEach(n => rhTrack.notes.push(n))
        const rhRaw = midi.tracks.length - 1
        rhRawIdxByOrigin.set(edIdx, rhRaw)
        handsByRawIdx.set(rhRaw, rhTrack.notes.map(() => 'R' as Hand))
      } else if (halves.L) {
        srcTrack.notes.splice(0)
        lhNotes.forEach(n => srcTrack.notes.push(n))
        srcTrack.name = halves.L.name || withHandSuffix(origName, 'L')
        if (halves.L.newProgram >= 0 && (srcTrack as any).channel !== 9) srcTrack.instrument.number = halves.L.newProgram
        handsByRawIdx.set(origRaw, srcTrack.notes.map(() => 'L' as Hand))
      } else if (halves.R) {
        srcTrack.notes.splice(0)
        rhNotes.forEach(n => srcTrack.notes.push(n))
        srcTrack.name = halves.R.name || withHandSuffix(origName, 'R')
        if (halves.R.newProgram >= 0 && (srcTrack as any).channel !== 9) srcTrack.instrument.number = halves.R.newProgram
        handsByRawIdx.set(origRaw, srcTrack.notes.map(() => 'R' as Hand))
      }
    }

    // ── Resolve every included row to its final raw track index — split
    // halves route through rhRawIdxByOrigin/origin above, everything else is
    // a plain noteTrackIndices lookup. ─────────────────────────────────────
    const resolved = payload.includedTracks.map(it => {
      const raw = it.splitHand === 'R' && rhRawIdxByOrigin.has(it.index)
        ? rhRawIdxByOrigin.get(it.index)!
        : noteTrackIndices[it.index]
      return { raw, entry: it }
    }).filter((r): r is { raw: number; entry: typeof payload.includedTracks[0] } => r.raw !== undefined)

    const includedSet = new Set(resolved.map(r => r.raw))

    // Instrument reassignment — split entries already handled above.
    for (const it of payload.includedTracks) {
      if (it.splitHand) continue
      const orig = noteTrackIndices[it.index]
      if (orig === undefined) continue
      const track = midi.tracks[orig]
      if (track && it.newProgram >= 0 && (track as any).channel !== 9) {
        track.instrument.number = it.newProgram
      }
    }

    // Merge — collects each merged group's combined notes into one stream and
    // runs them through the same hand-assignment engine that backs split and
    // hand-colored rendering (src/utils/handAssignment.ts), instead of the
    // merge simply concatenating notes with no hand awareness at all.
    for (const group of (payload.mergeGroups ?? [])) {
      if (group.length < 2) continue
      const idxs = group.map(i => noteTrackIndices[i]).filter((i): i is number => i !== undefined && includedSet.has(i))
      if (idxs.length < 2) continue
      const base = midi.tracks[idxs[0]]
      for (let i = 1; i < idxs.length; i++) {
        base.notes.push(...midi.tracks[idxs[i]].notes)
        base.notes.sort((a: any, b: any) => a.time - b.time)
        includedSet.delete(idxs[i])
      }

      const { assignments } = assignHands(base.notes, { rhMaxFingers: payload.rhMaxFingers, lhMaxFingers: payload.lhMaxFingers })
      const handByNote = new Map(assignments.map(a => [a.note, a.hand]))
      handsByRawIdx.set(idxs[0], base.notes.map((n: any) => handByNote.get(n)!))
    }

    // Surviving output tracks in file order — shared by both meta-injection
    // blocks below (their outIdx numbering must match, it's what the parser's
    // ParsedTrack.index will be on reimport). Raw indices are unique array
    // positions into midi.tracks (appended split/RH tracks always sort last),
    // so a numeric sort reproduces file order without needing noteTrackIndices,
    // which doesn't cover newly-appended tracks.
    const includedInOrder = Array.from(includedSet).sort((a, b) => a - b)

    // ── Hand-tag every surviving keyboard-group track the split/merge logic
    // above didn't already tag — this is what makes "keep one track, hand-
    // colored" (Stage 4) persist through an ordinary save, not just a merge:
    // every piano/chromatic/organ track gets the same assignHands() pass and
    // export hint, using the classification midiParser.ts uses on reimport
    // so the two sides agree on what counts as "keyboard-group".
    for (const rawIdx of includedInOrder) {
      if (handsByRawIdx.has(rawIdx)) continue
      const track = midi.tracks[rawIdx]
      const isDrum = (track as any).channel === 9
      if (isDrum || track.notes.length === 0) continue
      const group = getGMGroup(track.instrument?.number ?? 0, isDrum)
      if (!KEYBOARD_GROUPS.has(group)) continue
      const { assignments } = assignHands(track.notes, { rhMaxFingers: payload.rhMaxFingers, lhMaxFingers: payload.lhMaxFingers })
      const handByNote = new Map(assignments.map(a => [a.note, a.hand]))
      handsByRawIdx.set(rawIdx, track.notes.map((n: any) => handByNote.get(n)!))
    }

    // ── Inject ORFEO_TRACK_NAME / ORFEO_TRACK_COLOR text meta-events for each
    // output track that carries one — name/color now travel directly on each
    // includedTracks entry (see `resolved` above) instead of separate side
    // maps, so split halves (whose editor row isn't a plain noteTrackIndices
    // position) resolve the same way as every other row. Without this, a name
    // edit or color picked in the popover only ever lived in the renderer's
    // store — save+reload silently discarded it back to the file default. ───
    const rawToEntry = new Map(resolved.map(r => [r.raw, r.entry]))
    const existingMeta = (midi.header as any).meta ?? []
    ;(midi.header as any).meta = existingMeta.filter((m: any) =>
      !(typeof m.text === 'string' && (
        m.text.startsWith('ORFEO_TRACK_NAME:') || m.text.startsWith('ORFEO_TRACK_COLOR:') ||
        m.text.startsWith('ORFEO_TRACK_VISIBLE:') || m.text.startsWith('ORFEO_TRACK_KEYBOARD:')
      ))
    )
    includedInOrder.forEach((rawIdx, outIdx) => {
      const entry = rawToEntry.get(rawIdx)
      if (entry?.name) (midi.header as any).meta.push({ type: 'text', text: `ORFEO_TRACK_NAME:${outIdx}:${entry.name}`, ticks: 0 })
      if (entry?.color) (midi.header as any).meta.push({ type: 'text', text: `ORFEO_TRACK_COLOR:${outIdx}:${entry.color}`, ticks: 0 })
      if (entry?.visible !== undefined) (midi.header as any).meta.push({ type: 'text', text: `ORFEO_TRACK_VISIBLE:${outIdx}:${entry.visible ? 1 : 0}`, ticks: 0 })
      if (entry?.showOnKeyboard !== undefined) (midi.header as any).meta.push({ type: 'text', text: `ORFEO_TRACK_KEYBOARD:${outIdx}:${entry.showOnKeyboard ? 1 : 0}`, ticks: 0 })
    })

    // ── Inject hand-assignment export hint for every tagged track ─────────────
    // Homogeneous track (every note the same hand) → " (RH)"/" (LH)" name
    // suffix. Mixed track → ORFEO_HAND_MAP RLE text meta. Neither is real MIDI
    // clef data — see src/utils/handMetadata.ts.
    if (handsByRawIdx.size > 0) {
      const existingMeta = (midi.header as any).meta ?? []
      ;(midi.header as any).meta = existingMeta.filter(
        (m: any) => !(typeof m.text === 'string' && m.text.startsWith('ORFEO_HAND_MAP:'))
      )
      includedInOrder.forEach((rawIdx, outIdx) => {
        const hands = handsByRawIdx.get(rawIdx)
        if (!hands) return
        const track = midi.tracks[rawIdx]
        const hint = buildHandExportHint(outIdx, track.name, hands.map(h => ({ hand: h })))
        track.name = hint.name
        if (hint.meta) (midi.header as any).meta.push(hint.meta)
      })
    }

    // Remove excluded
    noteTrackIndices.filter(i => !includedSet.has(i)).sort((a, b) => b - a).forEach(i => midi.tracks.splice(i, 1))

    const outBuf = Buffer.from(midi.toArray())
    writeFileSync(outputPath, outBuf)

    // ── Return file data so the renderer can reload inline ────────────────────
    const fileName = outputPath.split(/[\\/]/).pop() ?? outputPath
    return { ok: true, message: `Saved: ${fileName}`, filePath: outputPath, fileName, base64: outBuf.toString('base64') }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Save failed' }
  }
})

// ── Mixer Console — persist per-channel volume/pan/reverb/chorus into the file ──
// Flattens each CC to a single static value at time 0 (the mixer UI never
// represented automation, only one value per channel), writes through the same
// _ORFEO_vN versioning as editor:save, and logs one changelog entry.
ipcMain.handle('mixer:save', async (_e, payload: {
  filePath: string
  channels: { index: number; volume: number; pan: number; chorus: number; reverb: number }[]
}) => {
  try {
    if (!payload.filePath) return { ok: false, message: 'No source file loaded' }
    const midi = new Midi(readFileSync(payload.filePath))

    const noteTrackIndices: number[] = []
    midi.tracks.forEach((t, i) => { if (t.notes.length > 0) noteTrackIndices.push(i) })

    const setStaticCC = (rawIdx: number, ccNumber: number, value: number) => {
      const track = midi.tracks[rawIdx]
      ;(track.controlChanges as any)[ccNumber] = []
      track.addCC({ number: ccNumber, value, time: 0 })
    }

    for (const ch of payload.channels) {
      const rawIdx = noteTrackIndices[ch.index]
      if (rawIdx === undefined) continue
      setStaticCC(rawIdx, 7,  Math.max(0, Math.min(1, ch.volume)))
      setStaticCC(rawIdx, 10, Math.max(0, Math.min(1, ch.pan / 2 + 0.5)))
      setStaticCC(rawIdx, 91, Math.max(0, Math.min(1, ch.reverb)))
      setStaticCC(rawIdx, 93, Math.max(0, Math.min(1, ch.chorus)))
    }

    const orfeoDir   = await getOrfeoOutputDir(payload.filePath)
    const rawBase    = basename(payload.filePath).replace(/\.midi?$/i, '')
    const outputPath = join(orfeoDir, `${nextOrfeoBaseName(rawBase)}.mid`)

    const outBuf = Buffer.from(midi.toArray())
    writeFileSync(outputPath, outBuf)

    const fileName = outputPath.split(/[\\/]/).pop() ?? outputPath
    appendFileLogEvent(outputPath, {
      type: 'mixer', timestamp: Date.now(),
      summary: `Mixer: volume/pan/reverb/chorus changed on ${payload.channels.length} channel(s)`,
    })
    return { ok: true, message: `Saved: ${fileName}`, filePath: outputPath, fileName, base64: outBuf.toString('base64') }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Save failed' }
  }
})

// ── Chord Transcript PDF generation ───────────────────────────────────────────

// ── Strip trailing M from plain major chord names (CM → C, GM → G) ───────────
function pdfStripMajor(chord: string): string {
  return chord.replace(/^([A-G][b#]?)M$/, '$1')
}

// ── Legend dedup key — strip inversion and trailing M ────────────────────────
// C/E → C,  GM/D → G,  Cm/Eb → Cm.  Used both for legend dedup and
// for consecutive-identical dedup in the bar progression.
function pdfLegendKey(chord: string): string {
  return pdfStripMajor(chord.split('/')[0])
}

// ── Penalise noisy/exotic chord names — mirrors renderer's scoreChord() ──────
const PDF_WEIRD = ['m#5', 'aug', 'No5', 'sus2add', 'add#11', 'add#', 'no5', '#5', 'b6']
function pdfScoreChord(name: string): number {
  let score = name.length
  if (PDF_WEIRD.some(w => name.includes(w))) score += 20
  if (name.includes('/')) score += 5
  return score
}

// ── Pick best root-position chord using WEIRD-penalised scoring ───────────────
function pdfPickBest(matches: string[]): string | null {
  const roots = matches.filter(m => !m.includes('/'))
  const pool = roots.length > 0 ? roots : matches
  return pool.sort((a, b) => pdfScoreChord(a) - pdfScoreChord(b))[0] ?? null
}

// ── Pitch-class names for power chord root identification ─────────────────────
const PDF_PC = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']

// ── Detect chord from a MIDI note cluster ─────────────────────────────────────
// Deduplicates to pitch classes first.
// Power chords (exactly 2 PCs, interval 7) → "{root}5".
// All other 2-PC combinations → null (ambiguous interval).
// 3+ distinct PCs → Chord.detect() with WEIRD-penalised scoring.
function pdfDetectChord(midiNotes: number[]): string | null {
  if (midiNotes.length < 2) return null
  const sorted = [...midiNotes].sort((a, b) => a - b)
  const pcs = [...new Set(sorted.map(m => m % 12))].sort((a, b) => a - b)

  if (pcs.length === 2) {
    const interval = (pcs[1] - pcs[0] + 12) % 12
    if (interval === 7) return `${PDF_PC[pcs[0]]}5`
    return null
  }
  if (pcs.length < 3) return null

  const noteNames = sorted.map(m => Note.fromMidi(m)).filter(Boolean) as string[]
  let matches = Chord.detect(noteNames)
  if (matches.length === 0 && noteNames.length > 3) matches = Chord.detect(noteNames.slice(0, -1))
  if (matches.length === 0) {
    const pcNames = pcs.map(pc => PDF_PC[pc])
    matches = Chord.detect(pcNames)
  }
  if (matches.length === 0) return null
  const best = pdfPickBest(matches)
  return best ? pdfStripMajor(best) : null
}

// ── Convert accidentals in a chord/note name string ───────────────────────────
// flat mode: no-op (tonal already returns flats, Bb always stays Bb per PC10 rule)
// sharp mode: Db→C#, Eb→D#, Gb→F#, Ab→G# — Bb is never converted (PC10 rule)
function pdfConvertAccidentals(text: string, accidentals: string): string {
  if (accidentals !== 'sharp') return text
  return text
    .replace(/Db/g, 'C#')
    .replace(/Eb/g, 'D#')
    .replace(/Gb/g, 'F#')
    .replace(/Ab/g, 'G#')
}

// ── Localize a chord/note name to the user's naming system ───────────────────
// Cannot import renderer's localizeChord — minimal duplicate here.
const PDF_SOLFEGE: Record<string, string> = {
  'C#': 'Do#', 'Db': 'Reb', 'D#': 'Re#', 'Eb': 'Mib',
  'F#': 'Fa#', 'Gb': 'Solb', 'G#': 'Sol#', 'Ab': 'Lab', 'Bb': 'Sib',
  'C': 'Do', 'D': 'Re', 'E': 'Mi', 'F': 'Fa', 'G': 'Sol', 'A': 'La', 'B': 'Si',
}
const PDF_SOLFEGE_KEYS = Object.keys(PDF_SOLFEGE).sort((a, b) => b.length - a.length)

function pdfLocalizeChord(chord: string, noteNaming: string, accidentals: string): string {
  if (!chord) return chord
  let r = pdfConvertAccidentals(chord, accidentals)
  if (noteNaming === 'central-european') {
    r = r.replace(/Bb/g, 'B').replace(/B(?!b)/g, 'H')
    return r
  }
  if (noteNaming === 'solfege') {
    for (const k of PDF_SOLFEGE_KEYS) {
      if (r.startsWith(k)) return PDF_SOLFEGE[k] + r.slice(k.length)
    }
  }
  return r
}

// ── Draw one-octave (C–B) keyboard thumbnail; chord tones filled amber ────────
// englishChordName must be root-position (no slash) for Chord.get() to work.
// Black keys: fixed 4.5pt wide × 11pt tall per spec, no stroke.
// White keys: fill #efefef, stroke #c0c0c0 at 0.2pt.
function drawKeyboardThumbnail(
  doc: InstanceType<typeof PDFDocument>,
  x: number,
  y: number,
  englishChordName: string,
  thumbW: number,
  thumbH: number,
) {
  const WHITE_PCS      = [0, 2, 4, 5, 7, 9, 11]
  const BLACK_PCS      = [1, 3, 6, 8, 10]
  const BLACK_X_FRACS  = [1 / 7, 2 / 7, 4 / 7, 5 / 7, 6 / 7]
  const wKeyW          = thumbW / 7
  const B_KEY_W        = 4.5
  const B_KEY_H        = 11

  const chordInfo = Chord.get(englishChordName)
  const chordPCs  = new Set(
    (chordInfo.notes ?? []).map((n: string) => ((Note.midi(n + '4') ?? 60) % 12))
  )

  // ── White keys ──────────────────────────────────────────────────────────────
  doc.lineWidth(0.2)
  WHITE_PCS.forEach((pc, i) => {
    const lit = chordPCs.has(pc)
    doc.rect(x + i * wKeyW, y, wKeyW - 0.5, thumbH)
      .fillAndStroke(lit ? '#e8a027' : '#efefef', '#c0c0c0')
  })

  // ── Black keys (no stroke — fill only) ──────────────────────────────────────
  BLACK_PCS.forEach((pc, i) => {
    const lit = chordPCs.has(pc)
    const bx  = x + BLACK_X_FRACS[i] * thumbW - B_KEY_W / 2
    doc.rect(bx, y, B_KEY_W, B_KEY_H)
      .fill(lit ? '#e8a027' : '#2a2a2a')
  })
}

// ── transcript:generate IPC handler ──────────────────────────────────────────
ipcMain.handle('transcript:generate', async (_e, midiFilePath: string, noteNaming: string, accidentals: string) => {
  try {
    // ── 1. Parse MIDI ──────────────────────────────────────────────────────────
    const buf = readFileSync(midiFilePath)
    const midi = new Midi(buf)
    const tempos = midi.header.tempos.length > 0
      ? midi.header.tempos
      : [{ ticks: 0, bpm: 120 }]
    const timeSigs = midi.header.timeSignatures.length > 0
      ? midi.header.timeSignatures
      : [{ ticks: 0, timeSignature: [4, 4] }]

    const bpm        = tempos[0].bpm
    const [tsNum, tsDen] = timeSigs[0].timeSignature as [number, number]
    const secPerBeat = 60 / bpm
    const secPerBar  = secPerBeat * tsNum

    const keySigs  = (midi.header as any).keySignatures ?? []
    const keyLabel = keySigs.length > 0
      ? `${keySigs[0].key ?? ''} ${keySigs[0].scale ?? ''}`.trim()
      : ''

    // noteNaming 'hidden' falls back to english for PDF display
    const effectiveNaming = noteNaming === 'hidden' ? 'english' : noteNaming

    // ── 2. Collect notes from all non-percussion tracks ────────────────────────
    const allNotes: { midi: number; time: number; duration: number }[] = []
    for (const track of midi.tracks) {
      if ((track.instrument as any).percussion) continue
      for (const note of track.notes) {
        allNotes.push({ midi: note.midi, time: note.time, duration: note.duration })
      }
    }
    allNotes.sort((a, b) => a.time - b.time)

    // ── 3. Cluster notes within 150ms; require ≥150ms max note duration ────────
    // 150ms window groups arpeggiated chords; duration gate filters melodic runs.
    interface RawCluster { time: number; notes: number[]; maxDuration: number }
    const rawClusters: RawCluster[] = []
    for (const note of allNotes) {
      const last = rawClusters[rawClusters.length - 1]
      if (last && note.time - last.time <= 0.150) {
        last.notes.push(note.midi)
        if (note.duration > last.maxDuration) last.maxDuration = note.duration
      } else {
        rawClusters.push({ time: note.time, notes: [note.midi], maxDuration: note.duration })
      }
    }

    // ── 4. Detect chords; filter passing tones and unrecognised clusters ───────
    interface DetectedChord { time: number; chord: string }
    const rawDetected: DetectedChord[] = rawClusters
      .filter(cl => cl.maxDuration >= 0.150)
      .map(cl => ({ time: cl.time, chord: pdfDetectChord(cl.notes) ?? '' }))
      .filter(cl => cl.chord !== '')

    // ── 5. Global dedup — consecutive same root+quality, ignoring inversions ───
    // C → C/E → C/G all collapse to the first C; inversion changes are noise here.
    const deduped: DetectedChord[] = []
    for (const cl of rawDetected) {
      const prevKey = deduped.length > 0 ? pdfLegendKey(deduped[deduped.length - 1].chord) : ''
      if (pdfLegendKey(cl.chord) !== prevKey) deduped.push(cl)
    }

    // ── 6. Compute bar/beat position; localize chord names ────────────────────
    interface GridChord {
      bar:     number  // 1-based
      beatCol: number  // 0-based beat index within bar
      xFrac:   number  // 0–1 proportional position within beat cell
      chord:   string  // localized display name (may include inversion slash)
      chordEn: string  // English root-position key (for Chord.get() in thumbnail)
    }
    const gridChords: GridChord[] = deduped.map(cl => {
      const bar       = Math.floor(cl.time / secPerBar) + 1
      const timeInBar = cl.time - (bar - 1) * secPerBar
      const beatInBar = timeInBar / secPerBeat
      const beatCol   = Math.min(Math.floor(beatInBar), tsNum - 1)
      const xFrac     = Math.max(0, Math.min(1, beatInBar - beatCol))
      return {
        bar, beatCol, xFrac,
        chord:   pdfLocalizeChord(cl.chord, effectiveNaming, accidentals),
        chordEn: pdfLegendKey(cl.chord),
      }
    })

    // ── 7. Build bar→beat map for grid rendering ──────────────────────────────
    const barBeatMap = new Map<number, { beatCol: number; xFrac: number; chord: string }[]>()
    for (const gc of gridChords) {
      if (!barBeatMap.has(gc.bar)) barBeatMap.set(gc.bar, [])
      barBeatMap.get(gc.bar)!.push({ beatCol: gc.beatCol, xFrac: gc.xFrac, chord: gc.chord })
    }

    const totalBars = Math.max(
      barBeatMap.size > 0 ? Math.max(...barBeatMap.keys()) : 1,
      Math.ceil(midi.duration / secPerBar),
    )

    // ── 8. Collect unique legend chords — strip inversion + trailing M, dedup ──
    // Normalize explicitly here: split on '/' (strip inversion), then strip
    // trailing M — e.g. C/E → C, GM/D → G, Hmb6b9/C → Hmb6b9.
    // Keep only first occurrence; thumbnails use the root-position English name.
    const legendKeySet = new Set<string>()
    const legendEn: string[] = []
    for (const gc of gridChords) {
      const base = pdfStripMajor(gc.chordEn.split('/')[0])
      if (!legendKeySet.has(base)) { legendKeySet.add(base); legendEn.push(base) }
    }

    // ── 9. Generate PDF ────────────────────────────────────────────────────────
    const orfeoDir   = await getOrfeoOutputDir(midiFilePath)
    const songName   = basename(midiFilePath).replace(/\.midi?$/i, '')
    const outputPath = join(orfeoDir, `${songName}_CHORD_TRANSCRIPT.pdf`)

    // ── Font directory: project root in dev, resources/ in packaged app ────────
    const fontsDir = app.isPackaged
      ? join(process.resourcesPath, 'fonts')
      : join(app.getAppPath(), 'public', 'fonts')

    await new Promise<void>((resolve, reject) => {
      // ── Page + color constants ───────────────────────────────────────────────
      const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: true })
      const stream = createWriteStream(outputPath)
      doc.pipe(stream)

      const pageW    = doc.page.width    // 595.28
      const pageH    = doc.page.height   // 841.89
      const margin   = 42.52             // 15mm
      const contentW = pageW - margin * 2

      const C_LINE  = '#d0d0dc'   // grid lines, rules, bar/beat labels
      const C_DIM   = '#707088'   // secondary labels, note names, footer
      const C_TEXT  = '#1a1a2a'   // chord names in grid
      const C_HEAD  = '#0f0f12'   // title
      const C_INFO  = '#909090'   // header info line

      // ── Register embedded fonts ──────────────────────────────────────────────
      doc.registerFont('Inter',        join(fontsDir, 'Inter-Regular.ttf'))
      doc.registerFont('Inter-Bold',   join(fontsDir, 'Inter-Bold.ttf'))
      doc.registerFont('Inter-Italic', join(fontsDir, 'Inter-Italic.ttf'))
      doc.registerFont('Mono',         join(fontsDir, 'JetBrainsMono-Regular.ttf'))

      // ── Section 1 — Header ───────────────────────────────────────────────────
      doc.font('Inter-Bold').fontSize(13).fillColor(C_HEAD)
        .text(songName, margin, margin, { width: contentW })

      doc.font('Inter-Italic').fontSize(8).fillColor(C_DIM)
        .text('Orfeo Chord Transcript', margin, doc.y + 3, { width: contentW })

      const infoLine = [
        `Tempo: ${Math.round(bpm)} BPM`,
        keyLabel ? `Key: ${keyLabel}` : null,
        `Time: ${tsNum}/${tsDen}`,
        `${totalBars} bars`,
        `${legendEn.length} unique chords`,
      ].filter(Boolean).join('  ·  ')

      doc.font('Inter').fontSize(7).fillColor(C_INFO)
        .text(infoLine, margin, doc.y + 3, { width: contentW })

      let curY = doc.y + 6
      doc.moveTo(margin, curY).lineTo(margin + contentW, curY)
        .strokeColor(C_LINE).lineWidth(0.3).stroke()
      curY += 8

      // ── Section 2 — Chord Legend ─────────────────────────────────────────────
      doc.font('Inter').fontSize(7).fillColor(C_DIM)
        .text('CHORDS USED IN SONG', margin, curY, { characterSpacing: 0.8 })
      curY = doc.y + 4

      const THUMB_W     = 49.5
      const THUMB_H     = 17.4
      const THUMB_GAP_H = 6
      const THUMB_GAP_V = 8
      const LEG_COLS    = 10
      const LEG_ROW_H   = THUMB_H + 15 + THUMB_GAP_V  // thumbnail + name line + notes line + gap
      const LEG_CELL_W  = THUMB_W + THUMB_GAP_H

      let legRowY = curY

      legendEn.forEach((chordEn, i) => {
        const col = i % LEG_COLS

        // ── Advance to next legend row; page-break if needed ─────────────────
        if (col === 0 && i > 0) {
          legRowY += LEG_ROW_H
          if (legRowY + LEG_ROW_H > pageH - margin - 20) {
            doc.addPage()
            legRowY = margin
          }
        }

        const cx        = margin + col * LEG_CELL_W
        const localName = pdfLocalizeChord(chordEn, effectiveNaming, accidentals)

        drawKeyboardThumbnail(doc, cx, legRowY, chordEn, THUMB_W, THUMB_H)

        // ── Chord name in Mono below thumbnail ──────────────────────────────
        doc.font('Inter-Bold').fontSize(7).fillColor(C_TEXT)
          .text(localName, cx, legRowY + THUMB_H + 2, { width: THUMB_W, align: 'center', lineBreak: false })

        // ── Note names in Inter below chord name ────────────────────────────
        const notesEn    = (Chord.get(chordEn).notes ?? []) as string[]
        const notesLocal = notesEn.map(n => pdfLocalizeChord(n, effectiveNaming, accidentals)).join(' ')
        doc.font('Inter').fontSize(6).fillColor(C_DIM)
          .text(notesLocal, cx, legRowY + THUMB_H + 10, { width: THUMB_W, align: 'center', lineBreak: false })
      })

      curY = legRowY + LEG_ROW_H + 4
      doc.moveTo(margin, curY).lineTo(margin + contentW, curY)
        .strokeColor(C_LINE).lineWidth(0.2).stroke()
      curY += 8

      // ── Section 3 — Bar Grid ─────────────────────────────────────────────────
      const BAR_NUM_W  = 20
      const BEAT_COL_W = (contentW - BAR_NUM_W) / tsNum
      const BEAT_HDR_H = 10

      // ── Draw beat-number header row at a given Y ─────────────────────────────
      function drawBeatHeader(y: number) {
        for (let b = 0; b < tsNum; b++) {
          const bx = margin + BAR_NUM_W + b * BEAT_COL_W
          doc.font('Inter').fontSize(6).fillColor(C_LINE)
            .text(`${b + 1}`, bx, y + 2, { width: BEAT_COL_W, align: 'center', lineBreak: false })
        }
      }

      drawBeatHeader(curY)
      let barRowY = curY + BEAT_HDR_H

      // ── Render each bar row with dynamic height ──────────────────────────────
      for (let bar = 1; bar <= totalBars; bar++) {
        const barChords  = barBeatMap.get(bar) ?? []
        const rowH       = Math.max(20, barChords.length * 11)

        // ── Page break before this row if it won't fit ───────────────────────
        if (barRowY + rowH > pageH - margin - 20) {
          doc.addPage()
          barRowY = margin
          drawBeatHeader(barRowY)
          barRowY += BEAT_HDR_H
        }

        // ── Bar number column separator ──────────────────────────────────────
        doc.moveTo(margin + BAR_NUM_W, barRowY)
          .lineTo(margin + BAR_NUM_W, barRowY + rowH)
          .strokeColor(C_LINE).lineWidth(0.2).stroke()

        // ── Bar number: Mono 7pt, right-aligned, vertically centred ─────────
        doc.font('Mono').fontSize(7).fillColor(C_LINE)
          .text(`${bar}`, margin + 1, barRowY + rowH / 2 - 4,
            { width: BAR_NUM_W - 3, align: 'right', lineBreak: false })

        // ── Beat column separators ───────────────────────────────────────────
        for (let b = 1; b < tsNum; b++) {
          const bx = margin + BAR_NUM_W + b * BEAT_COL_W
          doc.moveTo(bx, barRowY).lineTo(bx, barRowY + rowH)
            .strokeColor(C_LINE).lineWidth(0.2).stroke()
        }

        // ── Place chord names in beat cells ───────────────────────────────────
        // Group chords by beat column for per-cell stacking logic.
        const beatGroups = new Map<number, { xFrac: number; chord: string }[]>()
        for (const bc of barChords) {
          if (!beatGroups.has(bc.beatCol)) beatGroups.set(bc.beatCol, [])
          beatGroups.get(bc.beatCol)!.push({ xFrac: bc.xFrac, chord: bc.chord })
        }

        for (const [beatIdx, cellChords] of beatGroups.entries()) {
          const cellLeft  = margin + BAR_NUM_W + beatIdx * BEAT_COL_W
          const cellRight = cellLeft + BEAT_COL_W
          const midY      = barRowY + rowH / 2 - 4

          // ── Sort left-to-right so overlap check is order-stable ───────────
          const sorted = [...cellChords].sort((a, b) => a.xFrac - b.xFrac)

          // ── Adaptive stacking step: fits all chords in cell height ─────────
          const n    = sorted.length
          const step = n > 1 ? Math.min(9, (rowH - 6 - 8) / (n - 1)) : 0

          // ── Track previous chord's x and text-width for overlap detection ──
          let prevDrawX = Number.NEGATIVE_INFINITY
          let prevTW    = 0

          sorted.forEach((c, ci) => {
            // ── Font size: shrink until chord name fits within beat cell ──────
            let fontSize = 8
            doc.font('Mono').fontSize(fontSize)
            let tw = doc.widthOfString(c.chord)
            if (tw > BEAT_COL_W - 4) { fontSize = 7; doc.fontSize(fontSize); tw = doc.widthOfString(c.chord) }
            if (tw > BEAT_COL_W - 4) { fontSize = 6; doc.fontSize(fontSize); tw = doc.widthOfString(c.chord) }

            // ── Horizontal position: proportional x, clamped to cell ─────────
            const rawX = cellLeft + 2 + c.xFrac * (BEAT_COL_W - 4)
            let drawX  = Math.max(cellLeft + 2, Math.min(rawX, cellRight - tw - 2))

            // ── Anti-overlap: push right if too close to previous chord ───────
            let forceStack = false
            if (ci > 0 && drawX < prevDrawX + prevTW + 3) {
              drawX = Math.min(prevDrawX + prevTW + 3, cellRight - tw - 2)
              // Still overlaps after clamping — apply diagonal stack offset
              if (drawX < prevDrawX + prevTW) {
                forceStack = true
                drawX = Math.min(prevDrawX + 5, cellRight - tw - 2)
              }
            }

            prevDrawX = drawX
            prevTW    = tw

            // ── Vertical position: centre, stack for 3+, or force-stack ──────
            let drawY: number
            if (n > 2 || forceStack) {
              drawY = midY - ci * (forceStack ? 9 : step)
              drawY = Math.max(barRowY + 3, Math.min(barRowY + rowH - 3 - fontSize, drawY))
            } else {
              drawY = midY
            }

            // ── Render with hard right boundary — no overflow ─────────────────
            doc.font('Mono').fontSize(fontSize).fillColor(C_TEXT)
              .text(c.chord, drawX, drawY,
                { width: cellRight - drawX - 1, lineBreak: false })
          })
        }

        // ── Between-row separator — full-bleed, omit after last bar ────────────
        if (bar < totalBars) {
          doc.moveTo(0, barRowY + rowH).lineTo(pageW, barRowY + rowH)
            .strokeColor('#c8c8d8').lineWidth(0.15).stroke()
        }

        barRowY += rowH
      }

      // ── Footer (last page only) ──────────────────────────────────────────────
      const footerY = pageH - margin - 14
      doc.moveTo(margin, footerY - 6).lineTo(margin + contentW, footerY - 6)
        .strokeColor(C_LINE).lineWidth(0.2).stroke()
      doc.font('Inter').fontSize(7).fillColor(C_INFO)
        .text('Created by Orfeo  ·  github.com/SquareBow/orfeo',
          margin, footerY, { width: contentW, align: 'center', lineBreak: false })

      stream.on('finish', () => resolve())
      stream.on('error', reject)
      doc.end()
    })

    return { success: true, path: outputPath }
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'PDF generation failed' }
  }
})

// ── Note Editor save — write a MIDI buffer to the chosen output path ──────────
ipcMain.handle('noteEditor:save', async (_e, payload: { outputPath: string; base64: string }) => {
  try {
    const buf = Buffer.from(payload.base64, 'base64')
    await mkdir(dirname(payload.outputPath), { recursive: true })
    writeFileSync(payload.outputPath, buf)
    const fileName = payload.outputPath.split(/[\\/]/).pop() ?? ''
    return { ok: true, filePath: payload.outputPath, fileName, base64: buf.toString('base64') }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Save failed' }
  }
})

// ── Native message-box dialog — wraps dialog.showMessageBox for renderer use ──
ipcMain.handle('dialog:messageBox', async (_e, opts: {
  type?: string; buttons: string[]; defaultId?: number; cancelId?: number; message: string; detail?: string
}) => {
  const win = mainWin
  if (!win) return { response: opts.cancelId ?? opts.buttons.length - 1 }
  return dialog.showMessageBox(win, opts as any)
})

// ── App confirm-close — renderer calls this after resolving all pending state ─
// Sets the module-level allowClose flag so the next close event passes through.
ipcMain.handle('app:confirm-close', () => {
  allowClose = true
  mainWin?.close()
})

// ── OS-level fullscreen — toggled by Presentation Mode ───────────────────────
ipcMain.handle('window:setFullScreen', (_e, value: boolean) => {
  mainWin?.setFullScreen(value)
})

// ── Auto-update — GitHub Releases as the update feed (see package.json's
// build.publish). Only Windows gets real auto-update: that's the only
// platform SquareBow actually builds, signs (nominally), and publishes
// artifacts for via `npm run dist`. macOS/Linux builds are community-
// contributed unofficial binaries — nobody controls their provenance or
// update channel, so pointing electron-updater at the official GitHub feed
// for them would be actively wrong (could offer an "update" that doesn't
// match how that binary was built, or silently never fire since community
// builds usually aren't uploaded as electron-updater-recognized artifacts
// at all). Portable builds have no installer/uninstaller for
// electron-updater to work with either. All three fall back to the
// Settings "Check for updates" button just opening the releases page for
// a manual look — see docs/CONTRIBUTING.md's "Releases & auto-update"
// section. ─────────────────────────────────────────────────────────────────
const isPortable = !!process.env.PORTABLE_EXECUTABLE_DIR
const supportsAutoUpdate = process.platform === 'win32' && !isPortable
autoUpdater.autoDownload = true
autoUpdater.autoInstallOnAppQuit = false

function sendUpdateStatus(payload: Record<string, unknown>) {
  mainWin?.webContents.send('update:status', payload)
}

if (app.isPackaged && supportsAutoUpdate) {
  autoUpdater.on('checking-for-update', () => sendUpdateStatus({ state: 'checking' }))
  autoUpdater.on('update-available', (info) => sendUpdateStatus({ state: 'downloading', version: info.version }))
  autoUpdater.on('update-not-available', () => sendUpdateStatus({ state: 'up-to-date' }))
  autoUpdater.on('download-progress', (p) => sendUpdateStatus({ state: 'downloading', percent: p.percent }))
  autoUpdater.on('update-downloaded', (info) => sendUpdateStatus({ state: 'ready', version: info.version }))
  autoUpdater.on('error', (err) => sendUpdateStatus({ state: 'error', message: err?.message ?? 'Update check failed' }))
}

ipcMain.handle('update:check', () => {
  if (!app.isPackaged) { sendUpdateStatus({ state: 'unavailable', reason: 'dev' }); return }
  if (!supportsAutoUpdate) { sendUpdateStatus({ state: 'unavailable', reason: isPortable ? 'portable' : 'unsupported-platform' }); return }
  autoUpdater.checkForUpdates().catch((err) => sendUpdateStatus({ state: 'error', message: err?.message ?? 'Update check failed' }))
})

ipcMain.handle('update:install', () => {
  autoUpdater.quitAndInstall()
})

// ── Portable mode: redirect userData to a folder next to the exe ─────────────
// PORTABLE_EXECUTABLE_DIR is injected by electron-builder when running as a
// portable exe. Storing prefs and cache there lets the user copy the exe +
// Orfeo-Data/ folder to any machine and keep their settings intact.
// Must be called before app.whenReady() so getPrefsPath() sees the correct path.
if (process.env.PORTABLE_EXECUTABLE_DIR) {
  app.setPath('userData', join(process.env.PORTABLE_EXECUTABLE_DIR, 'Orfeo-Data'))
}

// ── Launch: copy demo files on first run, then open main window ───────────────
app.whenReady().then(async () => {
  try { await ensureDemoFolder() } catch (e) { console.error('[Orfeo] ensureDemoFolder failed:', e) }
  createWindow()
  if (app.isPackaged && supportsAutoUpdate) {
    // Delayed so it doesn't compete with the app's own startup work; silent
    // by design — the UI only shows anything once a real update is found.
    setTimeout(() => { autoUpdater.checkForUpdates().catch(() => {}) }, 5000)
  }
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
