import React from 'react'
import { Library, Star, Clock, Settings } from 'lucide-react'

export const Sidebar: React.FC = () => {
  const menuItems = [
    { icon: Library, label: 'All Clips', active: true },
    { icon: Star, label: 'Favorites', active: false },
    { icon: Clock, label: 'Recent', active: false },
  ]

  return (
    <aside className="w-64 bg-background-secondary border-r border-border flex flex-col shrink-0">
      <nav className="p-4 space-y-1">
        {menuItems.map((item) => (
          <button
            key={item.label}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 ${
              item.active
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-text-secondary hover:bg-background-tertiary hover:text-text-primary'
            }`}
          >
            <item.icon className="w-5 h-5" />
            {item.label}
          </button>
        ))}
      </nav>
      
      <div className="mt-auto p-4 border-t border-border">
        <div className="text-xs text-text-muted">
          <p>Storage</p>
          <div className="mt-2 h-2 bg-background-tertiary rounded-full overflow-hidden">
            <div className="h-full w-1/3 bg-accent-primary rounded-full" />
          </div>
          <p className="mt-1">Clips folder ready</p>
        </div>
      </div>
    </aside>
  )
}
