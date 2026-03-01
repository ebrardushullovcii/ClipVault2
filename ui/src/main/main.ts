import {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  shell,
  protocol,
  Menu,
  nativeImage,
  Tray,
  Rectangle,
  screen,
} from 'electron'
import { dirname, join, basename, resolve, relative, isAbsolute } from 'path'
import {
  readFile,
  writeFile,
  readdir,
  stat,
  mkdir,
  unlink as fsUnlinkAsync,
  rename,
} from 'fs/promises'
import { existsSync, readFileSync, createWriteStream, createReadStream } from 'fs'
import { request as httpsRequest } from 'https'
import ffmpeg from 'fluent-ffmpeg'
import { spawn, execSync, execFile } from 'child_process'
import { promisify } from 'util'
import { cleanupOrphanedCache, getCacheStats, formatBytes } from './cleanup'
import chokidar from 'chokidar'

const thumbnailLogPath = join(app.getPath('userData'), 'thumbnail.log')

function logThumbnail(message: string): void {
  const timestamp = new Date().toISOString()
  const logLine = `[${timestamp}] ${message}\n`
  console.log('[Thumbnail]', message)
  try {
    const logStream = createWriteStream(thumbnailLogPath, { flags: 'a' })
    logStream.write(logLine)
    logStream.end()
  } catch {
    // Ignore log errors
  }
}

logThumbnail('ClipVault started - Thumbnail Worker Manager initialized')

// Thumbnail Worker Manager - Optimized FFmpeg based
// Uses input seeking (-ss before -i) for fast thumbnail extraction
// Native Windows Thumbnail Cache API addon is disabled due to Electron compatibility issues
class ThumbnailWorkerManager {
  constructor() {
    console.log('[ThumbnailWorker] Optimized FFmpeg-based thumbnail generation active')
    logThumbnail('Thumbnail generation: Optimized FFmpeg with input seeking')
  }

  async extractThumbnail(
    videoPath: string,
    outputPath: string,
    width = 480,
    height = 270
  ): Promise<{ success: boolean; error?: string; duration?: number }> {
    const startTime = Date.now()
    try {
      // Skip if thumbnail already exists - this is the key optimization!
      if (existsSync(outputPath)) {
        return { success: true, duration: 0 }
      }

      const outputDir = dirname(outputPath)
      if (!existsSync(outputDir)) {
        await mkdir(outputDir, { recursive: true })
      }

      logThumbnail(`Extracting: ${basename(videoPath)}`)

      // Use optimized FFmpeg with input seeking (-ss before -i is MUCH faster)
      // This seeks directly in the file without decoding frames
      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .inputOptions(['-ss', '0.5']) // Input seeking - fast!
          .outputOptions([
            '-vframes',
            '1', // Only 1 frame
            '-q:v',
            '5', // Good quality JPEG
            '-vf',
            `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2`,
          ])
          .output(outputPath)
          .on('end', () => resolve())
          .on('error', err => {
            console.error('[ThumbnailWorker] FFmpeg error:', err.message)
            reject(err)
          })
          .run()
      })

      const duration = Date.now() - startTime
      logThumbnail(`Success: ${basename(videoPath)} (${duration}ms)`)
      return { success: true, duration }
    } catch (error) {
      const duration = Date.now() - startTime
      console.error('[ThumbnailWorker] FFmpeg error:', error)
      logThumbnail(`Error: ${basename(videoPath)} - ${error}`)
      return { success: false, error: String(error), duration }
    }
  }

  isAvailable(): boolean {
    return true
  }
}

let thumbnailWorker: ThumbnailWorkerManager | null = null

function getThumbnailWorker(): ThumbnailWorkerManager {
  if (!thumbnailWorker) {
    thumbnailWorker = new ThumbnailWorkerManager()
  }
  return thumbnailWorker
}

// Get the directory containing the main script
const appPath = process.argv[1] || process.cwd()
const appDir = dirname(appPath)

// Path to drag icon for file drag operations (64x64 PNG)
// Try multiple locations for dev vs production
const dragIconPaths = [
  join(appDir, '..', '..', '..', '64x64.png'), // Dev mode
  join(process.resourcesPath, '64x64.png'), // Production - resources folder
  join(process.resourcesPath, 'app.asar', '64x64.png'), // Production - inside asar
  join(app.getAppPath(), '64x64.png'), // Alternative production path
]

const dragIconPath = dragIconPaths.find(p => existsSync(p)) || dragIconPaths[0]

if (process.platform === 'win32') {
  app.setAppUserModelId('com.clipvault.editor')
}

function resolveWindowIcon(): Electron.NativeImage | undefined {
  const iconPaths: string[] = []

  if (process.platform === 'win32') {
    iconPaths.push(
      join(process.resourcesPath, 'icon.ico'),
      join(app.getAppPath(), 'public', 'icons', 'icon.ico'),
      join(appDir, '..', '..', 'public', 'icons', 'icon.ico')
    )
  }

  iconPaths.push(...dragIconPaths)

  const iconPath = iconPaths.find(p => existsSync(p))
  if (!iconPath) {
    return undefined
  }

  const icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    return undefined
  }

  return icon
}

// Disable hardware acceleration to prevent GPU crashes
app.disableHardwareAcceleration()

// Handle uncaught errors to prevent crashes
process.on('uncaughtException', error => {
  console.error('Uncaught Exception:', error)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

// Disable hardware acceleration BEFORE app is ready (must be called before app is ready)
app.disableHardwareAcceleration()

// Keep references to prevent garbage collection
let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let isQuitting = false
let suppressFileWatcher = false
let backendProcess: ReturnType<typeof spawn> | null = null

type WindowState = {
  bounds: Rectangle
  isMaximized: boolean
}

const windowStatePath = join(app.getPath('userData'), 'window-state.json')
const defaultWindowBounds = { width: 1400, height: 900 }
const minWindowBounds = { width: 1000, height: 600 }

function isBoundsVisible(bounds: Rectangle): boolean {
  return screen.getAllDisplays().some(display => {
    const area = display.workArea
    return (
      bounds.x + bounds.width > area.x &&
      bounds.y + bounds.height > area.y &&
      bounds.x < area.x + area.width &&
      bounds.y < area.y + area.height
    )
  })
}

function readWindowState(): WindowState | null {
  try {
    if (!existsSync(windowStatePath)) {
      return null
    }
    const raw = readFileSync(windowStatePath, 'utf-8')
    const parsed = JSON.parse(raw) as WindowState
    if (!parsed?.bounds) {
      return null
    }
    return parsed
  } catch (error) {
    console.warn('Failed to read window state:', error)
    return null
  }
}

async function writeWindowState(state: WindowState): Promise<void> {
  try {
    await writeFile(windowStatePath, JSON.stringify(state))
  } catch (error) {
    console.warn('Failed to write window state:', error)
  }
}

let windowStateSaveTimer: NodeJS.Timeout | null = null

function scheduleWindowStateSave(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  if (windowStateSaveTimer) {
    clearTimeout(windowStateSaveTimer)
  }
  windowStateSaveTimer = setTimeout(() => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return
    }
    if (mainWindow.isMinimized()) {
      return
    }
    const isMaximized = mainWindow.isMaximized()
    const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
    const clampedBounds: Rectangle = {
      x: bounds.x,
      y: bounds.y,
      width: Math.max(bounds.width, minWindowBounds.width),
      height: Math.max(bounds.height, minWindowBounds.height),
    }
    void writeWindowState({ bounds: clampedBounds, isMaximized })
  }, 300)
}

function saveWindowStateImmediate(): void {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return
  }
  if (mainWindow.isMinimized()) {
    return
  }
  const isMaximized = mainWindow.isMaximized()
  const bounds = isMaximized ? mainWindow.getNormalBounds() : mainWindow.getBounds()
  const clampedBounds: Rectangle = {
    x: bounds.x,
    y: bounds.y,
    width: Math.max(bounds.width, minWindowBounds.width),
    height: Math.max(bounds.height, minWindowBounds.height),
  }
  void writeWindowState({ bounds: clampedBounds, isMaximized })
}

// Backend paths
const getBackendPaths = () => {
  const inProduction = !isDev
  return {
    backendPath: inProduction
      ? join(process.resourcesPath, 'bin', 'ClipVault.exe')
      : join(appDir, '..', '..', '..', 'bin', 'ClipVault.exe'),
    backendLogPath: inProduction
      ? join(process.resourcesPath, 'bin', 'clipvault.log')
      : join(appDir, '..', '..', '..', 'bin', 'clipvault.log'),
  }
}

// Start backend process
function startBackend(): boolean {
  const { backendPath, backendLogPath } = getBackendPaths()

  if (!existsSync(backendPath)) {
    console.warn('Backend executable not found:', backendPath)
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'ClipVault Error',
      message: 'Backend executable not found',
      detail: `Path: ${backendPath}\n\nPlease reinstall ClipVault.`,
    })
    return false
  }

  try {
    console.log('Spawning backend from:', backendPath)
    console.log('Backend log path:', backendLogPath)

    const logStream = createWriteStream(backendLogPath, { flags: 'a' })
    logStream.write(`\n--- Backend started at ${new Date().toISOString()} ---\n`)

    const backendProc = spawn(backendPath, [], {
      detached: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    backendProc.stdout.on('data', data => {
      const text = data.toString().trim()
      if (text) {
        logStream.write(`[STDOUT] ${text}\n`)
      }
    })

    backendProc.stderr.on('data', data => {
      const text = data.toString().trim()
      if (text) {
        logStream.write(`[STDERR] ${text}\n`)
        console.error('[Backend stderr]', text)
      }
    })

    backendProc.on('error', error => {
      console.error('Backend spawn error:', error)
      logStream.write(`[ERROR] Spawn error: ${error}\n`)
      logStream.end()
    })

    backendProc.on('exit', (code, signal) => {
      console.log(`Backend exited with code ${code} and signal ${signal}`)
      logStream.write(`--- Backend exited: code=${code}, signal=${signal} ---\n`)
      logStream.end()
      if (backendProcess === backendProc) {
        backendProcess = null
      }
    })

    console.log('Backend spawned with PID:', backendProc.pid)
    backendProcess = backendProc

    backendProc.unref()
    return true
  } catch (error) {
    console.error('Failed to start backend:', error)
    dialog.showMessageBoxSync({
      type: 'error',
      title: 'ClipVault Error',
      message: 'Failed to start backend',
      detail: String(error),
    })
    return false
  }
}

// Kill backend process
function killBackend(): boolean {
  if (!backendProcess) {
    // Try to find and kill any existing ClipVault.exe processes (backend only)
    try {
      execSync('taskkill /F /IM ClipVault.exe /FI "WINDOWTITLE eq ClipVault"', {
        stdio: 'ignore',
      })
      console.log('Killed existing backend processes')
      return true
    } catch {
      // No processes found or already killed
      return false
    }
  }

  try {
    console.log('Killing backend process with PID:', backendProcess.pid)
    backendProcess.kill()
    backendProcess = null
    return true
  } catch (error) {
    console.error('Failed to kill backend:', error)
    return false
  }
}

// Restart backend process
async function restartBackend(): Promise<boolean> {
  console.log('Restarting backend...')
  killBackend()

  // Wait a moment for the process to fully terminate
  await new Promise(resolve => setTimeout(resolve, 1000))

  return startBackend()
}

// App configuration
const isDev = process.env.NODE_ENV === 'development'
const thumbnailsPath = join(app.getPath('userData'), 'thumbnails')

// Settings file path - use standard AppData location (same as C++ backend)
// MUST be defined before getClipsPath() which uses it
const getSettingsPath = (): string => {
  // Use process.env.APPDATA to match C++ backend's CSIDL_APPDATA
  // This ensures both backend and UI use exact same path
  const appDataPath = process.env.APPDATA || app.getPath('appData')
  return join(appDataPath, 'ClipVault', 'settings.json')
}

// Default clips path - single source of truth for fallback
const defaultClipsPath = join(app.getPath('videos'), 'ClipVault')

// Get clips path from settings file
function getClipsPath(): string {
  try {
    const settingsPath = getSettingsPath()
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8')
      const settings = JSON.parse(content)
      const normalized = normalizeSettings(settings, true)
      if (normalized.output_path && typeof normalized.output_path === 'string') {
        return normalized.output_path
      }
    }
  } catch (error) {
    console.error('Failed to read clips path from settings:', error)
  }
  return defaultClipsPath
}

async function ensureClipsDirectory(): Promise<void> {
  const clipsDir = getClipsPath()
  if (!existsSync(clipsDir)) {
    await mkdir(clipsDir, { recursive: true })
  }
}

// Configure FFmpeg path for bundled version
// In dev mode, look in project root bin folder
// In production, look in resources/bin
const ffmpegPath = isDev
  ? join(appDir, '..', '..', '..', 'bin', 'ffmpeg.exe')
  : join(process.resourcesPath, 'bin', 'ffmpeg.exe')
const ffprobePath = isDev
  ? join(appDir, '..', '..', '..', 'bin', 'ffprobe.exe')
  : join(process.resourcesPath, 'bin', 'ffprobe.exe')

console.log('FFmpeg paths:', { isDev, ffmpegPath, ffprobePath })

if (existsSync(ffmpegPath)) {
  ffmpeg.setFfmpegPath(ffmpegPath)
  process.env.PATH = `${dirname(ffmpegPath)};${process.env.PATH}`
  console.log('Using bundled FFmpeg:', ffmpegPath)
} else {
  console.warn('FFmpeg not found at:', ffmpegPath)
}

if (existsSync(ffprobePath)) {
  ffmpeg.setFfprobePath(ffprobePath)
  console.log('Using bundled FFprobe:', ffprobePath)
} else {
  console.warn('FFprobe not found at:', ffprobePath)
}

console.log('Config:', {
  clipsPath: getClipsPath(),
  thumbnailsPath,
  userData: app.getPath('userData'),
})

// Check if running in startup mode (no window, just backend)
const isStartupMode = process.argv.includes('--startup')
console.log('[Main] Startup mode:', isStartupMode)

// Single instance lock - prevent multiple app instances
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  console.log('Another instance is already running. Quitting.')
  app.quit()
} else {
  // When a second instance tries to run, focus the existing window AND ensure backend is running
  app.on('second-instance', (_, commandLine) => {
    console.log('Second instance detected, focusing existing window and checking backend')

    // If no window exists (startup mode), create one
    if (!mainWindow && !commandLine.includes('--startup')) {
      console.log('Second instance: Creating window (was in startup mode)')
      createWindow()
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore()
      }
      mainWindow.show()
      mainWindow.focus()
    }

    // Try to start backend again (in case it was stopped)
    const inProduction = !isDev
    const backendPath = inProduction
      ? join(process.resourcesPath, 'bin', 'ClipVault.exe')
      : join(appDir, '..', '..', '..', 'bin', 'ClipVault.exe')

    if (existsSync(backendPath)) {
      try {
        console.log('Second instance: Spawning backend from:', backendPath)
        const backendProc = spawn(backendPath, [], {
          detached: true,
          stdio: ['ignore', 'ignore', 'ignore'],
        })
        backendProc.unref()
        console.log('Second instance: Backend spawn attempted with PID:', backendProc.pid)
      } catch (error) {
        console.error('Second instance: Failed to start backend:', error)
      }
    }
  })
}

