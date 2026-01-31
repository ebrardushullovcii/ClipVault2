import React from 'react'
import { Header } from './Header'

interface AppLayoutProps {
  children: React.ReactNode
  currentView: 'library' | 'editor' | 'settings'
  onNavigateToLibrary?: () => void
  onOpenSettings?: () => void
}

export const AppLayout: React.FC<AppLayoutProps> = ({ children, currentView, onNavigateToLibrary, onOpenSettings }) => {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background-primary">
      <Header currentView={currentView} onNavigateToLibrary={onNavigateToLibrary} onOpenSettings={onOpenSettings} />
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
