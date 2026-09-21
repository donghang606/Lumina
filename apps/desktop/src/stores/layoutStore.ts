import { create } from 'zustand'

export type NavKey = 'feed' | 'notes' | 'graph' | 'timeline' | 'schedule' | 'wiki' | 'settings'
export type AIMode = 'chat' | 'agent'

interface LayoutState {
  nav: NavKey
  aiPanelOpen: boolean
  aiMode: AIMode
  setNav: (nav: NavKey) => void
  toggleAIPanel: (mode?: AIMode) => void
  setAIPanelOpen: (open: boolean, mode?: AIMode) => void
  setAIMode: (mode: AIMode) => void
  /** 兼容旧调用方：打开面板（默认问答模式） */
  openAIPanel: () => void
}

export const useLayoutStore = create<LayoutState>((set) => ({
  nav: 'feed',
  aiPanelOpen: false,
  aiMode: 'chat',
  setNav: (nav) => set({ nav }),
  toggleAIPanel: (mode) =>
    set((s) => {
      if (s.aiPanelOpen && (!mode || mode === s.aiMode)) {
        return { aiPanelOpen: false }
      }
      return { aiPanelOpen: true, aiMode: mode ?? s.aiMode }
    }),
  setAIPanelOpen: (open, mode) => set((s) => ({ aiPanelOpen: open, aiMode: mode ?? s.aiMode })),
  setAIMode: (mode) => set({ aiMode: mode }),
  openAIPanel: () => set({ aiPanelOpen: true, aiMode: 'chat' }),
}))
