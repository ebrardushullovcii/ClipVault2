import { app, BrowserWindow, ipcMain, dialog, shell, protocol, Menu, nativeImage } from 'electron'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { readFile, writeFile, readdir, stat, mkdir } from 'fs/promises'
import { existsSync, createReadStream } from 'fs'
import ffmpeg from 'fluent-ffmpeg'
import { extname } from 'path'

const __filename = fileURLToPath(import.meta.url)

// Path to drag icon for file drag operations (64x64 PNG in project root)
const dragIconPath = join(dirname(dirname(dirname(dirname(__filename)))), '64x64.png')
const __dirname = dirname(__filename)

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

// App configuration
const isDev = process.env.NODE_ENV === 'development'
const clipsPath = 'D:\\Clips\\ClipVault'
const thumbnailsPath = join(app.getPath('userData'), 'thumbnails')

console.log('Config:', { clipsPath, thumbnailsPath, userData: app.getPath('userData') })

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

async function createWindow() {
  console.log('Creating main window...')
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
      await mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
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
        .map(async filename => {
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
    const filePath = join(clipsPath, filename)
    
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
       }
     ) => {
       try {
         const { clipPath, exportFilename, trimStart, trimEnd, audioTrack1, audioTrack2, audioTrack1Volume, audioTrack2Volume } = params
         const duration = trimEnd - trimStart
         const vol1 = audioTrack1Volume ?? 1.0
         const vol2 = audioTrack2Volume ?? 1.0

         // Create exported-clips directory if it doesn't exist
         const exportedClipsPath = join(clipsPath, 'exported-clips')
         if (!existsSync(exportedClipsPath)) {
           await mkdir(exportedClipsPath, { recursive: true })
         }

         // Build full output path
         const outputPath = join(exportedClipsPath, exportFilename)

         return new Promise((resolve, reject) => {
           const command = ffmpeg(clipPath)
             .seekInput(trimStart)
             .duration(duration)
             .videoCodec('copy')

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

// App lifecycle
app.whenReady().then(() => {
  console.log('App is ready, creating window...')
  createWindow().catch(err => {
    console.error('Failed to create window:', err)
  })

  // Register protocol handler for clipvault:// URLs using registerFileProtocol
  // This is more stable for video streaming with proper byte-range support
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
        basePath = clipsPath
      } else if (type === 'thumb') {
        basePath = thumbnailsPath
      } else if (type === 'audio') {
        basePath = join(thumbnailsPath, 'audio')
      } else if (type === 'exported') {
        basePath = join(clipsPath, 'exported-clips')
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
