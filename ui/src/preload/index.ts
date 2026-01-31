import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

// Settings interface
interface AppSettings {
  output_path: string
  buffer_seconds: number
  video: {
    width: number
    height: number
    fps: number
    encoder: 'auto' | 'nvenc' | 'x264'
    quality: number
  }
  audio: {
    sample_rate: number
    bitrate: number
    system_audio_enabled: boolean
    microphone_enabled: boolean
  }
  hotkey: {
    save_clip: string
  }
  ui?: {
    show_notifications: boolean
    minimize_to_tray: boolean
    start_with_windows: boolean
  }
  launcher?: {
    autostart_backend: boolean
    backend_mode: string
    single_instance: boolean
  }
}

// Expose protected methods to renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
  restartBackend: () => ipcRenderer.invoke('backend:restart'),

  // System
  getMonitors: () => ipcRenderer.invoke('system:getMonitors'),

  // Clips
  getClipsList: () => ipcRenderer.invoke('clips:getList'),
  saveClipMetadata: (clipId: string, metadata: unknown) =>
    ipcRenderer.invoke('clips:saveMetadata', clipId, metadata),
  getClipMetadata: (clipId: string) => ipcRenderer.invoke('clips:getMetadata', clipId),
  generateThumbnail: (clipId: string, videoPath: string) =>
    ipcRenderer.invoke('clips:generateThumbnail', clipId, videoPath),
  getVideoMetadata: (videoPath: string) => ipcRenderer.invoke('clips:getVideoMetadata', videoPath),

  // Audio tracks
  extractAudioTracks: (clipId: string, videoPath: string) =>
    ipcRenderer.invoke('audio:extractTracks', clipId, videoPath),

  // Video loading
  getVideoFileUrl: (filename: string) => ipcRenderer.invoke('video:getFileUrl', filename),

  // Export preview
  showExportPreview: (filePath: string) => ipcRenderer.invoke('export:showPreview', filePath),

  // System
  openClipsFolder: () => ipcRenderer.invoke('system:openFolder'),

  // Dialogs (legacy - keep for backwards compatibility)
  showSaveDialog: (options: Electron.SaveDialogOptions) =>
    ipcRenderer.invoke('dialog:save', options),

  // New API structure
  dialog: {
    save: (options: Electron.SaveDialogOptions) => ipcRenderer.invoke('dialog:save', options),
  },

  editor: {
    exportClip: (params: ExportParams) => ipcRenderer.invoke('editor:exportClip', params),
  },

  // Event listener
  on: (channel: string, callback: (data: unknown) => void) => {
    const listener = (_event: IpcRendererEvent, data: unknown) => callback(data)
    ipcRenderer.on(channel, listener)
    return () => {
      ipcRenderer.removeListener(channel, listener)
    }
  },
})

interface VideoMetadata {
  duration: number
  width: number
  height: number
  fps: number
  bitrate: number
  size: number
  format: string
  videoCodec: string
  audioTracks: number
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

interface ExportParams {
  clipPath: string
  exportFilename: string
  trimStart: number
  trimEnd: number
  audioTrack1: boolean
  audioTrack2: boolean
  audioTrack1Volume?: number
  audioTrack2Volume?: number
  targetSizeMB?: number | 'original'
}

interface ExportResult {
  success: boolean
  error?: string
}

interface AudioTrackUrls {
  track1?: string
  track2?: string
  error?: string
}

// Type declarations for TypeScript
declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<AppSettings>
      saveSettings: (settings: AppSettings) => Promise<{ success: boolean }>
      getClipsList: () => Promise<ClipInfo[]>
      saveClipMetadata: (clipId: string, metadata: unknown) => Promise<boolean>
      getClipMetadata: (clipId: string) => Promise<unknown | null>
      generateThumbnail: (clipId: string, videoPath: string) => Promise<string>
      getVideoMetadata: (videoPath: string) => Promise<VideoMetadata>
      extractAudioTracks: (clipId: string, videoPath: string) => Promise<AudioTrackUrls>
      getVideoFileUrl: (filename: string) => Promise<{ success: boolean; url?: string; path?: string; error?: string }>
      openClipsFolder: () => Promise<void>
      showSaveDialog: (
        options: Electron.SaveDialogOptions
      ) => Promise<Electron.SaveDialogReturnValue>
      dialog: {
        save: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
      }
      editor: {
        exportClip: (params: ExportParams) => Promise<ExportResult>
      }
      on: (channel: string, callback: (data: unknown) => void) => (() => void) | undefined
    }
  }
}
