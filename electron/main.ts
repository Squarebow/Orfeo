import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { Midi } from '@tonejs/midi'

// ── Main window ────────────────────────────────────────────────────────────
function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, minWidth: 900, minHeight: 600,
    backgroundColor: '#111116',
    titleBarStyle: 'hidden',
    titleBarOverlay: { color: '#111116', symbolColor: '#e8a027', height: 100 },
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, webSecurity: false,
    },
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
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

// ── Open MIDI file ─────────────────────────────────────────────────────────
ipcMain.handle('dialog:openMidi', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open MIDI File',
    filters: [{ name: 'MIDI Files', extensions: ['mid', 'midi'] }],
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
        } else if (e.isFile() && /\.(mid|midi)$/i.test(e.name)) {
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

// ── MIDI Editor window ─────────────────────────────────────────────────────
let editorWin: BrowserWindow | null = null
let _editorData: any = null

ipcMain.handle('editor:open', async (_e, data: any) => {
  _editorData = data
  if (editorWin && !editorWin.isDestroyed()) { editorWin.focus(); return }
  editorWin = new BrowserWindow({
    width: 760, height: 600, minWidth: 640, minHeight: 480,
    resizable: true, backgroundColor: '#0f0f12',
    title: 'Orfeo MIDI Playback Editor',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#111116',
      symbolColor: '#707088',
      height: 48,
    },
    webPreferences: {
      preload: join(__dirname, '../preload/preload.cjs'),
      contextIsolation: true, nodeIntegration: false, webSecurity: false,
    },
  })
  if (process.env['ELECTRON_RENDERER_URL']) {
    editorWin.loadURL(process.env['ELECTRON_RENDERER_URL'] + '#/editor')
  } else {
    editorWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'editor' })
  }
  editorWin.on('closed', () => {
    editorWin = null
    _editorData = null
    // Signal main window that editor closed
    const mainWin = BrowserWindow.getAllWindows().find(w => w !== editorWin)
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('editor:closed')
    }
  })
})

ipcMain.handle('editor:getData', async () => _editorData)
ipcMain.handle('editor:close', async () => editorWin?.close())

ipcMain.handle('dialog:saveFile', async (_e, opts: { defaultPath: string; filters: any[] }) => {
  const result = await dialog.showSaveDialog({ defaultPath: opts.defaultPath, filters: opts.filters })
  return result.canceled ? null : result.filePath
})

ipcMain.handle('editor:save', async (_e, payload: {
  outputPath: string
  includedTracks: { index: number; newProgram: number }[]
  mergeGroups: number[][]
}) => {
  try {
    if (!_editorData?.filePath) return { ok: false, message: 'No source file loaded' }
    const midi = new Midi(readFileSync(_editorData.filePath))

    const noteTrackIndices: number[] = []
    midi.tracks.forEach((t, i) => { if (t.notes.length > 0) noteTrackIndices.push(i) })

    const includedSet = new Set(
      payload.includedTracks.map(it => noteTrackIndices[it.index] ?? -1).filter(i => i >= 0)
    )

    // Instrument reassignment
    for (const it of payload.includedTracks) {
      const orig = noteTrackIndices[it.index]
      if (orig === undefined) continue
      const track = midi.tracks[orig]
      if (track && it.newProgram >= 0 && (track as any).channel !== 9) {
        track.instrument.number = it.newProgram
      }
    }

    // Merge
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
    }

    // Remove excluded
    noteTrackIndices.filter(i => !includedSet.has(i)).sort((a, b) => b - a).forEach(i => midi.tracks.splice(i, 1))

    const outBuf = Buffer.from(midi.toArray())
    writeFileSync(payload.outputPath, outBuf)

    const mainWin = BrowserWindow.getAllWindows().find(w => w !== editorWin)
    if (mainWin) {
      const fileName = payload.outputPath.split(/[\\/]/).pop() ?? payload.outputPath
      mainWin.webContents.send('midi:reloadFile', { fileName, filePath: payload.outputPath, base64: outBuf.toString('base64') })
    }
    return { ok: true, message: `Saved: ${payload.outputPath.split(/[\\/]/).pop()}` }
  } catch (e: any) {
    return { ok: false, message: e?.message ?? 'Save failed' }
  }
})

app.whenReady().then(createWindow)
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
