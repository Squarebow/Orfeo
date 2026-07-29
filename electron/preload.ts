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
  splitMidiEditor:    (payload: any) => ipcRenderer.invoke('editor:split', payload),
  openExternal:       (url: string) => ipcRenderer.invoke('shell:openExternal', url),
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
})
