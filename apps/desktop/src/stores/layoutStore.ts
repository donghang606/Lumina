import { create } from 'zustand'

export type NavKey = 'feed' | 'notes' | 'graph' | 'timeline' | 'settings'

interface LayoutState {
  nav: NavKey
  aiPanelOpen: boolean
  agentPanelOpen: boolean
  setNav: (nav: NavKey) => void
  toggleAIPanel: () => void
  setAIPanelOpen: (open: boolean) => void
  openAIPanel: () => void
  toggleAgentPanel: () => void
  setAgentPanelOpen: (open: boolean) => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  nav: 'feed',
  aiPanelOpen: false,
  agentPanelOpen: false,
  setNav: (nav) => set({ nav }),
  toggleAIPanel: () => set((s) => ({ aiPanelOpen: !s.aiPanelOpen, agentPanelOpen: false })),
  setAIPanelOpen: (open) => set({ aiPanelOpen: open }),
  openAIPanel: () => set({ aiPanelOpen: true }),
  toggleAgentPanel: () => set((s) => ({ agentPanelOpen: !s.agentPanelOpen, aiPanelOpen: false })),
  setAgentPanelOpen: (open) => set({ agentPanelOpen: open }),
}))