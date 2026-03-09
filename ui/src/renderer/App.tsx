import { useState, useCallback, useRef, useEffect, useReducer } from 'react'
import { AppLayout } from './components/Layout/AppLayout'
import { Library } from './components/Library/Library'
import { Editor } from './components/Editor/Editor'
import { Settings } from './components/Settings'
import { FirstRunWizard } from './components/FirstRunWizard'
import type { VideoMetadata } from './hooks/useVideoMetadata'
import type { AppSettings, ClipInfo, ClipMetadata } from './types/electron'

type View = 'library' | 'settings'

// Navigation history entry
interface HistoryEntry {
  type: 'library' | 'clip'
  clip?: ClipInfo
  metadata?: VideoMetadata
}

type ClipNavigationDirection = 'previous' | 'next'

type AdjacentClipResult = {
  clip: ClipInfo
  metadata: VideoMetadata
}

type LibraryNavigationResolver = (
  clipId: string,
  direction: ClipNavigationDirection
) => AdjacentClipResult | null

type HistoryState = {
  history: HistoryEntry[]
  historyIndex: number
}

type HistoryAction =
  | {
      type: 'ADD_HISTORY'
      entry: HistoryEntry
    }
  | {
      type: 'SET_HISTORY_INDEX'
      historyIndex: number
    }

const initialHistoryState: HistoryState = {
  history: [{ type: 'library' }],
  historyIndex: 0,
}

const historyReducer = (state: HistoryState, action: HistoryAction): HistoryState => {
  switch (action.type) {
    case 'ADD_HISTORY': {
      const history = [...state.history.slice(0, state.historyIndex + 1), action.entry]
      return {
        history,
        historyIndex: history.length - 1,
      }
    }
    case 'SET_HISTORY_INDEX':
      return {
        ...state,
        historyIndex: action.historyIndex,
      }
    default:
      return state
  }
}