// Register custom protocol before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'clipvault',
    privileges: {
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
])

// Backend configuration loader
// Create system tray icon
function createTray(): void {
  console.log('Creating tray icon...')

  // Try to load an icon
  let icon: Electron.NativeImage | undefined
  if (existsSync(dragIconPath)) {
    icon = nativeImage.createFromPath(dragIconPath)
    if (icon.isEmpty()) {
      icon = undefined
    }
  }

  // Use default icon if custom one not found
  if (!icon) {
    icon = nativeImage.createFromPath(join(appDir, '..', 'renderer', 'favicon.ico'))
    if (icon?.isEmpty()) {
      icon = undefined
    }
  }

  tray = new Tray(icon || nativeImage.createEmpty())
  tray.setToolTip('ClipVault Editor')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open ClipVault',
        click: () => {
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
          }
        },
      },
      {
        label: 'Open Clips Folder',
        click: async () => {
          const clipsFolder = getClipsPath()
          if (!existsSync(clipsFolder)) {
            await mkdir(clipsFolder, { recursive: true })
          }
          await shell.openPath(clipsFolder)
        },
      },
      { type: 'separator' },
      {
        label: 'Exit',
        click: () => {
          app.quit()
        },
      },
    ])
  )

  tray.on('click', () => {
    if (mainWindow) {
      if (mainWindow.isVisible()) {
        mainWindow.hide()
      } else {
        mainWindow.show()
        mainWindow.focus()
      }
    } else {
      // Window doesn't exist (startup mode), create it
      createWindow()
    }
  })

  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  console.log('Tray icon created')
}

async function createWindow() {
  console.log('Creating main window...')
  const windowIcon = resolveWindowIcon()
  const savedWindowState = readWindowState()
  const useSavedBounds = savedWindowState?.bounds && isBoundsVisible(savedWindowState.bounds)
  const initialBounds = useSavedBounds
    ? {
        width: Math.max(savedWindowState.bounds.width, minWindowBounds.width),
        height: Math.max(savedWindowState.bounds.height, minWindowBounds.height),
        x: savedWindowState.bounds.x,
        y: savedWindowState.bounds.y,
      }
    : { ...defaultWindowBounds }

  mainWindow = new BrowserWindow({
    ...initialBounds,
    minWidth: 1000,
    minHeight: 600,
    title: 'ClipVault Editor',
    backgroundColor: '#0f0f0f',
    show: true, // Show immediately with background color
    ...(windowIcon ? { icon: windowIcon } : {}),
    webPreferences: {
      preload: isDev
        ? join(appDir, '..', 'preload', 'index.js')
        : join(process.resourcesPath, 'app.asar', 'dist', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: false,
    },
    titleBarStyle: 'hiddenInset', // Modern look on macOS
    ...(process.platform === 'win32'
      ? {
          titleBarOverlay: {
            color: '#0f0f0f',
            symbolColor: '#ffffff',
          },
        }
      : {}),
  })
  console.log('Main window created, loading content...')

  if (savedWindowState?.isMaximized) {
    mainWindow.maximize()
  }

  mainWindow.on('resize', scheduleWindowStateSave)
  mainWindow.on('move', scheduleWindowStateSave)
  mainWindow.on('maximize', scheduleWindowStateSave)
  mainWindow.on('unmaximize', scheduleWindowStateSave)

  // Load the app
  try {
    if (isDev) {
      await mainWindow.loadURL('http://localhost:5173')
      console.log('Loaded dev URL, opening devtools...')
      mainWindow.webContents.openDevTools()
    } else {
      await mainWindow.loadFile(
        isDev
          ? join(appDir, '..', 'renderer', 'index.html')
          : join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'index.html')
      )
      console.log('Loaded production HTML file')
    }
  } catch (error) {
    console.error('Error loading window content:', error)
  }

  // Remove default menu bar
  Menu.setApplicationMenu(null)

  // Handle renderer crashes gracefully
  mainWindow.webContents.on('crashed', (event, killed) => {
    console.error('Window crashed!', { killed })
    if (!killed) {
      mainWindow?.reload()
    }
  })

  // Handle GPU process crashes
  app.on('gpu-process-crashed', (event, killed) => {
    console.error('GPU process crashed!', { killed })
  })

  mainWindow.once('ready-to-show', () => {
    console.log('Window ready to show, showing now...')
    mainWindow?.show()
    mainWindow?.focus()
  })

  // Fallback: Show window after 2 seconds even if ready-to-show doesn't fire
  setTimeout(() => {
    if (mainWindow && !mainWindow.isVisible()) {
      console.log('Fallback: forcing window to show after timeout')
      mainWindow.show()
      mainWindow.focus()
    }
  }, 2000)

  // Minimize to tray instead of closing
  mainWindow.on('close', event => {
    if (!isQuitting) {
      event.preventDefault()
      console.log('Minimizing to tray instead of closing')
      scheduleWindowStateSave()
      mainWindow?.hide()
    }
  })

  mainWindow.on('page-title-updated', event => {
    event.preventDefault()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // F12 to toggle devtools
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12') {
      mainWindow?.webContents.toggleDevTools()
      event.preventDefault()
    }
  })
}

// IPC Handlers

// Default settings object
const defaultSettings = {
  output_path: defaultClipsPath,
  buffer_seconds: 120,
  video: {
    width: 1920,
    height: 1080,
    fps: 60,
    encoder: 'auto',
    quality: 20,
    monitor: 0,
  },
  audio: {
    sample_rate: 48000,
    bitrate: 160,
    system_audio_enabled: true,
    microphone_enabled: true,
    system_audio_device_id: 'default',
    microphone_device_id: 'default',
  },
  hotkey: {
    save_clip: 'F9',
  },
  ui: {
    show_notifications: true,
    play_sound: true,
    minimize_to_tray: true,
    start_with_windows: false,
    library_hover_preview: true,
    first_run_completed: false,
  },
  launcher: {
    autostart_backend: true,
    backend_mode: 'tray',
    single_instance: true,
  },
  social: {
    discord: {
      webhook_url: '',
      default_message_template: 'New clip from ClipVault: {clip_name}',
    },
    youtube: {
      auth_mode: 'managed' as 'managed' | 'custom',
      client_id: '',
      client_secret: '',
      refresh_token: '',
      access_token: '',
      token_expiry: 0,
      channel_id: '',
      channel_title: '',
      default_privacy: 'unlisted',
      default_title_template: '{clip_name}',
      default_description: 'Shared from ClipVault',
      default_tags: [] as string[],
    },
  },
}

const normalizeSettings = (raw: unknown, fileExists: boolean) => {
  const base = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const socialBase =
    base.social && typeof base.social === 'object' ? (base.social as Record<string, unknown>) : {}
  const merged = {
    ...defaultSettings,
    ...base,
    video: {
      ...defaultSettings.video,
      ...(base.video && typeof base.video === 'object' ? base.video : {}),
    },
    audio: {
      ...defaultSettings.audio,
      ...(base.audio && typeof base.audio === 'object' ? base.audio : {}),
    },
    hotkey: {
      ...defaultSettings.hotkey,
      ...(base.hotkey && typeof base.hotkey === 'object' ? base.hotkey : {}),
    },
    ui: {
      ...defaultSettings.ui,
      ...(base.ui && typeof base.ui === 'object' ? base.ui : {}),
    },
    launcher: {
      ...defaultSettings.launcher,
      ...(base.launcher && typeof base.launcher === 'object' ? base.launcher : {}),
    },
    social: {
      ...defaultSettings.social,
      ...socialBase,
      discord: {
        ...defaultSettings.social.discord,
        ...(socialBase.discord && typeof socialBase.discord === 'object' ? socialBase.discord : {}),
      },
      youtube: {
        ...defaultSettings.social.youtube,
        ...(socialBase.youtube && typeof socialBase.youtube === 'object' ? socialBase.youtube : {}),
      },
    },
  }

  const trimmedOutputPath = typeof merged.output_path === 'string' ? merged.output_path.trim() : ''
  merged.output_path = trimmedOutputPath || defaultSettings.output_path

  if (!Number.isFinite(merged.video.monitor)) {
    merged.video.monitor = 0
  }

  if (typeof merged.audio.system_audio_device_id !== 'string') {
    merged.audio.system_audio_device_id = 'default'
  }

  if (typeof merged.audio.microphone_device_id !== 'string') {
    merged.audio.microphone_device_id = 'default'
  }

  if (typeof merged.ui.library_hover_preview !== 'boolean') {
    merged.ui.library_hover_preview = true
  }

  if (fileExists && typeof merged.ui.first_run_completed !== 'boolean') {
    merged.ui.first_run_completed = true
  }

  if (!fileExists && typeof merged.ui.first_run_completed !== 'boolean') {
    merged.ui.first_run_completed = false
  }

  if (typeof merged.social.discord.webhook_url !== 'string') {
    merged.social.discord.webhook_url = ''
  }
  merged.social.discord.webhook_url = merged.social.discord.webhook_url.trim()

  if (typeof merged.social.discord.default_message_template !== 'string') {
    merged.social.discord.default_message_template = defaultSettings.social.discord.default_message_template
  }

  if (typeof merged.social.youtube.client_id !== 'string') {
    merged.social.youtube.client_id = ''
  }
  if (!['managed', 'custom'].includes(merged.social.youtube.auth_mode)) {
    merged.social.youtube.auth_mode = 'managed'
  }
  if (typeof merged.social.youtube.client_secret !== 'string') {
    merged.social.youtube.client_secret = ''
  }
  if (typeof merged.social.youtube.refresh_token !== 'string') {
    merged.social.youtube.refresh_token = ''
  }
  if (typeof merged.social.youtube.access_token !== 'string') {
    merged.social.youtube.access_token = ''
  }
  if (typeof merged.social.youtube.channel_id !== 'string') {
    merged.social.youtube.channel_id = ''
  }
  if (typeof merged.social.youtube.channel_title !== 'string') {
    merged.social.youtube.channel_title = ''
  }
  if (typeof merged.social.youtube.default_title_template !== 'string') {
    merged.social.youtube.default_title_template = defaultSettings.social.youtube.default_title_template
  }
  if (typeof merged.social.youtube.default_description !== 'string') {
    merged.social.youtube.default_description = defaultSettings.social.youtube.default_description
  }
  if (
    typeof merged.social.youtube.token_expiry !== 'number' ||
    !Number.isFinite(merged.social.youtube.token_expiry)
  ) {
    merged.social.youtube.token_expiry = 0
  }

  if (!['private', 'unlisted', 'public'].includes(merged.social.youtube.default_privacy)) {
    merged.social.youtube.default_privacy = 'unlisted'
  }

  if (!Array.isArray(merged.social.youtube.default_tags)) {
    merged.social.youtube.default_tags = []
  }
  merged.social.youtube.default_tags = merged.social.youtube.default_tags
    .filter((tag): tag is string => typeof tag === 'string')
    .map(tag => tag.trim())
    .filter(Boolean)
    .slice(0, 15)

  return merged
}

type NormalizedSettings = ReturnType<typeof normalizeSettings>

type YouTubeAuthMode = 'managed' | 'custom'

type ResolvedYouTubeCredentials = {
  mode: YouTubeAuthMode
  clientId: string
  clientSecret: string
}

const getManagedYouTubeCredentials = () => {
  const clientId =
    process.env.CLIPVAULT_YOUTUBE_CLIENT_ID?.trim() || process.env.YOUTUBE_CLIENT_ID?.trim() || ''
  const clientSecret =
    process.env.CLIPVAULT_YOUTUBE_CLIENT_SECRET?.trim() ||
    process.env.YOUTUBE_CLIENT_SECRET?.trim() ||
    ''

  return {
    clientId,
    clientSecret,
    available: Boolean(clientId && clientSecret),
  }
}

const resolveYouTubeAuthMode = (
  settings: NormalizedSettings,
  requestedMode?: string
): YouTubeAuthMode => {
  if (requestedMode === 'managed' || requestedMode === 'custom') {
    return requestedMode
  }

  if (settings.social.youtube.auth_mode === 'custom') {
    return 'custom'
  }

  const managed = getManagedYouTubeCredentials()
  return managed.available ? 'managed' : 'custom'
}

const resolveYouTubeCredentials = (
  settings: NormalizedSettings,
  requestedMode?: string,
  overrides?: { clientId?: string; clientSecret?: string }
): ResolvedYouTubeCredentials => {
  const mode = resolveYouTubeAuthMode(settings, requestedMode)

  if (mode === 'managed') {
    const managed = getManagedYouTubeCredentials()
    if (!managed.available) {
      throw new Error('ClipVault-managed YouTube sign-in is unavailable in this build.')
    }

    return {
      mode,
      clientId: managed.clientId,
      clientSecret: managed.clientSecret,
    }
  }

  const clientId =
    overrides?.clientId?.trim() || settings.social.youtube.client_id.trim() || ''
  const clientSecret =
    overrides?.clientSecret?.trim() || settings.social.youtube.client_secret.trim() || ''

  if (!clientId || !clientSecret) {
    throw new Error('Client ID and Client Secret are required for custom YouTube setup.')
  }

  return {
    mode,
    clientId,
    clientSecret,
  }
}

const getYouTubeProviderInfo = (settings: NormalizedSettings) => {
  const managed = getManagedYouTubeCredentials()
  return {
    managedAvailable: managed.available,
    activeMode: resolveYouTubeAuthMode(settings),
    recommendedMode: managed.available ? ('managed' as const) : ('custom' as const),
  }
}

const getConfigDir = (): string => {
  const appDataPath = process.env.APPDATA || app.getPath('appData')
  return join(appDataPath, 'ClipVault')
}

const persistNormalizedSettings = async (settings: NormalizedSettings): Promise<void> => {
  const configDir = getConfigDir()
  const settingsPath = getSettingsPath()

  if (!existsSync(configDir)) {
    await mkdir(configDir, { recursive: true })
  }

  await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
}

const readNormalizedSettings = async (): Promise<NormalizedSettings> => {
  const settingsPath = getSettingsPath()
  const fileExists = existsSync(settingsPath)

  if (!fileExists) {
    return normalizeSettings(null, false)
  }

  try {
    const content = await readFile(settingsPath, 'utf-8')
    return normalizeSettings(JSON.parse(content), true)
  } catch (error) {
    console.error('Failed to parse settings, using defaults:', error)
    return normalizeSettings(null, false)
  }
}

