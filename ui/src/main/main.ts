import { app, BrowserWindow, ipcMain, dialog, shell, protocol, Menu, nativeImage, Tray, Rectangle, screen } from 'electron'
import { dirname, join, basename } from 'path'
import { readFile, writeFile, readdir, stat, mkdir, unlink as fsUnlinkAsync } from 'fs/promises'
import { unlink } from 'fs'
import { unlink as fsUnlink } from 'fs'
import { existsSync, createReadStream, readFileSync, createWriteStream } from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import { spawn, execSync } from 'child_process'
import { cleanupOrphanedCache, getCacheStats, formatBytes } from './cleanup'
import chokidar from 'chokidar'

// Get the directory containing the main script
const appPath = process.argv[1] || process.cwd()
const appDir = dirname(appPath)

// Path to drag icon for file drag operations (64x64 PNG)
// Try multiple locations for dev vs production
const dragIconPaths = [
  join(appDir, '..', '..', '..', '64x64.png'), // Dev mode
  join(process.resourcesPath, '64x64.png'),    // Production - resources folder
  join(process.resourcesPath, 'app.asar', '64x64.png'), // Production - inside asar
  join(app.getAppPath(), '64x64.png'),         // Alternative production path
]

const dragIconPath = dragIconPaths.find(p => existsSync(p)) || dragIconPaths[0]

// Disable hardware acceleration to prevent GPU crashes
app.disableHardwareAcceleration()

