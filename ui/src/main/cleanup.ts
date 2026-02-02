/**
 * File Cleanup Utility for ClipVault
 * Handles permanent deletion (bypassing recycle bin) and cache management
 */

import { unlink, readdir, stat, rmdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join, basename, extname } from 'path'

/**
 * Permanently delete a file (bypasses recycle bin on Windows)
 * Uses Node.js fs.unlink which performs permanent deletion
 */
export async function permanentDelete(filePath: string): Promise<boolean> {
  try {
    if (!existsSync(filePath)) {
      return true // Already deleted
    }
    
    await unlink(filePath)
    console.log(`[Cleanup] Permanently deleted: ${filePath}`)
    return true
  } catch (error) {
    console.error(`[Cleanup] Failed to delete ${filePath}:`, error)
    return false
  }
}

/**
 * Delete all cache files associated with a clip
 * - Thumbnail (.jpg)
 * - Audio tracks (.m4a)
 */
export async function deleteClipCache(
  clipId: string,
  thumbnailsPath: string
): Promise<boolean> {
  let success = true
  
  try {
    // Delete thumbnail
    const thumbnailPath = join(thumbnailsPath, `${clipId}.jpg`)
    if (existsSync(thumbnailPath)) {
      const thumbDeleted = await permanentDelete(thumbnailPath)
      if (!thumbDeleted) success = false
    }
    
    // Delete audio cache files
    const audioCachePath = join(thumbnailsPath, 'audio')
    const track1Path = join(audioCachePath, `${clipId}_track1.m4a`)
    const track2Path = join(audioCachePath, `${clipId}_track2.m4a`)
    
    if (existsSync(track1Path)) {
      const t1Deleted = await permanentDelete(track1Path)
      if (!t1Deleted) success = false
    }
    
    if (existsSync(track2Path)) {
      const t2Deleted = await permanentDelete(track2Path)
      if (!t2Deleted) success = false
    }
    
    return success
  } catch (error) {
    console.error(`[Cleanup] Error deleting cache for clip ${clipId}:`, error)
    return false
  }
}

/**
 * Clean up orphaned cache files (thumbnails/audio for clips that no longer exist)
 * This should be called periodically or on app startup
 */
export async function cleanupOrphanedCache(
  clipsPath: string,
  thumbnailsPath: string
): Promise<{ deletedCount: number; errors: string[] }> {
  const result = { deletedCount: 0, errors: [] as string[] }
  
  try {
    // Get list of valid clip IDs from the clips directory
    // Clip IDs are the full filename without .mp4 extension
    // e.g., "VALORANT__2025-10-12__20-52-36.mp4" -> "VALORANT__2025-10-12__20-52-36"
    const clipFiles = await readdir(clipsPath)
    const validClipIds = new Set(
      clipFiles
        .filter(f => f.endsWith('.mp4'))
        .map(f => basename(f, '.mp4')) // Full clip ID = filename without .mp4
    )
    
    // Clean up orphaned thumbnails
    if (existsSync(thumbnailsPath)) {
      const thumbFiles = await readdir(thumbnailsPath)
      for (const thumbFile of thumbFiles) {
        if (!thumbFile.endsWith('.jpg')) continue
        
        const clipId = basename(thumbFile, '.jpg')
        if (!validClipIds.has(clipId)) {
          const thumbPath = join(thumbnailsPath, thumbFile)
          const deleted = await permanentDelete(thumbPath)
          if (deleted) {
            result.deletedCount++
            console.log(`[Cleanup] Deleted orphaned thumbnail: ${thumbFile}`)
          } else {
            result.errors.push(`Failed to delete thumbnail: ${thumbFile}`)
          }
        }
      }
    }
    
    // Clean up orphaned audio cache
    const audioCachePath = join(thumbnailsPath, 'audio')
    if (existsSync(audioCachePath)) {
      const audioFiles = await readdir(audioCachePath)
      for (const audioFile of audioFiles) {
        if (!audioFile.endsWith('.m4a')) continue
        
        // Extract clip ID from filename like "{clipId}_track1.m4a"
        // The clip ID contains multiple underscores, so we need to remove only the last part
        const clipId = audioFile.replace(/_track[12]\.m4a$/, '')
        if (!validClipIds.has(clipId)) {
          const audioPath = join(audioCachePath, audioFile)
          const deleted = await permanentDelete(audioPath)
          if (deleted) {
            result.deletedCount++
            console.log(`[Cleanup] Deleted orphaned audio cache: ${audioFile}`)
          } else {
            result.errors.push(`Failed to delete audio cache: ${audioFile}`)
          }
        }
      }
    }
    
    console.log(`[Cleanup] Orphaned cache cleanup complete. Deleted ${result.deletedCount} files.`)
    return result
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error)
    console.error('[Cleanup] Error during orphaned cache cleanup:', error)
    result.errors.push(errorMsg)
    return result
  }
}

/**
 * Get cache storage statistics
 */
export async function getCacheStats(thumbnailsPath: string): Promise<{
  thumbnailCount: number
  thumbnailSize: number
  audioCount: number
  audioSize: number
  totalSize: number
}> {
  const stats = {
    thumbnailCount: 0,
    thumbnailSize: 0,
    audioCount: 0,
    audioSize: 0,
    totalSize: 0
  }
  
  try {
    // Calculate thumbnails
    if (existsSync(thumbnailsPath)) {
      const thumbFiles = await readdir(thumbnailsPath)
      for (const file of thumbFiles) {
        if (file.endsWith('.jpg')) {
          const filePath = join(thumbnailsPath, file)
          const fileStat = await stat(filePath)
          stats.thumbnailCount++
          stats.thumbnailSize += fileStat.size
        }
      }
    }
    
    // Calculate audio cache
    const audioCachePath = join(thumbnailsPath, 'audio')
    if (existsSync(audioCachePath)) {
      const audioFiles = await readdir(audioCachePath)
      for (const file of audioFiles) {
        if (file.endsWith('.m4a')) {
          const filePath = join(audioCachePath, file)
          const fileStat = await stat(filePath)
          stats.audioCount++
          stats.audioSize += fileStat.size
        }
      }
    }
    
    stats.totalSize = stats.thumbnailSize + stats.audioSize
    return stats
  } catch (error) {
    console.error('[Cleanup] Error getting cache stats:', error)
    return stats
  }
}

/**
 * Format bytes to human readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
