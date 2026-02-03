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
    monitor: number
  }
  audio: {
    sample_rate: number
    bitrate: number
    system_audio_enabled: boolean
    microphone_enabled: boolean
    system_audio_device_id?: string
    microphone_device_id?: string
  }
  hotkey: {
    save_clip: string
  }
  ui?: {
    show_notifications: boolean
    minimize_to_tray: boolean
    start_with_windows: boolean
    first_run_completed?: boolean
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
  setStartup: (enabled: boolean) => ipcRenderer.invoke('settings:setStartup', enabled),

  // System
  getMonitors: () => ipcRenderer.invoke('system:getMonitors'),
  getAudioDevices: (type: 'output' | 'input') => ipcRenderer.invoke('audio:getDevices', type),

  // Clips
  getClipsList: () => ipcRenderer.invoke('clips:getList'),
  saveClipMetadata: (clipId: string, metadata: unknown) =>
    ipcRenderer.invoke('clips:saveMetadata', clipId, metadata),
  getClipMetadata: (clipId: string) => ipcRenderer.invoke('clips:getMetadata', clipId),
  deleteClip: (clipId: string) => ipcRenderer.invoke('clips:delete', clipId),
  generateThumbnail: (clipId: string, videoPath: string) =>
    ipcRenderer.invoke('clips:generateThumbnail', clipId, videoPath),
  getExistingThumbnails: () => ipcRenderer.invoke('clips:getExistingThumbnails'),
  getVideoMetadata: (videoPath: string) => ipcRenderer.invoke('clips:getVideoMetadata', videoPath),

  // Audio tracks
  extractAudioTracks: (clipId: string, videoPath: string) =>
    ipcRenderer.invoke('audio:extractTracks', clipId, videoPath),

  // Video loading
  getVideoFileUrl: (filename: string) => ipcRenderer.invoke('video:getFileUrl', filename),

  // Export preview
  showExportPreview: (filePath: string) => ipcRenderer.invoke('export:showPreview', filePath),

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
    saveState: (clipId: string, state: unknown) =>
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

interface AudioTrackState {
  enabled: boolean
  muted?: boolean
  volume?: number
}

type AudioTrackSetting = boolean | AudioTrackState

interface ClipMetadata {
  favorite?: boolean
  tags?: string[]
  game?: string
  trim?: {
    start: number
    end: number
  }
  audio?: {
    track1?: AudioTrackSetting
    track2?: AudioTrackSetting
  }
  playheadPosition?: number
  lastModified?: string
}

// Type for clip info (matches main process)
interface ClipInfo {
  id: string
  filename: string
  path: string
  size: number
  createdAt: string
  modifiedAt: string
  metadata: ClipMetadata | null
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

type EditorState = ClipMetadata

interface AudioDeviceInfo {
  id: string
  name: string
  type: 'output' | 'input'
  is_default: boolean
}

interface MonitorInfo {
  id: number
  name: string
  width: number
  height: number
  x: number
  y: number
  primary: boolean
}

// Type declarations for TypeScript
declare global {
  interface Window {
    electronAPI: {
      getSettings: () => Promise<AppSettings>
      saveSettings: (settings: AppSettings) => Promise<{ success: boolean }>
      setStartup: (enabled: boolean) => Promise<{ success: boolean }>
      getClipsList: () => Promise<ClipInfo[]>
      saveClipMetadata: (clipId: string, metadata: ClipMetadata) => Promise<boolean>
      getClipMetadata: (clipId: string) => Promise<ClipMetadata | null>
      generateThumbnail: (clipId: string, videoPath: string) => Promise<string>
      getExistingThumbnails: () => Promise<{ [clipId: string]: string }>
      getVideoMetadata: (videoPath: string) => Promise<VideoMetadata>
      extractAudioTracks: (clipId: string, videoPath: string) => Promise<AudioTrackUrls>
      getVideoFileUrl: (
        filename: string
      ) => Promise<{ success: boolean; url?: string; path?: string; error?: string }>
      cleanupOrphanedCache: () => Promise<{ deletedCount: number; errors: string[] }>
      getCacheStats: () => Promise<{
        thumbnailCount: number
        thumbnailSize: number
        audioCount: number
        audioSize: number
        totalSize: number
        thumbnailSizeFormatted: string
        audioSizeFormatted: string
        totalSizeFormatted: string
      } | null>
      getMonitors: () => Promise<MonitorInfo[]>
      getAudioDevices: (type: 'output' | 'input') => Promise<AudioDeviceInfo[]>
      openClipsFolder: () => Promise<void>
      showSaveDialog: (
        options: Electron.SaveDialogOptions
      ) => Promise<Electron.SaveDialogReturnValue>
      dialog: {
        save: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
        openFolder: () => Promise<Electron.OpenDialogReturnValue>
      }
      editor: {
        exportClip: (params: ExportParams) => Promise<ExportResult>
        saveState: (clipId: string, state: EditorState) => Promise<boolean>
        loadState: (clipId: string) => Promise<EditorState | null>
      }
      on: (channel: string, callback: (data: unknown) => void) => (() => void) | undefined
    }
  }
}
