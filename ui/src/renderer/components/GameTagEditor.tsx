import React, { useState, useMemo, useEffect, useRef } from 'react'
import { X, Search, Gamepad2 } from 'lucide-react'
import type { ClipInfo } from '../types/electron'

// Game database structure
interface GameEntry {
  name: string
  processNames: string[]
  twitchId: string
}

// Built-in games database as fallback
const BUILTIN_GAMES: GameEntry[] = [
  { name: 'League of Legends', processNames: ['League of Legends.exe', 'LeagueClient.exe'], twitchId: '21779' },
  { name: 'Valorant', processNames: ['VALORANT.exe', 'VALORANT-Win64-Shipping.exe'], twitchId: '516575' },
  { name: 'Counter-Strike 2', processNames: ['cs2.exe', 'csgo.exe'], twitchId: '32399' },
  { name: 'Fortnite', processNames: ['FortniteClient-Win64-Shipping.exe'], twitchId: '33214' },
  { name: 'Apex Legends', processNames: ['r5apex.exe'], twitchId: '511224' },
  { name: 'Minecraft', processNames: ['Minecraft.exe', 'javaw.exe'], twitchId: '27471' },
  { name: 'Overwatch 2', processNames: ['Overwatch.exe'], twitchId: '1814638' },
  { name: 'Rainbow Six Siege', processNames: ['RainbowSix.exe', 'RainbowSix_Vulkan.exe'], twitchId: '25949' },
  { name: 'PUBG', processNames: ['TslGame.exe'], twitchId: '493057' },
  { name: 'Rocket League', processNames: ['RocketLeague.exe'], twitchId: '271224' },
  { name: 'Dota 2', processNames: ['dota2.exe'], twitchId: '29595' },
  { name: 'Team Fortress 2', processNames: ['hl2.exe'], twitchId: '44011' },
  { name: 'Rust', processNames: ['RustClient.exe'], twitchId: '252490' },
  { name: 'GTA V', processNames: ['GTA5.exe'], twitchId: '33133' },
  { name: 'Warframe', processNames: ['Warframe.exe'], twitchId: '24204' },
  { name: 'Path of Exile', processNames: ['PathOfExile.exe'], twitchId: '211063' },
  { name: 'Dead by Daylight', processNames: ['DeadByDaylight.exe'], twitchId: '438610' },
  { name: 'Destiny 2', processNames: ['destiny2.exe'], twitchId: '242484' },
  { name: 'SMITE', processNames: ['Smite.exe'], twitchId: '33411' },
  { name: 'Elden Ring', processNames: ['eldenring.exe'], twitchId: '0' },
  { name: 'Cyberpunk 2077', processNames: ['Cyberpunk2077.exe'], twitchId: '515110' },
  { name: 'Baldur\'s Gate 3', processNames: ['bg3.exe', 'BaldursGate3.exe'], twitchId: '0' },
  { name: 'The Witcher 3', processNames: ['witcher3.exe'], twitchId: '10361' },
  { name: 'Stardew Valley', processNames: ['Stardew Valley.exe'], twitchId: '0' },
  { name: 'Terraria', processNames: ['Terraria.exe'], twitchId: '0' },
  { name: 'Hollow Knight', processNames: ['hollow_knight.exe'], twitchId: '0' },
  { name: 'Hades', processNames: ['Hades.exe'], twitchId: '0' },
  { name: 'Vampire Survivors', processNames: ['VampireSurvivors.exe'], twitchId: '0' },
  { name: 'Deep Rock Galactic', processNames: ['FSD-Win64-Shipping.exe'], twitchId: '0' },
  { name: 'Phasmophobia', processNames: ['Phasmophobia.exe'], twitchId: '0' },
  { name: 'Lethal Company', processNames: ['Lethal Company.exe'], twitchId: '0' },
  { name: 'Palworld', processNames: ['Palworld.exe'], twitchId: '0' },
  { name: 'Black Myth: Wukong', processNames: ['b1.exe'], twitchId: '0' },
  { name: 'Helldivers 2', processNames: ['Helldivers2.exe'], twitchId: '0' },
  { name: 'Street Fighter 6', processNames: ['StreetFighter6.exe'], twitchId: '621708' },
  { name: 'Tekken 8', processNames: ['Tekken8.exe', 'Polaris-Win64-Shipping.exe'], twitchId: '0' },
  { name: 'Guilty Gear Strive', processNames: ['GGST-Win64-Shipping.exe'], twitchId: '0' },
  { name: 'FIFA 24', processNames: ['FC24.exe'], twitchId: '0' },
  { name: 'NBA 2K24', processNames: ['NBA2K24.exe'], twitchId: '0' },
  { name: 'Call of Duty', processNames: ['cod.exe'], twitchId: '46724' },
]

interface GameTagEditorProps {
  isOpen: boolean
  onClose: () => void
  clip: ClipInfo | null
  currentGame: string | null
  onSave: (game: string | null) => void
}

