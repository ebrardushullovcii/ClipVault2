import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Search, Grid3X3, List, Loader2, ArrowUpDown, ArrowUp, ArrowDown, RefreshCw } from 'lucide-react'
import { ClipCard } from './ClipCard'
import { useThumbnails } from '../../hooks/useThumbnails'
import { useVideoMetadata, type VideoMetadata } from '../../hooks/useVideoMetadata'
import { useLibraryState } from '../../hooks/useLibraryState'
import type { ClipInfo, ClipMetadata } from '../../types/electron'

export interface LibraryProps {
  onOpenEditor: (clip: ClipInfo, metadata: VideoMetadata) => void
  onRegisterUpdate: ((updateFn: (clipId: string, metadata: ClipMetadata) => void) => void) | undefined
}

// Constants for virtualization
const GRID_CARD_HEIGHT = 240
const LIST_CARD_HEIGHT = 88
const GRID_GAP = 16
const LIST_GAP = 16
const OVERSCAN_ROWS = 2

export const Library: React.FC<LibraryProps> = ({ onOpenEditor, onRegisterUpdate }) => {
  const [clips, setClips] = useState<ClipInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  
  // Use persistent state
  const {
    state: libraryState,
    scrollRef: persistedScrollRef,
    isRestored,
    setSearchQuery,
    setViewMode,
    setSortBy,
    toggleSortDirection,
    setFilterBy,
    setShowFavoritesOnly,
    setSelectedTag,
    saveScrollPosition,
  } = useLibraryState()

  const { thumbnails, generateThumbnail } = useThumbnails()
  const { metadata, fetchMetadata } = useVideoMetadata()
  
  // Track filenames currently being processed to avoid re-processing on re-renders
  const processingFilesRef = useRef<Set<string>>(new Set())
  // Track retry attempts for each filename
  const retryAttemptsRef = useRef<Map<string, number>>(new Map())

  // Calculate responsive columns based on container width
  const getGridCols = (width: number): number => {
    if (width < 640) return 1
    if (width < 1024) return 2
    if (width < 1280) return 3
    return 4
  }

  // Load clips on mount
  useEffect(() => {
    if (isRestored) {
      loadClips()
    }

    const unsubscribeNew = window.electronAPI.on('clips:new', (data: unknown) => {
      const { filename } = data as { filename: string }
      
      // Skip if already processing this file
      if (processingFilesRef.current.has(filename)) {
        console.log(`[Library] Skipping duplicate processing for ${filename}`)
        return
      }
      
      // Mark as processing
      processingFilesRef.current.add(filename)
      retryAttemptsRef.current.set(filename, 0)
      
      // Immediately add placeholder to show something to the user
      const newClip: ClipInfo = {
        id: filename.replace('.mp4', ''),
        filename,
        path: filename,
        size: 0,
        createdAt: new Date().toISOString(),
        modifiedAt: new Date().toISOString(),
        metadata: null,
      }
      setClips(prev => [newClip, ...prev])
      
      // Attempt 1: Wait 3 seconds for file to be fully written
      setTimeout(() => {
        console.log(`[Library] Attempt 1: Refreshing clip data for ${filename}...`)
        retryAttemptsRef.current.set(filename, 1)
        refreshClipData(filename, 1)
      }, 3000)
      
      // Attempt 2: Wait 6 seconds total (3s additional)
      setTimeout(() => {
        console.log(`[Library] Attempt 2: Refreshing clip data for ${filename}...`)
        retryAttemptsRef.current.set(filename, 2)
        refreshClipData(filename, 2)
      }, 6000)
      
      // Attempt 3: Wait 15 seconds total (9s additional after attempt 2)
      // This is the FINAL attempt - stop after this regardless of result
      setTimeout(() => {
        console.log(`[Library] Attempt 3 (FINAL): Refreshing clip data for ${filename}...`)
        retryAttemptsRef.current.set(filename, 3)
        refreshClipData(filename, 3)
        
        // Clean up tracking after final attempt
        setTimeout(() => {
          processingFilesRef.current.delete(filename)
          retryAttemptsRef.current.delete(filename)
          console.log(`[Library] Final attempt completed for ${filename}, stopped tracking`)
        }, 100)
      }, 15000)
    })

    const unsubscribeRemoved = window.electronAPI.on('clips:removed', (data: unknown) => {
      const { filename } = data as { filename: string }
      setClips(prev => prev.filter(clip => clip.filename !== filename))
      // Clean up tracking when file is removed
      processingFilesRef.current.delete(filename)
      retryAttemptsRef.current.delete(filename)
    })

    return () => {
      unsubscribeNew?.()
      unsubscribeRemoved?.()
    }
  }, [isRestored])
  
  // Refresh data for a specific clip
  const refreshClipData = useCallback(async (filename: string, attempt?: number) => {
    try {
      // Reload the entire clips list to get updated file info
      const clipList = await window.electronAPI.getClipsList()
      const updatedClip = clipList.find(c => c.filename === filename)
      
      if (updatedClip) {
        // Update the clip in state with real data
        setClips(prev => prev.map(clip => 
          clip.filename === filename ? updatedClip : clip
        ))
        
        // Trigger thumbnail generation
        if (updatedClip.path && updatedClip.size > 0) {
          console.log(`[Library] Attempt ${attempt || '?'}: Generating thumbnail for ${filename}...`)
          generateThumbnail(updatedClip.id, updatedClip.path)
            .then(() => console.log(`[Library] Thumbnail generated for ${filename}`))
            .catch(err => console.error(`[Library] Failed to generate thumbnail for ${filename}:`, err))
          
          // Fetch video metadata (duration, resolution, etc.)
          console.log(`[Library] Attempt ${attempt || '?'}: Fetching metadata for ${filename}...`)
          fetchMetadata(updatedClip.id, updatedClip.path)
            .then(() => console.log(`[Library] Metadata fetched for ${filename}`))
            .catch(err => console.error(`[Library] Failed to fetch metadata for ${filename}:`, err))
        }
      }
    } catch (err) {
      console.error(`[Library] Attempt ${attempt || '?'}: Failed to refresh clip data for ${filename}:`, err)
    }
  }, [generateThumbnail, fetchMetadata])

  const loadClips = useCallback(async () => {
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
  }, [])

  // Handle metadata updates from Editor (real-time updates!) - defined first
  const handleMetadataUpdate = useCallback((clipId: string, newMetadata: ClipMetadata) => {
    setClips(prev => prev.map(clip =>
      clip.id === clipId
        ? { ...clip, metadata: { ...clip.metadata, ...newMetadata } }
        : clip
    ))
  }, [])

  // Register update function with parent App (runs after handleMetadataUpdate is defined)
  useEffect(() => {
    if (onRegisterUpdate) {
      onRegisterUpdate(handleMetadataUpdate)
    }
  }, [onRegisterUpdate, handleMetadataUpdate])

  // Extract all unique tags from clips with counts
  const tagCounts = useMemo(() => {
    const counts: { [tag: string]: number } = {}
    clips.forEach(clip => {
      clip.metadata?.tags?.forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1
      })
    })
    return counts
  }, [clips])

  const allTags = useMemo(() => {
    return Object.keys(tagCounts).sort()
  }, [tagCounts])

  const filteredAndSortedClips = useMemo(() => {
    let result = clips.filter(clip =>
      clip.filename.toLowerCase().includes(libraryState.searchQuery.toLowerCase())
    )

    if (libraryState.showFavoritesOnly) {
      result = result.filter(clip => clip.metadata?.favorite)
    }

    // Filter by selected tag
    if (libraryState.selectedTag) {
      result = result.filter(clip => clip.metadata?.tags?.includes(libraryState.selectedTag!))
    }

    result.sort((a, b) => {
      let comparison = 0
      switch (libraryState.sortBy) {
        case 'date':
          comparison = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          break
        case 'size':
          comparison = b.size - a.size
          break
        case 'name':
          comparison = a.filename.localeCompare(b.filename)
          break
        case 'favorite':
          const aFav = a.metadata?.favorite ? 1 : 0
          const bFav = b.metadata?.favorite ? 1 : 0
          comparison = bFav - aFav
          break
      }
      // Reverse if ascending
      return libraryState.sortDirection === 'asc' ? -comparison : comparison
    })

    return result
  }, [clips, libraryState.searchQuery, libraryState.sortBy, libraryState.sortDirection, libraryState.filterBy, libraryState.showFavoritesOnly, libraryState.selectedTag])

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
  }

  // Update container height and handle scroll
  useEffect(() => {
    const container = scrollRef.current
    if (!container) return

    const updateHeight = () => {
      setContainerHeight(container.clientHeight)
    }

    updateHeight()
    window.addEventListener('resize', updateHeight)
    return () => window.removeEventListener('resize', updateHeight)
  }, [])

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const newScrollTop = e.currentTarget.scrollTop
    setScrollTop(newScrollTop)
    saveScrollPosition()
  }, [saveScrollPosition])

  // Calculate visible range for virtualization
  const isGrid = libraryState.viewMode === 'grid'
  const rowHeight = isGrid ? GRID_CARD_HEIGHT + GRID_GAP : LIST_CARD_HEIGHT + LIST_GAP
  const containerWidth = scrollRef.current?.clientWidth || 1200
  const cols = isGrid ? getGridCols(containerWidth) : 1
  const totalRows = Math.ceil(filteredAndSortedClips.length / cols)

  // Calculate which rows are visible
  const visibleStartRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS)
  const visibleEndRow = Math.min(totalRows, Math.ceil((scrollTop + containerHeight) / rowHeight) + OVERSCAN_ROWS)
  const visibleStartIndex = visibleStartRow * cols
  const visibleEndIndex = Math.min(filteredAndSortedClips.length, visibleEndRow * cols)

  return (
    <div className="flex h-full w-full flex-col bg-background-primary">
      {/* Toolbar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-text-primary">
            {libraryState.selectedTag
              ? `Tag: ${libraryState.selectedTag}`
              : libraryState.filterBy === 'favorites' || libraryState.showFavoritesOnly
                ? 'Favorites'
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
              value={libraryState.searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input w-64 pl-10"
            />
          </div>

          {/* Sort Dropdown + Direction */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={libraryState.sortBy}
                onChange={e => setSortBy(e.target.value as 'date' | 'size' | 'name' | 'favorite')}
                className="input cursor-pointer appearance-none bg-background-secondary py-2 pl-4 pr-10"
              >
                <option value="date">Sort by Date</option>
                <option value="size">Sort by Size</option>
                <option value="name">Sort by Name</option>
                <option value="favorite">Sort by Favorite</option>
              </select>
              <ArrowUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            </div>
            <button
              onClick={toggleSortDirection}
              className="flex items-center justify-center rounded-lg border border-border bg-background-secondary p-2 text-text-muted transition-all hover:bg-background-tertiary hover:text-text-primary"
              title={libraryState.sortDirection === 'desc' ? 'Sort ascending' : 'Sort descending'}
            >
              {libraryState.sortDirection === 'desc' ? (
                <ArrowDown className="h-4 w-4" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>

          {/* View Toggle */}
          <div className="flex items-center rounded-lg border border-border bg-background-secondary p-1">
            <button
              onClick={() => setViewMode('grid')}
              className={`rounded-md p-2 transition-all ${
                libraryState.viewMode === 'grid'
                  ? 'bg-accent-primary text-background-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Grid3X3 className="h-4 w-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`rounded-md p-2 transition-all ${
                libraryState.viewMode === 'list'
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
            libraryState.filterBy === 'all' && !libraryState.showFavoritesOnly
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
            libraryState.filterBy === 'favorites' || libraryState.showFavoritesOnly
              ? 'bg-accent-primary text-background-primary'
              : 'text-text-muted hover:bg-background-tertiary hover:text-text-primary'
          }`}
        >
          Favorites
        </button>
        
        {/* Tag Filter Dropdown */}
        {allTags.length > 0 && (
          <>
            <div className="h-6 w-px bg-border mx-2" />
            <div className="relative">
              <select
                value={libraryState.selectedTag || ''}
                onChange={(e) => {
                  const value = e.target.value
                  setSelectedTag(value || null)
                }}
                className={`cursor-pointer appearance-none rounded-md px-3 py-1.5 pr-8 text-sm font-medium transition-all ${
                  libraryState.selectedTag
                    ? 'bg-accent-primary text-background-primary'
                    : 'bg-background-secondary text-text-muted hover:bg-background-tertiary hover:text-text-primary'
                }`}
              >
                <option value="">All Tags</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag} ({tagCounts[tag]})</option>
                ))}
              </select>
              {libraryState.selectedTag && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="ml-2 rounded-md p-1 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
                  title="Clear tag filter"
                >
                  ×
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Content */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-6"
      >
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
                {libraryState.selectedTag
                  ? `No clips tagged with "${libraryState.selectedTag}". Try selecting a different tag or add this tag to clips in the editor.`
                  : libraryState.showFavoritesOnly
                    ? 'No favorite clips yet. Mark clips as favorites to see them here.'
                    : 'Clips will appear here when you save them with F9 in ClipVault'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Spacer for rows above visible range */}
            {visibleStartRow > 0 && (
              <div style={{ height: visibleStartRow * rowHeight }} />
            )}
            
            {/* Visible clips grid */}
            <div
              className={`grid gap-4 ${
                isGrid
                  ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  : 'grid-cols-1'
              }`}
            >
              {filteredAndSortedClips.slice(visibleStartIndex, visibleEndIndex).map(clip => (
                <ClipCard
                  key={clip.id}
                  clip={clip}
                  viewMode={libraryState.viewMode}
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
            
            {/* Spacer for rows below visible range */}
            {visibleEndRow < totalRows && (
              <div style={{ height: (totalRows - visibleEndRow) * rowHeight }} />
            )}
          </>
        )}
      </div>
    </div>
  )
}