const sanitizeSettingsForRenderer = (settings: NormalizedSettings): NormalizedSettings => {
  const safe = normalizeSettings(settings, true)
  safe.social.youtube.access_token = ''
  safe.social.youtube.refresh_token = ''
  safe.social.youtube.client_secret = ''
  return safe
}

interface GamesDatabaseEntry {
  name: string
  processNames?: string[]
  twitchId?: string
}

interface GamesDatabaseFile {
  version?: string
  description?: string
  games: GamesDatabaseEntry[]
}

type GamesDatabaseResult = {
  success: boolean
  data?: GamesDatabaseFile | null
  error?: string
}

const GAME_TAG_SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'from',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
])

let cachedGameAliasMap: Map<string, string> | null = null

const getGamesDatabasePaths = (): string[] => {
  return [
    // Development paths
    join(process.cwd(), 'config', 'games_database.json'),
    join(app.getAppPath(), '..', '..', 'config', 'games_database.json'),
    // Production paths (packaged app)
    join(process.resourcesPath, 'bin', 'config', 'games_database.json'),
    join(process.resourcesPath, 'config', 'games_database.json'),
    // Fallback to app directory
    join(app.getAppPath(), 'config', 'games_database.json'),
  ]
}

const normalizeGameLookupKey = (value: string): string => {
  return value
    .trim()
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,4}$/i, '')
    .replace(/[\s_.-]+/g, '')
}

const looksLikeProcessName = (value: string): boolean => {
  const trimmed = value.trim()
  if (!trimmed) {
    return false
  }

  if (/\.[a-z0-9]{1,4}$/i.test(trimmed)) {
    return true
  }

  return /(?:win64|win32|shipping|launcher|client)/i.test(trimmed)
}

const toDisplayGameName = (value: string): string => {
  const cleaned = value
    .replace(/\.[a-z0-9]{1,4}$/i, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  if (!cleaned) {
    return value.trim()
  }

  const words = cleaned.split(' ')
  return words
    .map((word, index) => {
      const lower = word.toLowerCase()
      const isMiddleWord = index > 0 && index < words.length - 1

      if (/^[A-Z0-9]{2,5}$/.test(word)) {
        return word
      }

      if (isMiddleWord && GAME_TAG_SMALL_WORDS.has(lower)) {
        return lower
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1)
    })
    .join(' ')
}

const buildGameAliasMap = (games: GamesDatabaseEntry[]): Map<string, string> => {
  const aliases = new Map<string, string>()

  const addAlias = (alias: string, gameName: string) => {
    const key = normalizeGameLookupKey(alias)
    if (!key || aliases.has(key)) {
      return
    }
    aliases.set(key, gameName)
  }

  for (const game of games) {
    const canonicalName = typeof game.name === 'string' ? game.name.trim() : ''
    if (!canonicalName) {
      continue
    }

    addAlias(canonicalName, canonicalName)

    if (Array.isArray(game.processNames)) {
      for (const processName of game.processNames) {
        if (typeof processName === 'string' && processName.trim()) {
          addAlias(processName, canonicalName)
        }
      }
    }
  }

  return aliases
}

const loadGamesDatabaseFromDisk = async (): Promise<GamesDatabaseResult> => {
  const possiblePaths = getGamesDatabasePaths()

  for (const dbPath of possiblePaths) {
    try {
      if (!existsSync(dbPath)) {
        continue
      }

      console.log('[GamesDB] Loading from:', dbPath)
      const content = await readFile(dbPath, 'utf-8')
      const parsed = JSON.parse(content) as GamesDatabaseFile

      if (!parsed || !Array.isArray(parsed.games)) {
        throw new Error('Invalid games database format')
      }

      console.log('[GamesDB] Successfully loaded', parsed.games.length, 'games')
      return { success: true, data: parsed }
    } catch (error) {
      console.log('[GamesDB] Failed to load from:', dbPath, '-', error)
    }
  }

  console.error('[GamesDB] Could not find games_database.json in any location')
  return { success: false, error: 'Games database not found', data: null }
}

const getGameAliasMap = async (): Promise<Map<string, string>> => {
  if (cachedGameAliasMap) {
    return cachedGameAliasMap
  }

  const result = await loadGamesDatabaseFromDisk()
  const games = result.success && result.data?.games ? result.data.games : []

  cachedGameAliasMap = buildGameAliasMap(games)
  return cachedGameAliasMap
}

const canonicalizeGameTag = (rawGameTag: string, aliasMap: Map<string, string>): string => {
  const trimmed = rawGameTag.trim()
  if (!trimmed) {
    return ''
  }

  const aliasMatch = aliasMap.get(normalizeGameLookupKey(trimmed))
  if (aliasMatch) {
    return aliasMatch
  }

  if (!looksLikeProcessName(trimmed)) {
    return trimmed
  }

  return toDisplayGameName(trimmed)
}

const normalizeGameTagInMetadata = (
  metadata: Record<string, unknown> | null,
  aliasMap: Map<string, string>
): { metadata: Record<string, unknown> | null; changed: boolean } => {
  if (!metadata) {
    return { metadata, changed: false }
  }

  const existingGame = metadata.game
  if (typeof existingGame !== 'string') {
    return { metadata, changed: false }
  }

  const canonicalGame = canonicalizeGameTag(existingGame, aliasMap)
  if (!canonicalGame || canonicalGame === existingGame) {
    return { metadata, changed: false }
  }

  return {
    metadata: {
      ...metadata,
      game: canonicalGame,
      lastModified: new Date().toISOString(),
    },
    changed: true,
  }
}

// Get settings
ipcMain.handle('settings:get', async () => {
  try {
    const settingsPath = getSettingsPath()
    console.log('Settings path:', settingsPath)
    const normalized = await readNormalizedSettings()
    return sanitizeSettingsForRenderer(normalized)
  } catch (error) {
    console.error('Failed to read settings:', error)
    return normalizeSettings(null, false)
  }
})

// Load games database - tries multiple paths for dev and production
ipcMain.handle('games:getDatabase', async () => {
  return await loadGamesDatabaseFromDisk()
})

// Save settings and restart backend
ipcMain.handle('settings:save', async (_, settings: unknown) => {
  try {
    const settingsPath = getSettingsPath()
    const configDir = getConfigDir()
    const normalized = normalizeSettings(settings, true)
    const existingSettings = await readNormalizedSettings()

    const incomingClientId = normalized.social.youtube.client_id.trim()
    const incomingClientSecret = normalized.social.youtube.client_secret.trim()
    const authModeChanged =
      normalized.social.youtube.auth_mode !== existingSettings.social.youtube.auth_mode
    const clientIdChanged =
      incomingClientId.length > 0 && incomingClientId !== existingSettings.social.youtube.client_id.trim()
    const clientSecretChanged =
      incomingClientSecret.length > 0 &&
      incomingClientSecret !== existingSettings.social.youtube.client_secret.trim()

    // Preserve sensitive YouTube credentials/tokens unless explicitly provided.
    if (!normalized.social.youtube.client_id && existingSettings.social.youtube.client_id) {
      normalized.social.youtube.client_id = existingSettings.social.youtube.client_id
    }
    if (!normalized.social.youtube.client_secret && existingSettings.social.youtube.client_secret) {
      normalized.social.youtube.client_secret = existingSettings.social.youtube.client_secret
    }

    if (authModeChanged || clientIdChanged || clientSecretChanged) {
      // OAuth client/mode changed; clear connection state and require reconnect.
      normalized.social.youtube.refresh_token = ''
      normalized.social.youtube.access_token = ''
      normalized.social.youtube.token_expiry = 0
      normalized.social.youtube.channel_id = ''
      normalized.social.youtube.channel_title = ''
    } else {
      if (!normalized.social.youtube.refresh_token && existingSettings.social.youtube.refresh_token) {
        normalized.social.youtube.refresh_token = existingSettings.social.youtube.refresh_token
      }
      if (!normalized.social.youtube.access_token && existingSettings.social.youtube.access_token) {
        normalized.social.youtube.access_token = existingSettings.social.youtube.access_token
      }
      if (!normalized.social.youtube.token_expiry && existingSettings.social.youtube.token_expiry) {
        normalized.social.youtube.token_expiry = existingSettings.social.youtube.token_expiry
      }
      if (!normalized.social.youtube.channel_id && existingSettings.social.youtube.channel_id) {
        normalized.social.youtube.channel_id = existingSettings.social.youtube.channel_id
      }
      if (!normalized.social.youtube.channel_title && existingSettings.social.youtube.channel_title) {
        normalized.social.youtube.channel_title = existingSettings.social.youtube.channel_title
      }
    }

    if (normalized.ui.first_run_completed == null) {
      normalized.ui.first_run_completed = true
    }

    // Ensure config directory exists
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true })
    }

    if (typeof normalized.output_path === 'string' && normalized.output_path.trim()) {
      try {
        await mkdir(normalized.output_path, { recursive: true })
      } catch (mkdirError) {
        console.error('Failed to create clips directory:', mkdirError)
      }
    }

    await persistNormalizedSettings(normalized)
    console.log('Settings saved to:', settingsPath)

    // Restart backend to apply new settings
    console.log('Settings saved, restarting backend...')
    const restarted = await restartBackend()

    return { success: true, restarted }
  } catch (error) {
    console.error('Failed to save settings:', error)
    throw error
  }
})

// Restart backend manually
ipcMain.handle('backend:restart', async () => {
  try {
    const restarted = await restartBackend()
    return { success: true, restarted }
  } catch (error) {
    console.error('Failed to restart backend:', error)
    throw error
  }
})

// Set start with Windows
ipcMain.handle('settings:setStartup', async (_, enabled: boolean) => {
  try {
    const exePath = process.execPath
    const keyName = 'ClipVault'

    if (enabled) {
      // Add to registry Run key with --startup flag (no window, backend only)
      const { exec } = require('child_process')
      // Escape quotes for registry
      const quotedPath = `"${exePath}"`
      const regCmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${keyName}" /t REG_SZ /d "${quotedPath} --startup" /f`
      exec(regCmd, (err: Error | null) => {
        if (err) {
          console.error('Failed to add startup registry:', err)
        } else {
          console.log('[Startup] Added ClipVault to Windows startup (background mode)')
        }
      })
    } else {
      // Remove from registry Run key
      const { exec } = require('child_process')
      const regCmd = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${keyName}" /f`
      exec(regCmd, (err: Error | null) => {
        if (err) {
          console.error('Failed to remove startup registry:', err)
        } else {
          console.log('[Startup] Removed ClipVault from Windows startup')
        }
      })
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to set startup:', error)
    return { success: false, error: String(error) }
  }
})

// Get monitor information
ipcMain.handle('system:getMonitors', async () => {
  try {
    const displays = screen.getAllDisplays()
    return displays.map((display, index) => ({
      id: index,
      name: `Monitor ${index + 1}`,
      width: display.bounds.width,
      height: display.bounds.height,
      x: display.bounds.x,
      y: display.bounds.y,
      primary: display.bounds.x === 0 && display.bounds.y === 0,
    }))
  } catch (error) {
    console.error('Failed to get monitors:', error)
    throw error
  }
})

// Get audio devices - async implementation to avoid blocking main process
const execFileAsync = promisify(execFile)

ipcMain.handle('audio:getDevices', async (_, type: 'output' | 'input') => {
  try {
    const { backendPath } = getBackendPaths()

    if (!existsSync(backendPath)) {
      console.warn('Backend executable not found for audio device enumeration')
      return []
    }

    // Use async execFile to avoid blocking the main process
    const { stdout } = await execFileAsync(backendPath, ['--list-audio-devices'], {
      encoding: 'utf8',
      timeout: 5000,
    })

    try {
      const devices = JSON.parse(stdout)
      if (type === 'output') {
        return devices.filter((d: { type: string }) => d.type === 'output')
      } else {
        return devices.filter((d: { type: string }) => d.type === 'input')
      }
    } catch {
      console.error('Failed to parse audio devices:', stdout)
      return []
    }
  } catch (error) {
    console.error('Failed to get audio devices:', error)
    return []
  }
})

// Get list of clips
ipcMain.handle('clips:getList', async () => {
  try {
    if (!existsSync(getClipsPath())) {
      await mkdir(getClipsPath(), { recursive: true })
      return []
    }

    // Ensure clips-metadata directory exists
    const metadataDir = join(getClipsPath(), 'clips-metadata')
    if (!existsSync(metadataDir)) {
      await mkdir(metadataDir, { recursive: true })
    }

    const gameAliasMap = await getGameAliasMap()
    const pendingMetadataUpdates: Array<{ metadataPath: string; metadata: Record<string, unknown> }> = []
    let migratedGameTags = 0

    const files = await readdir(getClipsPath())
    const clips = await Promise.all(
      files
        .filter(file => file.endsWith('.mp4'))
        .map(async filename => {
          const filePath = join(getClipsPath(), filename)
          const stats = await stat(filePath)
          const clipId = filename.replace('.mp4', '')
          const metadataPath = join(metadataDir, `${clipId}.json`)

          let metadata: Record<string, unknown> | null = null
          try {
            if (existsSync(metadataPath)) {
              const content = await readFile(metadataPath, 'utf-8')
              const parsed = JSON.parse(content)
              if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const normalized = normalizeGameTagInMetadata(
                  parsed as Record<string, unknown>,
                  gameAliasMap
                )
                metadata = normalized.metadata

                if (normalized.changed && metadata) {
                  pendingMetadataUpdates.push({ metadataPath, metadata })
                }
              }
            }
          } catch (e) {
            console.error('Failed to read metadata:', e)
          }

          return {
            id: clipId,
            filename,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString(),
            metadata,
          }
        })
    )

    for (const update of pendingMetadataUpdates) {
      try {
        await writeFile(update.metadataPath, JSON.stringify(update.metadata, null, 2), 'utf-8')
        migratedGameTags += 1
      } catch (error) {
        console.error('Failed to write migrated metadata:', error)
      }
    }

    if (migratedGameTags > 0) {
      console.log(`[METADATA] Migrated ${migratedGameTags} game tags to canonical names`)
    }

    return clips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (error) {
    console.error('Failed to get clips list:', error)
    throw error
  }
})

// Save clip metadata
ipcMain.handle('clips:saveMetadata', async (_, clipId: string, metadata: unknown) => {
  try {
    console.log('[METADATA] Saving metadata for clip:', clipId)
    const metadataDir = join(getClipsPath(), 'clips-metadata')
    if (!existsSync(metadataDir)) {
      await mkdir(metadataDir, { recursive: true })
    }
    const metadataPath = join(metadataDir, `${clipId}.json`)
    const gameAliasMap = await getGameAliasMap()

    let metadataToSave: unknown = metadata
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      const normalized = normalizeGameTagInMetadata(
        { ...(metadata as Record<string, unknown>) },
        gameAliasMap
      )
      metadataToSave = normalized.metadata
    }

    await writeFile(metadataPath, JSON.stringify(metadataToSave, null, 2), 'utf-8')
    console.log('[METADATA] Saved to:', metadataPath)
    return true
  } catch (error) {
    console.error('[METADATA] Failed to save:', error)
    throw error
  }
})