export const GameTagEditor: React.FC<GameTagEditorProps> = ({
  isOpen,
  onClose,
  clip,
  currentGame,
  onSave,
}) => {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedGame, setSelectedGame] = useState<string | null>(currentGame)
  const [gamesList, setGamesList] = useState<GameEntry[]>([])
  const [loading, setLoading] = useState(true)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Load games database
  useEffect(() => {
    const loadGames = async () => {
      setLoading(true)
      let loadedGames: GameEntry[] = []
      
      // Try multiple possible paths
      const possiblePaths = [
        'games_database.json',
        '../config/games_database.json',
        '../../config/games_database.json',
        '../../../config/games_database.json',
        'bin/config/games_database.json',
        '../../bin/config/games_database.json',
      ]

      for (const path of possiblePaths) {
        try {
          const response = await fetch(path)
          if (response.ok) {
            const data = await response.json()
            if (data.games && Array.isArray(data.games)) {
              loadedGames = data.games
              console.log('[GameTagEditor] Loaded games from:', path)
              break
            }
          }
        } catch (error) {
          // Continue to next path
        }
      }

      // Fallback to built-in games if none loaded
      if (loadedGames.length === 0) {
        console.log('[GameTagEditor] Using built-in games list (' + BUILTIN_GAMES.length + ' games)')
        loadedGames = BUILTIN_GAMES
      }

      setGamesList(loadedGames)
      setLoading(false)
    }

    if (isOpen) {
      loadGames()
      setSelectedGame(currentGame)
      setSearchQuery('')
    }
  }, [isOpen, currentGame])

  // Focus search input when modal opens
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus()
      }, 100)
    }
  }, [isOpen])

  // Filter games based on search query
  const filteredGames = useMemo(() => {
    if (!searchQuery.trim()) {
      return gamesList
    }
    const query = searchQuery.toLowerCase()
    return gamesList.filter(game => 
      game.name.toLowerCase().includes(query)
    )
  }, [gamesList, searchQuery])

  // Handle save
  const handleSave = () => {
    onSave(selectedGame)
    onClose()
  }

  // Handle clear
  const handleClear = () => {
    setSelectedGame(null)
  }

  // Handle selecting a game
  const handleSelectGame = (gameName: string) => {
    setSelectedGame(gameName)
  }

  // Handle keyboard shortcuts
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose()
    }
  }

  if (!isOpen || !clip) {
    return null
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-background-secondary shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-text-primary">
              Edit Game Tag
            </h2>
          </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary"
            >
              <X className="h-5 w-5" />
            </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Clip info */}
          <p className="mb-4 text-sm text-text-muted">
            {clip.filename.replace('.mp4', '')}
          </p>

          {/* Current game display */}
          {selectedGame && (
            <div className="mb-4 rounded-lg bg-purple-500/10 p-3">
              <span className="text-xs text-text-muted">Selected game:</span>
              <div className="mt-1 flex items-center gap-2">
                <Gamepad2 className="h-4 w-4 text-purple-400" />
                <span className="font-medium text-purple-400">{selectedGame}</span>
              </div>
            </div>
          )}

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search games..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input w-full pl-10"
            />
          </div>

          {/* Games list */}
          <div className="mb-4 max-h-64 overflow-y-auto rounded-lg border border-border bg-background-tertiary">
            {loading ? (
              <div className="flex items-center justify-center p-4 text-text-muted">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-primary border-t-transparent" />
                <span className="ml-2 text-sm">Loading games...</span>
              </div>
            ) : filteredGames.length === 0 ? (
              <div className="p-4 text-center text-sm text-text-muted">
                {searchQuery ? 'No games found matching your search.' : 'No games available.'}
              </div>
            ) : (
                <div className="divide-y divide-border">
                  {filteredGames.map(game => (
                    <button
                      type="button"
                      key={game.name}
                      onClick={() => handleSelectGame(game.name)}
                      className={`flex w-full items-center gap-3 px-4 py-2 text-left transition-colors ${
                        selectedGame === game.name
                          ? 'bg-purple-500/20 text-purple-400'
                          : 'text-text-secondary hover:bg-background-secondary'
                      }`}
                    >
                      <Gamepad2 className={`h-4 w-4 ${selectedGame === game.name ? 'text-purple-400' : 'text-text-muted'}`} />
                      <span className="flex-1 text-sm">{game.name}</span>
                      {selectedGame === game.name && (
                        <span className="text-xs text-purple-400">Selected</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleClear}
                disabled={!selectedGame}
                className="rounded-lg px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-background-tertiary hover:text-text-primary disabled:opacity-50"
              >
                Clear Game Tag
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-border bg-background-tertiary px-4 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-background-primary"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  className="rounded-lg bg-accent-primary px-4 py-2 text-sm font-medium text-background-primary transition-colors hover:bg-accent-primary/90"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }
