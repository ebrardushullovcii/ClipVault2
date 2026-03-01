import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  AppSettings,
  ClipMetadata,
  EditorState,
  ElectronAPI,
  ExportParams,
  TrimInPlaceParams,
} from '../renderer/types/electron'

// Expose protected methods to renderer process
const electronAPI: ElectronAPI = {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),
  setStartup: (enabled: boolean) => ipcRenderer.invoke('settings:setStartup', enabled),

  // System
  getMonitors: () => ipcRenderer.invoke('system:getMonitors'),
  getAudioDevices: (type: 'output' | 'input') => ipcRenderer.invoke('audio:getDevices', type),

  // Clips
  getClipsList: () => ipcRenderer.invoke('clips:getList'),
  saveClipMetadata: (clipId: string, metadata: ClipMetadata) =>
    ipcRenderer.invoke('clips:saveMetadata', clipId, metadata),
  getClipMetadata: (clipId: string) => ipcRenderer.invoke('clips:getMetadata', clipId),
  deleteClip: (clipId: string) => ipcRenderer.invoke('clips:delete', clipId),
  generateThumbnail: (clipId: string, videoPath: string) =>
    ipcRenderer.invoke('clips:generateThumbnail', clipId, videoPath),
  getExistingThumbnails: () => ipcRenderer.invoke('clips:getExistingThumbnails'),
  getVideoMetadata: (videoPath: string) => ipcRenderer.invoke('clips:getVideoMetadata', videoPath),

  // Audio tracks
  extractAudioTracks: (
    clipId: string,
    videoPath: string,
    options?: { forceReextract?: boolean }
  ) => ipcRenderer.invoke('audio:extractTracks', clipId, videoPath, options),

  // Video loading
  getVideoFileUrl: (filename: string) => ipcRenderer.invoke('video:getFileUrl', filename),

  // Export preview
  showExportPreview: (filePath: string) => ipcRenderer.invoke('export:showPreview', filePath),

  // External links
  openExternal: (url: string) => ipcRenderer.invoke('system:openExternal', url),

  // Social sharing integrations
  social: {
    testDiscordWebhook: (webhookUrl: string) =>
      ipcRenderer.invoke('social:discord:testWebhook', webhookUrl),
    youtubeGetProviderInfo: () => ipcRenderer.invoke('social:youtube:getProviderInfo'),
    youtubeStartDeviceAuth: (params: {
      mode?: 'managed' | 'custom'
      clientId?: string
      clientSecret?: string
    }) =>
      ipcRenderer.invoke('social:youtube:startDeviceAuth', params),
    youtubePollDeviceAuth: (params: { deviceCode: string }) =>
      ipcRenderer.invoke('social:youtube:pollDeviceAuth', params),
    youtubeDisconnect: () => ipcRenderer.invoke('social:youtube:disconnect'),
  },

  // Cleanup - permanent deletion of cache files (bypasses recycle bin)
  cleanupOrphanedCache: () => ipcRenderer.invoke('cleanup:orphans'),
  getCacheStats: () => ipcRenderer.invoke('cleanup:stats'),

  // System
  openClipsFolder: () => ipcRenderer.invoke('system:openFolder'),

  // Dialogs
  showSaveDialog: (options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('dialog:save', options),

  // Dialog API
  dialog: {
    save: (options: Electron.SaveDialogOptions) => ipcRenderer.invoke('dialog:save', options),
    openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  },

  editor: {
    exportClip: (params: ExportParams) => ipcRenderer.invoke('editor:exportClip', params),
    trimInPlace: (params: TrimInPlaceParams) => ipcRenderer.invoke('editor:trimInPlace', params),
    saveState: (clipId: string, state: EditorState) =>
      ipcRenderer.invoke('editor:saveState', clipId, state),
    loadState: (clipId: string) => ipcRenderer.invoke('editor:loadState', clipId),
  },

  // Games database
  getGamesDatabase: () => ipcRenderer.invoke('games:getDatabase'),

  // Event listener
  on: (channel: string, callback: (data: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },
}

contextBridge.exposeInMainWorld('electronAPI', electronAPI)
