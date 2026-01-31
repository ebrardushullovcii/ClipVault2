import { useState, useCallback } from 'react'

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

interface MetadataCache {
  [clipId: string]: VideoMetadata
}

interface UseVideoMetadataReturn {
  metadata: MetadataCache
  loading: Set<string>
  error: Map<string, string>
  fetchMetadata: (clipId: string, videoPath: string) => Promise<void>
  getMetadata: (clipId: string) => VideoMetadata | undefined
  formatDuration: (seconds: number) => string
  formatResolution: (width: number, height: number) => string
}

export const useVideoMetadata = (): UseVideoMetadataReturn => {
  const [metadata, setMetadata] = useState<MetadataCache>({})
  const [loading, setLoading] = useState<Set<string>>(new Set())
  const [error, setError] = useState<Map<string, string>>(new Map())

  const fetchMetadata = useCallback(
    async (clipId: string, videoPath: string) => {
      // Skip if already loaded or loading
      if (metadata[clipId] || loading.has(clipId)) {
        return
      }

      // Mark as loading
      setLoading(prev => new Set(prev).add(clipId))

      try {
        const videoMetadata = await window.electronAPI.getVideoMetadata(videoPath)

        setMetadata(prev => ({
          ...prev,
          [clipId]: videoMetadata,
        }))

        // Clear any previous error
        setError(prev => {
          const newMap = new Map(prev)
          newMap.delete(clipId)
          return newMap
        })
      } catch (err) {
        console.error(`Failed to fetch metadata for ${clipId}:`, err)
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
    [metadata, loading]
  )

  const getMetadata = useCallback(
    (clipId: string) => {
      return metadata[clipId]
    },
    [metadata]
  )

  const formatDuration = useCallback((seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }, [])

  const formatResolution = useCallback((width: number, height: number): string => {
    if (width >= 3840 && height >= 2160) return '4K'
    if (width >= 1920 && height >= 1080) return '1080p'
    if (width >= 1280 && height >= 720) return '720p'
    return `${width}x${height}`
  }, [])

  return {
    metadata,
    loading,
    error,
    fetchMetadata,
    getMetadata,
    formatDuration,
    formatResolution,
  }
}
