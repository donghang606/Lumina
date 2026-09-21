import { useEffect } from 'react'
import { useLayoutStore, type NavKey } from '../stores/layoutStore'

/** 全局键盘快捷键。在 App 根组件挂载一次即可。 */
export function useGlobalHotkeys() {
  const setNav = useLayoutStore((s) => s.setNav)
  const toggleAIPanel = useLayoutStore((s) => s.toggleAIPanel)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return

      const key = e.key.toLowerCase()

      // Cmd+1~7 → 导航
      const navMap: Record<string, NavKey> = {
        '1': 'feed',
        '2': 'notes',
        '3': 'graph',
        '4': 'timeline',
        '5': 'schedule',
        '6': 'wiki',
        '7': 'settings',
      }
      if (navMap[key]) {
        e.preventDefault()
        setNav(navMap[key])
        return
      }

      // Cmd+K → 切换 AI 面板
      if (key === 'k') {
        e.preventDefault()
        toggleAIPanel()
        return
      }

      // Cmd+, → 设置
      if (key === ',') {
        e.preventDefault()
        setNav('settings')
        return
      }
    }

    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setNav, toggleAIPanel])
}
