import { useEffect, useRef, useState } from 'react'
import { X, Sparkles, Bot } from 'lucide-react'
import { useLayoutStore } from '../../stores/layoutStore'
import AIChatView from './AIChatView'
import AgentChatView from './AgentChatView'

interface Props {
  open: boolean
  onClose: () => void
}

/** 融合面板：问答 / Agent 双模式，共享侧滑壳、会话历史样式、消息流样式 */
export default function UnifiedAIPanel({ open, onClose }: Props) {
  const { aiMode, setAIMode } = useLayoutStore()
  const [tab, setTab] = useState<'chat' | 'agent'>(aiMode)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  useEffect(() => {
    setTab(aiMode)
  }, [aiMode])

  useEffect(() => {
    if (open) setTimeout(() => tabRefs.current[tab]?.focus(), 80)
  }, [open, tab])

  if (!open) return null

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', pointerEvents: 'none' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(5,8,15,0.4)', pointerEvents: 'auto', backdropFilter: 'blur(2px)' }} />
      <div
        style={{
          position: 'relative',
          marginLeft: 'auto',
          width: 440,
          height: '100%',
          background: 'var(--bg-app)',
          borderLeft: '1px solid var(--glass-border)',
          boxShadow: 'var(--shadow-3)',
          display: 'flex',
          flexDirection: 'column',
          animation: 'lumina-panel-in 0.3s var(--ease-out)',
          pointerEvents: 'auto',
          backdropFilter: 'var(--glass-blur)',
        }}
      >
        <style>{`@keyframes lumina-panel-in { from { transform: translateX(32px); opacity: 0 } to { transform: translateX(0); opacity: 1 } }`}</style>

        {/* Header：标题 + 模式 tab + 关闭 */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--accent), var(--accent-strong))', boxShadow: '0 0 14px var(--accent-soft)' }}>
              <Sparkles size={15} color="#fff" />
            </span>
            <span className="display" style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-1)' }}>
              Lumina AI
            </span>
          </div>
          <button className="lumina-iconbtn" onClick={onClose} title="关闭" style={{ width: 26, height: 26 }}>
            <X size={15} />
          </button>
        </div>

        {/* Tab 切换 */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--glass-border)', padding: '0 8px' }}>
          {([
            { key: 'chat' as const, label: '问答', icon: <Sparkles size={12} /> },
            { key: 'agent' as const, label: 'Agent', icon: <Bot size={12} /> },
          ]).map(({ key, label, icon }) => {
            const active = tab === key
            return (
              <button
                key={key}
                ref={(el) => { tabRefs.current[key] = el }}
                onClick={() => { setTab(key); setAIMode(key) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 12px', marginRight: 4, marginBottom: -1,
                  fontSize: 'var(--text-sm)', fontWeight: active ? 600 : 400,
                  color: active ? 'var(--accent)' : 'var(--text-3)',
                  background: 'transparent', border: 'none',
                  borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
                  cursor: 'pointer', outline: 'none',
                }}
              >
                {icon}
                {label}
              </button>
            )
          })}
        </div>

        {/* 视图区（key 触发重挂载，两模式状态独立） */}
        <div key={tab} style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          {tab === 'chat' ? <AIChatView /> : <AgentChatView />}
        </div>
      </div>
    </div>
  )
}
