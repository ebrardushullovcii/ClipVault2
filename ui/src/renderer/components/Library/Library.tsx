import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import {
  Search,
  Grid3X3,
  List,
  Loader2,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  RefreshCw,
  Gamepad2,
  X,
  Plus,
  Trash2,
  Tag,
  Heart,
  Download,
  CheckSquare,
} from 'lucide-react'
import { ClipCard } from './ClipCard'
import { GameTagEditor } from '../GameTagEditor'
import { useThumbnails } from '../../hooks/useThumbnails'
import { useVideoMetadata, type VideoMetadata } from '../../hooks/useVideoMetadata'
import { useLibraryState } from '../../hooks/useLibraryState'
import type { ClipInfo, ClipMetadata, AudioTrackSetting } from '../../types/electron'

export interface LibraryProps {
  onOpenEditor: (clip: ClipInfo, metadata: VideoMetadata) => void
  onRegisterUpdate:
    | ((updateFn: (clipId: string, metadata: ClipMetadata) => void) => void)
    | undefined
}

// Constants for virtualization
const GRID_CARD_HEIGHT = 240
const LIST_CARD_HEIGHT = 88
const GRID_GAP = 16
const LIST_GAP = 16
const OVERSCAN_ROWS = 2

const resolveAudioEnabled = (track?: AudioTrackSetting): boolean => {
  if (typeof track === 'boolean') return track
  return track?.enabled ?? true
}

