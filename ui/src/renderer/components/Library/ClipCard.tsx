import React, { useEffect } from 'react'
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
  onGenerateThumbnail: (clipId: string, videoPath: string) => void
  onFetchMetadata: (clipId: string, videoPath: string) => void
  onOpenEditor?: (clip: ClipInfo, metadata: VideoMetadata) => void
}

export const ClipCard: React.FC<ClipCardProps> = ({
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
  useEffect(() => {
    // Generate thumbnail and fetch metadata when component mounts
    onGenerateThumbnail(clip.id, clip.path)
    onFetchMetadata(clip.id, clip.path)
  }, [clip.id, clip.path, onGenerateThumbnail, onFetchMetadata])

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
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Film className="h-12 w-12 text-text-muted" />
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
}
