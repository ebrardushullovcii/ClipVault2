import { useEffect, useState, useMemo } from 'react'
import { Search, Grid3X3, List, Loader2, ArrowUpDown, RefreshCw } from 'lucide-react'
import { ClipCard } from './ClipCard'
import { useThumbnails } from '../../hooks/useThumbnails'
import { useVideoMetadata, type VideoMetadata } from '../../hooks/useVideoMetadata'
import type { ClipInfo } from '../../types/electron'

type SortOption = 'date' | 'size' | 'name' | 'favorite'
type FilterOption = 'all' | 'favorites' | 'recent'

interface LibraryProps {
  onOpenEditor: (clip: ClipInfo, metadata: VideoMetadata) => void
}

export const Library: React.FC<LibraryProps> = ({ onOpenEditor }) => {
  const [clips, setClips] = useState<ClipInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [sortBy, setSortBy] = useState<SortOption>('date')
  const [filterBy, setFilterBy] = useState<FilterOption>('all')
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false)

  const { thumbnails, generateThumbnail } = useThumbnails()
  const { metadata, fetchMetadata } = useVideoMetadata()

  useEffect(() => {
    loadClips()

    // Listen for new clips added via file watcher
    const unsubscribeNew = window.electronAPI.on('clips:new', (data: unknown) => {
      const { filename } = data as { filename: string }
      console.log('[Library] New clip detected:', filename)
      // Refresh the clips list
      loadClips()
    })

    // Listen for clips removed via file watcher
    const unsubscribeRemoved = window.electronAPI.on('clips:removed', (data: unknown) => {
      const { filename } = data as { filename: string }
      console.log('[Library] Clip removed:', filename)
      // Refresh the clips list
      loadClips()
    })

    // Cleanup listeners on unmount
    return () => {
      unsubscribeNew?.()
      unsubscribeRemoved?.()
    }
  }, [])

  const loadClips = async () => {
    try {
      setLoading(true)
      setError(null)
      const clipList = await window.electronAPI.getClipsList()
      setClips(clipList)
    } catch (err) {
      setError('Failed to load clips. Make sure the clips folder exists.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const filteredAndSortedClips = useMemo(() => {
    let result = clips.filter(clip =>
      clip.filename.toLowerCase().includes(searchQuery.toLowerCase())
    )

    // Apply filters
    if (showFavoritesOnly) {
      result = result.filter(clip => clip.metadata?.favorite)
    }

    if (filterBy === 'recent') {
      const oneWeekAgo = new Date()
      oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)
      result = result.filter(clip => new Date(clip.createdAt) > oneWeekAgo)
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        case 'size':
          return b.size - a.size
        case 'name':
          return a.filename.localeCompare(b.filename)
        case 'favorite':
          const aFav = a.metadata?.favorite ? 1 : 0
          const bFav = b.metadata?.favorite ? 1 : 0
          return bFav - aFav
        default:
          return 0
      }
    })

    return result
  }, [clips, searchQuery, sortBy, filterBy, showFavoritesOnly])

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
  }

  return (
    <div className="flex h-full flex-col bg-background-primary">
      {/* Toolbar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-text-primary">
            {filterBy === 'favorites' || showFavoritesOnly
              ? 'Favorites'
              : filterBy === 'recent'
                ? 'Recent Clips'
                : 'All Clips'}
          </h2>
          <span className="text-sm text-text-muted">{filteredAndSortedClips.length} clips</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              type="text"
              placeholder="Search clips..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input w-64 pl-10"
            />
          </div>

          {/* Sort Dropdown */}
          <div className="relative">
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as SortOption)}
              className="input cursor-pointer appearance-none bg-background-secondary py-2 pl-4 pr-10"
            >
              <option value="date">Sort by Date</option>
              <option value="size">Sort by Size</option>
              <option value="name">Sort by Name</option>
              <option value="favorite">Sort by Favorite</option>
            </select>
            <ArrowUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          </div>

          {/* View Toggle */}
          <div className="flex items-center rounded-lg border border-border bg-background-secondary p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-md p-2 transition-all ${
                viewMode === 'grid'
                  ? 'bg-accent-primary text-background-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-md p-2 transition-all ${
                viewMode === 'list'
                  ? 'bg-accent-primary text-background-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>

          {/* Refresh Button */}
          <button
            onClick={loadClips}
            disabled={loading}
            className="flex items-center gap-2 rounded-lg border border-border bg-background-secondary p-2 text-text-muted transition-all hover:bg-background-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
            title="Refresh clips list"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-background-secondary/50 px-6">
        <button
          onClick={() => {
            setFilterBy('all')
            setShowFavoritesOnly(false)
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
            filterBy === 'all' && !showFavoritesOnly
              ? 'bg-accent-primary text-background-primary'
              : 'text-text-muted hover:bg-background-tertiary hover:text-text-primary'
          }`}
        >
          All
        </button>
        <button
          onClick={() => {
            setFilterBy('favorites')
            setShowFavoritesOnly(true)
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
            filterBy === 'favorites' || showFavoritesOnly
              ? 'bg-accent-primary text-background-primary'
              : 'text-text-muted hover:bg-background-tertiary hover:text-text-primary'
          }`}
        >
          Favorites
        </button>
        <button
          onClick={() => {
            setFilterBy('recent')
            setShowFavoritesOnly(false)
          }}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
            filterBy === 'recent'
              ? 'bg-accent-primary text-background-primary'
              : 'text-text-muted hover:bg-background-tertiary hover:text-text-primary'
          }`}
        >
          Recent (7 days)
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-text-muted">
              <Loader2 className="h-8 w-8 animate-spin" />
              <p>Loading clips...</p>
            </div>
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="mb-4 text-text-secondary">{error}</p>
              <button onClick={loadClips} className="btn-primary">
                Retry
              </button>
            </div>
          </div>
        ) : filteredAndSortedClips.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <p className="mb-2 text-lg text-text-muted">No clips found</p>
              <p className="text-sm text-text-muted">
                {showFavoritesOnly
                  ? 'No favorite clips yet. Mark clips as favorites to see them here.'
                  : 'Clips will appear here when you save them with F9 in ClipVault'}
              </p>
            </div>
          </div>
        ) : (
          <div
            className={`grid gap-4 ${
              viewMode === 'grid'
                ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                : 'grid-cols-1'
            }`}
          >
            {filteredAndSortedClips.map(clip => (
              <ClipCard
                key={clip.id}
                clip={clip}
                viewMode={viewMode}
                formatFileSize={formatFileSize}
                formatDate={formatDate}
                thumbnailUrl={thumbnails[clip.id]}
                metadata={metadata[clip.id]}
                onGenerateThumbnail={generateThumbnail}
                onFetchMetadata={fetchMetadata}
                onOpenEditor={onOpenEditor}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
