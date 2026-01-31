import { useState, useCallback } from 'react'

interface ThumbnailCache {
  [clipId: string]: string
}

interface UseThumbnailsReturn {
  thumbnails: ThumbnailCache
  loading: Set<string>
  error: Map<string, string>
  generateThumbnail: (clipId: string, videoPath: string) => Promise<void>
  getThumbnail: (clipId: string) => string | undefined
}

export const useThumbnails = (): UseThumbnailsReturn => {
  const [thumbnails, setThumbnails] = useState<ThumbnailCache>({})
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [error, setError] = useState<Map<string, string>>(new Map())

  const generateThumbnail = useCallback(
    async (clipId: string, videoPath: string) => {
      // Skip if already loaded or loading
      if (thumbnails[clipId] || loading.has(clipId)) {
        return
      }

      // Mark as loading
      setLoading(prev => new Set(prev).add(clipId))

      try {
        const thumbnailUrl = await window.electronAPI.generateThumbnail(clipId, videoPath)

        // Backend now returns clipvault:// URLs
        setThumbnails(prev => ({
          ...prev,
          [clipId]: thumbnailUrl,
        }))

        // Clear any previous error
        setError(prev => {
          const newMap = new Map(prev)
          newMap.delete(clipId)
          return newMap
        })
      } catch (err) {
        console.error(`Failed to generate thumbnail for ${clipId}:`, err)
        setError(prev => {
          const newMap = new Map(prev)
          newMap.set(clipId, err instanceof Error ? err.message : 'Unknown error')
          return newMap
        })
      } finally {
        setLoading(prev => {
          const newSet = new Set(prev)
          newSet.delete(clipId)
          return newSet
        })
      }
    },
    [thumbnails, loading]
  )

  const getThumbnail = useCallback(
    (clipId: string) => {
      return thumbnails[clipId]
    },
    [thumbnails]
  )

  return {
    thumbnails,
    loading,
    error,
    generateThumbnail,
    getThumbnail,
  }
}
