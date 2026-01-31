export interface VideoMetadata {
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

export interface ClipMetadata {
  favorite?: boolean
  tags?: string[]
  trim?: {
    start: number
    end: number
  }
  audio?: {
    track1: boolean
    track2: boolean
  }
}

export interface ClipInfo {
  id: string
  filename: string
  path: string
  size: number
  createdAt: string
  modifiedAt: string
  metadata: ClipMetadata | null
}

export interface AudioTrackUrls {
  track1?: string
  track2?: string
  error?: string
}

// Editor state for persistence (saved in clips-metadata folder)
export interface EditorState {
  trim: {
    start: number
    end: number
  }
  playheadPosition: number
  audio: {
    track1: {
      enabled: boolean
      muted: boolean
      volume: number
    }
    track2: {
      enabled: boolean
      muted: boolean
      volume: number
    }
  }
  lastModified: string // ISO timestamp
}

export interface AppSettings {
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

export interface ExportParams {
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

export interface ExportResult {
  success: boolean
  filePath?: string
  error?: string
}

export interface DialogAPI {
  save: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
}

export interface EditorAPI {
  exportClip: (params: ExportParams) => Promise<ExportResult>
  saveState: (clipId: string, state: EditorState) => Promise<boolean>
  loadState: (clipId: string) => Promise<EditorState | null>
}

export interface MonitorInfo {
  id: number
  name: string
  width: number
  height: number
  x: number
  y: number
  primary: boolean
}

export interface ElectronAPI {
  getSettings: () => Promise<AppSettings>
  saveSettings: (settings: AppSettings) => Promise<{ success: boolean; restarted?: boolean }>
  restartBackend: () => Promise<{ success: boolean; restarted?: boolean }>
  getMonitors: () => Promise<MonitorInfo[]>
  getClipsList: () => Promise<ClipInfo[]>
  saveClipMetadata: (clipId: string, metadata: unknown) => Promise<boolean>
  getClipMetadata: (clipId: string) => Promise<unknown | null>
  generateThumbnail: (clipId: string, videoPath: string) => Promise<string>
  getVideoMetadata: (videoPath: string) => Promise<VideoMetadata>
  extractAudioTracks: (clipId: string, videoPath: string) => Promise<AudioTrackUrls>
  getVideoFileUrl: (filename: string) => Promise<{ success: boolean; url?: string; path?: string; error?: string }>
  showExportPreview: (filePath: string) => Promise<void>
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
  openClipsFolder: () => Promise<void>
  showSaveDialog: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
  dialog: DialogAPI
  editor: EditorAPI
  on: (channel: string, callback: (data: unknown) => void) => (() => void) | undefined
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
