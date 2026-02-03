import {
  Video,
  Settings,
  FolderOpen,
  Library,
  RotateCcw,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react'
import { APP_VERSION } from '../../../constants/version'

interface HeaderProps {
  currentView: 'library' | 'editor' | 'settings'
  onNavigateToLibrary?: () => void
  onOpenSettings?: () => void
  onGoBack?: () => void
  onGoForward?: () => void
  onRefresh?: () => void
  canGoBack?: boolean
  canGoForward?: boolean
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  onNavigateToLibrary,
  onOpenSettings,
  onGoBack,
  onGoForward,
  onRefresh,
  canGoBack,
  canGoForward,
}) => {
  const handleOpenFolder = async () => {
    try {
      await window.electronAPI.openClipsFolder()
    } catch (error) {
      console.error('Failed to open folder:', error)
    }
  }

  const handleRefresh = () => {
    if (onRefresh) {
      onRefresh()
    } else {
      window.location.reload()
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background-secondary px-6">
      <div className="flex items-center gap-3">
        <Video className="h-6 w-6 text-accent-primary" />
        <h1 className="text-lg font-semibold text-text-primary">ClipVault Editor</h1>
        <span className="rounded bg-background-tertiary px-2 py-1 text-xs text-text-muted">
          v{APP_VERSION}
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Navigation buttons */}
        <div className="mr-2 flex items-center gap-1">
          <button
            onClick={onGoBack}
            disabled={!canGoBack}
            className="btn-secondary p-2 disabled:cursor-not-allowed disabled:opacity-30"
            title="Go Back (Alt+Left or Mouse Back)"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            onClick={onGoForward}
            disabled={!canGoForward}
            className="btn-secondary p-2 disabled:cursor-not-allowed disabled:opacity-30"
            title="Go Forward (Alt+Right or Mouse Forward)"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <button
            onClick={handleRefresh}
            className="btn-secondary p-2"
            title="Refresh (F5 or Ctrl+R)"
          >
            <RotateCcw className="h-4 w-4" />
          </button>
        </div>

        <div className="mx-2 h-6 w-px bg-border" />

        {currentView !== 'library' && onNavigateToLibrary && (
          <button
            onClick={onNavigateToLibrary}
            className="btn-secondary flex items-center gap-2 text-sm"
          >
            <Library className="h-4 w-4" />
            Library
          </button>
        )}
        <button
          onClick={handleOpenFolder}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <FolderOpen className="h-4 w-4" />
          Open Folder
        </button>
        <button onClick={onOpenSettings} className="btn-secondary p-2">
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
