import { contextBridge, ipcRenderer } from 'electron'

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
  openMidiEditor:     (data: any) => ipcRenderer.invoke('editor:open', data),
  getMidiEditorData:  () => ipcRenderer.invoke('editor:getData'),
  closeMidiEditor:    () => ipcRenderer.invoke('editor:close'),
  saveFileDialog:     (opts: any) => ipcRenderer.invoke('dialog:saveFile', opts),
  saveMidiEditor:     (payload: any) => ipcRenderer.invoke('editor:save', payload),
  splitMidiEditor:    (payload: any) => ipcRenderer.invoke('editor:split', payload),
  onMidiReload:       (cb: (data: any) => void) => ipcRenderer.on('midi:reloadFile', (_e, data) => cb(data)),
  onEditorClosed:     (cb: () => void) => ipcRenderer.on('editor:closed', () => cb()),
  openExternal:       (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  transcriptGenerate: (midiPath: string, noteNaming: string, accidentals: string) => ipcRenderer.invoke('transcript:generate', midiPath, noteNaming, accidentals),
})
