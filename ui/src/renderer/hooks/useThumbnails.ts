import { useState, useCallback, useEffect } from 'react'

interface ThumbnailCache {
  [clipId: string]: string
}

interface UseThumbnailsReturn {
  thumbnails: ThumbnailCache
  generateThumbnail: (clipId: string, videoPath: string) => Promise<string | undefined>
  isLoading: boolean
}

// Module-level cache that persists across component re-renders and sessions
const globalThumbnailCache: ThumbnailCache = {}
const globalLoadingSet = new Set<string>()
const globalFailedSet = new Set<string>() // Track failed attempts
let globalInitialized = false

export const useThumbnails = (): UseThumbnailsReturn => {
  const [thumbnails, setThumbnails] = useState<ThumbnailCache>(globalThumbnailCache)
  const [isLoading, setIsLoading] = useState(!globalInitialized)
  // Keep track of rendered thumbnails to force updates
  const [, setForceUpdate] = useState(0)

  // Load existing thumbnails from disk on first mount
  useEffect(() => {
    if (globalInitialized) {
      setIsLoading(false)
      return
    }

    const loadExistingThumbnails = async () => {
      try {
        console.log('[Thumbnails] Loading existing thumbnails...')
        const existing = await window.electronAPI.getExistingThumbnails()
        const count = Object.keys(existing).length

        // Merge into global cache
        Object.assign(globalThumbnailCache, existing)
        globalInitialized = true

        // Update React state
        setThumbnails({ ...globalThumbnailCache })
        setIsLoading(false)
        console.log(`[Thumbnails] Loaded ${count} existing thumbnails instantly`)
      } catch (error) {
        console.error('[Thumbnails] Failed to load existing:', error)
        globalInitialized = true
        setIsLoading(false)
      }
    }

    loadExistingThumbnails()
  }, [])

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
      
      // Remove from failed set if it was there
      globalFailedSet.delete(clipId)
      
      // Update React state (this will trigger re-render for all cards using this hook)
      setThumbnails({ ...globalThumbnailCache })
      // Force update for components that already have this hook
      setForceUpdate(prev => prev + 1)
      
      return thumbnailUrl
    } catch (err) {
      console.error(`[Thumbnails] Failed to generate for ${clipId}:`, err)
      // Mark as failed so it can be retried later
      globalFailedSet.add(clipId)
      return undefined
    } finally {
      globalLoadingSet.delete(clipId)
    }
  }, [])

  return {
    thumbnails,
    generateThumbnail,
    isLoading,
  }
}

// Check if a thumbnail has failed and can be retried
export const hasThumbnailFailed = (clipId: string): boolean => {
  return globalFailedSet.has(clipId) && !globalThumbnailCache[clipId]
}

// Retry a failed thumbnail
export const retryThumbnail = (clipId: string): void => {
  globalFailedSet.delete(clipId)
}
