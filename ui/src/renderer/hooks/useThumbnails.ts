import { useState, useRef, useCallback } from 'react'

interface ThumbnailCache {
  [clipId: string]: string
}

interface UseThumbnailsReturn {
  thumbnails: ThumbnailCache
  generateThumbnail: (clipId: string, videoPath: string) => Promise<string | undefined>
}

// Module-level cache that persists across component re-renders and sessions
const globalThumbnailCache: ThumbnailCache = {}
const globalLoadingSet = new Set<string>()

export const useThumbnails = (): UseThumbnailsReturn => {
  const [thumbnails, setThumbnails] = useState<ThumbnailCache>(globalThumbnailCache)
  // Keep track of rendered thumbnails to force updates
  const [, setForceUpdate] = useState(0)

  const generateThumbnail = useCallback(async (clipId: string, videoPath: string): Promise<string | undefined> => {
    // Return cached thumbnail immediately if available - NO IPC CALL
    if (globalThumbnailCache[clipId]) {
      return globalThumbnailCache[clipId]
    }

    // Skip if already loading
    if (globalLoadingSet.has(clipId)) {
      return undefined
    }

    // Mark as loading
    globalLoadingSet.add(clipId)

    try {
      // Only make IPC call if not cached
      const thumbnailUrl = await window.electronAPI.generateThumbnail(clipId, videoPath)
      
      // Store in global cache
      globalThumbnailCache[clipId] = thumbnailUrl
      
      // Update React state (this will trigger re-render for all cards using this hook)
      setThumbnails({ ...globalThumbnailCache })
      // Force update for components that already have this hook
      setForceUpdate(prev => prev + 1)
      
      return thumbnailUrl
    } catch (err) {
      console.error(`[Thumbnails] Failed to generate for ${clipId}:`, err)
      return undefined
    } finally {
      globalLoadingSet.delete(clipId)
    }
  }, [])

  return {
    thumbnails,
    generateThumbnail,
  }
}
