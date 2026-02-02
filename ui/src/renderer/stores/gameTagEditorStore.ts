import { create } from 'zustand'

export interface GameEntry {
  name: string
  processNames: string[]
  twitchId: string
}

interface GameTagEditorState {
  searchQuery: string
  selectedGame: string | null
  gamesList: GameEntry[]
  loading: boolean

  setSearchQuery: (query: string) => void
  setSelectedGame: (game: string | null) => void
  setGamesList: (games: GameEntry[]) => void
  setLoading: (loading: boolean) => void
}

export const useGameTagEditorStore = create<GameTagEditorState>((set) => ({
  searchQuery: '',
  selectedGame: null,
  gamesList: [],
  loading: false,

  setSearchQuery: (query) => set({ searchQuery: query }),
  setSelectedGame: (game) => set({ selectedGame: game }),
  setGamesList: (games) => set({ gamesList: games }),
  setLoading: (loading) => set({ loading }),
}))