'use client'

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'

export type TabValue = 'dust' | 'process' | 'swap'

interface UIContextType {
  activeTab: TabValue
  setActiveTab: (tab: TabValue) => void
}

const UIContext = createContext<UIContextType | undefined>(undefined)

interface UIProviderProps {
  children: ReactNode
}

export function UIProvider({ children }: UIProviderProps) {
  const [activeTab, setActiveTabState] = useState<TabValue>('dust')

  const setActiveTab = useCallback((tab: TabValue) => {
    setActiveTabState(tab)
  }, [])

  return (
    <UIContext.Provider value={{ activeTab, setActiveTab }}>
      {children}
    </UIContext.Provider>
  )
}

export function useUI() {
  const context = useContext(UIContext)
  if (context === undefined) {
    throw new Error('useUI must be used within a UIProvider')
  }
  return context
}