// Get clip metadata
ipcMain.handle('clips:getMetadata', async (_, clipId: string) => {
  try {
    const metadataDir = join(getClipsPath(), 'clips-metadata')
    const metadataPath = join(metadataDir, `${clipId}.json`)
    if (!existsSync(metadataPath)) {
      return null
    }
    const content = await readFile(metadataPath, 'utf-8')
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return parsed
    }

    const gameAliasMap = await getGameAliasMap()
    const normalized = normalizeGameTagInMetadata(parsed as Record<string, unknown>, gameAliasMap)

    if (normalized.changed && normalized.metadata) {
      await writeFile(metadataPath, JSON.stringify(normalized.metadata, null, 2), 'utf-8')
    }

    return normalized.metadata
  } catch (error) {
    console.error('Failed to get metadata:', error)
    return null
  }
})

// Delete clip
ipcMain.handle('clips:delete', async (_, clipId: string) => {
  try {
    const clipsPath = getClipsPath()

    // Delete video file
    const videoPath = join(clipsPath, `${clipId}.mp4`)
    if (existsSync(videoPath)) {
      await fsUnlinkAsync(videoPath)
      console.log('[Main] Deleted video file:', videoPath)
    }

    // Delete metadata file
    const metadataDir = join(clipsPath, 'clips-metadata')
    const metadataPath = join(metadataDir, `${clipId}.json`)
    if (existsSync(metadataPath)) {
      await fsUnlinkAsync(metadataPath)
      console.log('[Main] Deleted metadata file:', metadataPath)
    }

    // Delete thumbnail if exists
    const thumbnailsPath = join(app.getPath('userData'), 'thumbnails')
    const thumbnailPath = join(thumbnailsPath, `${clipId}.jpg`)
    if (existsSync(thumbnailPath)) {
      await fsUnlinkAsync(thumbnailPath)
      console.log('[Main] Deleted thumbnail:', thumbnailPath)
    }

    // Delete audio cache if exists
    const audioCachePath = join(thumbnailsPath, 'audio')
    const track1Path = join(audioCachePath, `${clipId}_track1.m4a`)
    const track2Path = join(audioCachePath, `${clipId}_track2.m4a`)
    if (existsSync(track1Path)) {
      await fsUnlinkAsync(track1Path)
    }
    if (existsSync(track2Path)) {
      await fsUnlinkAsync(track2Path)
    }

    return { success: true }
  } catch (error) {
    console.error('Failed to delete clip:', error)
    throw error
  }
})

// Save editor state (playhead only, since trim/audio are in main metadata)
ipcMain.handle('editor:saveState', async (_, clipId: string, state: unknown) => {
  try {
    const metadataDir = join(getClipsPath(), 'clips-metadata')
    if (!existsSync(metadataDir)) {
      await mkdir(metadataDir, { recursive: true })
    }
    const statePath = join(metadataDir, `${clipId}.json`)
    // Merge with existing metadata if any
    const existingContent = existsSync(statePath)
      ? JSON.parse(await readFile(statePath, 'utf-8'))
      : {}
    const existingObj =
      typeof existingContent === 'object' && existingContent !== null ? existingContent : {}
    const stateObj = typeof state === 'object' && state !== null ? state : {}
    const mergedState = { ...existingObj, ...stateObj } as Record<string, unknown>

    const gameAliasMap = await getGameAliasMap()
    const normalized = normalizeGameTagInMetadata(mergedState, gameAliasMap)

    await writeFile(statePath, JSON.stringify(normalized.metadata, null, 2), 'utf-8')
    console.log(`[Editor] Saved state for clip ${clipId}`)
    return true
  } catch (error) {
    console.error('Failed to save editor state:', error)
    throw error
  }
})

// Load editor state
ipcMain.handle('editor:loadState', async (_, clipId: string) => {
  try {
    const metadataDir = join(getClipsPath(), 'clips-metadata')
    const statePath = join(metadataDir, `${clipId}.json`)

    if (!existsSync(statePath)) {
      return null
    }

    const content = await readFile(statePath, 'utf-8')
    console.log(`[Editor] Loaded state for clip ${clipId}`)
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return parsed
    }

    const gameAliasMap = await getGameAliasMap()
    const normalized = normalizeGameTagInMetadata(parsed as Record<string, unknown>, gameAliasMap)

    if (normalized.changed && normalized.metadata) {
      await writeFile(statePath, JSON.stringify(normalized.metadata, null, 2), 'utf-8')
    }

    return normalized.metadata
  } catch (error) {
    console.error('Failed to load editor state:', error)
    return null
  }
})

// Open clips folder in file explorer
ipcMain.handle('system:openFolder', async () => {
  const clipsPath = getClipsPath()
  try {
    // Create the folder if it doesn't exist
    if (!existsSync(clipsPath)) {
      await mkdir(clipsPath, { recursive: true })
      console.log('[Main] Created clips folder:', clipsPath)
    }
    await shell.openPath(clipsPath)
  } catch (error) {
    console.error('[Main] Failed to open clips folder:', error)
    throw error
  }
})

// Show folder picker dialog
ipcMain.handle('dialog:openFolder', async () => {
  if (!mainWindow) return { canceled: true }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Clips Folder',
  })
  return result
})

// Show save dialog
ipcMain.handle('dialog:save', async (_, options) => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, options)
  return result
})

// Get all existing thumbnails (for instant library loading)
ipcMain.handle('clips:getExistingThumbnails', async () => {
  try {
    if (!existsSync(thumbnailsPath)) {
      return {}
    }

    const files = await readdir(thumbnailsPath)
    const thumbnails: { [clipId: string]: string } = {}

    for (const file of files) {
      if (file.endsWith('.jpg')) {
        const clipId = file.replace('.jpg', '')
        thumbnails[clipId] = `clipvault://thumb/${encodeURIComponent(file)}`
      }
    }

    console.log(`[Thumbnails] Found ${Object.keys(thumbnails).length} existing thumbnails`)
    return thumbnails
  } catch (error) {
    console.error('[Thumbnails] Error getting existing thumbnails:', error)
    return {}
  }
})

// Generate thumbnail for a clip
ipcMain.handle('clips:generateThumbnail', async (_, clipId: string, videoPath: string) => {
  try {
    if (!existsSync(thumbnailsPath)) {
      await mkdir(thumbnailsPath, { recursive: true })
    }

    const thumbnailFilename = `${clipId}.jpg`
    const thumbnailPath = join(thumbnailsPath, thumbnailFilename)

    if (existsSync(thumbnailPath)) {
      return `clipvault://thumb/${encodeURIComponent(thumbnailFilename)}`
    }

    const worker = getThumbnailWorker()

    if (worker.isAvailable()) {
      logThumbnail(`Windows API: ${thumbnailFilename}`)

      try {
        const result = await worker.extractThumbnail(videoPath, thumbnailPath, 480, 270)

        if (result.success && existsSync(thumbnailPath)) {
          logThumbnail(`Windows API success: ${thumbnailFilename} in ${result.duration || 0}ms`)
          return `clipvault://thumb/${encodeURIComponent(thumbnailFilename)}`
        } else {
          logThumbnail(`Windows API failed: ${thumbnailFilename} - ${result.error}`)
        }
      } catch (error) {
        logThumbnail(`Windows API error: ${thumbnailFilename} - ${error}`)
      }
    } else {
      logThumbnail(`Worker unavailable, using FFmpeg: ${thumbnailFilename}`)
    }

    logThumbnail(`FFmpeg fallback: ${thumbnailFilename}`)
    const ffStartTime = Date.now()

    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .inputOptions(['-ss', '0.5']) // Input seeking - fast!
        .outputOptions([
          '-vframes',
          '1',
          '-q:v',
          '5',
          '-vf',
          'scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2',
        ])
        .output(thumbnailPath)
        .on('end', () => {
          logThumbnail(`FFmpeg success: ${thumbnailFilename} in ${Date.now() - ffStartTime}ms`)
          resolve(`clipvault://thumb/${encodeURIComponent(thumbnailFilename)}`)
        })
        .on('error', err => {
          logThumbnail(`FFmpeg error: ${thumbnailFilename} - ${err}`)
          reject(err)
        })
        .run()
    })
  } catch (error) {
    logThumbnail(`Failed: ${clipId} - ${error}`)
    throw error
  }
})

// Get video file URL for loading in video element
ipcMain.handle('video:getFileUrl', async (_, filename: string) => {
  try {
    const filePath = join(getClipsPath(), filename)

    if (!existsSync(filePath)) {
      console.error('Video file not found:', filePath)
      return { success: false, error: 'File not found' }
    }

    // Return the file:// URL which the renderer can use directly
    // Note: webSecurity is disabled in the window, so file:// URLs work
    const fileUrl = `file:///${filePath.replace(/\\/g, '/')}`
    console.log('Returning video file URL:', fileUrl)

    return { success: true, url: fileUrl, path: filePath }
  } catch (error) {
    console.error('Error getting video file URL:', error)
    return { success: false, error: String(error) }
  }
})

// Get video metadata (duration, resolution, etc.)
ipcMain.handle('clips:getVideoMetadata', async (_, videoPath: string) => {
  try {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, metadata) => {
        if (err) {
          reject(err)
          return
        }

        const videoStream = metadata.streams.find(s => s.codec_type === 'video')
        const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio')

        resolve({
          duration: metadata.format.duration || 0,
          width: videoStream?.width || 0,
          height: videoStream?.height || 0,
          fps: videoStream ? eval(videoStream.r_frame_rate || '0') : 0,
          bitrate: metadata.format.bit_rate || 0,
          size: metadata.format.size || 0,
          format: metadata.format.format_name || '',
          videoCodec: videoStream?.codec_name || '',
          audioTracks: audioStreams.length,
        })
      })
    })
  } catch (error) {
    console.error('Failed to get video metadata:', error)
    throw error
  }
})

// Background thumbnail pre-generation on startup
async function preGenerateThumbnails() {
  try {
    const clipsDir = getClipsPath()
    if (!existsSync(clipsDir)) {
      console.log('[Main] No clips directory, skipping thumbnail pre-generation')
      return
    }

    const files = await readdir(clipsDir)
    const videoFiles = files.filter(f => f.endsWith('.mp4'))

    if (videoFiles.length === 0) {
      return
    }

    console.log(`[Main] Pre-generating ${videoFiles.length} thumbnails...`)

    let generated = 0
    let skipped = 0
    let windowsGenerated = 0
    let ffmpegGenerated = 0

    const batchSize = 3
    const worker = getThumbnailWorker()
    const useWorker = worker.isAvailable()

    if (useWorker) {
      logThumbnail(`Pre-generation: using Windows Thumbnail Cache for ${videoFiles.length} clips`)
    } else {
      logThumbnail(
        `Pre-generation: Worker not available, using FFmpeg for ${videoFiles.length} clips`
      )
    }

    for (let i = 0; i < videoFiles.length; i += batchSize) {
      const batch = videoFiles.slice(i, i + batchSize)

      await Promise.all(
        batch.map(async filename => {
          const clipId = filename.replace('.mp4', '')
          const thumbnailFilename = `${clipId}.jpg`
          const thumbnailPath = join(thumbnailsPath, thumbnailFilename)

          if (existsSync(thumbnailPath)) {
            skipped++
            return
          }

          const videoPath = join(clipsDir, filename)

          if (useWorker) {
            try {
              const result = await worker.extractThumbnail(videoPath, thumbnailPath, 480, 270)
              if (result.success && existsSync(thumbnailPath)) {
                windowsGenerated++
                generated++
                logThumbnail(`Pre-gen Windows: ${thumbnailFilename} in ${result.duration || 0}ms`)
                return
              } else {
                logThumbnail(`Pre-gen Windows failed: ${thumbnailFilename}`)
              }
            } catch (error) {
              logThumbnail(`Pre-gen Windows error: ${thumbnailFilename} - ${error}`)
            }
          }

          await new Promise<void>(resolve => {
            const ffStartTime = Date.now()
            ffmpeg(videoPath)
              .inputOptions(['-ss', '0.5']) // Input seeking - fast!
              .outputOptions([
                '-vframes',
                '1',
                '-q:v',
                '5',
                '-vf',
                'scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2',
              ])
              .output(thumbnailPath)
              .on('end', () => {
                ffmpegGenerated++
                generated++
                logThumbnail(`Pre-gen: ${thumbnailFilename} in ${Date.now() - ffStartTime}ms`)
                resolve()
              })
              .on('error', err => {
                logThumbnail(`Pre-gen error: ${thumbnailFilename} - ${err}`)
                resolve()
              })
              .run()
          })
        })
      )

      if (i + batchSize < videoFiles.length) {
        await new Promise(r => setTimeout(r, 100))
      }
    }

    logThumbnail(
      `Pre-generation complete: ${generated} generated (${windowsGenerated} Windows, ${ffmpegGenerated} FFmpeg), ${skipped} skipped`
    )
  } catch (error) {
    logThumbnail(`Pre-generation error: ${error}`)
  }
}

// Watch clips folder for new files and generate thumbnails instantly
// This is the KEY to fast library loading - thumbnails are ready before you open the Library
let clipsWatcher: ReturnType<typeof chokidar.watch> | null = null

