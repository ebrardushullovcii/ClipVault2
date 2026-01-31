import { contextBridge, ipcRenderer } from 'electron'

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Clips
  getClipsList: () => ipcRenderer.invoke('clips:getList'),
  saveClipMetadata: (clipId: string, metadata: unknown) => 
    ipcRenderer.invoke('clips:saveMetadata', clipId, metadata),
  getClipMetadata: (clipId: string) => 
    ipcRenderer.invoke('clips:getMetadata', clipId),
  
  // System
  openClipsFolder: () => ipcRenderer.invoke('system:openFolder'),
  
  // Dialogs
  showSaveDialog: (options: Electron.SaveDialogOptions) => 
    ipcRenderer.invoke('dialog:save', options),
})

// Type declarations for TypeScript
declare global {
  interface Window {
    electronAPI: {
      getClipsList: () => Promise<ClipInfo[]>
      saveClipMetadata: (clipId: string, metadata: unknown) => Promise<boolean>
      getClipMetadata: (clipId: string) => Promise<unknown | null>
      openClipsFolder: () => Promise<void>
      showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
    }
  }
}

// Type for clip info (matches main process)
interface ClipInfo {
  id: string
  filename: string
  path: string
  size: number
  createdAt: string
  modifiedAt: string
  metadata: unknown | null
}
