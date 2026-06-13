import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0f0f12',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#0f0f12',
      symbolColor: '#e8e8f0',
      height: 40
    },
    webPreferences: {
      preload: join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  win.once('ready-to-show', () => win.show())

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

ipcMain.handle('dialog:openMidi', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    title: 'Open MIDI File',
    filters: [{ name: 'MIDI Files', extensions: ['mid', 'midi'] }],
    properties: ['openFile']
  })
  if (canceled || filePaths.length === 0) return null
  const filePath = filePaths[0]
  const buffer = readFileSync(filePath)
  return {
    path: filePath,
    name: filePath.split(/[\\/]/).pop() || 'Unknown',
    data: Array.from(buffer)
  }
})

ipcMain.handle('dialog:saveMidi', async (_event, defaultName: string) => {
  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Save MIDI File',
    defaultPath: defaultName,
    filters: [{ name: 'MIDI Files', extensions: ['mid'] }]
  })
  if (canceled || !filePath) return null
  return filePath
})

ipcMain.handle('shell:openExternal', (_event, url: string) => {
  shell.openExternal(url)
})
