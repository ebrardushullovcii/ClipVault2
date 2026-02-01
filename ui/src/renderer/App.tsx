import React, { useState, useCallback, useRef, useEffect } from 'react'
import { AppLayout } from './components/Layout/AppLayout'
import { Library } from './components/Library/Library'
import { Editor } from './components/Editor/Editor'
import { Settings } from './components/Settings'
import type { VideoMetadata } from './hooks/useVideoMetadata'
import type { ClipInfo, ClipMetadata } from './types/electron'

type View = 'library' | 'settings'

// Navigation history entry
interface HistoryEntry {
  type: 'library' | 'clip'
  clip?: ClipInfo
  metadata?: VideoMetadata
}

function App() {
  const [currentView, setCurrentView] = useState<View>('library')
  const [selectedClip, setSelectedClip] = useState<ClipInfo | null>(null)
  const [selectedClipMetadata, setSelectedClipMetadata] = useState<VideoMetadata | null>(null)
  const [showEditor, setShowEditor] = useState(false)
  // Navigation history for browser-like back/forward
  const [history, setHistory] = useState<HistoryEntry[]>([{ type: 'library' }])
  const [historyIndex, setHistoryIndex] = useState(0)
  // Ref to hold the Library's update function
  const libraryUpdateRef = useRef<((clipId: string, metadata: ClipMetadata) => void) | null>(null)
  // Ref to track if we're navigating programmatically
  const isNavigatingRef = useRef(false)

  // Add entry to history when opening a clip
  const addToHistory = useCallback((entry: HistoryEntry) => {
    setHistory(prev => {
      // Remove any forward history if we're branching off
      const newHistory = prev.slice(0, prev.length)
      return [...newHistory, entry]
    })
    setHistoryIndex(prev => prev + 1)
  }, [])

  // Go back in history
  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      isNavigatingRef.current = true
      const newIndex = historyIndex - 1
      const entry = history[newIndex]
      setHistoryIndex(newIndex)

      if (entry.type === 'library') {
        setShowEditor(false)
        setSelectedClip(null)
        setSelectedClipMetadata(null)
      } else if (entry.clip && entry.metadata) {
        setSelectedClip(entry.clip)
        setSelectedClipMetadata(entry.metadata)
        setShowEditor(true)
      }
      setTimeout(() => { isNavigatingRef.current = false }, 100)
    }
  }, [history, historyIndex])

  // Go forward in history
  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      isNavigatingRef.current = true
      const newIndex = historyIndex + 1
      const entry = history[newIndex]
      setHistoryIndex(newIndex)

      if (entry.type === 'library') {
        setShowEditor(false)
        setSelectedClip(null)
        setSelectedClipMetadata(null)
      } else if (entry.clip && entry.metadata) {
        setSelectedClip(entry.clip)
        setSelectedClipMetadata(entry.metadata)
        setShowEditor(true)
      }
      setTimeout(() => { isNavigatingRef.current = false }, 100)
    }
  }, [history, historyIndex])

  const handleOpenEditor = useCallback((clip: ClipInfo, metadata: VideoMetadata) => {
    if (!isNavigatingRef.current) {
      addToHistory({ type: 'clip', clip, metadata })
    }
    setSelectedClip(clip)
    setSelectedClipMetadata(metadata)
    setShowEditor(true)
  }, [addToHistory])

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
  const handleRegisterLibraryUpdate = useCallback((updateFn: (clipId: string, metadata: ClipMetadata) => void) => {
    libraryUpdateRef.current = updateFn
  }, [])

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

  const hideHeader = showEditor || currentView === 'settings'

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
      <div style={{ 
        display: 'flex', 
        height: '100%',
        width: '100%',
        visibility: showEditor || currentView === 'settings' ? 'hidden' : 'visible'
      }}>
        <Library 
          onOpenEditor={handleOpenEditor}
          onRegisterUpdate={handleRegisterLibraryUpdate}
        />
      </div>
      
      {/* Settings overlay */}
      {currentView === 'settings' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50 }}>
          <Settings onClose={handleCloseSettings} />
        </div>
      )}
      
      {/* Editor modal overlay - Library stays mounted behind */}
      {showEditor && selectedClip && selectedClipMetadata && (
        <div 
          style={{ 
            position: 'absolute', 
            inset: 0, 
            zIndex: 40,
            animation: 'fadeIn 0.2s ease-out'
          }}
        >
          <Editor
            clip={selectedClip}
            metadata={selectedClipMetadata}
            onClose={handleCloseEditor}
            onSave={handleSaveMetadata}
          />
        </div>
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