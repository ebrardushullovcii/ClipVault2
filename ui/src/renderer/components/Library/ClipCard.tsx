import React, { useEffect, useRef, useState, memo } from 'react'
import { Play, Clock, HardDrive, Film, Maximize } from 'lucide-react'
import type { VideoMetadata } from '../../hooks/useVideoMetadata'
import type { ClipInfo } from '../../types/electron'

interface ClipCardProps {
  clip: ClipInfo
  viewMode: 'grid' | 'list'
  formatFileSize: (bytes: number) => string
  formatDate: (dateString: string) => string
  thumbnailUrl?: string
  metadata?: VideoMetadata
  onGenerateThumbnail: (clipId: string, videoPath: string) => Promise<string | undefined>
  onFetchMetadata: (clipId: string, videoPath: string) => Promise<VideoMetadata | undefined>
  onOpenEditor?: (clip: ClipInfo, metadata: VideoMetadata) => void
}

export const ClipCard: React.FC<ClipCardProps> = memo(({
  clip,
  viewMode,
  formatFileSize,
  formatDate,
  thumbnailUrl,
  metadata,
  onGenerateThumbnail,
  onFetchMetadata,
  onOpenEditor,
}) => {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)
  const hasLoadedRef = useRef(false)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)
  
  // Lazy loading with intersection observer
  useEffect(() => {
    const element = cardRef.current
    if (!element) return

    // If we already have both thumbnail and metadata, don't observe
    if (thumbnailUrl && metadata) {
      setIsVisible(true)
      return
    }

    // Reset hasLoaded when dependencies change (e.g., when card remounts with new data)
    hasLoadedRef.current = false

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasLoadedRef.current) {
            setIsVisible(true)
            hasLoadedRef.current = true
            
            // Load thumbnail and metadata (only if not already loaded)
            timeoutRef.current = setTimeout(async () => {
              try {
                // Check again at call time in case props updated
                if (!thumbnailUrl) {
                  await onGenerateThumbnail(clip.id, clip.path)
                }
                if (!metadata) {
                  await onFetchMetadata(clip.id, clip.path)
                }
              } catch (error) {
                // Silently ignore errors - thumbnails will show placeholder
              }
            }, Math.random() * 50) // Small stagger
            
            if (observerRef.current) {
              observerRef.current.unobserve(element)
            }
          }
        })
      },
      {
        threshold: 0,
        rootMargin: '100px',
      }
    )

    observerRef.current.observe(element)

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [clip.id, clip.path, thumbnailUrl, metadata, onGenerateThumbnail, onFetchMetadata])

  const handleClick = () => {
    if (metadata && onOpenEditor) {
      onOpenEditor(clip, metadata)
    }
  }

  const isGrid = viewMode === 'grid'

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  return (
    <div
      ref={cardRef}
      onClick={handleClick}
      className={`card group cursor-pointer overflow-hidden ${
        isGrid ? '' : 'flex items-center gap-4 p-4'
      }`}
    >
      {/* Thumbnail */}
      <div
        className={`relative overflow-hidden bg-background-tertiary ${
          isGrid ? 'aspect-video' : 'aspect-video w-48 rounded-lg'
        }`}
      >
        {/* Thumbnail image or placeholder */}
        {thumbnailUrl ? (
          <img
            src={thumbnailUrl}
            alt={clip.filename}
            className="h-full w-full object-cover"
            loading="lazy"
            onError={(e) => {
              // Silently handle thumbnail load errors - will show placeholder
              (e.target as HTMLImageElement).style.display = 'none'
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className={`h-12 w-12 ${isVisible ? 'text-text-muted animate-pulse' : 'text-text-muted/50'}`} />
          </div>
        )}

        {/* Play overlay on hover */}
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-primary">
            <Play className="ml-1 h-6 w-6 text-background-primary" />
          </div>
        </div>

        {/* Duration badge */}
        <div className="absolute bottom-2 right-2 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
          {metadata ? formatDuration(metadata.duration) : '2:00'}
        </div>

        {/* Resolution badge */}
        {metadata && (
          <div className="absolute left-2 top-2 flex items-center gap-1 rounded bg-black/70 px-2 py-1 text-xs font-medium text-white">
            <Maximize className="h-3 w-3" />
            {metadata.width >= 1920 ? '1080p' : `${metadata.height}p`}
          </div>
        )}
      </div>

      {/* Info */}
      <div className={`${isGrid ? 'p-4' : 'flex-1'}`}>
        <h3
          className={`truncate font-medium text-text-primary ${
            isGrid ? 'mb-2 text-sm' : 'mb-1 text-base'
          }`}
        >
          {clip.filename.replace('.mp4', '')}
        </h3>

        <div className={`flex items-center gap-3 text-xs text-text-muted ${isGrid ? '' : 'gap-6'}`}>
          <span className="flex items-center gap-1">
            <HardDrive className="h-3 w-3" />
            {formatFileSize(clip.size)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(clip.createdAt)}
          </span>
          {metadata && (
            <span className="flex items-center gap-1">
              <span className="h-1 w-1 rounded-full bg-text-muted" />
              {Math.round(metadata.fps)}fps
            </span>
          )}
        </div>

        {/* Tags (if any in metadata) */}
        {clip.metadata?.tags && clip.metadata.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {clip.metadata.tags.map((tag, index) => (
              <span
                key={index}
                className="rounded bg-accent-primary/10 px-2 py-1 text-xs text-accent-primary"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Favorite indicator */}
        {clip.metadata?.favorite && (
          <div className="mt-2">
            <span className="text-xs text-yellow-500">★ Favorite</span>
          </div>
        )}
      </div>
    </div>
  )
}, (prevProps, nextProps) => {
  // Custom comparison for memo - only re-render if these change
  return (
    prevProps.clip.id === nextProps.clip.id &&
    prevProps.viewMode === nextProps.viewMode &&
    prevProps.thumbnailUrl === nextProps.thumbnailUrl &&
    prevProps.metadata?.duration === nextProps.metadata?.duration &&
    prevProps.metadata?.width === nextProps.metadata?.width &&
    prevProps.metadata?.height === nextProps.metadata?.height &&
    prevProps.metadata?.fps === nextProps.metadata?.fps &&
    prevProps.clip.metadata?.favorite === nextProps.clip.metadata?.favorite &&
    JSON.stringify(prevProps.clip.metadata?.tags) === JSON.stringify(nextProps.clip.metadata?.tags)
  )
})
