import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // Existing
  openMidiFile:       () => ipcRenderer.invoke('dialog:openMidi'),
  windowMinimize:     () => ipcRenderer.invoke('window:minimize'),
  windowMaximize:     () => ipcRenderer.invoke('window:maximize'),
  windowClose:        () => ipcRenderer.invoke('window:close'),
  // Prefs
  getPrefs:           () => ipcRenderer.invoke('prefs:get'),
  setPrefs:           (data: any) => ipcRenderer.invoke('prefs:set', data),
  // Library
  openFolder:         () => ipcRenderer.invoke('dialog:openFolder'),
  scanMidiFolder:     (path: string) => ipcRenderer.invoke('fs:scanMidiFolder', path),
  getDemoFolder:      () => ipcRenderer.invoke('app:getDemoFolder'),
  loadMidiFromPath:   (path: string) => ipcRenderer.invoke('fs:loadMidiFromPath', path),
  // MIDI Editor
  saveFileDialog:     (opts: any) => ipcRenderer.invoke('dialog:saveFile', opts),
  saveMidiEditor:     (payload: any) => ipcRenderer.invoke('editor:save', payload),
  saveMixerChannels:  (payload: any) => ipcRenderer.invoke('mixer:save', payload),
  openExternal:       (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  openFolderInExplorer: (folderPath: string) => ipcRenderer.invoke('shell:openFolder', folderPath),
  showItemInFolder:   (filePath: string) => ipcRenderer.invoke('shell:showItemInFolder', filePath),
  listLibraryFolders: (libraryFolder: string) => ipcRenderer.invoke('fs:listLibraryFolders', libraryFolder),
  createLibraryFolder: (libraryFolder: string, name: string) => ipcRenderer.invoke('fs:createLibraryFolder', libraryFolder, name),
  renameLibraryFolder: (libraryFolder: string, oldName: string, newName: string) => ipcRenderer.invoke('fs:renameLibraryFolder', libraryFolder, oldName, newName),
  deleteLibraryFolder: (libraryFolder: string, name: string) => ipcRenderer.invoke('fs:deleteLibraryFolder', libraryFolder, name),
  renameLibraryFile: (filePath: string, newName: string) => ipcRenderer.invoke('fs:renameLibraryFile', filePath, newName),
  getFileLog:  (filePath: string) => ipcRenderer.invoke('fileinfo:getLog', filePath),
  logFileEvent: (filePath: string, type: string, summary: string) => ipcRenderer.invoke('fileinfo:logEvent', filePath, type, summary),
  listFileVersions: (filePath: string) => ipcRenderer.invoke('fileinfo:listVersions', filePath),
  moveLibraryFiles: (filePaths: string[], libraryFolder: string, destFolderName: string | null) => ipcRenderer.invoke('fs:moveLibraryFiles', filePaths, libraryFolder, destFolderName),
  transcriptGenerate: (midiPath: string, noteNaming: string, accidentals: string) => ipcRenderer.invoke('transcript:generate', midiPath, noteNaming, accidentals),
  // Note Editor
  saveNoteEditor:      (payload: any) => ipcRenderer.invoke('noteEditor:save', payload),
  showMessageBox:      (opts: any)    => ipcRenderer.invoke('dialog:messageBox', opts),
  confirmClose:        ()             => ipcRenderer.invoke('app:confirm-close'),
  setFullScreen:       (value: boolean) => ipcRenderer.invoke('window:setFullScreen', value),
  onSaveBeforeClose:   (fn: () => void) => ipcRenderer.on('app:save-before-close', () => fn()),
  offSaveBeforeClose:  ()             => ipcRenderer.removeAllListeners('app:save-before-close'),
  // Drag-and-drop file import
  getPathForFile:     (file: File) => webUtils.getPathForFile(file),
  copyMidiToLibrary:  (sourcePath: string, libraryFolder: string) => ipcRenderer.invoke('fs:copyMidiToLibrary', sourcePath, libraryFolder),
  // Foreign format import cache
  getCachedImport:    (sourcePath: string, cachePath: string) => ipcRenderer.invoke('fs:getCachedImport', sourcePath, cachePath),
  writeCachedImport:  (destPath: string, base64: string) => ipcRenderer.invoke('fs:writeCachedImport', destPath, base64),
  // Downloadable extra soundfonts
  listSoundfonts:     () => ipcRenderer.invoke('soundfont:list'),
  downloadSoundfont:  (id: string) => ipcRenderer.invoke('soundfont:download', id),
  deleteSoundfont:    (id: string) => ipcRenderer.invoke('soundfont:delete', id),
  readSoundfont:      (id: string) => ipcRenderer.invoke('soundfont:read', id),
  importSoundfont:    () => ipcRenderer.invoke('soundfont:import'),
  onSoundfontProgress: (fn: (data: { id: string; progress: number }) => void) => ipcRenderer.on('soundfont:progress', (_e, data) => fn(data)),
  offSoundfontProgress: () => ipcRenderer.removeAllListeners('soundfont:progress'),
  // Auto-update (GitHub Releases)
  checkForUpdates:    () => ipcRenderer.invoke('update:check'),
  installUpdate:       () => ipcRenderer.invoke('update:install'),
  onUpdateStatus:      (fn: (data: any) => void) => ipcRenderer.on('update:status', (_e, data) => fn(data)),
  offUpdateStatus:     () => ipcRenderer.removeAllListeners('update:status'),
})
