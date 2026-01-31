import { useState, useCallback } from 'react'
import { AppLayout } from './components/Layout/AppLayout'
import { Library } from './components/Library/Library'
import { Editor } from './components/Editor/Editor'
import { Settings } from './components/Settings'
import type { VideoMetadata } from './hooks/useVideoMetadata'
import type { ClipInfo, ClipMetadata } from './types/electron'

type View = 'library' | 'editor' | 'settings'

function App() {
  const [currentView, setCurrentView] = useState<View>('library')
  const [selectedClip, setSelectedClip] = useState<ClipInfo | null>(null)
  const [selectedClipMetadata, setSelectedClipMetadata] = useState<VideoMetadata | null>(null)

  const handleOpenEditor = useCallback((clip: ClipInfo, metadata: VideoMetadata) => {
    setSelectedClip(clip)
    setSelectedClipMetadata(metadata)
    setCurrentView('editor')
  }, [])

  const handleCloseEditor = useCallback(() => {
    setCurrentView('library')
    setSelectedClip(null)
    setSelectedClipMetadata(null)
  }, [])

  const handleOpenSettings = useCallback(() => {
    setCurrentView('settings')
  }, [])

  const handleCloseSettings = useCallback(() => {
    setCurrentView('library')
  }, [])

  const handleNavigateToLibrary = useCallback(() => {
    setCurrentView('library')
    setSelectedClip(null)
    setSelectedClipMetadata(null)
  }, [])

  const handleSaveMetadata = useCallback(async (clipId: string, metadata: ClipMetadata) => {
    try {
      await window.electronAPI.saveClipMetadata(clipId, metadata)
      // Optionally show a success notification here
    } catch (error) {
      console.error('Failed to save metadata:', error)
    }
  }, [])

  return (
    <AppLayout currentView={currentView} onOpenSettings={handleOpenSettings} onNavigateToLibrary={handleNavigateToLibrary}>
      {currentView === 'library' ? (
        <Library onOpenEditor={handleOpenEditor} />
      ) : currentView === 'settings' ? (
        <Settings onClose={handleCloseSettings} />
      ) : selectedClip && selectedClipMetadata ? (
        <Editor
          clip={selectedClip}
          metadata={selectedClipMetadata}
          onClose={handleCloseEditor}
          onSave={handleSaveMetadata}
        />
      ) : null}
    </AppLayout>
  )
}

export default App
