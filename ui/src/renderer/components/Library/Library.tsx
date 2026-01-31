import React, { useEffect, useState } from 'react'
import { Search, Grid3X3, List, Loader2 } from 'lucide-react'
import { ClipCard } from './ClipCard'

interface Clip {
  id: string
  filename: string
  path: string
  size: number
  createdAt: string
  modifiedAt: string
  metadata: unknown | null
}

export const Library: React.FC = () => {
  const [clips, setClips] = useState<Clip[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

  useEffect(() => {
    loadClips()
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

  const filteredClips = clips.filter(clip =>
    clip.filename.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <div className="h-full flex flex-col bg-background-primary">
      {/* Toolbar */}
      <div className="h-16 px-6 border-b border-border flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold text-text-primary">
            All Clips
          </h2>
          <span className="text-sm text-text-muted">
            {filteredClips.length} clips
          </span>
        </div>

        <div className="flex items-center gap-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Search clips..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="input pl-10 w-64"
            />
          </div>

          {/* View Toggle */}
          <div className="flex items-center bg-background-secondary rounded-lg p-1 border border-border">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-2 rounded-md transition-all ${
                viewMode === 'grid'
                  ? 'bg-accent-primary text-background-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <Grid3X3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('list')}
              className={`p-2 rounded-md transition-all ${
                viewMode === 'list'
                  ? 'bg-accent-primary text-background-primary'
                  : 'text-text-muted hover:text-text-primary'
              }`}
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-text-muted">
              <Loader2 className="w-8 h-8 animate-spin" />
              <p>Loading clips...</p>
            </div>
          </div>
        ) : error ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-text-secondary mb-4">{error}</p>
              <button onClick={loadClips} className="btn-primary">
                Retry
              </button>
            </div>
          </div>
        ) : filteredClips.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-text-muted text-lg mb-2">No clips found</p>
              <p className="text-text-muted text-sm">
                Clips will appear here when you save them with F9 in ClipVault
              </p>
            </div>
          </div>
        ) : (
          <div className={`grid gap-4 ${
            viewMode === 'grid' 
              ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
              : 'grid-cols-1'
          }`}>
            {filteredClips.map((clip) => (
              <ClipCard
                key={clip.id}
                clip={clip}
                viewMode={viewMode}
                formatFileSize={formatFileSize}
                formatDate={formatDate}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
