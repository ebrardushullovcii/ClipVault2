import React from 'react'
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
    <header className="h-14 bg-background-secondary border-b border-border flex items-center justify-between px-6 shrink-0">
      <div className="flex items-center gap-3">
        <Video className="w-6 h-6 text-accent-primary" />
        <h1 className="text-lg font-semibold text-text-primary">ClipVault Editor</h1>
        <span className="text-xs text-text-muted bg-background-tertiary px-2 py-1 rounded">
          v1.0.0
        </span>
      </div>
      
      <div className="flex items-center gap-2">
        <button 
          onClick={handleOpenFolder}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <FolderOpen className="w-4 h-4" />
          Open Folder
        </button>
        <button className="btn-secondary p-2">
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </header>
  )
}
