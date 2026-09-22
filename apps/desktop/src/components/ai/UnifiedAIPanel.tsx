import { useEffect, useRef, useState } from 'react'
import { X, Sparkles, Bot, MessageSquare } from 'lucide-react'
import { useLayoutStore } from '../../stores/layoutStore'
import { aiService } from '../../services/aiService'
import { agentService } from '../../services/agentService'
import AgentChatView, { type LoadSignal } from './AgentChatView'

interface Props {
  open: boolean
  onClose: () => void
}

interface RecentConv { id: string; title: string; updatedAt: string }

/** 融合面板：单一 Agent 视图（RAG + 工具调用 + HITL 审批） */
export default function UnifiedAIPanel({ open, onClose }: Props) {
  const [recent, setRecent] = useState<RecentConv[]>([])
  const [loadSignal, setLoadSignal] = useState<LoadSignal | null>(null)
  const tabRef = useRef<HTMLButtonElement | null>(null)

  const refreshRecent = async () => {
    try {
      const [ai, ag] = await Promise.all([
        aiService.listConversations().catch(() => []),
        agentService.listConversations().catch(() => []),
      ])
      const merged: RecentConv[] = [
        ...ai.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })),
        ...ag.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt })),
      ].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, 8)
      setRecent(merged)
    } catch { /* ignore */ }
  }

  useEffect(() => {
    if (open) {
      void refreshRecent()
      setTimeout(() => tabRef.current?.focus(), 80)
    }
  }, [open])

  // 发送/审批后聚合刷新
  useEffect(() => {
    if (loadSignal) void refreshRecent()
  }, [loadSignal?.nonce])

  const openRecent = (c: RecentConv) => {
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

        {/* Header */}
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

        {/* 最近会话 chips */}
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
                  background: 'transparent',
                  border: '1px solid var(--glass-border)', cursor: 'pointer', outline: 'none',
                }}
              >
                <MessageSquare size={10} />
                <span style={{ maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title || '(无标题)'}</span>
              </button>
            ))}
          </div>
        )}

        {/* 单一 Agent 视图 */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <AgentChatView loadSignal={loadSignal} />
          </div>
        </div>
      </div>
    </div>
  )
}
