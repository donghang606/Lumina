import { useEffect, useRef, useState } from 'react'
import { X, Sparkles, Bot, MessageSquare } from 'lucide-react'
import { useLayoutStore, type AIMode } from '../../stores/layoutStore'
import { aiService } from '../../services/aiService'
import { agentService } from '../../services/agentService'
import AIChatView, { type LoadSignal } from './AIChatView'
import AgentChatView from './AgentChatView'

interface Props {
  open: boolean
  onClose: () => void
}

interface RecentConv { id: string; title: string; mode: AIMode; updatedAt: string }

/** 融合面板：问答 / Agent 双模式，共享侧滑壳、消息流样式；顶部聚合最近会话 */
export default function UnifiedAIPanel({ open, onClose }: Props) {
  const { aiMode, setAIMode } = useLayoutStore()
  const [tab, setTab] = useState<'chat' | 'agent'>(aiMode)
  const [recent, setRecent] = useState<RecentConv[]>([])
  const [loadSignal, setLoadSignal] = useState<LoadSignal | null>(null)
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const refreshRecent = async () => {
    try {
      const [ai, ag] = await Promise.all([
        aiService.listConversations().catch(() => []),
        agentService.listConversations().catch(() => []),
      ])
      const merged: RecentConv[] = [
        ...ai.map((c) => ({ id: c.id, title: c.title, mode: 'chat' as AIMode, updatedAt: c.updatedAt })),
        ...ag.map((c) => ({ id: c.id, title: c.title, mode: 'agent' as AIMode, updatedAt: c.updatedAt })),
      ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 8)
      setRecent(merged)
    } catch { /* ignore */ }
  }

  useEffect(() => { setTab(aiMode) }, [aiMode])

  useEffect(() => {
    if (open) {
      void refreshRecent()
      setTimeout(() => tabRefs.current[tab]?.focus(), 80)
    }
  }, [open, tab])

  // 发送/审批后聚合刷新（view 内部状态变更时通过 reload 信号触发）
  useEffect(() => {
    if (loadSignal) void refreshRecent()
  }, [loadSignal?.nonce])

  const openRecent = (c: RecentConv) => {
    setTab(c.mode); setAIMode(c.mode)
    setLoadSignal({ id: c.id, nonce: Date.now() })
  }

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

        {/* 最近会话（聚合问答 + Agent，按更新时间倒序，点击切 tab 并加载） */}
        {recent.length > 0 && (
          <div style={{ padding: '6px 12px', borderBottom: '1px solid var(--glass-border)', display: 'flex', gap: 6, overflowX: 'auto' }}>
            {recent.map((c) => (
              <button
                key={c.id}
                onClick={() => openRecent(c)}
                title={c.title}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  padding: '4px 8px', borderRadius: 'var(--radius-sm)',
                  fontSize: 'var(--text-xs)', color: 'var(--text-2)',
                  background: c.mode === tab ? 'var(--accent-soft)' : 'transparent',
                  border: '1px solid var(--glass-border)', cursor: 'pointer', outline: 'none',
                }}
              >
                {c.mode === 'agent' ? <Bot size={10} /> : <MessageSquare size={10} />}
                <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || '(无标题)'}</span>
              </button>
            ))}
          </div>
        )}

        {/* 视图区：两 view 常驻，display 切换（保留各自会话/输入状态，切回不丢） */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, display: tab === 'chat' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0 }}>
            <AIChatView loadSignal={tab === 'chat' ? loadSignal : null} />
          </div>
          <div style={{ position: 'absolute', inset: 0, display: tab === 'agent' ? 'flex' : 'none', flexDirection: 'column', minHeight: 0 }}>
            <AgentChatView loadSignal={tab === 'agent' ? loadSignal : null} />
          </div>
        </div>
      </div>
    </div>
  )
}
