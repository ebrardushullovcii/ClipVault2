import { Video, Settings, FolderOpen } from 'lucide-react'

export const Header: React.FC = () => {
  const handleOpenFolder = async () => {
    try {
      await window.electronAPI.openClipsFolder()
    } catch (error) {
      console.error('Failed to open folder:', error)
    }
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border bg-background-secondary px-6">
      <div className="flex items-center gap-3">
        <Video className="h-6 w-6 text-accent-primary" />
        <h1 className="text-lg font-semibold text-text-primary">ClipVault Editor</h1>
        <span className="rounded bg-background-tertiary px-2 py-1 text-xs text-text-muted">
          v1.0.0
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={handleOpenFolder}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <FolderOpen className="h-4 w-4" />
          Open Folder
        </button>
        <button className="btn-secondary p-2">
          <Settings className="h-4 w-4" />
        </button>
      </div>
    </header>
  )
}
