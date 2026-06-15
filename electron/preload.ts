import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openMidiFile: () => ipcRenderer.invoke('dialog:openMidi'),
  windowMinimize: () => ipcRenderer.invoke('window:minimize'),
  windowMaximize: () => ipcRenderer.invoke('window:maximize'),
  windowClose:    () => ipcRenderer.invoke('window:close'),
})
