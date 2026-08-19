import { Sparkles, CircleDot } from 'lucide-react'

import Sidebar from './components/layout/Sidebar'
import HomeFeed from './components/HomeFeed'
import AISidePanel from './components/ai/AISidePanel'
import NotesPage from './components/notes/NotesPage'
import GraphPage from './components/graph/GraphPage'
import TimelinePage from './components/timeline/TimelinePage'
import SettingsPage from './components/settings/SettingsPage'
import { useLayoutStore } from './stores/layoutStore'
import { useTheme } from './hooks/useTheme'
import UiButton from './components/ui/UiButton'

function CurrentPage() {
  const nav = useLayoutStore((s) => s.nav)
  if (nav === 'feed') return <HomeFeed />
  if (nav === 'notes') return <NotesPage />
  if (nav === 'graph') return <GraphPage />
  if (nav === 'timeline') return <TimelinePage />
  return <SettingsPage />
}

export default function App() {
  const { aiPanelOpen, setAIPanelOpen, toggleAIPanel } = useLayoutStore()
  useTheme()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg-app)', overflow: 'hidden' }}>
      {/* 顶栏：左字标 · 右工具 */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          height: 60,
          padding: '0 var(--sp-6)',
          flexShrink: 0,
          borderBottom: '1px solid var(--glass-border)',
          background: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          zIndex: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))',
              boxShadow: '0 0 18px var(--accent-soft)',
            }}
          >
            <CircleDot size={16} color="#fff" strokeWidth={2.4} />
          </span>
          <span className="display" style={{ fontSize: 'var(--text-xl)', fontWeight: 700, color: 'var(--text-1)' }}>
            Lumina
          </span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-3)',
              marginLeft: 4,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            knowledge atlas
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <UiButton variant={aiPanelOpen ? 'primary' : 'outline'} icon={Sparkles} onClick={toggleAIPanel}>
            Lumina AI
          </UiButton>
        </div>
      </header>

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        <aside
          style={{
            width: 232,
            background: 'var(--bg-subtle)',
            borderRight: '1px solid var(--glass-border)',
            overflow: 'auto',
            flexShrink: 0,
            padding: 'var(--sp-3) var(--sp-2)',
          }}
        >
          <Sidebar />
        </aside>

        <main style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-6) var(--sp-7)', minWidth: 0 }}>
          <CurrentPage />
        </main>
      </div>

      <AISidePanel open={aiPanelOpen} onClose={() => setAIPanelOpen(false)} />
    </div>
  )
}