// Handle uncaught errors to prevent crashes
process.on('uncaughtException', (error) => {
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
let backendProcess: ReturnType<typeof spawn> | null = null

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

    backendProc.stdout.on('data', (data) => {
      const text = data.toString().trim()
      if (text) {
        logStream.write(`[STDOUT] ${text}\n`)
      }
    })

    backendProc.stderr.on('data', (data) => {
      const text = data.toString().trim()
      if (text) {
        logStream.write(`[STDERR] ${text}\n`)
        console.error('[Backend stderr]', text)
      }
    })

    backendProc.on('error', (error) => {
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
        stdio: 'ignore' 
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

// Default clips path (fallback if not in settings)
const DEFAULT_CLIPS_PATH = 'D:\\Clips\\ClipVault'

// Get clips path from settings file
function getClipsPath(): string {
  try {
    const settingsPath = getSettingsPath()
    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8')
      const settings = JSON.parse(content)
      if (settings.output_path && typeof settings.output_path === 'string') {
        return settings.output_path
      }
    }
  } catch (error) {
    console.error('Failed to read clips path from settings:', error)
  }
  return DEFAULT_CLIPS_PATH
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

console.log('Config:', { clipsPath: getClipsPath(), thumbnailsPath, userData: app.getPath('userData') })

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
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open ClipVault',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    },
    {
      label: 'Open Clips Folder',
      click: async () => {
        const clipsFolder = getClipsPath()
        if (!existsSync(clipsFolder)) {
          await mkdir(clipsFolder, { recursive: true })
        }
        await shell.openPath(clipsFolder)
      }
    },
    { type: 'separator' },
    {
      label: 'Exit',
      click: () => {
        app.quit()
      }
    }
  ]))

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
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'ClipVault Editor',
    backgroundColor: '#0f0f0f',
    show: true, // Show immediately with background color
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

  // Load the app
  try {
    if (isDev) {
      await mainWindow.loadURL('http://localhost:5173')
      console.log('Loaded dev URL, opening devtools...')
      mainWindow.webContents.openDevTools()
    } else {
      await mainWindow.loadFile(isDev
        ? join(appDir, '..', 'renderer', 'index.html')
        : join(process.resourcesPath, 'app.asar', 'dist', 'renderer', 'index.html'))
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
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      console.log('Minimizing to tray instead of closing')
      mainWindow?.hide()
    }
  })

  mainWindow.on('page-title-updated', (event) => {
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

// Settings file path - use standard AppData location (same as C++ backend)
const getSettingsPath = () => {
  // Use process.env.APPDATA to match C++ backend's CSIDL_APPDATA
  // This ensures both backend and UI use exact same path
  const appDataPath = process.env.APPDATA || app.getPath('appData')
  return join(appDataPath, 'ClipVault', 'settings.json')
}

// Default settings object
const defaultSettings = {
  output_path: 'D:\\Clips\\ClipVault',
  buffer_seconds: 120,
  video: {
    width: 1920,
    height: 1080,
    fps: 60,
    encoder: 'auto',
    quality: 20,
  },
  audio: {
    sample_rate: 48000,
    bitrate: 160,
    system_audio_enabled: true,
    microphone_enabled: true,
  },
  hotkey: {
    save_clip: 'F9',
  },
  ui: {
    show_notifications: true,
    minimize_to_tray: true,
    start_with_windows: false,
  },
}

// Get settings
ipcMain.handle('settings:get', async () => {
  try {
    const settingsPath = getSettingsPath()
    console.log('Settings path:', settingsPath)
    
    if (!existsSync(settingsPath)) {
      console.log('Settings file not found, returning defaults')
      return defaultSettings
    }
    
    console.log('Reading settings from:', settingsPath)
    const content = await readFile(settingsPath, 'utf-8')
    
    try {
      return JSON.parse(content)
    } catch (parseError) {
      console.error('JSON parse error, returning defaults:', parseError)
      return defaultSettings
    }
  } catch (error) {
    console.error('Failed to read settings:', error)
    return defaultSettings
  }
})

// Save settings and restart backend
ipcMain.handle('settings:save', async (_, settings: unknown) => {
  try {
    const settingsPath = getSettingsPath()
    const configDir = join(app.getPath('appData'), 'ClipVault')
    
    // Ensure config directory exists
    if (!existsSync(configDir)) {
      await mkdir(configDir, { recursive: true })
    }
    
    await writeFile(settingsPath, JSON.stringify(settings, null, 2), 'utf-8')
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

    const files = await readdir(getClipsPath())
    const clips = await Promise.all(
      files
        .filter(file => file.endsWith('.mp4'))
        .map(async filename => {
          const filePath = join(getClipsPath(), filename)
          const stats = await stat(filePath)
          const metadataPath = join(metadataDir, `${filename.replace('.mp4', '')}.json`)

          let metadata = null
          try {
            if (existsSync(metadataPath)) {
              const content = await readFile(metadataPath, 'utf-8')
              metadata = JSON.parse(content)
            }
          } catch (e) {
            console.error('Failed to read metadata:', e)
          }

          return {
            id: filename.replace('.mp4', ''),
            filename,
            path: filePath,
            size: stats.size,
            createdAt: stats.birthtime.toISOString(),
            modifiedAt: stats.mtime.toISOString(),
            metadata,
          }
        })
    )

    return clips.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  } catch (error) {
    console.error('Failed to get clips list:', error)
    throw error
  }
})

// Save clip metadata
ipcMain.handle('clips:saveMetadata', async (_, clipId: string, metadata: unknown) => {
  try {
    const metadataDir = join(getClipsPath(), 'clips-metadata')
    if (!existsSync(metadataDir)) {
      await mkdir(metadataDir, { recursive: true })
    }
    const metadataPath = join(metadataDir, `${clipId}.json`)
    await writeFile(metadataPath, JSON.stringify(metadata, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to save metadata:', error)
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
    return JSON.parse(content)
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
    const existingContent = existsSync(statePath) ? JSON.parse(await readFile(statePath, 'utf-8')) : {}
    const existingObj = typeof existingContent === 'object' && existingContent !== null ? existingContent : {}
    const stateObj = typeof state === 'object' && state !== null ? state : {}
    const mergedState = { ...existingObj, ...stateObj } as Record<string, unknown>
    await writeFile(statePath, JSON.stringify(mergedState, null, 2), 'utf-8')
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
    return JSON.parse(content)
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
    title: 'Select Clips Folder'
  })
  return result
})

// Show save dialog
ipcMain.handle('dialog:save', async (_, options) => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, options)
  return result
})

// Generate thumbnail for a clip
ipcMain.handle('clips:generateThumbnail', async (_, clipId: string, videoPath: string) => {
  try {
    // Ensure thumbnails directory exists
    if (!existsSync(thumbnailsPath)) {
      await mkdir(thumbnailsPath, { recursive: true })
    }

    const thumbnailFilename = `${clipId}.jpg`
    const thumbnailPath = join(thumbnailsPath, thumbnailFilename)

    // Check if thumbnail already exists
    if (existsSync(thumbnailPath)) {
      return `clipvault://thumb/${encodeURIComponent(thumbnailFilename)}`
    }

    // Generate thumbnail using FFmpeg
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .screenshots({
          timestamps: ['10%'], // Take screenshot at 10% into the video
          filename: thumbnailFilename,
          folder: thumbnailsPath,
          size: '480x270', // 16:9 aspect ratio thumbnail
        })
        .on('end', () => {
          resolve(`clipvault://thumb/${encodeURIComponent(thumbnailFilename)}`)
        })
        .on('error', err => {
          console.error('FFmpeg error:', err)
          reject(err)
        })
    })
  } catch (error) {
    console.error('Failed to generate thumbnail:', error)
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

 // Keep reference to export preview window
let exportPreviewWindow: BrowserWindow | null = null

// Create export preview window
function createExportPreviewWindow(filePath: string) {
  // Close existing preview window if open
  if (exportPreviewWindow && !exportPreviewWindow.isDestroyed()) {
    exportPreviewWindow.close()
  }

  exportPreviewWindow = new BrowserWindow({
    width: 600,
    height: 500,
    alwaysOnTop: true,
    modal: false,
    resizable: false,
    title: 'Export Complete',
    backgroundColor: '#1a1a1a',
    webPreferences: {
      contextIsolation: false,
      nodeIntegration: true,
      webSecurity: false,
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
  const filename = filePath.split('\\').pop() || ''
  // Use 'exported' protocol for files in exported-clips directory
  const isExported = filePath.includes('exported-clips')
  const videoUrl = `clipvault://${isExported ? 'exported' : 'clip'}/${encodeURIComponent(filename)}`

  const htmlContent = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #1a1a1a; color: white; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; overflow: hidden; }
    video { width: 100%; border-radius: 8px; max-height: 320px; object-fit: contain; background: #000; }
    .drag-hint { text-align: center; padding: 15px; background: #2a2a2a; border-radius: 8px; margin-top: 10px; cursor: grab; user-select: none; }
    .drag-hint:active { cursor: grabbing; }
    .drag-hint h3 { margin: 0 0 8px 0; font-size: 16px; color: #4ade80; }
    .drag-hint p { margin: 0; font-size: 13px; color: #aaa; }
    .timer { position: absolute; top: 10px; right: 10px; font-size: 12px; color: #666; }
    .file-icon { font-size: 24px; margin-bottom: 8px; }
    .actions { display: flex; gap: 10px; margin-top: 10px; }
    .btn { flex: 1; padding: 10px; background: #3a3a3a; border: none; border-radius: 6px; color: white; cursor: pointer; font-size: 13px; }
    .btn:hover { background: #4a4a4a; }
    .btn-primary { background: #4ade80; color: #0f0f0f; }
    .btn-primary:hover { background: #22c55e; }
  </style>
</head>
<body>
  <div class="timer" id="timer">Closing in 30s</div>
  <video src="${videoUrl}" controls autoplay></video>
  <div class="drag-hint" id="dragHint" draggable="true">
    <div class="file-icon">📹</div>
    <h3>Export Complete!</h3>
    <p>Drag from here to share the file anywhere</p>
  </div>
  <div class="actions">
    <button class="btn" onclick="copyPath()">Copy Path</button>
    <button class="btn btn-primary" onclick="openFolder()">Open Folder</button>
  </div>
  <script>
    const { ipcRenderer } = require('electron');
    const filePath = '${filePath.replace(/\\/g, '\\\\')}';
    let timeLeft = 30;
    const timerEl = document.getElementById('timer');
    const interval = setInterval(() => {
      timeLeft--;
      timerEl.textContent = 'Closing in ' + timeLeft + 's';
      if (timeLeft <= 0) {
        clearInterval(interval);
        window.close();
      }
    }, 1000);
    
    // Handle drag start - send IPC to main process for native drag
    const dragHint = document.getElementById('dragHint');
    dragHint.addEventListener('dragstart', (e) => {
      e.preventDefault();
      // Send IPC to main process to initiate native drag
      ipcRenderer.send('export:startDrag', filePath);
    });
    
    function copyPath() {
      navigator.clipboard.writeText(filePath);
      const btn = event.target;
      const originalText = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = originalText, 1500);
    }
    
    function openFolder() {
      ipcRenderer.send('export:openFolder', filePath);
    }
  </script>
</body>
</html>`

  exportPreviewWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent))

  // Auto-close after 30 seconds
  const autoCloseTimeout = setTimeout(() => {
    if (exportPreviewWindow && !exportPreviewWindow.isDestroyed()) {
      exportPreviewWindow.close()
    }
  }, 30000)

  exportPreviewWindow.on('closed', () => {
    clearTimeout(autoCloseTimeout)
    exportPreviewWindow = null
  })

  // Handle drag start - use native startDrag API for external file drops
  exportPreviewWindow.webContents.on('ipc-message', (event, channel, data) => {
    if (channel === 'export:startDrag') {
      console.log('Starting native drag for:', data)
      try {
        // Create nativeImage from the icon file
        let dragIcon: Electron.NativeImage | undefined
        if (existsSync(dragIconPath)) {
          dragIcon = nativeImage.createFromPath(dragIconPath)
          console.log('Drag icon loaded from:', dragIconPath)
        } else {
          console.warn('Drag icon not found at:', dragIconPath)
        }
        
        // Use webContents.startDrag for native file drag (required for external apps like Discord)
        exportPreviewWindow?.webContents.startDrag({
          file: data as string,
          icon: dragIcon || nativeImage.createEmpty()
        })
      } catch (error) {
        console.error('Error starting drag:', error)
      }
    } else if (channel === 'export:openFolder') {
      // Open the folder containing the exported file
      const folderPath = dirname(data as string)
      shell.openPath(folderPath)
    }
  })
}

// IPC handler to show export preview
ipcMain.handle('export:showPreview', async (_, filePath: string) => {
  createExportPreviewWindow(filePath)
  return { success: true }
})

  // Extract audio tracks from video file
   ipcMain.handle('audio:extractTracks', async (_, clipId: string, videoPath: string) => {
     try {
       // Ensure audio cache directory exists
       const audioCachePath = join(thumbnailsPath, 'audio')
       if (!existsSync(audioCachePath)) {
         await mkdir(audioCachePath, { recursive: true })
       }

       const track1Path = join(audioCachePath, `${clipId}_track1.m4a`)
       const track2Path = join(audioCachePath, `${clipId}_track2.m4a`)

       const results: { track1?: string; track2?: string; error?: string } = {}

       // Check if already cached
       const track1Exists = existsSync(track1Path)
       const track2Exists = existsSync(track2Path)

       if (track1Exists) {
         results.track1 = `clipvault://audio/${encodeURIComponent(`${clipId}_track1.m4a`)}`
       }
       if (track2Exists) {
         results.track2 = `clipvault://audio/${encodeURIComponent(`${clipId}_track2.m4a`)}`
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

       // Extract track 1 if not cached and exists
       if (!track1Exists && audioStreams.length >= 1) {
         await new Promise<void>((resolve, reject) => {
           ffmpeg(videoPath)
             .outputOptions(['-map 0:a:0', '-c:a aac', '-b:a 128k'])
             .save(track1Path)
             .on('end', () => resolve())
             .on('error', err => reject(err))
         })
         results.track1 = `clipvault://audio/${encodeURIComponent(`${clipId}_track1.m4a`)}`
       }

       // Extract track 2 if not cached and exists
       if (!track2Exists && audioStreams.length >= 2) {
         await new Promise<void>((resolve, reject) => {
           ffmpeg(videoPath)
             .outputOptions(['-map 0:a:1', '-c:a aac', '-b:a 128k'])
             .save(track2Path)
             .on('end', () => resolve())
             .on('error', err => reject(err))
         })
         results.track2 = `clipvault://audio/${encodeURIComponent(`${clipId}_track2.m4a`)}`
       }

       return results
     } catch (error) {
       console.error('Failed to extract audio tracks:', error)
       return { error: String(error) }
     }
   })

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
        }
      ) => {
        try {
          const { clipPath, exportFilename, trimStart, trimEnd, audioTrack1, audioTrack2, audioTrack1Volume, audioTrack2Volume, targetSizeMB = 'original' } = params
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
            console.log(`Target size: ${targetSizeMB}MB, Duration: ${duration}s, Video bitrate: ${videoBitrate}kbps`)
          }

          return new Promise((resolve, reject) => {
            const command = ffmpeg(clipPath)
              .seekInput(trimStart)
              .duration(duration)

            // Configure video encoding based on target size
            if (useTargetSize && videoBitrate) {
              // Use H.264 with target bitrate for size-constrained export
              // Note: Don't use -crf with -b:v - they conflict (CRF overrides bitrate)
              command.videoCodec('libx264')
              command.outputOptions([
                '-b:v', `${videoBitrate}k`,
                '-maxrate', `${Math.floor(videoBitrate * 1.5)}k`,
                '-bufsize', `${videoBitrate * 2}k`,
                '-preset', 'fast',
                '-pix_fmt', 'yuv420p'
              ])
            } else {
              // Original quality - just copy video stream
              command.videoCodec('copy')
            }

            // Map audio tracks based on options
            if (audioTrack1 && audioTrack2) {
              // Mix both tracks with volume adjustment
              const filter = `[0:a:0]volume=${vol1}[a0];[0:a:1]volume=${vol2}[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=3[aout]`
              command.outputOptions([
                '-map 0:v:0',
                '-filter_complex', filter,
                '-map', '[aout]',
                '-c:a aac',
                '-b:a 128k',
                '-ac 2'
              ])
            } else if (audioTrack1) {
              // Only track 1 with volume
              if (vol1 < 1.0) {
                command.outputOptions([
                  '-map 0:v:0',
                  '-map 0:a:0',
                  '-filter:a:0', `volume=${vol1}`
                ])
              } else {
                command.outputOptions(['-map 0:v:0', '-map 0:a:0'])
              }
            } else if (audioTrack2) {
              // Only track 2 with volume
              if (vol2 < 1.0) {
                command.outputOptions([
                  '-map 0:v:0',
                  '-map 0:a:1',
                  '-filter:a:0', `volume=${vol2}`
                ])
              } else {
                command.outputOptions(['-map 0:v:0', '-map 0:a:1'])
              }
            } else {
              // No audio - video only
              command.noAudio()
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
          totalSizeFormatted: formatBytes(stats.totalSize)
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
      const checkOutput = execSync(
        'tasklist /NH /FO CSV /FI "IMAGENAME eq ClipVault.exe"',
        { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
      )
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
      pollInterval: 100
    }
  })

  clipsWatcher.on('add', (filePath) => {
    // Only notify for .mp4 files
    if (filePath.endsWith('.mp4')) {
      console.log('[Watcher] New clip detected:', filePath)
      // Notify all windows that a new clip is available
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('clips:new', { filename: basename(filePath) })
      })
    }
  })

  clipsWatcher.on('unlink', (filePath) => {
    // Notify when a clip is deleted
    if (filePath.endsWith('.mp4')) {
      console.log('[Watcher] Clip deleted:', filePath)
      BrowserWindow.getAllWindows().forEach(window => {
        window.webContents.send('clips:removed', { filename: basename(filePath) })
      })
    }
  })

  clipsWatcher.on('error', (error) => {
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
app.on('before-quit', (event) => {
  console.log('App is quitting...')
  isQuitting = true
  if (tray) {
    tray.destroy()
    tray = null
  }
})

// Set app as quitting when user chooses Exit from tray
app.on('will-quit', () => {
  isQuitting = true
})
