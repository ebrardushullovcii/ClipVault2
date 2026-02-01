import { useState, useRef } from 'react'

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
  fetchMetadata: (clipId: string, videoPath: string) => Promise<VideoMetadata | undefined>
  formatDuration: (seconds: number) => string
  formatResolution: (width: number, height: number) => string
}

// Module-level cache that persists across component re-renders
const globalMetadataCache: MetadataCache = {}
const globalLoadingSet = new Set<string>()

export const useVideoMetadata = (): UseVideoMetadataReturn => {
  const [metadata, setMetadata] = useState<MetadataCache>(globalMetadataCache)

  const fetchMetadata = async (clipId: string, videoPath: string): Promise<VideoMetadata | undefined> => {
    // Return cached metadata if available
    if (globalMetadataCache[clipId]) {
      return globalMetadataCache[clipId]
    }

    // Skip if already loading
    if (globalLoadingSet.has(clipId)) {
      return undefined
    }

    // Mark as loading
    globalLoadingSet.add(clipId)

    try {
      const videoMetadata = await window.electronAPI.getVideoMetadata(videoPath)
      
      // Store in global cache
      globalMetadataCache[clipId] = videoMetadata
      
      // Update React state (this will trigger re-render)
      setMetadata({ ...globalMetadataCache })
      
      return videoMetadata
    } catch (err) {
      console.error(`[VideoMetadata] Failed to fetch for ${clipId}:`, err)
      return undefined
    } finally {
      globalLoadingSet.delete(clipId)
    }
  }

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const formatResolution = (width: number, height: number): string => {
    if (width >= 3840 && height >= 2160) return '4K'
    if (width >= 1920 && height >= 1080) return '1080p'
    if (width >= 1280 && height >= 720) return '720p'
    return `${width}x${height}`
  }

  return {
    metadata,
    fetchMetadata,
    formatDuration,
    formatResolution,
  }
}