function startClipsWatcher() {
  const clipsDir = getClipsPath()
  if (!existsSync(clipsDir)) {
    console.log('[ClipsWatcher] No clips directory yet, will start watcher when it exists')
    return
  }

  if (clipsWatcher) {
    console.log('[ClipsWatcher] Already watching')
    return
  }

  console.log(`[ClipsWatcher] Watching for new clips in: ${clipsDir}`)
  logThumbnail(`Starting clips watcher on: ${clipsDir}`)

  // Track files being written (recording in progress)
  clipsWatcher = chokidar.watch(clipsDir, {
    ignored: /(^|[\/\\])\../, // Ignore hidden files
    persistent: true,
    ignoreInitial: true, // Don't fire for existing files
    awaitWriteFinish: {
      stabilityThreshold: 1000, // Wait 1s for file size to stabilize (recording complete)
      pollInterval: 200,
    },
  })

  clipsWatcher.on('add', async (filePath: string) => {
    // Only process .mp4 files
    if (!filePath.endsWith('.mp4')) return

    const filename = basename(filePath)
    const clipId = filename.replace('.mp4', '')
    const thumbnailFilename = `${clipId}.jpg`
    const thumbnailPath = join(thumbnailsPath, thumbnailFilename)

    // Skip if thumbnail already exists
    if (existsSync(thumbnailPath)) {
      logThumbnail(`[Watcher] Thumbnail already exists: ${thumbnailFilename}`)
      return
    }

    logThumbnail(`[Watcher] New clip detected: ${filename} - generating thumbnail...`)
    const startTime = Date.now()

    try {
      // Make sure thumbnails directory exists
      if (!existsSync(thumbnailsPath)) {
        await mkdir(thumbnailsPath, { recursive: true })
      }

      // Generate thumbnail using optimized FFmpeg
      await new Promise<void>((resolve, reject) => {
        ffmpeg(filePath)
          .inputOptions(['-ss', '0.5']) // Input seeking - fast!
          .outputOptions([
            '-vframes',
            '1',
            '-q:v',
            '5',
            '-vf',
            'scale=480:270:force_original_aspect_ratio=decrease,pad=480:270:(ow-iw)/2:(oh-ih)/2',
          ])
          .output(thumbnailPath)
          .on('end', () => resolve())
          .on('error', err => reject(err))
          .run()
      })

      const duration = Date.now() - startTime
      logThumbnail(`[Watcher] Thumbnail generated: ${thumbnailFilename} in ${duration}ms`)
      console.log(`[ClipsWatcher] ✓ Thumbnail ready: ${thumbnailFilename} (${duration}ms)`)
    } catch (error) {
      logThumbnail(`[Watcher] Failed to generate thumbnail: ${thumbnailFilename} - ${error}`)
      console.error(`[ClipsWatcher] ✗ Failed: ${thumbnailFilename}`, error)
    }
  })

  clipsWatcher.on('error', error => {
    console.error('[ClipsWatcher] Error:', error)
    logThumbnail(`[Watcher] Error: ${error}`)
  })
}

function stopClipsWatcher() {
  if (clipsWatcher) {
    clipsWatcher.close()
    clipsWatcher = null
    console.log('[ClipsWatcher] Stopped')
  }
}

type HttpTextResponse = {
  statusCode: number
  headers: Record<string, string | string[] | undefined>
  body: string
}

type YouTubePrivacy = 'private' | 'unlisted' | 'public'

const encodeFormBody = (params: Record<string, string>): string => {
  return Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

const parseJsonSafe = <T>(raw: string): T | null => {
  if (!raw.trim()) {
    return null
  }

  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

const performHttpRequest = async (
  method: 'GET' | 'POST' | 'PUT',
  urlString: string,
  headers: Record<string, string | number> = {},
  body?: string | Buffer,
  timeoutMs = 60_000
): Promise<HttpTextResponse> => {
  const url = new URL(urlString)

  return await new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        method,
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        headers,
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', chunk => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          })
        })
      }
    )

    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${timeoutMs}ms`))
    })

    if (body) {
      req.write(body)
    }

    req.end()
  })
}

const uploadFileToUrl = async (
  uploadUrl: string,
  filePath: string,
  headers: Record<string, string | number>,
  timeoutMs = 10 * 60_000
): Promise<HttpTextResponse> => {
  const stats = await stat(filePath)
  const url = new URL(uploadUrl)

  return await new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        method: 'PUT',
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        headers: {
          ...headers,
          'Content-Length': stats.size,
        },
      },
      res => {
        const chunks: Buffer[] = []
        res.on('data', chunk => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
        })
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf-8'),
          })
        })
      }
    )

    req.on('error', reject)
    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`Upload timed out after ${timeoutMs}ms`))
    })

    const stream = createReadStream(filePath)
    stream.on('error', error => {
      req.destroy(error)
      reject(error)
    })
    stream.pipe(req)
  })
}

type ShareTemplateContext = {
  clip_name: string
  filename: string
  date: string
  time: string
}

const getShareTemplateContext = (filePath: string): ShareTemplateContext => {
  const filename = basename(filePath)
  const clipName = filename.replace(/\.[^.]+$/, '')
  const now = new Date()

  return {
    clip_name: clipName,
    filename,
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 8),
  }
}

const renderShareTemplate = (template: string, context: ShareTemplateContext): string => {
  if (!template.trim()) {
    return ''
  }

  return template.replace(/\{(clip_name|filename|date|time)\}/g, (_, key: keyof ShareTemplateContext) => {
    return context[key] || ''
  })
}

const isPathWithinRoot = (rootPath: string, candidatePath: string): boolean => {
  const relativePath = relative(resolve(rootPath), resolve(candidatePath))
  return relativePath === '' || (!relativePath.startsWith('..') && !isAbsolute(relativePath))
}

const validateExportSharePath = (
  candidatePath: string
): { valid: true; filePath: string } | { valid: false; error: string } => {
  if (!candidatePath || typeof candidatePath !== 'string') {
    return { valid: false, error: 'Missing share file path.' }
  }

  const resolvedPath = resolve(candidatePath)
  const exportedClipsRoot = resolve(join(getClipsPath(), 'exported-clips'))

  if (!isPathWithinRoot(exportedClipsRoot, resolvedPath)) {
    return {
      valid: false,
      error: 'Invalid share path. Only files in exported-clips can be shared.',
    }
  }

  if (!resolvedPath.toLowerCase().endsWith('.mp4')) {
    return {
      valid: false,
      error: 'Only MP4 exports can be shared.',
    }
  }

  return {
    valid: true,
    filePath: resolvedPath,
  }
}

const isValidDiscordWebhookUrl = (candidate: string): boolean => {
  try {
    const parsed = new URL(candidate)
    const hostname = parsed.hostname.toLowerCase()
    const isDiscordHost =
      hostname === 'discord.com' || hostname === 'discordapp.com' || hostname.endsWith('.discord.com')

    return parsed.protocol === 'https:' && isDiscordHost && parsed.pathname.startsWith('/api/webhooks/')
  } catch {
    return false
  }
}

const getSocialShareConfig = (settings: NormalizedSettings, filePath: string) => {
  const context = getShareTemplateContext(filePath)
  const discordTemplate = settings.social.discord.default_message_template
  const youtubeTemplate = settings.social.youtube.default_title_template

  return {
    context,
    discordConfigured: Boolean(settings.social.discord.webhook_url),
    youtubeConnected: Boolean(settings.social.youtube.refresh_token),
    youtubeChannelTitle: settings.social.youtube.channel_title,
    defaultDiscordMessage: renderShareTemplate(discordTemplate, context),
    defaultYouTubeTitle: renderShareTemplate(youtubeTemplate, context),
    defaultYouTubeDescription: settings.social.youtube.default_description,
    defaultYouTubePrivacy: settings.social.youtube.default_privacy,
    defaultYouTubeTags: settings.social.youtube.default_tags,
  }
}

type DiscordWebhookMessage = {
  id?: string
  channel_id?: string
  attachments?: Array<{ url?: string }>
}

const uploadToDiscord = async (
  webhookUrl: string,
  filePath: string,
  message: string
): Promise<{ messageId?: string; messageUrl?: string; attachmentUrl?: string }> => {
  const url = new URL(webhookUrl)
  url.searchParams.set('wait', 'true')

  const fileName = basename(filePath)
  const fileBuffer = await readFile(filePath)
  const boundary = `----ClipVaultBoundary${Date.now()}`

  const payload = {
    content: message.slice(0, 2000),
  }

  const preamble = Buffer.from(
    `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="payload_json"\r\n\r\n` +
      `${JSON.stringify(payload)}\r\n` +
      `--${boundary}\r\n` +
      `Content-Disposition: form-data; name="files[0]"; filename="${fileName.replace(/"/g, '')}"\r\n` +
      `Content-Type: video/mp4\r\n\r\n`,
    'utf-8'
  )
  const ending = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf-8')
  const body = Buffer.concat([preamble, fileBuffer, ending])

  const response = await performHttpRequest(
    'POST',
    url.toString(),
    {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Content-Length': body.byteLength,
    },
    body
  )

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Discord upload failed (${response.statusCode}): ${response.body}`)
  }

  const payloadResult = parseJsonSafe<DiscordWebhookMessage>(response.body)
  const attachmentUrl = payloadResult?.attachments?.[0]?.url
  const messageId = payloadResult?.id
  const channelId = payloadResult?.channel_id
  const messageUrl =
    messageId && channelId ? `https://discord.com/channels/@me/${channelId}/${messageId}` : undefined

  return {
    messageId,
    messageUrl,
    attachmentUrl,
  }
}

type YouTubeChannelResponse = {
  items?: Array<{
    id?: string
    snippet?: {
      title?: string
    }
  }>
}

type YouTubeTokenResponse = {
  access_token?: string
  expires_in?: number
  refresh_token?: string
  error?: string
  error_description?: string
}

type YouTubeDeviceAuthSession = {
  mode: YouTubeAuthMode
  clientId: string
  clientSecret: string
  expiresAt: number
}

const youtubeDeviceAuthSessions = new Map<string, YouTubeDeviceAuthSession>()

const fetchYouTubeChannel = async (accessToken: string) => {
  const response = await performHttpRequest(
    'GET',
    'https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true',
    {
      Authorization: `Bearer ${accessToken}`,
    }
  )

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Failed to fetch YouTube channel (${response.statusCode})`)
  }

  const payload = parseJsonSafe<YouTubeChannelResponse>(response.body)
  const firstChannel = payload?.items?.[0]

  return {
    channelId: firstChannel?.id || '',
    channelTitle: firstChannel?.snippet?.title || 'Connected account',
  }
}

const refreshYouTubeAccessToken = async (
  settings: NormalizedSettings
): Promise<{ accessToken: string; updatedSettings: NormalizedSettings }> => {
  const credentials = resolveYouTubeCredentials(settings)
  const refreshToken = settings.social.youtube.refresh_token.trim()

  if (!refreshToken) {
    throw new Error('YouTube is not configured. Connect your account in Settings first.')
  }

  const body = encodeFormBody({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  })

  const tokenResponse = await performHttpRequest(
    'POST',
    'https://oauth2.googleapis.com/token',
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
    body
  )

  const tokenPayload = parseJsonSafe<YouTubeTokenResponse>(tokenResponse.body)

  if (tokenResponse.statusCode < 200 || tokenResponse.statusCode >= 300 || !tokenPayload?.access_token) {
    const reason = tokenPayload?.error_description || tokenPayload?.error || tokenResponse.body
    throw new Error(`Failed to refresh YouTube token: ${reason}`)
  }

  const nextSettings = normalizeSettings(settings, true)
  nextSettings.social.youtube.access_token = tokenPayload.access_token
  nextSettings.social.youtube.token_expiry = Date.now() + (tokenPayload.expires_in || 3600) * 1000
  await persistNormalizedSettings(nextSettings)

  return {
    accessToken: tokenPayload.access_token,
    updatedSettings: nextSettings,
  }
}

const ensureYouTubeAccessToken = async (): Promise<{
  accessToken: string
  settings: NormalizedSettings
}> => {
  const settings = await readNormalizedSettings()
  const currentToken = settings.social.youtube.access_token
  const tokenExpiry = settings.social.youtube.token_expiry

  if (currentToken && tokenExpiry > Date.now() + 60_000) {
    return {
      accessToken: currentToken,
      settings,
    }
  }

  const refreshed = await refreshYouTubeAccessToken(settings)
  return {
    accessToken: refreshed.accessToken,
    settings: refreshed.updatedSettings,
  }
}

const uploadToYouTube = async (
  accessToken: string,
  filePath: string,
  details: {
    title: string
    description: string
    privacy: YouTubePrivacy
    tags: string[]
  }
): Promise<{ videoId: string; videoUrl: string }> => {
  const fileStats = await stat(filePath)
  const metadataBody = JSON.stringify({
    snippet: {
      title: details.title.slice(0, 100),
      description: details.description.slice(0, 5000),
      tags: details.tags,
      categoryId: '20',
    },
    status: {
      privacyStatus: details.privacy,
    },
  })

  const initResponse = await performHttpRequest(
    'POST',
    'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',
    {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'Content-Length': Buffer.byteLength(metadataBody),
      'X-Upload-Content-Type': 'video/mp4',
      'X-Upload-Content-Length': fileStats.size,
    },
    metadataBody
  )

  const locationHeader = initResponse.headers.location
  const uploadUrl = Array.isArray(locationHeader) ? locationHeader[0] : locationHeader

  if (initResponse.statusCode < 200 || initResponse.statusCode >= 300 || !uploadUrl) {
    throw new Error(`Failed to initialize YouTube upload (${initResponse.statusCode}): ${initResponse.body}`)
  }

  const uploadResponse = await uploadFileToUrl(uploadUrl, filePath, {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'video/mp4',
  })

  if (uploadResponse.statusCode < 200 || uploadResponse.statusCode >= 300) {
    throw new Error(`Failed to upload to YouTube (${uploadResponse.statusCode}): ${uploadResponse.body}`)
  }

  const uploadPayload = parseJsonSafe<{ id?: string }>(uploadResponse.body)
  if (!uploadPayload?.id) {
    throw new Error('YouTube upload completed but no video ID was returned')
  }

  return {
    videoId: uploadPayload.id,
    videoUrl: `https://www.youtube.com/watch?v=${uploadPayload.id}`,
  }
}

// Keep reference to export preview window
let exportPreviewWindow: BrowserWindow | null = null
let exportPreviewCreationQueue: Promise<void> = Promise.resolve()

