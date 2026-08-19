import { create } from 'zustand'

export type NavKey = 'feed' | 'notes' | 'graph' | 'timeline' | 'settings'

interface LayoutState {
  nav: NavKey
  aiPanelOpen: boolean
  setNav: (nav: NavKey) => void
  toggleAIPanel: () => void
  setAIPanelOpen: (open: boolean) => void
  openAIPanel: () => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  nav: 'feed',
  aiPanelOpen: false,
  setNav: (nav) => set({ nav }),
  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen })),
  setAIPanelOpen: (open) => set({ aiPanelOpen: open }),
  openAIPanel: () => set({ aiPanelOpen: true }),
}))
