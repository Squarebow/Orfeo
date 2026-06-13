import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  openMidiFile: () => ipcRenderer.invoke('dialog:openMidi'),
})
