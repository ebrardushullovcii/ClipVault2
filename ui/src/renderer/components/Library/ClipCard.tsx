import React from 'react'
import { Play, Clock, HardDrive, Film } from 'lucide-react'

interface Clip {
  id: string
  filename: string
  path: string
  size: number
  createdAt: string
  modifiedAt: string
  metadata: unknown | null
}

interface ClipCardProps {
  clip: Clip
  viewMode: 'grid' | 'list'
  formatFileSize: (bytes: number) => string
  formatDate: (dateString: string) => string
}

export const ClipCard: React.FC<ClipCardProps> = ({
  clip,
  viewMode,
  formatFileSize,
  formatDate
}) => {
  const handleClick = () => {
    // TODO: Open clip in editor
    console.log('Opening clip:', clip.id)
  }

  const isGrid = viewMode === 'grid'

  return (
    <div
      onClick={handleClick}
      className={`card group cursor-pointer overflow-hidden ${
        isGrid ? '' : 'flex items-center gap-4 p-4'
      }`}
    >
      {/* Thumbnail */}
      <div className={`relative bg-background-tertiary overflow-hidden ${
        isGrid ? 'aspect-video' : 'w-48 aspect-video rounded-lg'
      }`}>
        {/* Placeholder - will be replaced with actual thumbnail */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Film className="w-12 h-12 text-text-muted" />
        </div>
        
        {/* Play overlay on hover */}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="w-12 h-12 rounded-full bg-accent-primary flex items-center justify-center">
            <Play className="w-6 h-6 text-background-primary ml-1" />
          </div>
        </div>

        {/* Duration badge (if we had duration) */}
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 rounded text-xs text-white font-medium">
          2:00
        </div>
      </div>

      {/* Info */}
      <div className={`${isGrid ? 'p-4' : 'flex-1'}`}>
        <h3 className={`font-medium text-text-primary truncate ${
          isGrid ? 'text-sm mb-2' : 'text-base mb-1'
        }`}>
          {clip.filename.replace('.mp4', '')}
        </h3>
        
        <div className={`flex items-center gap-3 text-xs text-text-muted ${
          isGrid ? '' : 'gap-6'
        }`}>
          <span className="flex items-center gap-1">
            <HardDrive className="w-3 h-3" />
            {formatFileSize(clip.size)}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(clip.createdAt)}
          </span>
        </div>

        {/* Tags (if any in metadata) */}
        {clip.metadata && (
          <div className="mt-3 flex flex-wrap gap-1">
            <span className="px-2 py-1 bg-accent-primary/10 text-accent-primary text-xs rounded">
              Edited
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
