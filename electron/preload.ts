import { contextBridge, ipcRenderer } from 'electron'

// Expose safe APIs to the renderer process
contextBridge.exposeInMainWorld('orfeo', {
  // File operations
  openMidiFile: () => ipcRenderer.invoke('dialog:openMidi'),
  saveMidiFile: (defaultName: string) => ipcRenderer.invoke('dialog:saveMidi', defaultName),

  // Shell
  openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),

  // Platform info
  platform: process.platform,
})
