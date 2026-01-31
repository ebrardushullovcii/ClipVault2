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

export interface ExportParams {
  clipPath: string
  exportFilename: string
  trimStart: number
  trimEnd: number
  audioTrack1: boolean
  audioTrack2: boolean
  audioTrack1Volume?: number
  audioTrack2Volume?: number
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
}

export interface ElectronAPI {
  getClipsList: () => Promise<ClipInfo[]>
  saveClipMetadata: (clipId: string, metadata: unknown) => Promise<boolean>
  getClipMetadata: (clipId: string) => Promise<unknown | null>
  generateThumbnail: (clipId: string, videoPath: string) => Promise<string>
  getVideoMetadata: (videoPath: string) => Promise<VideoMetadata>
  extractAudioTracks: (clipId: string, videoPath: string) => Promise<AudioTrackUrls>
  getVideoFileUrl: (filename: string) => Promise<{ success: boolean; url?: string; path?: string; error?: string }>
  showExportPreview: (filePath: string) => Promise<void>
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