function App() {
  const [currentView, setCurrentView] = useState<View>('library')
  const [selectedClip, setSelectedClip] = useState<ClipInfo | null>(null)
  const [selectedClipMetadata, setSelectedClipMetadata] = useState<VideoMetadata | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  const [showFirstRun, setShowFirstRun] = useState(false)
  const [firstRunSettings, setFirstRunSettings] = useState<AppSettings | null>(null)
  const [appSettings, setAppSettings] = useState<AppSettings | null>(null)
  // Navigation history for browser-like back/forward
  const [{ history, historyIndex }, dispatchHistory] = useReducer(
    historyReducer,
    initialHistoryState
  )
  // Ref to hold the Library's update function
  const libraryUpdateRef = useRef<((clipId: string, metadata: ClipMetadata) => void) | null>(null)
  // Ref to hold the Library's clip navigation resolver
  const libraryNavigationRef = useRef<LibraryNavigationResolver | null>(null)
  // Ref to track if we're navigating programmatically
  const isNavigatingRef = useRef(false)

  useEffect(() => {
    let mounted = true
    const loadSettings = async () => {
      try {
        const settings = await window.electronAPI.getSettings()
        if (!mounted) return
        setFirstRunSettings(settings)
        setAppSettings(settings)
        setShowFirstRun(!settings.ui?.first_run_completed)
      } catch (error) {
        console.error('Failed to load settings for first run:', error)
      }
    }

    void loadSettings()

    return () => {
      mounted = false
    }
  }, [])

  const handleFirstRunFinish = useCallback(async (settings: AppSettings) => {
    try {
      await window.electronAPI.saveSettings(settings)
      await window.electronAPI.setStartup(settings.ui?.start_with_windows ?? false)
      setFirstRunSettings(settings)
      setAppSettings(settings)
      setShowFirstRun(false)
    } catch (error) {
      console.error('Failed to save first-run settings:', error)
    }
  }, [])

  const handleSettingsSaved = useCallback((settings: AppSettings) => {
    setAppSettings(settings)
  }, [])

  // Add entry to history when opening a clip
  const addToHistory = useCallback((entry: HistoryEntry) => {
    dispatchHistory({ type: 'ADD_HISTORY', entry })
  }, [])

  // Go back in history
  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      isNavigatingRef.current = true
      const newIndex = historyIndex - 1
      const entry = history[newIndex]
      dispatchHistory({ type: 'SET_HISTORY_INDEX', historyIndex: newIndex })

      if (entry.type === 'library') {
        setShowEditor(false)
        setSelectedClip(null)
        setSelectedClipMetadata(null)
      } else if (entry.clip && entry.metadata) {
        setSelectedClip(entry.clip)
        setSelectedClipMetadata(entry.metadata)
        setShowEditor(true)
      }
      setTimeout(() => {
        isNavigatingRef.current = false
      }, 100)
    }
  }, [history, historyIndex])

  // Go forward in history
  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isNavigatingRef.current = true
      const newIndex = historyIndex + 1
      const entry = history[newIndex]
      dispatchHistory({ type: 'SET_HISTORY_INDEX', historyIndex: newIndex })

      if (entry.type === 'library') {
        setShowEditor(false)
        setSelectedClip(null)
        setSelectedClipMetadata(null)
      } else if (entry.clip && entry.metadata) {
        setSelectedClip(entry.clip)
        setSelectedClipMetadata(entry.metadata)
        setShowEditor(true)
      }
      setTimeout(() => {
        isNavigatingRef.current = false
      }, 100)
    }
  }, [history, historyIndex])

  const handleOpenEditor = useCallback(
    (clip: ClipInfo, metadata: VideoMetadata) => {
      if (!isNavigatingRef.current) {
        addToHistory({ type: 'clip', clip, metadata })
      }
      setSelectedClip(clip)
      setSelectedClipMetadata(metadata)
      setShowEditor(true)
    },
    [addToHistory]
  )

  const handleCloseEditor = useCallback(() => {
    if (!isNavigatingRef.current) {
      addToHistory({ type: 'library' })
    }
    setShowEditor(false)
    setTimeout(() => {
      setSelectedClip(null)
      setSelectedClipMetadata(null)
    }, 300)
  }, [addToHistory])

  const handleOpenSettings = useCallback(() => {
    setCurrentView('settings')
  }, [])

  const handleCloseSettings = useCallback(() => {
    setCurrentView('library')
  }, [])

  const handleNavigateToLibrary = useCallback(() => {
    addToHistory({ type: 'library' })
    setCurrentView('library')
    setShowEditor(false)
    setSelectedClip(null)
    setSelectedClipMetadata(null)
  }, [addToHistory])

  // Keyboard shortcuts and mouse back/forward
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+R or F5 to refresh
      if ((e.ctrlKey || e.metaKey) && e.key === 'r') {
        e.preventDefault()
        window.location.reload()
      }
      if (e.key === 'F5') {
        e.preventDefault()
        window.location.reload()
      }
      // Alt+Left for back
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        goBack()
      }
      // Alt+Right for forward
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        goForward()
      }
    }

    const handleMouseDown = (e: MouseEvent) => {
      // Mouse button 4 = back, button 5 = forward
      if (e.button === 3) {
        e.preventDefault()
        goBack()
      }
      if (e.button === 4) {
        e.preventDefault()
        goForward()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('mousedown', handleMouseDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('mousedown', handleMouseDown)
    }
  }, [goBack, goForward])

  // Callback for Library to register its update function
  const handleRegisterLibraryUpdate = useCallback(
    (updateFn: (clipId: string, metadata: ClipMetadata) => void) => {
      libraryUpdateRef.current = updateFn
    },
    []
  )

  const handleRegisterLibraryNavigation = useCallback((resolver: LibraryNavigationResolver) => {
    libraryNavigationRef.current = resolver
  }, [])

  const getAdjacentClip = useCallback(
    (clipId: string, direction: ClipNavigationDirection): AdjacentClipResult | null => {
      if (!libraryNavigationRef.current) {
        return null
      }
      return libraryNavigationRef.current(clipId, direction)
    },
    []
  )

  // Save metadata and trigger update in Library
  const handleSaveMetadata = useCallback(async (clipId: string, metadata: ClipMetadata) => {
    try {
      await window.electronAPI.saveClipMetadata(clipId, metadata)
      if (libraryUpdateRef.current) {
        libraryUpdateRef.current(clipId, metadata)
      }
    } catch (error) {
      console.error('Failed to save metadata:', error)
    }
  }, [])

  const hideHeader = showEditor || currentView === 'settings' || showFirstRun

  return (
    <AppLayout
      currentView={showEditor ? 'editor' : currentView}
      onOpenSettings={handleOpenSettings}
      onNavigateToLibrary={handleNavigateToLibrary}
      onGoBack={goBack}
      onGoForward={goForward}
      onRefresh={() => window.location.reload()}
      canGoBack={historyIndex > 0}
      canGoForward={historyIndex < history.length - 1}
      hideHeader={hideHeader}
    >
      {/* Library is always rendered (needed for metadata updates) */}
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          visibility:
            showEditor || currentView === 'settings' || showFirstRun ? 'hidden' : 'visible',
        }}
      >
        <Library
          onOpenEditor={handleOpenEditor}
          onRegisterUpdate={handleRegisterLibraryUpdate}
          onRegisterNavigation={handleRegisterLibraryNavigation}
          hoverPreviewEnabled={
            appSettings !== null && appSettings.ui?.library_hover_preview !== false
          }
        />
      </div>

      {/* Settings overlay */}
      {currentView === 'settings' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
          <Settings onClose={handleCloseSettings} onSettingsSaved={handleSettingsSaved} />
        </div>
      )}

      {/* Editor modal overlay - Library stays mounted behind */}
      {showEditor && selectedClip && selectedClipMetadata && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 40,
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <Editor
            key={selectedClip.id}
            clip={selectedClip}
            metadata={selectedClipMetadata}
            onClose={handleCloseEditor}
            onSave={handleSaveMetadata}
            onOpenClip={handleOpenEditor}
            getAdjacentClip={getAdjacentClip}
          />
        </div>
      )}

      {showFirstRun && firstRunSettings && (
        <FirstRunWizard
          initialSettings={firstRunSettings}
          onComplete={handleFirstRunFinish}
          onSkip={handleFirstRunFinish}
        />
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </AppLayout>
  )
}

export default App
