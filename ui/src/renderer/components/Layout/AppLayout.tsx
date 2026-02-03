import React from 'react'
import { Header } from './Header'

interface AppLayoutProps {
  children: React.ReactNode
  currentView: 'library' | 'editor' | 'settings'
  onNavigateToLibrary?: () => void
  onOpenSettings?: () => void
  onGoBack?: () => void
  onGoForward?: () => void
  onRefresh?: () => void
  canGoBack?: boolean
  canGoForward?: boolean
  hideHeader?: boolean
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  currentView,
  onNavigateToLibrary,
  onOpenSettings,
  onGoBack,
  onGoForward,
  onRefresh,
  canGoBack,
  canGoForward,
  hideHeader = false,
}) => {
  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background-primary">
      {!hideHeader && (
        <Header
          currentView={currentView}
          onNavigateToLibrary={onNavigateToLibrary}
          onOpenSettings={onOpenSettings}
          onGoBack={onGoBack}
          onGoForward={onGoForward}
          onRefresh={onRefresh}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
        />
      )}
      <div className="flex flex-1 overflow-hidden">
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
    </div>
  )
}
