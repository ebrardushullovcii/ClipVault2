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

export interface AudioTrackState {
  enabled: boolean
  muted?: boolean
  volume?: number
}

export type AudioTrackSetting = boolean | AudioTrackState

export interface ClipMetadata {
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
export type EditorState = ClipMetadata

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
    system_audio_device_id?: string
    microphone_device_id?: string
  }
  hotkey: {
    save_clip: string
  }
  editor?: {
    skip_seconds?: number
  }
  ui?: {
    show_notifications?: boolean
    play_sound?: boolean
    minimize_to_tray?: boolean
    start_with_windows?: boolean
    first_run_completed?: boolean
  }
  launcher?: {
    autostart_backend?: boolean
    backend_mode?: string
    single_instance?: boolean
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

export interface AudioDeviceInfo {
  id: string
  name: string
  type: 'output' | 'input'
  is_default: boolean
}

export interface DialogAPI {
  save: (options: Electron.SaveDialogOptions) => Promise<Electron.SaveDialogReturnValue>
  openFolder: () => Promise<Electron.OpenDialogReturnValue>
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
  getAudioDevices: (type: 'output' | 'input') => Promise<AudioDeviceInfo[]>
  setStartup: (enabled: boolean) => Promise<{ success: boolean }>
  getClipsList: () => Promise<ClipInfo[]>
  saveClipMetadata: (clipId: string, metadata: ClipMetadata) => Promise<boolean>
  getClipMetadata: (clipId: string) => Promise<ClipMetadata | null>
  deleteClip: (clipId: string) => Promise<{ success: boolean }>
  generateThumbnail: (clipId: string, videoPath: string) => Promise<string>
  getExistingThumbnails: () => Promise<{ [clipId: string]: string }>
  getVideoMetadata: (videoPath: string) => Promise<VideoMetadata>
  extractAudioTracks: (clipId: string, videoPath: string) => Promise<AudioTrackUrls>
  getVideoFileUrl: (
    filename: string
  ) => Promise<{ success: boolean; url?: string; path?: string; error?: string }>
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
  getGamesDatabase: () => Promise<{
    success: boolean
    data?: { games: GameEntry[] }
    error?: string
  }>
  on: (channel: string, callback: (data: unknown) => void) => (() => void) | undefined
}

export interface GameEntry {
  name: string
  processNames: string[]
  twitchId: string
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

export {}