// Create export preview window
async function createExportPreviewWindow(filePath: string) {
  const pathValidation = validateExportSharePath(filePath)
  if (!pathValidation.valid) {
    throw new Error(pathValidation.error)
  }

  const safeFilePath = pathValidation.filePath

  // Close existing preview window if open
  if (exportPreviewWindow && !exportPreviewWindow.isDestroyed()) {
    exportPreviewWindow.close()
  }

  const settings = await readNormalizedSettings()
  const shareConfig = getSocialShareConfig(settings, safeFilePath)
  const safeShareConfig = JSON.stringify(shareConfig).replace(/</g, '\\u003c')

  exportPreviewWindow = new BrowserWindow({
    width: 980,
    height: 760,
    alwaysOnTop: true,
    modal: false,
    resizable: true,
    title: 'Export Complete',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: join(__dirname, 'exportPreviewPreload.js'),
    },
  })

  // Remove menu bar from popup
  exportPreviewWindow.setMenu(null)

  // Handle preview window crashes
  exportPreviewWindow.webContents.on('crashed', () => {
    console.error('Preview window crashed')
    exportPreviewWindow?.close()
    exportPreviewWindow = null
  })

  // Convert file path to clipvault protocol URL
  const filename = safeFilePath.split('\\').pop() || ''
  // Use 'exported' protocol for files in exported-clips directory
  const isExported = safeFilePath.includes('exported-clips')
  const videoUrl = `clipvault://${isExported ? 'exported' : 'clip'}/${encodeURIComponent(filename)}`
  const escapedFilePath = safeFilePath
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #1a1a1a; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow-y: auto; }
    video { width: 100%; border-radius: 8px; max-height: 480px; object-fit: contain; background: #000; }
    .drag-hint { text-align: center; padding: 15px; background: #2a2a2a; border-radius: 8px; margin-top: 10px; cursor: grab; user-select: none; }
    .drag-hint:active { cursor: grabbing; }
    .drag-hint h3 { margin: 0 0 8px 0; font-size: 16px; color: #4ade80; }
    .drag-hint p { margin: 0; font-size: 13px; color: #aaa; }
    .file-icon { font-size: 24px; margin-bottom: 8px; }
    .actions { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
    .btn { flex: 1; padding: 10px; background: #3a3a3a; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 13px; transition: background 0.2s ease; }
    .btn:hover { background: #4a4a4a; }
    .btn:disabled { cursor: not-allowed; opacity: 0.6; }
    .btn-primary { background: #4ade80; color: #0f0f0f; }
    .btn-primary:hover { background: #22c55e; }
    .btn-discord { background: #5865F2; }
    .btn-discord:hover { background: #4752c4; }
    .btn-youtube { background: #ff0033; }
    .btn-youtube:hover { background: #cc0029; }
    .share-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 16px; }
    .share-card { border: 1px solid #2f2f2f; border-radius: 10px; padding: 12px; background: #202020; }
    .share-card h4 { margin: 0 0 6px 0; font-size: 14px; }
    .share-card p { margin: 0 0 8px 0; color: #aaa; font-size: 12px; }
    .field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 8px; }
    .field label { font-size: 12px; color: #bcbcbc; }
    .input, .textarea, .select {
      border: 1px solid #3a3a3a;
      background: #171717;
      color: #f0f0f0;
      border-radius: 6px;
      font-size: 13px;
      padding: 8px;
      width: 100%;
    }
    .textarea { min-height: 72px; resize: vertical; }
    .status { margin-top: 8px; font-size: 12px; min-height: 18px; }
    .status.info { color: #9ca3af; }
    .status.success { color: #4ade80; }
    .status.error { color: #fb7185; }
    .status.warn { color: #fbbf24; }
    .status-link { color: #86efac; text-decoration: underline; cursor: pointer; }
    .btn-row { display: flex; gap: 8px; }
    @media (max-width: 900px) {
      .share-grid { grid-template-columns: 1fr; }
    }
  </style>
</head>
<body>
  <video src="${videoUrl}" controls autoplay></video>
  <div class="drag-hint" id="dragHint" draggable="true">
    <div class="file-icon">📹</div>
    <h3>Export Complete!</h3>
    <p>Drag from here to share the file anywhere</p>
  </div>
  <div class="actions">
    <button class="btn" onclick="copyPath(this)">Copy Path</button>
    <button class="btn btn-primary" onclick="openFolder(this)">Open Folder</button>
  </div>
  <div class="share-grid">
    <section class="share-card">
      <h4>Discord</h4>
      <p>Direct upload using your configured webhook.</p>
      <div class="field">
        <label for="discordMessage">Message</label>
        <textarea id="discordMessage" class="textarea" placeholder="Optional message"></textarea>
      </div>
      <button class="btn btn-discord" id="discordShareBtn">Upload to Discord</button>
      <div class="status" id="discordStatus"></div>
    </section>

    <section class="share-card">
      <h4>YouTube</h4>
      <p id="youtubeConnectionText">Upload to your connected YouTube account.</p>
      <div class="field">
        <label for="youtubeTitle">Title</label>
        <input id="youtubeTitle" class="input" maxlength="100" />
      </div>
      <div class="field">
        <label for="youtubeDescription">Description</label>
        <textarea id="youtubeDescription" class="textarea" maxlength="5000"></textarea>
      </div>
      <div class="field">
        <label for="youtubeTags">Tags (comma separated)</label>
        <input id="youtubeTags" class="input" placeholder="clipvault, gaming, highlights" />
      </div>
      <div class="field">
        <label for="youtubePrivacy">Privacy</label>
        <select id="youtubePrivacy" class="select">
          <option value="private">Private</option>
          <option value="unlisted">Unlisted</option>
          <option value="public">Public</option>
        </select>
      </div>
      <button class="btn btn-youtube" id="youtubeShareBtn">Upload to YouTube</button>
      <div class="status" id="youtubeStatus"></div>
    </section>
  </div>
  <script>
    const api = window.exportPreviewAPI;
    const filePath = '${escapedFilePath}';
    const shareConfig = ${safeShareConfig};

    function flashButton(buttonEl, text) {
      if (!buttonEl) return;
      const originalText = buttonEl.textContent;
      buttonEl.textContent = text;
      setTimeout(() => {
        buttonEl.textContent = originalText;
      }, 1500);
    }

    function copyPath(buttonEl) {
      try {
        api.copyPath(filePath);
      } catch {
        if (navigator.clipboard?.writeText) {
          navigator.clipboard.writeText(filePath).catch(() => {});
        }
      }
      flashButton(buttonEl, 'Copied!');
    }

    function setStatus(elementId, text, kind = 'info') {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.className = 'status ' + kind;
      el.textContent = text;
    }

    function setStatusWithLink(elementId, text, url) {
      const el = document.getElementById(elementId);
      if (!el) return;
      el.className = 'status success';
      el.innerHTML = '';
      const textNode = document.createElement('span');
      textNode.textContent = text + ' ';
      const link = document.createElement('a');
      link.textContent = 'Open';
      link.className = 'status-link';
      link.href = '#';
      link.addEventListener('click', (event) => {
        event.preventDefault();
        void api.openExternal(url);
      });
      el.appendChild(textNode);
      el.appendChild(link);
    }

    // Handle drag start - send IPC to main process for native drag
    const dragHint = document.getElementById('dragHint');
    dragHint.addEventListener('dragstart', (e) => {
      e.preventDefault();
      // Send IPC to main process to initiate native drag
      api.startDrag(filePath);
    });

    function openFolder(buttonEl) {
      api.openFolder(filePath);
      flashButton(buttonEl, 'Opened');
    }

    const discordMessageEl = document.getElementById('discordMessage');
    const youtubeTitleEl = document.getElementById('youtubeTitle');
    const youtubeDescriptionEl = document.getElementById('youtubeDescription');
    const youtubeTagsEl = document.getElementById('youtubeTags');
    const youtubePrivacyEl = document.getElementById('youtubePrivacy');
    const discordShareBtn = document.getElementById('discordShareBtn');
    const youtubeShareBtn = document.getElementById('youtubeShareBtn');
    const youtubeConnectionText = document.getElementById('youtubeConnectionText');

    discordMessageEl.value = shareConfig.defaultDiscordMessage || '';
    youtubeTitleEl.value = shareConfig.defaultYouTubeTitle || '';
    youtubeDescriptionEl.value = shareConfig.defaultYouTubeDescription || '';
    youtubeTagsEl.value = (shareConfig.defaultYouTubeTags || []).join(', ');
    youtubePrivacyEl.value = shareConfig.defaultYouTubePrivacy || 'unlisted';

    if (!shareConfig.discordConfigured) {
      discordShareBtn.disabled = true;
      setStatus('discordStatus', 'Configure Discord webhook in Settings > Social Sharing.', 'warn');
    }

    if (!shareConfig.youtubeConnected) {
      youtubeShareBtn.disabled = true;
      if (youtubeConnectionText) {
        youtubeConnectionText.textContent = 'Connect your YouTube account in Settings > Social Sharing.';
      }
      setStatus('youtubeStatus', 'YouTube account not connected.', 'warn');
    } else if (shareConfig.youtubeChannelTitle && youtubeConnectionText) {
      youtubeConnectionText.textContent = 'Connected as: ' + shareConfig.youtubeChannelTitle;
    }

    discordShareBtn?.addEventListener('click', async () => {
      discordShareBtn.disabled = true;
      setStatus('discordStatus', 'Uploading to Discord...', 'info');
      try {
        const result = await api.shareDiscord({
          filePath,
          message: discordMessageEl.value,
        });

        if (result?.success) {
          if (result.attachmentUrl) {
            setStatusWithLink('discordStatus', 'Upload complete.', result.attachmentUrl);
          } else if (result.messageUrl) {
            setStatusWithLink('discordStatus', 'Upload complete.', result.messageUrl);
          } else {
            setStatus('discordStatus', 'Upload complete.', 'success');
          }
        } else {
          setStatus('discordStatus', result?.error || 'Discord upload failed.', 'error');
        }
      } catch (error) {
        setStatus('discordStatus', error?.message || 'Discord upload failed.', 'error');
      } finally {
        discordShareBtn.disabled = !shareConfig.discordConfigured;
      }
    });

    youtubeShareBtn?.addEventListener('click', async () => {
      youtubeShareBtn.disabled = true;
      setStatus('youtubeStatus', 'Uploading to YouTube... this can take a while.', 'info');
      try {
        const tags = youtubeTagsEl.value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean);

        const result = await api.shareYouTube({
          filePath,
          title: youtubeTitleEl.value,
          description: youtubeDescriptionEl.value,
          tags,
          privacy: youtubePrivacyEl.value,
        });

        if (result?.success && result?.videoUrl) {
          setStatusWithLink('youtubeStatus', 'Upload complete.', result.videoUrl);
        } else if (result?.success) {
          setStatus('youtubeStatus', 'Upload complete.', 'success');
        } else {
          setStatus('youtubeStatus', result?.error || 'YouTube upload failed.', 'error');
        }
      } catch (error) {
        setStatus('youtubeStatus', error?.message || 'YouTube upload failed.', 'error');
      } finally {
        youtubeShareBtn.disabled = !shareConfig.youtubeConnected;
      }
    });
  </script>
</body>
</html>`

  exportPreviewWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent))

  exportPreviewWindow.on('closed', () => {
    exportPreviewWindow = null
  })

}

ipcMain.on('export:startDrag', (event, data: unknown) => {
  if (!exportPreviewWindow || event.sender !== exportPreviewWindow.webContents) {
    return
  }

  const filePath = typeof data === 'string' ? data : ''
  const pathValidation = validateExportSharePath(filePath)
  if (!pathValidation.valid) {
    console.warn('Rejected export drag request:', pathValidation.error)
    return
  }

  try {
    let dragIcon: Electron.NativeImage | undefined
    if (existsSync(dragIconPath)) {
      dragIcon = nativeImage.createFromPath(dragIconPath)
    }

    event.sender.startDrag({
      file: pathValidation.filePath,
      icon: dragIcon || nativeImage.createEmpty(),
    })
  } catch (error) {
    console.error('Error starting drag:', error)
  }
})

ipcMain.on('export:openFolder', (event, data: unknown) => {
  if (!exportPreviewWindow || event.sender !== exportPreviewWindow.webContents) {
    return
  }

  const filePath = typeof data === 'string' ? data : ''
  const pathValidation = validateExportSharePath(filePath)
  if (!pathValidation.valid) {
    console.warn('Rejected open-folder request:', pathValidation.error)
    return
  }

  const folderPath = dirname(pathValidation.filePath)
  void shell.openPath(folderPath)
})

ipcMain.handle('system:openExternal', async (_, targetUrl: string) => {
  try {
    await shell.openExternal(targetUrl)
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('social:discord:testWebhook', async (_, webhookUrl: string) => {
  try {
    const sanitizedWebhook = webhookUrl.trim()
    if (!sanitizedWebhook) {
      return { success: false, error: 'Webhook URL is required' }
    }

    if (!isValidDiscordWebhookUrl(sanitizedWebhook)) {
      return {
        success: false,
        error: 'Enter a valid Discord webhook URL (https://discord.com/api/webhooks/...)',
      }
    }

    const url = new URL(sanitizedWebhook)
    url.searchParams.set('wait', 'true')
    const body = JSON.stringify({ content: 'ClipVault test message: webhook connected successfully.' })

    const response = await performHttpRequest(
      'POST',
      url.toString(),
      {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
      body
    )

    if (response.statusCode < 200 || response.statusCode >= 300) {
      return {
        success: false,
        error: `Discord webhook test failed (${response.statusCode}): ${response.body}`,
      }
    }

    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

ipcMain.handle('social:youtube:getProviderInfo', async () => {
  try {
    const settings = await readNormalizedSettings()
    const info = getYouTubeProviderInfo(settings)
    return {
      success: true,
      ...info,
    }
  } catch (error) {
    return {
      success: false,
      error: String(error),
      managedAvailable: false,
      activeMode: 'custom' as const,
      recommendedMode: 'custom' as const,
    }
  }
})

ipcMain.handle(
  'social:youtube:startDeviceAuth',
  async (
    _,
    params: { mode?: YouTubeAuthMode; clientId?: string; clientSecret?: string } = {}
  ) => {
    try {
      const settings = await readNormalizedSettings()
      const credentials = resolveYouTubeCredentials(settings, params.mode, {
        clientId: params.clientId,
        clientSecret: params.clientSecret,
      })

      const body = encodeFormBody({
        client_id: credentials.clientId,
        scope:
          'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
      })

      const response = await performHttpRequest(
        'POST',
        'https://oauth2.googleapis.com/device/code',
        {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        body
      )

      const payload = parseJsonSafe<{
        device_code?: string
        user_code?: string
        verification_uri?: string
        verification_url?: string
        expires_in?: number
        interval?: number
        error?: string
        error_description?: string
      }>(response.body)

      if (response.statusCode < 200 || response.statusCode >= 300 || !payload?.device_code) {
        return {
          success: false,
          error:
            payload?.error_description ||
            payload?.error ||
            `Failed to start YouTube auth (${response.statusCode})`,
        }
      }

      youtubeDeviceAuthSessions.set(payload.device_code, {
        mode: credentials.mode,
        clientId: credentials.clientId,
        clientSecret: credentials.clientSecret,
        expiresAt: Date.now() + (payload.expires_in || 1800) * 1000,
      })

      return {
        success: true,
        mode: credentials.mode,
        deviceCode: payload.device_code,
        userCode: payload.user_code,
        verificationUrl: payload.verification_url || payload.verification_uri || 'https://google.com/device',
        expiresInSeconds: payload.expires_in || 1800,
        intervalSeconds: payload.interval || 5,
      }
    } catch (error) {
      return {
        success: false,
        error: String(error),
      }
    }
  }
)

ipcMain.handle(
  'social:youtube:pollDeviceAuth',
  async (_, params: { deviceCode: string }) => {
    try {
      const deviceCode = params.deviceCode.trim()

      if (!deviceCode) {
        return {
          success: false,
          error: 'Device code is required.',
        }
      }

      const authSession = youtubeDeviceAuthSessions.get(deviceCode)
      if (!authSession) {
        return {
          success: false,
          error: 'YouTube authorization session not found. Start connect again.',
        }
      }

      if (Date.now() > authSession.expiresAt) {
        youtubeDeviceAuthSessions.delete(deviceCode)
        return {
          success: false,
          error: 'YouTube authorization expired. Start connect again.',
        }
      }

      const body = encodeFormBody({
        client_id: authSession.clientId,
        client_secret: authSession.clientSecret,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      })

      const response = await performHttpRequest(
        'POST',
        'https://oauth2.googleapis.com/token',
        {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
        body
      )

      const payload = parseJsonSafe<YouTubeTokenResponse>(response.body)

      if (payload?.error === 'authorization_pending') {
        return { success: false, pending: true }
      }

      if (payload?.error === 'slow_down') {
        return { success: false, pending: true, intervalSeconds: 10 }
      }

      if (payload?.error) {
        youtubeDeviceAuthSessions.delete(deviceCode)
        return {
          success: false,
          error: payload.error_description || payload.error,
        }
      }

      if (!payload?.access_token) {
        youtubeDeviceAuthSessions.delete(deviceCode)
        return {
          success: false,
          error: 'No access token returned from YouTube OAuth.',
        }
      }

      const channel = await fetchYouTubeChannel(payload.access_token)
      const settings = await readNormalizedSettings()
      settings.social.youtube.auth_mode = authSession.mode
      if (authSession.mode === 'custom') {
        settings.social.youtube.client_id = authSession.clientId
        settings.social.youtube.client_secret = authSession.clientSecret
      }
      settings.social.youtube.access_token = payload.access_token
      settings.social.youtube.refresh_token = payload.refresh_token || settings.social.youtube.refresh_token
      settings.social.youtube.token_expiry = Date.now() + (payload.expires_in || 3600) * 1000
      settings.social.youtube.channel_id = channel.channelId
      settings.social.youtube.channel_title = channel.channelTitle

      if (!settings.social.youtube.refresh_token) {
        youtubeDeviceAuthSessions.delete(deviceCode)
        return {
          success: false,
          error: 'No refresh token returned. Revoke ClipVault access in Google Account and try connecting again.',
        }
      }

      await persistNormalizedSettings(settings)
      youtubeDeviceAuthSessions.delete(deviceCode)

      return {
        success: true,
        mode: authSession.mode,
        channelId: channel.channelId,
        channelTitle: channel.channelTitle,
      }
    } catch (error) {
      return {
        success: false,
        error: String(error),
      }
    }
  }
)

ipcMain.handle('social:youtube:disconnect', async () => {
  try {
    youtubeDeviceAuthSessions.clear()
    const settings = await readNormalizedSettings()
    settings.social.youtube.access_token = ''
    settings.social.youtube.refresh_token = ''
    settings.social.youtube.token_expiry = 0
    settings.social.youtube.channel_id = ''
    settings.social.youtube.channel_title = ''
    await persistNormalizedSettings(settings)

    return {
      success: true,
    }
  } catch (error) {
    return {
      success: false,
      error: String(error),
    }
  }
})

ipcMain.handle(
  'social:shareDiscord',
  async (_, params: { filePath: string; message?: string }) => {
    try {
      const pathValidation = validateExportSharePath(params?.filePath)
      if (!pathValidation.valid) {
        return {
          success: false,
          error: pathValidation.error,
        }
      }

      if (!existsSync(pathValidation.filePath)) {
        return {
          success: false,
          error: 'Export file not found.',
        }
      }

      const settings = await readNormalizedSettings()
      const webhookUrl = settings.social.discord.webhook_url
      if (!webhookUrl) {
        return {
          success: false,
          error: 'Discord webhook is not configured. Add it in Settings > Social Sharing.',
        }
      }

      if (!isValidDiscordWebhookUrl(webhookUrl)) {
        return {
          success: false,
          error: 'Configured Discord webhook URL is invalid. Update it in Settings.',
        }
      }

      const context = getShareTemplateContext(pathValidation.filePath)
      const defaultMessage = renderShareTemplate(
        settings.social.discord.default_message_template,
        context
      )
      const finalMessage =
        (typeof params.message === 'string' && params.message.trim()) ||
        defaultMessage ||
        `New clip from ClipVault: ${context.clip_name}`

      const upload = await uploadToDiscord(webhookUrl, pathValidation.filePath, finalMessage)
      return {
        success: true,
        ...upload,
      }
    } catch (error) {
      return {
        success: false,
        error: String(error),
      }
    }
  }
)

ipcMain.handle(
  'social:shareYouTube',
  async (
    _,
    params: {
      filePath: string
      title?: string
      description?: string
      privacy?: YouTubePrivacy
      tags?: string[]
    }
  ) => {
    try {
      const pathValidation = validateExportSharePath(params?.filePath)
      if (!pathValidation.valid) {
        return {
          success: false,
          error: pathValidation.error,
        }
      }

      if (!existsSync(pathValidation.filePath)) {
        return {
          success: false,
          error: 'Export file not found.',
        }
      }

      const { accessToken, settings } = await ensureYouTubeAccessToken()
      const context = getShareTemplateContext(pathValidation.filePath)

      const defaultTitle = renderShareTemplate(settings.social.youtube.default_title_template, context)
      const defaultDescription = settings.social.youtube.default_description
      const rawPrivacy = params.privacy || settings.social.youtube.default_privacy
      const allowedPrivacy: YouTubePrivacy[] = ['private', 'unlisted', 'public']
      const privacy: YouTubePrivacy = allowedPrivacy.includes(rawPrivacy as YouTubePrivacy)
        ? (rawPrivacy as YouTubePrivacy)
        : 'unlisted'

      const tagsInput = Array.isArray(params.tags) ? params.tags : settings.social.youtube.default_tags
      const tags = tagsInput
        .filter((tag): tag is string => typeof tag === 'string')
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, 15)

      const upload = await uploadToYouTube(accessToken, pathValidation.filePath, {
        title: (params.title || defaultTitle || context.clip_name).trim(),
        description: (params.description || defaultDescription || '').trim(),
        privacy,
        tags,
      })

      return {
        success: true,
        videoId: upload.videoId,
        videoUrl: upload.videoUrl,
      }
    } catch (error) {
      return {
        success: false,
        error: String(error),
      }
    }
  }
)

// IPC handler to show export preview
ipcMain.handle('export:showPreview', async (_, filePath: string) => {
  try {
    exportPreviewCreationQueue = exportPreviewCreationQueue
      .catch(() => {
        // Keep queue alive after failures
      })
      .then(async () => {
        await createExportPreviewWindow(filePath)
      })

    await exportPreviewCreationQueue
    return { success: true }
  } catch (error) {
    return { success: false, error: String(error) }
  }
})

type ExtractAudioTracksOptions = {
  forceReextract?: boolean
}

const waitForStableFileSize = async (filePath: string, attempts = 6, delayMs = 250): Promise<void> => {
  let previousSize = -1

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const fileStats = await stat(filePath)
    if (fileStats.size === previousSize) {
      return
    }

    previousSize = fileStats.size
    if (attempt < attempts - 1) {
      await new Promise(resolve => setTimeout(resolve, delayMs))
    }
  }
}

// Extract audio tracks from video file
ipcMain.handle(
  'audio:extractTracks',
  async (_, clipId: string, videoPath: string, options?: ExtractAudioTracksOptions) => {
  try {
    const forceReextract = options?.forceReextract === true

    // Ensure audio cache directory exists
    const audioCachePath = join(thumbnailsPath, 'audio')
    if (!existsSync(audioCachePath)) {
      await mkdir(audioCachePath, { recursive: true })
    }

    const track1Path = join(audioCachePath, `${clipId}_track1.m4a`)
    const track2Path = join(audioCachePath, `${clipId}_track2.m4a`)

    const results: { track1?: string; track2?: string; error?: string } = {}
    const track1Url = `clipvault://audio/${encodeURIComponent(`${clipId}_track1.m4a`)}`
    const track2Url = `clipvault://audio/${encodeURIComponent(`${clipId}_track2.m4a`)}`

    const deleteIfExists = async (filePath: string): Promise<void> => {
      if (existsSync(filePath)) {
        await fsUnlinkAsync(filePath).catch(() => {})
      }
    }

    if (forceReextract) {
      await Promise.all([deleteIfExists(track1Path), deleteIfExists(track2Path)])
    }

    // Check if already cached
    const track1Exists = !forceReextract && existsSync(track1Path)
    const track2Exists = !forceReextract && existsSync(track2Path)

    if (track1Exists) {
      results.track1 = track1Url
    }
    if (track2Exists) {
      results.track2 = track2Url
    }

    if (track1Exists && track2Exists) {
      return results
    }

    // Get video metadata to check audio tracks
    const metadata = await new Promise<ffmpeg.FfprobeData>((resolve, reject) => {
      ffmpeg.ffprobe(videoPath, (err, data) => {
        if (err) reject(err)
        else resolve(data)
      })
    })

    const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio')

    const extractTrack = async (streamIndex: number, outputPath: string): Promise<void> => {
      await waitForStableFileSize(videoPath)
      await deleteIfExists(outputPath)

      await new Promise<void>((resolve, reject) => {
        ffmpeg(videoPath)
          .outputOptions([`-map 0:a:${streamIndex}`, '-vn', '-c:a aac', '-b:a 128k'])
          .save(outputPath)
          .on('end', () => resolve())
          .on('error', err => reject(err))
      })
    }

    if (!track1Exists && audioStreams.length >= 1) {
      await extractTrack(0, track1Path)
      results.track1 = track1Url
    }

    if (!track2Exists && audioStreams.length >= 2) {
      await extractTrack(1, track2Path)
      results.track2 = track2Url
    }

    return results
  } catch (error) {
    console.error('Failed to extract audio tracks:', error)
    return { error: String(error) }
  }
  }
)

// Export clip with trim and audio track selection
ipcMain.handle(
  'editor:exportClip',
  async (
    _,
    params: {
      clipPath: string
      exportFilename: string
      trimStart: number
      trimEnd: number
      audioTrack1: boolean
      audioTrack2: boolean
      audioTrack1Volume?: number
      audioTrack2Volume?: number
      targetSizeMB?: number | 'original'
      exportFps?: number
      exportResolution?: string
    }
  ) => {
    try {
      const {
        clipPath,
        exportFilename,
        trimStart,
        trimEnd,
        audioTrack1,
        audioTrack2,
        audioTrack1Volume,
        audioTrack2Volume,
        targetSizeMB = 'original',
        exportFps,
        exportResolution,
      } = params
      const duration = trimEnd - trimStart
      const vol1 = audioTrack1Volume ?? 1.0
      const vol2 = audioTrack2Volume ?? 1.0

      // Create exported-clips directory if it doesn't exist
      const exportedClipsPath = join(getClipsPath(), 'exported-clips')
      if (!existsSync(exportedClipsPath)) {
        await mkdir(exportedClipsPath, { recursive: true })
      }

      // Build full output path
      const outputPath = join(exportedClipsPath, exportFilename)

      // Calculate video bitrate if target size is specified
      let videoBitrate: number | null = null
      let useTargetSize = false
      if (typeof targetSizeMB === 'number' && targetSizeMB > 0 && duration > 0) {
        // Formula: target_size_mb * 8192 kb / duration_sec - audio_overhead
        // Leave ~15% overhead for container and audio
        const targetSizeKB = targetSizeMB * 8192 * 0.85
        const totalBitrate = Math.floor(targetSizeKB / duration)
        const audioBitrate = 128 // AAC audio bitrate
        videoBitrate = Math.max(totalBitrate - audioBitrate, 500) // Minimum 500kbps
        useTargetSize = true
        console.log(
          `Target size: ${targetSizeMB}MB, Duration: ${duration}s, Video bitrate: ${videoBitrate}kbps`
        )
      }

      const needsReencode = useTargetSize || !!exportFps || !!exportResolution

      return new Promise((resolve, reject) => {
        const command = ffmpeg(clipPath).seekInput(trimStart).duration(duration)

        // Build video filter chain for fps/resolution changes
        const videoFilters: string[] = []
        if (exportResolution) {
          const [w, h] = exportResolution.split('x')
          if (w && h && !isNaN(Number(w)) && !isNaN(Number(h))) {
            videoFilters.push(
              `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2`
            )
          }
        }
        if (exportFps) {
          videoFilters.push(`fps=${exportFps}`)
        }

        const hasVideoFilters = videoFilters.length > 0
        const needsDualAudioMix = audioTrack1 && audioTrack2

        // Configure video encoding
        if (useTargetSize && videoBitrate) {
          command.videoCodec('libx264')
          command.outputOptions([
            '-b:v',
            `${videoBitrate}k`,
            '-maxrate',
            `${Math.floor(videoBitrate * 1.5)}k`,
            '-bufsize',
            `${videoBitrate * 2}k`,
            '-preset',
            'fast',
            '-pix_fmt',
            'yuv420p',
          ])
        } else if (needsReencode) {
          command.videoCodec('libx264')
          command.outputOptions(['-crf', '18', '-preset', 'fast', '-pix_fmt', 'yuv420p'])
        } else {
          command.videoCodec('copy')
        }

        // Map audio tracks — use filter_complex when mixing both tracks,
        // and merge video filters into it to avoid -vf + -filter_complex conflict
        if (needsDualAudioMix) {
          const videoChain = hasVideoFilters ? `[0:v:0]${videoFilters.join(',')}[vout];` : ''
          const videoMap = hasVideoFilters ? '[vout]' : '0:v:0'
          const audioChain = `[0:a:0]volume=${vol1}[a0];[0:a:1]volume=${vol2}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=3[aout]`
          command.outputOptions([
            '-filter_complex',
            `${videoChain}${audioChain}`,
            '-map',
            videoMap,
            '-map',
            '[aout]',
            '-c:a aac',
            '-b:a 128k',
            '-ac 2',
          ])
        } else {
          // Apply video filters via -vf (no conflict with -filter_complex)
          if (hasVideoFilters && needsReencode) {
            command.outputOptions(['-vf', videoFilters.join(',')])
          }

          if (audioTrack1) {
            if (vol1 < 1.0) {
              command.outputOptions(['-map 0:v:0', '-map 0:a:0', '-filter:a:0', `volume=${vol1}`])
            } else {
              command.outputOptions(['-map 0:v:0', '-map 0:a:0'])
            }
          } else if (audioTrack2) {
            if (vol2 < 1.0) {
              command.outputOptions(['-map 0:v:0', '-map 0:a:1', '-filter:a:0', `volume=${vol2}`])
            } else {
              command.outputOptions(['-map 0:v:0', '-map 0:a:1'])
            }
          } else {
            command.noAudio()
          }
        }

        command
          .on('progress', progress => {
            if (mainWindow && progress.percent) {
              mainWindow.webContents.send('export:progress', { percent: progress.percent })
            }
          })
          .on('end', () => {
            resolve({ success: true, filePath: outputPath })
          })
          .on('error', err => {
            console.error('Export error:', err)
            reject(err)
          })
          .save(outputPath)
      })
    } catch (error) {
      console.error('Failed to export clip:', error)
      throw error
    }
  }
)

// Trim clip in place - lossless stream copy, replaces original file
ipcMain.handle(
  'editor:trimInPlace',
  async (_, params: { clipId: string; clipPath: string; trimStart: number; trimEnd: number }) => {
    const { clipId, clipPath, trimStart, trimEnd } = params
    const duration = trimEnd - trimStart

    // Validate clipPath is inside the clips directory (path traversal guard)
    const resolvedClipsDir = resolve(getClipsPath())
    const resolvedClipPath = resolve(clipPath)
    const rel = relative(resolvedClipsDir, resolvedClipPath)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      throw new Error(`Invalid clip path: ${clipPath} is outside clips directory`)
    }

    if (!existsSync(clipPath)) {
      throw new Error(`Clip file not found: ${clipPath}`)
    }
    if (trimStart < 0 || duration <= 0) {
      throw new Error(`Invalid trim range: ${trimStart} - ${trimEnd}`)
    }

    const tempPath = clipPath.replace(/\.mp4$/i, '.trimming.mp4')

    // Remove stale temp file from a previous failed trim
    if (existsSync(tempPath)) {
      await fsUnlinkAsync(tempPath)
    }

    try {
      // Step 1: FFmpeg stream copy to temp file
      await new Promise<void>((resolve, reject) => {
        const command = ffmpeg(clipPath)
          .seekInput(trimStart)
          .duration(duration)
          .outputOptions(['-map 0', '-c copy', '-avoid_negative_ts make_zero'])
          .on('progress', progress => {
            if (mainWindow && progress.percent) {
              mainWindow.webContents.send('trim:progress', { percent: progress.percent })
            }
          })
          .on('end', () => resolve())
          .on('error', err => {
            console.error('Trim error:', err)
            reject(err)
          })
          .save(tempPath)
      })

      // Step 2: Verify temp file exists and has content
      const tempStat = await stat(tempPath)
      if (tempStat.size === 0) {
        throw new Error('Trimmed file is empty')
      }

      // Step 3: Atomic swap via backup - rename original to .bak, rename temp to original
      // Suppress chokidar watcher during rename to avoid spurious clips:removed/clips:new
      const backupPath = clipPath + '.bak'
      // Guard against stale backup from a previous failed trim
      if (existsSync(backupPath)) {
        await fsUnlinkAsync(backupPath)
      }
      suppressFileWatcher = true
      try {
        await rename(clipPath, backupPath)
        try {
          await rename(tempPath, clipPath)
        } catch (renameErr) {
          // Restore backup if rename failed
          await rename(backupPath, clipPath)
          throw renameErr
        }
      } finally {
        suppressFileWatcher = false
      }

      // Post-swap: ffprobe, metadata update, and cache cleanup are non-fatal.
      // The trim file swap already succeeded, so errors here become warnings.
      let newDuration = duration
      let warning: string | undefined

      try {
        // Step 4: ffprobe for actual new duration
        newDuration = await new Promise<number>((res, rej) => {
          ffmpeg.ffprobe(clipPath, (err, metadata) => {
            if (err) {
              rej(err)
              return
            }
            res(metadata.format.duration || duration)
          })
        })

        // Step 5: Update metadata - reset trim markers and playhead
        const metadataDir = join(dirname(clipPath), 'clips-metadata')
        const metadataPath = join(metadataDir, `${clipId}.json`)
        if (existsSync(metadataPath)) {
          const existing: Record<string, unknown> = JSON.parse(
            await readFile(metadataPath, 'utf-8')
          )
          existing.trim = { start: 0, end: newDuration }
          existing.playheadPosition = 0
          existing.lastModified = new Date().toISOString()
          await writeFile(metadataPath, JSON.stringify(existing, null, 2))
        }
      } catch (postSwapErr) {
        console.error(`[Main] Post-swap metadata update failed for ${clipId}:`, postSwapErr)
        warning = `Trim succeeded but metadata update failed: ${postSwapErr}`
      }

      // Step 5b: Remove backup now that swap is complete
      try {
        await fsUnlinkAsync(backupPath)
      } catch {
        console.error(`[Main] Failed to remove backup: ${backupPath}`)
      }

      // Step 6: Delete cached thumbnail and audio tracks so they regenerate
      try {
        const thumbPath = join(thumbnailsPath, `${clipId}.jpg`)
        if (existsSync(thumbPath)) {
          await fsUnlinkAsync(thumbPath)
        }
        const audioCachePath = join(thumbnailsPath, 'audio')
        const track1Path = join(audioCachePath, `${clipId}_track1.m4a`)
        const track2Path = join(audioCachePath, `${clipId}_track2.m4a`)
        if (existsSync(track1Path)) await fsUnlinkAsync(track1Path)
        if (existsSync(track2Path)) await fsUnlinkAsync(track2Path)
      } catch (cacheErr) {
        console.error(`[Main] Failed to clean cached files for ${clipId}:`, cacheErr)
      }

      console.log(`[Main] Trim in place complete: ${clipId}, new duration: ${newDuration}s`)

      // Notify renderer to refresh this clip in the Library
      if (mainWindow) {
        mainWindow.webContents.send('clip:trimmed', { clipId, filename: basename(clipPath) })
      }

      return { success: true, newDuration, warning }
    } catch (error) {
      // Clean up temp file on failure
      if (existsSync(tempPath)) {
        try {
          await fsUnlinkAsync(tempPath)
        } catch {
          // ignore cleanup error
        }
      }
      // Clean up backup file if it exists
      const backupPath = clipPath + '.bak'
      if (existsSync(backupPath)) {
        try {
          // Restore backup if original is missing
          if (!existsSync(clipPath)) {
            await rename(backupPath, clipPath)
          } else {
            await fsUnlinkAsync(backupPath)
          }
        } catch {
          // ignore cleanup error
        }
      }
      console.error('Failed to trim in place:', error)
      throw error
    }
  }
)

// Clean up orphaned cache files (thumbnails/audio for clips that no longer exist)
ipcMain.handle('cleanup:orphans', async () => {
  try {
    console.log('[Main] Cleaning up orphaned cache files...')
    const result = await cleanupOrphanedCache(getClipsPath(), thumbnailsPath)
    return result
  } catch (error) {
    console.error('Failed to cleanup orphans:', error)
    return { deletedCount: 0, errors: [String(error)] }
  }
})

// Get cache storage statistics
ipcMain.handle('cleanup:stats', async () => {
  try {
    const stats = await getCacheStats(thumbnailsPath)
    return {
      ...stats,
      thumbnailSizeFormatted: formatBytes(stats.thumbnailSize),
      audioSizeFormatted: formatBytes(stats.audioSize),
      totalSizeFormatted: formatBytes(stats.totalSize),
    }
  } catch (error) {
    console.error('Failed to get cache stats:', error)
    return null
  }
})

// App lifecycle
app.whenReady().then(async () => {
  console.log('App is ready, creating window...')

  // Register protocol handler FIRST, before creating window
  // This ensures clipvault:// URLs can be loaded immediately when the window opens
  protocol.registerFileProtocol('clipvault', (request, callback) => {
    try {
      console.log('Protocol handler called:', request.url)
      const url = new URL(request.url)
      const host = url.host // "clip" or "thumb"
      const pathname = url.pathname // "/filename.mp4"

      console.log('Parsed URL:', { host, pathname })

      // The URL format is: clipvault://clip/filename.mp4
      // where host = type (clip/thumb), pathname = /filename
      if (!host || !pathname) {
        console.error('Invalid URL format:', { host, pathname })
        callback({ error: -2 }) // net::FAILED
        return
      }

      const type = host
      const encodedFilename = pathname.substring(1) // Remove leading /
      const filename = decodeURIComponent(encodedFilename)

      console.log('Processing file:', { type, filename })

      // Determine the base path based on the type
      let basePath: string
      if (type === 'clip') {
        basePath = getClipsPath()
      } else if (type === 'thumb') {
        basePath = thumbnailsPath
      } else if (type === 'audio') {
        basePath = join(thumbnailsPath, 'audio')
      } else if (type === 'exported') {
        basePath = join(getClipsPath(), 'exported-clips')
      } else {
        console.error('Unknown resource type:', type)
        callback({ error: -2 })
        return
      }

      // Build the full file path
      const filePath = join(basePath, filename)
      console.log('Full file path:', filePath)

      // Check if file exists
      if (!existsSync(filePath)) {
        console.error('File not found:', filePath)
        callback({ error: -6 }) // net::ERR_FILE_NOT_FOUND
        return
      }

      // registerFileProtocol automatically handles byte-range requests for video seeking
      callback({ path: filePath })
    } catch (error) {
      console.error('Protocol handler error:', error)
      callback({ error: -2 })
    }
  })

  // Create tray icon (only if not in startup mode)
  if (!isStartupMode) {
    createTray()
  } else {
    console.log('[Main] Startup mode: Creating minimal tray icon only')
    createTray()
  }

  // Create the main window (skip in startup mode)
  if (isStartupMode) {
    console.log('[Main] Startup mode: Skipping UI window, running in background')
  } else {
    await createWindow().catch(err => {
      console.error('Failed to create window:', err)
    })
  }

  // Start the backend
  console.log('Attempting to start backend...')
  startBackend()

  try {
    await ensureClipsDirectory()
  } catch (error) {
    console.error('Failed to ensure clips directory:', error)
  }

  // Clean up orphaned cache files on startup
  setTimeout(async () => {
    try {
      console.log('[Main] Running orphaned cache cleanup on startup...')
      const result = await cleanupOrphanedCache(getClipsPath(), thumbnailsPath)
      if (result.deletedCount > 0) {
        console.log(`[Main] Cleaned up ${result.deletedCount} orphaned cache files`)
      }
      if (result.errors.length > 0) {
        console.warn('[Main] Cleanup errors:', result.errors)
      }

      // Pre-generate thumbnails in background
      preGenerateThumbnails()

      // Start watching for new clips - generates thumbnails INSTANTLY when clips are saved
      // This is what Medal, SteelSeries, etc. do - thumbnails are ready before you open Library
      startClipsWatcher()

      // Clean up old .clipvault.json files from clips folder (move to clips-metadata)
      console.log('[Main] Migrating old metadata files to clips-metadata folder...')
      try {
        const clipsDir = getClipsPath()
        if (existsSync(clipsDir)) {
          const files = await readdir(clipsDir)
          const oldMetadataFiles = files.filter(f => f.endsWith('.clipvault.json'))

          for (const oldFile of oldMetadataFiles) {
            const oldPath = join(clipsDir, oldFile)
            const clipId = oldFile.replace('.clipvault.json', '')

            // Read old content
            try {
              const content = await readFile(oldPath, 'utf-8')
              const metadata = JSON.parse(content)

              // Check if new location already has data
              const newPath = join(clipsDir, 'clips-metadata', `${clipId}.json`)
              let existingData = null
              if (existsSync(newPath)) {
                existingData = JSON.parse(await readFile(newPath, 'utf-8'))
              }

              // Merge: old data takes precedence
              const mergedData = { ...existingData, ...metadata }

              // Write to new location
              const metadataDir = join(clipsDir, 'clips-metadata')
              if (!existsSync(metadataDir)) {
                await mkdir(metadataDir, { recursive: true })
              }
              await writeFile(newPath, JSON.stringify(mergedData, null, 2), 'utf-8')

              // Delete old file
              await fsUnlinkAsync(oldPath)
              console.log(`[Main] Migrated ${oldFile} -> clips-metadata/${clipId}.json`)
            } catch (e) {
              console.error(`[Main] Failed to migrate ${oldFile}:`, e)
            }
          }
          if (oldMetadataFiles.length > 0) {
            console.log(`[Main] Migrated ${oldMetadataFiles.length} metadata files`)
          }
        }
      } catch (e) {
        console.error('[Main] Failed to migrate old metadata files:', e)
      }
    } catch (error) {
      console.error('[Main] Failed to run startup cleanup:', error)
    }
  }, 5000) // Wait 5 seconds after startup to let backend initialize

  // Verify backend started after a short delay
  setTimeout(() => {
    try {
      const { backendLogPath } = getBackendPaths()
      const checkOutput = execSync('tasklist /NH /FO CSV /FI "IMAGENAME eq ClipVault.exe"', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'ignore'],
      })
      const isRunning = checkOutput.includes('ClipVault.exe')
      console.log('Backend verification after spawn:', isRunning ? 'running' : 'not running')

      // Check if log file was created
      if (existsSync(backendLogPath)) {
        console.log('Backend log file exists:', backendLogPath)
      } else {
        console.warn('Backend log file not found - spawn may have failed silently')
      }
    } catch (e) {
      console.log('Could not verify backend status:', e)
    }
  }, 2000)

  // Set up file watching for clips folder to auto-refresh UI
  const clipsWatcher = chokidar.watch(getClipsPath(), {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    depth: 0, // Only watch immediate directory, not subdirectories
    ignoreInitial: true, // Don't fire events for existing files on startup
    awaitWriteFinish: {
      stabilityThreshold: 500, // Wait 500ms after file size stops changing
      pollInterval: 100,
    },
  })

  clipsWatcher.on('add', filePath => {
    // Only notify for .mp4 files; skip during trim-in-place swap
    if (filePath.endsWith('.mp4') && !suppressFileWatcher) {
      console.log('[Watcher] New clip detected:', filePath)
      // Notify all windows that a new clip is available
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('clips:new', { filename: basename(filePath) })
      })
    }
  })

  clipsWatcher.on('unlink', filePath => {
    // Notify when a clip is deleted; skip during trim-in-place swap
    if (filePath.endsWith('.mp4') && !suppressFileWatcher) {
      console.log('[Watcher] Clip deleted:', filePath)
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('clips:removed', { filename: basename(filePath) })
      })
    }
  })

  clipsWatcher.on('error', error => {
    console.error('[Watcher] Error watching clips folder:', error)
  })

  console.log('[Watcher] Started watching clips folder:', getClipsPath())

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // Don't quit on macOS when all windows are closed
  if (process.platform !== 'darwin') {
    // Only quit if there's no tray
    if (!tray) {
      app.quit()
    }
  }
})

// Handle app quit
app.on('before-quit', _event => {
  console.log('App is quitting...')
  isQuitting = true
  saveWindowStateImmediate()
  stopClipsWatcher()
  if (tray) {
    tray.destroy()
    tray = null
  }
})

// Set app as quitting when user chooses Exit from tray
app.on('will-quit', () => {
  isQuitting = true
})