export const Library: React.FC<LibraryProps> = ({ onOpenEditor, onRegisterUpdate }) => {
  const [clips, setClips] = useState<ClipInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const [containerHeight, setContainerHeight] = useState(0)
  const [editingGameClip, setEditingGameClip] = useState<ClipInfo | null>(null)
  const [selectedClipIds, setSelectedClipIds] = useState<Set<string>>(new Set())
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showTagModal, setShowTagModal] = useState(false)
  const [bulkTagMode, setBulkTagMode] = useState<'add' | 'remove'>('add')
  const [bulkTagValue, setBulkTagValue] = useState('')
  const [bulkActionMessage, setBulkActionMessage] = useState<string | null>(null)
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  const [isBulkTagApplying, setIsBulkTagApplying] = useState(false)
  const [isBulkExporting, setIsBulkExporting] = useState(false)
  const [bulkExportProgress, setBulkExportProgress] = useState(0)
  const [bulkExportIndex, setBulkExportIndex] = useState(0)
  const [bulkExportTotal, setBulkExportTotal] = useState(0)
  const [bulkExportCurrent, setBulkExportCurrent] = useState<string | null>(null)
  const [bulkExportErrors, setBulkExportErrors] = useState<string[]>([])
  const [bulkTargetSizeMB, setBulkTargetSizeMB] = useState<number | 'original'>('original')
  const [showExportSizeDropdown, setShowExportSizeDropdown] = useState(false)
  const bulkExportAbortRef = useRef(false)
  const lastSelectedIndexRef = useRef<number | null>(null)
  const bulkMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const [showGameModal, setShowGameModal] = useState(false)
  const [bulkGameMode, setBulkGameMode] = useState<'add' | 'remove'>('add')
  const [bulkGameValue, setBulkGameValue] = useState('')
  const [gamesList, setGamesList] = useState<string[]>([])
  const [gamesLoading, setGamesLoading] = useState(false)
  const [gameSearchQuery, setGameSearchQuery] = useState('')

  // Use persistent state
  const {
    state: libraryState,
    scrollRef,
    isRestored,
    setSearchQuery,
    setViewMode,
    setSortBy,
    toggleSortDirection,
    setFilterBy,
    setShowFavoritesOnly,
    setSelectedTag,
    setSelectedGame,
    saveScrollPosition,
  } = useLibraryState()

  const { thumbnails, generateThumbnail } = useThumbnails()
  const { metadata, fetchMetadata } = useVideoMetadata()

  // Track filenames currently being processed to avoid re-processing on re-renders
  const processingFilesRef = useRef<Set<string>>(new Set())
  // Track retry attempts for each filename
  const retryAttemptsRef = useRef<Map<string, number>>(new Map())
  const selectedClips = useMemo(
    () => clips.filter(clip => selectedClipIds.has(clip.id)),
    [clips, selectedClipIds]
  )
  const selectedCount = selectedClipIds.size
  const selectionActive = selectedCount > 0

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

    // Listen for trim-in-place completion to refresh the clip in the list
    const unsubscribeTrimmed = window.electronAPI.on('clip:trimmed', (data: unknown) => {
      const { filename } = data as { filename: string }
      console.log(`[Library] Clip trimmed, refreshing: ${filename}`)
      // Reload clip list to get updated file size and metadata
      void (async () => {
        try {
          const clipList = await window.electronAPI.getClipsList()
          const updatedClip = clipList.find(c => c.filename === filename)
          if (updatedClip) {
            setClips(prev =>
              prev.map(c => (c.filename === filename ? updatedClip : c))
            )
          }
        } catch (error) {
          console.error('[Library] Failed to refresh trimmed clip:', error)
        }
      })()
    })

    return () => {
      unsubscribeNew?.()
      unsubscribeRemoved?.()
      unsubscribeTrimmed?.()
    }
  }, [isRestored])

  // Refresh data for a specific clip
  const refreshClipData = useCallback(
    async (filename: string, attempt?: number) => {
      try {
        // Reload the entire clips list to get updated file info
        const clipList = await window.electronAPI.getClipsList()
        const updatedClip = clipList.find(c => c.filename === filename)

        if (updatedClip) {
          // Update the clip in state with real data
          setClips(prev => prev.map(clip => (clip.filename === filename ? updatedClip : clip)))

          // Trigger thumbnail generation
          if (updatedClip.path && updatedClip.size > 0) {
            console.log(
              `[Library] Attempt ${attempt || '?'}: Generating thumbnail for ${filename}...`
            )
            generateThumbnail(updatedClip.id, updatedClip.path)
              .then(() => console.log(`[Library] Thumbnail generated for ${filename}`))
              .catch(err =>
                console.error(`[Library] Failed to generate thumbnail for ${filename}:`, err)
              )

            // Fetch video metadata (duration, resolution, etc.)
            console.log(`[Library] Attempt ${attempt || '?'}: Fetching metadata for ${filename}...`)
            fetchMetadata(updatedClip.id, updatedClip.path)
              .then(() => console.log(`[Library] Metadata fetched for ${filename}`))
              .catch(err =>
                console.error(`[Library] Failed to fetch metadata for ${filename}:`, err)
              )
          }
        }
      } catch (err) {
        console.error(
          `[Library] Attempt ${attempt || '?'}: Failed to refresh clip data for ${filename}:`,
          err
        )
      }
    },
    [generateThumbnail, fetchMetadata]
  )

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
    setClips(prev =>
      prev.map(clip =>
        clip.id === clipId ? { ...clip, metadata: { ...clip.metadata, ...newMetadata } } : clip
      )
    )
  }, [])

  // Handle editing game tag
  const handleEditGame = useCallback((clip: ClipInfo) => {
    setEditingGameClip(clip)
  }, [])

  // Handle saving game tag
  const handleSaveGame = useCallback(
    async (game: string | null) => {
      if (!editingGameClip) return

      try {
        const newMetadata: ClipMetadata = {
          ...(editingGameClip.metadata ?? {}),
          game: game || undefined,
        }

        // Save to backend
        await window.electronAPI.saveClipMetadata(editingGameClip.id, newMetadata)

        // Update local state
        setClips(prev =>
          prev.map(clip =>
            clip.id === editingGameClip.id ? { ...clip, metadata: newMetadata } : clip
          )
        )
      } catch (error) {
        console.error('[Library] Failed to update game tag:', error)
      }

      setEditingGameClip(null)
    },
    [editingGameClip]
  )

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

  const selectedTags = useMemo(() => {
    const tags = new Set<string>()
    selectedClips.forEach(clip => {
      clip.metadata?.tags?.forEach(tag => tags.add(tag))
    })
    return Array.from(tags).sort()
  }, [selectedClips])

  // Extract all unique games from clips with counts
  // ONLY counts games from actual metadata tags (backend detection or user tagging)
  // Does NOT use filename extraction for filtering - filename is just for display
  const gameCounts = useMemo(() => {
    const counts: { [game: string]: number } = {}
    clips.forEach(clip => {
      // Only use metadata.game - never extract from filename for filter
      const game = clip.metadata?.game
      if (game) {
        counts[game] = (counts[game] || 0) + 1
      }
    })
    return counts
  }, [clips])

  const allGames = useMemo(() => {
    return Object.keys(gameCounts).sort()
  }, [gameCounts])

  const selectedGames = useMemo(() => {
    const games = new Set<string>()
    selectedClips.forEach(clip => {
      if (clip.metadata?.game) {
        games.add(clip.metadata.game)
      }
    })
    return Array.from(games).sort()
  }, [selectedClips])

  const filteredGamesList = useMemo(() => {
    if (!gameSearchQuery.trim()) {
      return gamesList
    }
    const query = gameSearchQuery.toLowerCase()
    return gamesList.filter(game => game.toLowerCase().includes(query))
  }, [gameSearchQuery, gamesList])

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

    // Filter by selected game
    if (libraryState.selectedGame) {
      result = result.filter(clip => clip.metadata?.game === libraryState.selectedGame)
    }

    // Parse date from filename like "2026-02-04_21-33-19.mp4", fallback to createdAt
    const getClipDate = (clip: ClipInfo): number => {
      const match = clip.filename.match(/^(\d{4})-(\d{2})-(\d{2})_(\d{2})-(\d{2})-(\d{2})/)
      if (match) {
        const [, y, mo, d, h, mi, s] = match
        return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`).getTime()
      }
      return new Date(clip.createdAt).getTime()
    }

    result.sort((a, b) => {
      let comparison = 0
      switch (libraryState.sortBy) {
        case 'date':
          comparison = getClipDate(b) - getClipDate(a)
          break
        case 'size':
          comparison = b.size - a.size
          break
        case 'name':
          comparison = a.filename.localeCompare(b.filename)
          break
        case 'favorite': {
          const aFav = a.metadata?.favorite ? 1 : 0
          const bFav = b.metadata?.favorite ? 1 : 0
          comparison = bFav - aFav
          break
        }
      }
      // Reverse if ascending
      return libraryState.sortDirection === 'asc' ? -comparison : comparison
    })

    return result
  }, [
    clips,
    libraryState.searchQuery,
    libraryState.sortBy,
    libraryState.sortDirection,
    libraryState.filterBy,
    libraryState.showFavoritesOnly,
    libraryState.selectedTag,
    libraryState.selectedGame,
  ])

  const clearSelection = useCallback(() => {
    setSelectedClipIds(new Set())
    lastSelectedIndexRef.current = null
  }, [])

  const selectAllVisible = useCallback(() => {
    if (filteredAndSortedClips.length === 0) {
      return
    }
    setSelectedClipIds(new Set(filteredAndSortedClips.map(clip => clip.id)))
    lastSelectedIndexRef.current = filteredAndSortedClips.length - 1
  }, [filteredAndSortedClips])

  const applySelection = useCallback(
    (
      clipId: string,
      index: number,
      options: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; forceToggle?: boolean }
    ) => {
      setSelectedClipIds(prev => {
        const next = new Set(prev)
        const hasModifier = options.ctrlKey || options.metaKey
        const hasExisting = next.size > 0

        if (options.shiftKey && lastSelectedIndexRef.current !== null) {
          const start = Math.min(lastSelectedIndexRef.current, index)
          const end = Math.max(lastSelectedIndexRef.current, index)
          const rangeIds = filteredAndSortedClips.slice(start, end + 1).map(clip => clip.id)
          if (!hasModifier) {
            next.clear()
          }
          rangeIds.forEach(id => next.add(id))
        } else if (options.forceToggle || hasModifier || hasExisting) {
          if (next.has(clipId)) {
            next.delete(clipId)
          } else {
            next.add(clipId)
          }
        } else {
          next.clear()
          next.add(clipId)
        }

        return next
      })

      lastSelectedIndexRef.current = index
    },
    [filteredAndSortedClips]
  )

  const handleCardClick = useCallback(
    (clip: ClipInfo, index: number, event: React.MouseEvent<HTMLDivElement>) => {
      const hasModifier = event.ctrlKey || event.metaKey || event.shiftKey
      if (selectionActive || hasModifier) {
        applySelection(clip.id, index, {
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
        })
        return
      }

      const fallbackMetadata: VideoMetadata = metadata[clip.id] || {
        duration: 0,
        width: 1920,
        height: 1080,
        fps: 60,
        bitrate: 0,
        size: clip.size,
        format: 'mp4',
        videoCodec: 'h264',
        audioTracks: 2,
      }
      onOpenEditor(clip, fallbackMetadata)
    },
    [applySelection, metadata, onOpenEditor, selectionActive]
  )

  const handleToggleSelect = useCallback(
    (clip: ClipInfo, index: number, event: React.MouseEvent<HTMLButtonElement>) => {
      applySelection(clip.id, index, {
        shiftKey: event.shiftKey,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        forceToggle: true,
      })
    },
    [applySelection]
  )

  useEffect(() => {
    if (filteredAndSortedClips.length === 0) {
      if (selectedClipIds.size > 0) {
        clearSelection()
      }
      return
    }

    const allowedIds = new Set(filteredAndSortedClips.map(clip => clip.id))
    setSelectedClipIds(prev => {
      const next = new Set(Array.from(prev).filter(id => allowedIds.has(id)))
      return next.size === prev.size ? prev : next
    })
  }, [clearSelection, filteredAndSortedClips, selectedClipIds.size])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isTypingField =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)

      if (isTypingField) {
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        selectAllVisible()
      }

      if (event.key === 'Escape' && selectedClipIds.size > 0) {
        event.preventDefault()
        clearSelection()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [clearSelection, selectAllVisible, selectedClipIds.size])

  const showBulkMessage = useCallback((message: string) => {
    setBulkActionMessage(message)
    if (bulkMessageTimeoutRef.current) {
      clearTimeout(bulkMessageTimeoutRef.current)
    }
    bulkMessageTimeoutRef.current = setTimeout(() => {
      setBulkActionMessage(null)
    }, 3000)
  }, [])

  useEffect(() => {
    return () => {
      if (bulkMessageTimeoutRef.current) {
        clearTimeout(bulkMessageTimeoutRef.current)
      }
    }
  }, [])

  const handleBulkFavoriteToggle = useCallback(async () => {
    if (selectedClips.length === 0) return

    const allFavorite = selectedClips.every(clip => clip.metadata?.favorite)
    const nextFavorite = !allFavorite
    const updatedMetadata = new Map<string, ClipMetadata>()
    const failed: string[] = []

    for (const clip of selectedClips) {
      const newMetadata: ClipMetadata = {
        ...(clip.metadata ?? {}),
        favorite: nextFavorite,
      }
      try {
        await window.electronAPI.saveClipMetadata(clip.id, newMetadata)
        updatedMetadata.set(clip.id, newMetadata)
      } catch (error) {
        console.error('[Library] Failed to update favorite:', error)
        failed.push(clip.filename)
      }
    }

    if (updatedMetadata.size > 0) {
      setClips(prev =>
        prev.map(clip => {
          const updated = updatedMetadata.get(clip.id)
          return updated ? { ...clip, metadata: updated } : clip
        })
      )
    }

    if (failed.length > 0) {
      showBulkMessage(`Failed to update ${failed.length} clips`)
    } else {
      showBulkMessage(nextFavorite ? 'Marked as favorite' : 'Removed from favorites')
    }
    clearSelection()
  }, [clearSelection, selectedClips, showBulkMessage])

  const loadGamesList = useCallback(async () => {
    if (gamesLoading || gamesList.length > 0) {
      return
    }
    setGamesLoading(true)
    try {
      const result = await window.electronAPI.getGamesDatabase()
      if (result?.success && result.data?.games) {
        const names = result.data.games.map(game => game.name).filter(Boolean)
        names.sort((a, b) => a.localeCompare(b))
        setGamesList(names)
      }
    } catch (error) {
      console.error('[Library] Failed to load games list:', error)
    } finally {
      setGamesLoading(false)
    }
  }, [gamesLoading, gamesList.length])

  const applyBulkTags = useCallback(async () => {
    const tagValue = bulkTagValue.trim()
    if (!tagValue || selectedClips.length === 0) {
      return
    }

    setIsBulkTagApplying(true)
    const updatedMetadata = new Map<string, ClipMetadata>()
    const failed: string[] = []

    for (const clip of selectedClips) {
      const existingTags = clip.metadata?.tags ? [...clip.metadata.tags] : []
      let nextTags = existingTags
      if (bulkTagMode === 'add') {
        if (!existingTags.includes(tagValue)) {
          nextTags = [...existingTags, tagValue]
        }
      } else {
        nextTags = existingTags.filter(tag => tag !== tagValue)
      }

      const newMetadata: ClipMetadata = {
        ...(clip.metadata ?? {}),
        tags: nextTags,
      }

      try {
        await window.electronAPI.saveClipMetadata(clip.id, newMetadata)
        updatedMetadata.set(clip.id, newMetadata)
      } catch (error) {
        console.error('[Library] Failed to update tags:', error)
        failed.push(clip.filename)
      }
    }

    if (updatedMetadata.size > 0) {
      setClips(prev =>
        prev.map(clip => {
          const updated = updatedMetadata.get(clip.id)
          return updated ? { ...clip, metadata: updated } : clip
        })
      )
    }

    setIsBulkTagApplying(false)
    setShowTagModal(false)
    setBulkTagValue('')

    if (failed.length > 0) {
      showBulkMessage(`Failed to update ${failed.length} clips`)
    } else {
      showBulkMessage(
        bulkTagMode === 'add' ? 'Tag added to selection' : 'Tag removed from selection'
      )
    }
    clearSelection()
  }, [bulkTagMode, bulkTagValue, clearSelection, selectedClips, showBulkMessage])

  const applyBulkGame = useCallback(async () => {
    if (selectedClips.length === 0) {
      return
    }

    const gameValue = bulkGameValue.trim()
    if (!gameValue) {
      return
    }

    const updatedMetadata = new Map<string, ClipMetadata>()
    const failed: string[] = []

    for (const clip of selectedClips) {
      let nextGame = clip.metadata?.game

      if (bulkGameMode === 'add') {
        nextGame = gameValue
      } else if (bulkGameMode === 'remove') {
        if (clip.metadata?.game === gameValue) {
          nextGame = undefined
        }
      }

      const newMetadata: ClipMetadata = {
        ...(clip.metadata ?? {}),
        game: nextGame,
      }

      try {
        await window.electronAPI.saveClipMetadata(clip.id, newMetadata)
        updatedMetadata.set(clip.id, newMetadata)
      } catch (error) {
        console.error('[Library] Failed to update game tag:', error)
        failed.push(clip.filename)
      }
    }

    if (updatedMetadata.size > 0) {
      setClips(prev =>
        prev.map(clip => {
          const updated = updatedMetadata.get(clip.id)
          return updated ? { ...clip, metadata: updated } : clip
        })
      )
    }

    setShowGameModal(false)
    setBulkGameValue('')
    setGameSearchQuery('')

    if (failed.length > 0) {
      showBulkMessage(`Failed to update ${failed.length} clips`)
    } else {
      showBulkMessage(
        bulkGameMode === 'add' ? 'Game tag added to selection' : 'Game tag removed from selection'
      )
    }
    clearSelection()
  }, [bulkGameMode, bulkGameValue, clearSelection, selectedClips, showBulkMessage])

  const handleBulkDelete = useCallback(async () => {
    if (selectedClips.length === 0) return

    setIsBulkDeleting(true)
    const deletedIds = new Set<string>()
    const failed: string[] = []

    for (const clip of selectedClips) {
      try {
        const result = await window.electronAPI.deleteClip(clip.id)
        if (result?.success) {
          deletedIds.add(clip.id)
        } else {
          failed.push(clip.filename)
        }
      } catch (error) {
        console.error('[Library] Failed to delete clip:', error)
        failed.push(clip.filename)
      }
    }

    if (deletedIds.size > 0) {
      setClips(prev => prev.filter(clip => !deletedIds.has(clip.id)))
    }

    setIsBulkDeleting(false)
    setShowDeleteConfirm(false)
    clearSelection()

    if (failed.length > 0) {
      showBulkMessage(`Failed to delete ${failed.length} clips`)
    } else {
      showBulkMessage('Deleted selected clips')
    }
  }, [clearSelection, selectedClips, showBulkMessage])

  const handleBulkExport = useCallback(async () => {
    if (selectedClips.length === 0) return

    setIsBulkExporting(true)
    setBulkExportErrors([])
    setBulkExportProgress(0)
    setBulkExportIndex(0)
    setBulkExportTotal(selectedClips.length)
    bulkExportAbortRef.current = false

    const failures: string[] = []

    for (let i = 0; i < selectedClips.length; i += 1) {
      if (bulkExportAbortRef.current) {
        break
      }

      const clip = selectedClips[i]
      setBulkExportIndex(i + 1)
      setBulkExportCurrent(clip.filename)
      setBulkExportProgress(0)

      let clipMetadata = metadata[clip.id]
      if (!clipMetadata) {
        try {
          clipMetadata = await fetchMetadata(clip.id, clip.path)
        } catch (error) {
          console.error('[Library] Failed to fetch metadata for export:', error)
          failures.push(`${clip.filename} (metadata unavailable)`)
          continue
        }
      }

      if (!clipMetadata) {
        failures.push(`${clip.filename} (metadata unavailable)`)
        continue
      }

      const trimStart = clip.metadata?.trim?.start ?? 0
      const trimEndDefault = clip.metadata?.trim?.end ?? clipMetadata.duration
      const trimEnd = Math.max(trimEndDefault, trimStart + 0.01)
      const audioTrack1 = resolveAudioEnabled(clip.metadata?.audio?.track1)
      const audioTrack2 = resolveAudioEnabled(clip.metadata?.audio?.track2)

      const baseFilename = clip.filename.replace('.mp4', '')
      const timestamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)
      const exportFilename = `${baseFilename}_export_${timestamp}.mp4`

      try {
        const result = await window.electronAPI.editor.exportClip({
          clipPath: clip.path,
          exportFilename,
          trimStart,
          trimEnd,
          audioTrack1,
          audioTrack2,
          audioTrack1Volume: 1.0,
          audioTrack2Volume: 1.0,
          targetSizeMB: bulkTargetSizeMB,
        })

        if (!result.success) {
          failures.push(`${clip.filename} (${result.error || 'export failed'})`)
        }
      } catch (error) {
        console.error('[Library] Failed to export clip:', error)
        failures.push(`${clip.filename} (export failed)`)
      }
    }

    setIsBulkExporting(false)
    setBulkExportProgress(0)
    setBulkExportCurrent(null)
    setBulkExportIndex(0)
    setBulkExportTotal(0)
    setBulkExportErrors(failures)

    if (bulkExportAbortRef.current) {
      showBulkMessage('Export stopped')
    } else if (failures.length > 0) {
      showBulkMessage(`Export completed with ${failures.length} errors`)
    } else {
      showBulkMessage('Export completed')
    }
    bulkExportAbortRef.current = false
    clearSelection()
  }, [bulkTargetSizeMB, clearSelection, fetchMetadata, metadata, selectedClips, showBulkMessage])

  const handleCancelExport = useCallback(() => {
    if (isBulkExporting) {
      bulkExportAbortRef.current = true
      showBulkMessage('Stopping export after current clip...')
    }
  }, [isBulkExporting, showBulkMessage])

  useEffect(() => {
    if (!isBulkExporting) {
      return
    }

    const unsubscribe = window.electronAPI.on('export:progress', (data: unknown) => {
      const payload = data as { percent?: number }
      if (typeof payload.percent === 'number') {
        setBulkExportProgress(payload.percent)
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [isBulkExporting])

  useEffect(() => {
    if (showGameModal) {
      void loadGamesList()
    }
  }, [loadGamesList, showGameModal])

  useEffect(() => {
    if (!selectionActive && showExportSizeDropdown) {
      setShowExportSizeDropdown(false)
    }
  }, [selectionActive, showExportSizeDropdown])

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

  const handleScroll = useCallback(
    (e: React.UIEvent<HTMLDivElement>) => {
      const newScrollTop = e.currentTarget.scrollTop
      setScrollTop(newScrollTop)
      saveScrollPosition()
    },
    [saveScrollPosition]
  )

  // Calculate visible range for virtualization
  const isGrid = libraryState.viewMode === 'grid'
  const rowHeight = isGrid ? GRID_CARD_HEIGHT + GRID_GAP : LIST_CARD_HEIGHT + LIST_GAP
  const containerWidth = scrollRef.current?.clientWidth || 1200
  const cols = isGrid ? getGridCols(containerWidth) : 1
  const totalRows = Math.ceil(filteredAndSortedClips.length / cols)

  // Calculate which rows are visible
  const visibleStartRow = Math.max(0, Math.floor(scrollTop / rowHeight) - OVERSCAN_ROWS)
  const visibleEndRow = Math.min(
    totalRows,
    Math.ceil((scrollTop + containerHeight) / rowHeight) + OVERSCAN_ROWS
  )
  const visibleStartIndex = visibleStartRow * cols
  const visibleEndIndex = Math.min(filteredAndSortedClips.length, visibleEndRow * cols)

  return (
    <div className="flex h-full w-full flex-col bg-background-primary">
      {/* Toolbar */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-border px-6">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-text-primary">
            {libraryState.selectedGame
              ? libraryState.selectedGame
              : libraryState.selectedTag
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

      {/* Selection Toolbar */}
      {selectionActive && (
        <div className="flex shrink-0 flex-col border-b border-border bg-background-secondary/60">
          <div className="flex h-12 items-center justify-between px-6">
            <div className="flex items-center gap-3 text-sm text-text-primary">
              <span className="font-medium">{selectedCount} selected</span>
              <button
                type="button"
                onClick={selectAllVisible}
                className="flex items-center gap-1 rounded-md border border-border bg-background-secondary px-2 py-1 text-xs text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
              >
                <CheckSquare className="h-3 w-3" />
                Select all
              </button>
              <button
                type="button"
                onClick={clearSelection}
                className="flex items-center gap-1 rounded-md border border-border bg-background-secondary px-2 py-1 text-xs text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
              >
                <X className="h-3 w-3" />
                Clear
              </button>
              {bulkActionMessage && (
                <span className="ml-2 text-xs text-text-muted">{bulkActionMessage}</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBulkFavoriteToggle}
                disabled={isBulkDeleting || isBulkTagApplying || isBulkExporting}
                className="flex items-center gap-1 rounded-md border border-border bg-background-secondary px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Heart className="h-3 w-3" />
                {selectedClips.every(clip => clip.metadata?.favorite) ? 'Unfavorite' : 'Favorite'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkTagMode('add')
                  setShowTagModal(true)
                  setBulkTagValue('')
                }}
                disabled={isBulkDeleting || isBulkTagApplying || isBulkExporting}
                className="flex items-center gap-1 rounded-md border border-border bg-background-secondary px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Tag className="h-3 w-3" />
                Add Tag
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkTagMode('remove')
                  setShowTagModal(true)
                  setBulkTagValue('')
                }}
                disabled={isBulkDeleting || isBulkTagApplying || isBulkExporting}
                className="flex items-center gap-1 rounded-md border border-border bg-background-secondary px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Tag className="h-3 w-3" />
                Remove Tag
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkGameMode('add')
                  setShowGameModal(true)
                  setBulkGameValue('')
                  setGameSearchQuery('')
                }}
                disabled={isBulkDeleting || isBulkTagApplying || isBulkExporting}
                className="flex items-center gap-1 rounded-md border border-border bg-background-secondary px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Gamepad2 className="h-3 w-3" />
                Add Game
              </button>
              <button
                type="button"
                onClick={() => {
                  setBulkGameMode('remove')
                  setShowGameModal(true)
                  setBulkGameValue('')
                  setGameSearchQuery('')
                }}
                disabled={isBulkDeleting || isBulkTagApplying || isBulkExporting}
                className="flex items-center gap-1 rounded-md border border-border bg-background-secondary px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Gamepad2 className="h-3 w-3" />
                Remove Game
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowExportSizeDropdown(prev => !prev)}
                  disabled={isBulkDeleting || isBulkTagApplying || isBulkExporting}
                  className="flex items-center gap-1 rounded-md border border-border bg-background-secondary px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Size:
                  <span className="text-text-primary">
                    {bulkTargetSizeMB === 'original' ? 'Original' : `${bulkTargetSizeMB}MB`}
                  </span>
                </button>
                {showExportSizeDropdown && (
                  <div className="absolute right-0 top-9 z-20 w-36 overflow-hidden rounded-lg border border-border bg-background-secondary shadow-lg">
                    {[
                      { label: 'Original', value: 'original' as const },
                      { label: '10 MB', value: 10 },
                      { label: '50 MB', value: 50 },
                      { label: '100 MB', value: 100 },
                    ].map(option => (
                      <button
                        key={option.label}
                        type="button"
                        onClick={() => {
                          setBulkTargetSizeMB(option.value)
                          setShowExportSizeDropdown(false)
                        }}
                        className={`flex w-full items-center justify-between px-3 py-2 text-left text-xs transition-colors hover:bg-background-tertiary ${
                          bulkTargetSizeMB === option.value
                            ? 'text-accent-primary'
                            : 'text-text-secondary'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={handleBulkExport}
                disabled={isBulkDeleting || isBulkTagApplying || isBulkExporting}
                className="flex items-center gap-1 rounded-md border border-border bg-background-secondary px-3 py-1.5 text-xs font-medium text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-3 w-3" />
                Export
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                disabled={isBulkDeleting || isBulkTagApplying || isBulkExporting}
                className="flex items-center gap-1 rounded-md border border-red-500/40 bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 transition-colors hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-3 w-3" />
                Delete
              </button>
            </div>
          </div>

          {isBulkExporting && (
            <div className="border-t border-border px-6 py-2">
              <div className="flex items-center justify-between text-xs text-text-muted">
                <span>
                  Exporting {bulkExportIndex}/{bulkExportTotal}
                  {bulkExportCurrent ? ` • ${bulkExportCurrent}` : ''}
                </span>
                <button
                  type="button"
                  onClick={handleCancelExport}
                  className="rounded-md border border-border bg-background-secondary px-2 py-1 text-xs text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
                >
                  Stop
                </button>
              </div>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-background-tertiary">
                <div
                  className="h-full bg-accent-primary transition-all duration-300"
                  style={{ width: `${bulkExportProgress}%` }}
                />
              </div>
            </div>
          )}

          {!isBulkExporting && bulkExportErrors.length > 0 && (
            <div className="border-t border-border px-6 py-2">
              <p className="text-xs text-red-400">
                Export errors: {bulkExportErrors.slice(0, 2).join(', ')}
                {bulkExportErrors.length > 2 ? ` +${bulkExportErrors.length - 2} more` : ''}
              </p>
            </div>
          )}
        </div>
      )}

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
            <div className="mx-2 h-6 w-px bg-border" />
            <div className="relative">
              <select
                value={libraryState.selectedTag || ''}
                onChange={e => {
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
                  <option key={tag} value={tag}>
                    {tag} ({tagCounts[tag]})
                  </option>
                ))}
              </select>
              {libraryState.selectedTag && (
                <button
                  onClick={() => setSelectedTag(null)}
                  className="ml-2 rounded-md p-1 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
                  title="Clear tag filter"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          </>
        )}

        {/* Game Filter Dropdown - Always visible */}
        <div className="mx-2 h-6 w-px bg-border" />
        <div className="relative flex items-center">
          {allGames.length > 0 ? (
            <>
              <Gamepad2 className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-text-muted" />
              <select
                value={libraryState.selectedGame || ''}
                onChange={e => {
                  const value = e.target.value
                  setSelectedGame(value || null)
                }}
                className={`cursor-pointer appearance-none rounded-md py-1.5 pl-7 pr-8 text-sm font-medium transition-all ${
                  libraryState.selectedGame
                    ? 'bg-accent-primary text-background-primary'
                    : 'bg-background-secondary text-text-muted hover:bg-background-tertiary hover:text-text-primary'
                }`}
              >
                <option value="">All Games</option>
                {allGames.map(game => (
                  <option key={game} value={game}>
                    {game} ({gameCounts[game]})
                  </option>
                ))}
              </select>
              {libraryState.selectedGame && (
                <button
                  type="button"
                  onClick={() => setSelectedGame(null)}
                  className="ml-2 rounded-md p-1 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
                  title="Clear game filter"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-xs text-text-muted">No games tagged</span>
              <button
                type="button"
                onClick={() => {
                  if (clips.length > 0) {
                    setEditingGameClip(clips[0])
                  }
                }}
                disabled={clips.length === 0}
                className="flex items-center gap-1 rounded-md bg-background-secondary px-2 py-1 text-xs text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-50"
                title={
                  clips.length === 0 ? 'No clips available to tag' : 'Add game to the first clip'
                }
              >
                <Plus className="h-3 w-3" />
                Add Game
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Content */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-6">
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
              <button type="button" onClick={loadClips} className="btn-primary">
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
            {visibleStartRow > 0 && <div style={{ height: visibleStartRow * rowHeight }} />}

            {/* Visible clips grid */}
            <div
              className={`grid gap-4 ${
                isGrid ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' : 'grid-cols-1'
              }`}
            >
              {filteredAndSortedClips
                .slice(visibleStartIndex, visibleEndIndex)
                .map((clip, index) => {
                  const clipIndex = visibleStartIndex + index
                  return (
                    <ClipCard
                      key={clip.id}
                      clip={clip}
                      clipIndex={clipIndex}
                      viewMode={libraryState.viewMode}
                      formatFileSize={formatFileSize}
                      formatDate={formatDate}
                      thumbnailUrl={thumbnails[clip.id]}
                      metadata={metadata[clip.id]}
                      isSelected={selectedClipIds.has(clip.id)}
                      showSelection={selectionActive}
                      onGenerateThumbnail={generateThumbnail}
                      onFetchMetadata={fetchMetadata}
                      onCardClick={handleCardClick}
                      onToggleSelect={handleToggleSelect}
                      onEditGame={handleEditGame}
                    />
                  )
                })}
            </div>

            {/* Spacer for rows below visible range */}
            {visibleEndRow < totalRows && (
              <div style={{ height: (totalRows - visibleEndRow) * rowHeight }} />
            )}
          </>
        )}
      </div>

      {/* Bulk Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-96 rounded-xl border border-border bg-background-secondary p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-text-primary">
              Delete {selectedCount} clip{selectedCount === 1 ? '' : 's'}?
            </h3>
            <p className="mb-4 text-sm text-text-muted">
              This will permanently delete the selected clips. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="btn-secondary"
                disabled={isBulkDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulkDelete}
                disabled={isBulkDeleting}
                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isBulkDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-96 rounded-xl border border-border bg-background-secondary p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-text-primary">
              {bulkTagMode === 'add' ? 'Add Tag' : 'Remove Tag'}
            </h3>
            <p className="mb-4 text-sm text-text-muted">
              Apply to {selectedCount} clip{selectedCount === 1 ? '' : 's'}.
            </p>
            <input
              type="text"
              value={bulkTagValue}
              onChange={e => setBulkTagValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && applyBulkTags()}
              placeholder={bulkTagMode === 'add' ? 'e.g. clutch' : 'select a tag to remove'}
              className="input w-full"
            />
            <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-border bg-background-primary/40 p-2">
              {(bulkTagMode === 'add' ? allTags : selectedTags).length === 0 ? (
                <p className="text-xs text-text-muted">
                  {bulkTagMode === 'add' ? 'No tags exist yet.' : 'No tags on selected clips.'}
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {(bulkTagMode === 'add' ? allTags : selectedTags).map(tag => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => setBulkTagValue(tag)}
                      className={`rounded-full px-2 py-1 text-xs transition-colors ${
                        bulkTagValue === tag
                          ? 'bg-accent-primary text-background-primary'
                          : 'bg-background-tertiary text-text-muted hover:text-text-primary'
                      }`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowTagModal(false)
                  setBulkTagValue('')
                }}
                className="btn-secondary"
                disabled={isBulkTagApplying}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBulkTags}
                disabled={isBulkTagApplying || bulkTagValue.trim().length === 0}
                className="btn-primary"
              >
                {isBulkTagApplying ? 'Applying...' : bulkTagMode === 'add' ? 'Add' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Game Modal */}
      {showGameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="w-[420px] rounded-xl border border-border bg-background-secondary p-6 shadow-2xl">
            <h3 className="mb-2 text-lg font-semibold text-text-primary">
              {bulkGameMode === 'add' ? 'Add Game Tag' : 'Remove Game Tag'}
            </h3>
            <p className="mb-4 text-sm text-text-muted">
              Apply to {selectedCount} clip{selectedCount === 1 ? '' : 's'}.
            </p>

            {bulkGameMode === 'add' ? (
              <>
                <input
                  type="text"
                  value={gameSearchQuery}
                  onChange={e => setGameSearchQuery(e.target.value)}
                  placeholder="Search games..."
                  className="input w-full"
                />
                <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-border bg-background-primary/40 p-2">
                  {gamesLoading ? (
                    <p className="text-xs text-text-muted">Loading games...</p>
                  ) : filteredGamesList.length === 0 ? (
                    <p className="text-xs text-text-muted">No games found.</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {filteredGamesList.map(game => (
                        <button
                          key={game}
                          type="button"
                          onClick={() => setBulkGameValue(game)}
                          className={`rounded-full px-2 py-1 text-xs transition-colors ${
                            bulkGameValue === game
                              ? 'bg-accent-primary text-background-primary'
                              : 'bg-background-tertiary text-text-muted hover:text-text-primary'
                          }`}
                        >
                          {game}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-background-primary/40 p-2">
                {selectedGames.length === 0 ? (
                  <p className="text-xs text-text-muted">No game tags on selected clips.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {selectedGames.map(game => (
                      <button
                        key={game}
                        type="button"
                        onClick={() => setBulkGameValue(game)}
                        className={`rounded-full px-2 py-1 text-xs transition-colors ${
                          bulkGameValue === game
                            ? 'bg-red-500 text-white'
                            : 'bg-background-tertiary text-text-muted hover:text-text-primary'
                        }`}
                      >
                        {game}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowGameModal(false)
                  setBulkGameValue('')
                  setGameSearchQuery('')
                }}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={applyBulkGame}
                disabled={bulkGameValue.trim().length === 0}
                className="btn-primary"
              >
                {bulkGameMode === 'add' ? 'Add' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Game Tag Editor Modal */}
      <GameTagEditor
        isOpen={!!editingGameClip}
        onClose={() => setEditingGameClip(null)}
        clip={editingGameClip}
        currentGame={editingGameClip?.metadata?.game || null}
        onSave={handleSaveGame}
      />
    </div>
  )
}
