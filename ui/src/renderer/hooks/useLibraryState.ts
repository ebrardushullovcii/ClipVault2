import { useState, useEffect, useCallback, useRef } from 'react'

interface LibraryState {
  searchQuery: string
  viewMode: 'grid' | 'list'
  sortBy: 'date' | 'size' | 'name' | 'favorite'
  sortDirection: 'asc' | 'desc'
  filterBy: 'all' | 'favorites' | 'recent'
  showFavoritesOnly: boolean
  selectedTag: string | null
  scrollPosition: number
}

const STORAGE_KEY = 'clipvault_library_state'

export const useLibraryState = () => {
  const [state, setState] = useState<LibraryState>({
    searchQuery: '',
    viewMode: 'grid',
    sortBy: 'date',
    sortDirection: 'desc',
    filterBy: 'all',
    showFavoritesOnly: false,
    selectedTag: null,
    scrollPosition: 0,
  })

  const [isRestored, setIsRestored] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // Load state from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        setState(prev => ({
          ...prev,
          ...parsed,
          // Don't restore scroll position immediately, we'll do it after render
        }))
      }
    } catch (error) {
      console.error('[LibraryState] Failed to restore state:', error)
    }
    setIsRestored(true)
  }, [])

  // Restore scroll position after content loads
  useEffect(() => {
    if (isRestored && scrollRef.current) {
      try {
        const saved = localStorage.getItem(STORAGE_KEY)
        if (saved) {
          const parsed = JSON.parse(saved)
          if (parsed.scrollPosition && parsed.scrollPosition > 0) {
            // Small delay to ensure content is rendered
            setTimeout(() => {
              if (scrollRef.current) {
                scrollRef.current.scrollTop = parsed.scrollPosition
              }
            }, 100)
          }
        }
      } catch (error) {
        console.error('[LibraryState] Failed to restore scroll:', error)
      }
    }
  }, [isRestored])

  // Save state to localStorage
  const saveState = useCallback((newState: Partial<LibraryState>) => {
    setState(prev => {
      const updated = { ...prev, ...newState }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
      } catch (error) {
        console.error('[LibraryState] Failed to save state:', error)
      }
      return updated
    })
  }, [])

  // Save scroll position
  const saveScrollPosition = useCallback(() => {
    if (scrollRef.current) {
      const scrollPos = scrollRef.current.scrollTop
      setState(prev => {
        const updated = { ...prev, scrollPosition: scrollPos }
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(updated))
        } catch (error) {
          console.error('[LibraryState] Failed to save scroll position:', error)
        }
        return updated
      })
    }
  }, [])

  // Update individual state values
  const setSearchQuery = useCallback((value: string) => {
    saveState({ searchQuery: value })
  }, [saveState])

  const setViewMode = useCallback((value: 'grid' | 'list') => {
    saveState({ viewMode: value })
  }, [saveState])

  const setSortBy = useCallback((value: 'date' | 'size' | 'name' | 'favorite') => {
    saveState({ sortBy: value })
  }, [saveState])

  const setFilterBy = useCallback((value: 'all' | 'favorites' | 'recent') => {
    saveState({ filterBy: value })
  }, [saveState])

  const setShowFavoritesOnly = useCallback((value: boolean) => {
    saveState({ showFavoritesOnly: value })
  }, [saveState])

  const toggleSortDirection = useCallback(() => {
    saveState({ sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc' })
  }, [saveState, state.sortDirection])

  const setSelectedTag = useCallback((value: string | null) => {
    saveState({ selectedTag: value })
  }, [saveState])

  return {
    state,
    scrollRef,
    isRestored,
    setSearchQuery,
    setViewMode,
    setSortBy,
    toggleSortDirection,
    setFilterBy,
    setShowFavoritesOnly,
    setSelectedTag,
    saveScrollPosition,
  }
}
