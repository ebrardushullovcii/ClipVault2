import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFile, writeFile, readdir, stat, mkdir } from 'fs/promises'
import { existsSync } from 'fs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Keep references to prevent garbage collection
let mainWindow: BrowserWindow | null = null

// App configuration
const isDev = process.env.NODE_ENV === 'development'
const clipsPath = 'D:\\Clips\\ClipVault'

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 600,
    title: 'ClipVault Editor',
    backgroundColor: '#0f0f0f',
    show: false, // Show when ready
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    },
    titleBarStyle: 'hiddenInset', // Modern look on macOS
    ...(process.platform === 'win32' ? {
      titleBarOverlay: {
        color: '#0f0f0f',
        symbolColor: '#ffffff'
      }
    } : {})
  })

  // Load the app
  if (isDev) {
    await mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// IPC Handlers

// Get list of clips
ipcMain.handle('clips:getList', async () => {
  try {
    if (!existsSync(clipsPath)) {
      await mkdir(clipsPath, { recursive: true })
      return []
    }

    const files = await readdir(clipsPath)
    const clips = await Promise.all(
      files
        .filter(file => file.endsWith('.mp4'))
        .map(async (filename) => {
          const filePath = join(clipsPath, filename)
          const stats = await stat(filePath)
          const metadataPath = filePath.replace('.mp4', '.clipvault.json')
          
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
            metadata
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
    const metadataPath = join(clipsPath, `${clipId}.clipvault.json`)
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
    const metadataPath = join(clipsPath, `${clipId}.clipvault.json`)
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

// Open clips folder in file explorer
ipcMain.handle('system:openFolder', async () => {
  await shell.openPath(clipsPath)
})

// Show save dialog
ipcMain.handle('dialog:save', async (_, options) => {
  if (!mainWindow) return null
  const result = await dialog.showSaveDialog(mainWindow, options)
  return result
})

// App lifecycle
app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
