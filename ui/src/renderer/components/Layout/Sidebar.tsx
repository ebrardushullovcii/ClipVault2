import { Library, Star, Clock } from 'lucide-react'

export const Sidebar: React.FC = () => {
  const menuItems = [
    { icon: Library, label: 'All Clips', active: true },
    { icon: Star, label: 'Favorites', active: false },
    { icon: Clock, label: 'Recent', active: false },
  ]

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-background-secondary">
      <nav className="space-y-1 p-4">
        {menuItems.map(item => (
          <button
            key={item.label}
            className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-sm font-medium transition-all duration-200 ${
              item.active
                ? 'bg-accent-primary/10 text-accent-primary'
                : 'text-text-secondary hover:bg-background-tertiary hover:text-text-primary'
            }`}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </button>
        ))}
      </nav>

      <div className="mt-auto border-t border-border p-4">
        <div className="text-xs text-text-muted">
          <p>Storage</p>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-background-tertiary">
            <div className="h-full w-1/3 rounded-full bg-accent-primary" />
          </div>
          <p className="mt-1">Clips folder ready</p>
        </div>
      </div>
    </aside>
  )
}
