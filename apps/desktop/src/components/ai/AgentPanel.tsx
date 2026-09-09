import { useEffect, useRef, useState } from 'react'
import { Spin, Tag, Dropdown, Menu } from '@arco-design/web-react'
import { Bot, Plus, X, Send, Wrench, CheckCircle2, XCircle, ShieldAlert, ChevronDown, ChevronRight } from 'lucide-react'
import {
  agentService,
  streamAgentChat,
  type AgentPendingApproval,
  type AgentToolEvent,
  type AgentConversationSummary,
} from '../../services/agentService'

interface Props {
  open: boolean
  onClose: () => void
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'tool'
  content: string
  toolName?: string
  toolStatus?: 'running' | 'success' | 'error'
  toolKey?: string
  createdAt?: string
}

export default function AgentPanel({ open, onClose }: Props) {
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [conversations, setConversations] = useState<AgentConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [threadId, setThreadId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [approval, setApproval] = useState<AgentPendingApproval[] | null>(null)
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set())

  const refreshList = async () => {
    try {
      setConversations(await agentService.listConversations())
    } catch {
      /* server offline */
    }
  }

  useEffect(() => {
    if (open) {
      void refreshList()
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  useEffect(() => {
    scrollRef.current?.scrollTo?.({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, approval])

  const startNew = () => {
    setActiveId(null)
    setThreadId(null)
    setMessages([])
    setApproval(null)
    inputRef.current?.focus()
  }

  const loadConversation = async (id: string) => {
    const detail = await agentService.getConversation(id)
    if (!detail) return
    setActiveId(id)
    setApproval(null)
    setMessages(
      detail.messages
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content, createdAt: m.createdAt })),
    )
  }

  const removeConversation = async (id: string) => {
    await agentService.deleteConversation(id)
    if (id === activeId) startNew()
    await refreshList()
  }

  const runTurn = async (body: { message?: string; conversationId?: string; resume?: { threadId: string; decision: 'approve' | 'reject' } }) => {
    setLoading(true)
    const toolKey = (name: string, callId?: string) => `${name}:${callId ?? ''}`
    try {
      const result = await streamAgentChat(body, (ev) => {
        if (ev.type === 'tool-call') {
          const p = ev.payload as AgentToolEvent
          setMessages((prev) => [
            ...prev,
            { role: 'tool', content: JSON.stringify(p.arguments ?? {}), toolName: p.toolName, toolStatus: 'running', toolKey: toolKey(p.toolName, p.toolCallId) },
          ])
        } else if (ev.type === 'tool-result') {
          const p = ev.payload as AgentToolEvent
          const k = toolKey(p.toolName, p.toolCallId)
          setMessages((prev) =>
            prev.map((m) =>
              m.role === 'tool' && m.toolKey === k
                ? { ...m, content: (p.output ?? '').slice(0, 600), toolStatus: p.status === 'error' ? 'error' : 'success' as const }
                : m,
            ),
          )
        }
      })
      if (result.conversationId) {
        setActiveId(result.conversationId)
        if (result.threadId) setThreadId(result.threadId)
        await refreshList()
      }
      if (result.pendingApproval && result.pendingApproval.length > 0) {
        setApproval(result.pendingApproval)
      } else {
        setApproval(null)
        if (result.reply) setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }])
      }
    } catch (e) {
      setMessages((prev) => [...prev, { role: 'assistant', content: `⚠️ ${e instanceof Error ? e.message : String(e)}` }])
    } finally {
      setLoading(false)
    }
  }

  const send = async () => {
    const text = input.trim()
    if (!text || loading || approval) return
    setMessages((prev) => [...prev, { role: 'user', content: text }])
    setInput('')
    await runTurn({ message: text, conversationId: activeId ?? undefined })
  }

  const decide = async (decision: 'approve' | 'reject') => {
    if (!threadId || !approval) return
    setApproval(null)
    await runTurn({ resume: { threadId, decision } })
  }

  const toggleExpand = (key: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  if (!open) return null

  const dropdownItems = (conv: AgentConversationSummary) => (
    <Menu
      onClickMenuItem={(key: string) => {
        if (key === 'delete') void removeConversation(conv.id)
      }}
    >
      <Menu.Item key="delete" style={{ color: 'var(--danger)' }}>
        删除会话
      </Menu.Item>
    </Menu>
  )

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
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, display: 'grid', placeItems: 'center', background: 'linear-gradient(135deg, var(--accent-strong), var(--accent))', boxShadow: '0 0 14px var(--accent-soft)' }}>
              <Bot size={15} color="#fff" />
            </span>
            <span className="display" style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-1)' }}>
              Lumina Agent
            </span>
            <Tag size="small" color="purple" style={{ fontSize: 11 }}>
              deepagents
            </Tag>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button className="lumina-iconbtn" onClick={startNew} title="新会话" style={{ width: 26, height: 26, background: 'var(--accent-soft)', color: 'var(--accent)', borderRadius: 'var(--radius-sm)' }}>
              <Plus size={14} />
            </button>
            <button className="lumina-iconbtn" onClick={onClose} title="关闭" style={{ width: 26, height: 26 }}>
              <X size={15} />
            </button>
          </div>
        </div>

        {/* 历史 */}
        {conversations.length > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--glass-border)', maxHeight: 120, overflow: 'auto' }}>
            <span className="lumina-label" style={{ display: 'block', marginBottom: 6 }}>历史会话</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {conversations.slice(0, 6).map((c) => (
                <Dropdown key={c.id} droplist={dropdownItems(c)} trigger="contextMenu" position="bl">
                  <div
                    onClick={() => void loadConversation(c.id)}
                    className="lumina-ai-hist"
                    style={{ color: c.id === activeId ? 'var(--accent)' : 'var(--text-1)', background: c.id === activeId ? 'var(--accent-soft)' : 'transparent' }}
                  >
                    <span style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  </div>
                </Dropdown>
              ))}
            </div>
          </div>
        )}

        {/* 消息流 */}
        <div ref={scrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {messages.map((m, i) => {
            if (m.role === 'tool') {
              const key = `${i}`
              const expanded = expandedTools.has(key)
              const statusIcon = m.toolStatus === 'running' ? <Spin size={11} /> : m.toolStatus === 'error' ? <XCircle size={13} color="var(--danger)" /> : <CheckCircle2 size={13} color="var(--success, #4caf7d)" />
              return (
                <div key={i} style={{ marginBottom: 8 }}>
                  <div
                    onClick={() => toggleExpand(key)}
                    className="glass"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 'var(--text-xs)', color: 'var(--text-2)' }}
                  >
                    {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    <Wrench size={12} color="var(--accent)" />
                    <code style={{ color: 'var(--text-1)' }}>{m.toolName}</code>
                    <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>{statusIcon}</span>
                  </div>
                  {expanded && (
                    <pre style={{ margin: '4px 0 0 20px', padding: '8px 10px', background: 'var(--bg-2, rgba(0,0,0,0.2))', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 200, overflow: 'auto' }}>
                      {m.content}
                    </pre>
                  )}
                </div>
              )
            }
            return (
              <div key={i} style={{ marginBottom: 12, display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    maxWidth: '86%',
                    padding: '10px 14px',
                    background: m.role === 'user' ? 'var(--accent)' : 'var(--glass-bg)',
                    color: m.role === 'user' ? '#fff' : 'var(--text-1)',
                    border: m.role === 'user' ? 'none' : '1px solid var(--glass-border)',
                    borderRadius: m.role === 'user' ? '14px 14px 4px 14px' : '14px 14px 14px 4px',
                    fontSize: 'var(--text-md)',
                    lineHeight: 1.65,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {m.content}
                </div>
              </div>
            )
          })}
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: 'var(--sp-6) 0', color: 'var(--text-3)' }}>
              <Bot size={24} style={{ marginBottom: 10, opacity: 0.5 }} />
              <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.7 }}>
                我是 Lumina Agent——可以检索笔记、分析图谱、建议记笔记。
                <br />
                需要写库的操作会先请你确认。
              </div>
            </div>
          )}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', padding: 4 }}>
              <Spin size={15} />
            </div>
          )}
        </div>

        {/* HITL 审批条 */}
        {approval && approval.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--glass-border)', background: 'var(--accent-soft)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <ShieldAlert size={15} color="var(--warn, #e6a23c)" />
              <span style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-1)' }}>
                Agent 请求执行写操作：{approval[0].name}
              </span>
            </div>
            <pre style={{ margin: '0 0 10px', padding: '8px 10px', background: 'var(--glass-bg)', borderRadius: 'var(--radius-sm)', fontSize: 11, color: 'var(--text-2)', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 140, overflow: 'auto' }}>
              {JSON.stringify(approval[0].args, null, 2)}
            </pre>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="lumina-toolbtn lumina-toolbtn-primary" style={{ flex: 1 }} onClick={() => void decide('approve')} disabled={loading}>
                同意执行
              </button>
              <button className="lumina-toolbtn" style={{ flex: 1 }} onClick={() => void decide('reject')} disabled={loading}>
                拒绝
              </button>
            </div>
          </div>
        )}

        {/* 输入区 */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--glass-border)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={inputRef}
              placeholder={approval ? '等待审批…' : '让 Agent 帮你查笔记、建卡片…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              disabled={loading || !!approval}
              rows={2}
              style={{
                flex: 1,
                resize: 'none',
                background: 'var(--glass-bg)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-md)',
                padding: '8px 12px',
                fontSize: 'var(--text-md)',
                color: 'var(--text-1)',
                outline: 'none',
                fontFamily: 'inherit',
              }}
            />
            <button className="lumina-toolbtn lumina-toolbtn-primary" onClick={() => void send()} disabled={loading || !!approval} style={{ opacity: loading || approval ? 0.5 : 1 }}>
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}