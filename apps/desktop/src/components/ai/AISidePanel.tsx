import { useEffect, useRef, useState } from 'react'
import { Spin, Tag, Dropdown, Menu, Input } from '@arco-design/web-react'
import { Sparkles, Plus, X, Map, Send, MessageSquare, Mic, MicOff, Hash } from 'lucide-react'
import { aiService, type ConversationSummary, type ConversationMessage } from '../../services/aiService'
import { graphService } from '../../services/feedService'
import { useLayoutStore } from '../../stores/layoutStore'
import { useNoteStore } from '../../stores/noteStore'
import { noteService, tagService } from '../../services/noteService'
import { transcribeAudio } from '../../services/voiceService'
import type { GraphData, TagWithCount } from '@lumina/shared'

interface Props {
  open: boolean
  onClose: () => void
}

export default function AISidePanel({ open, onClose }: Props) {
  const inputRef = useRef<any>(null)
  const [messages, setMessages] = useState<ConversationMessage[]>([])
  const [conversations, setConversations] = useState<ConversationSummary[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [graph, setGraph] = useState<GraphData>({ nodes: [], edges: [] })
  const [aiReady, setAiReady] = useState<boolean | null>(null)
  const [aiProvider, setAiProvider] = useState('')

  const [recording, setRecording] = useState(false)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const [tagSuggest, setTagSuggest] = useState<TagWithCount[]>([])
  const [tagHi, setTagHi] = useState(0)

  const refreshList = async () => {
    try {
      setConversations(await aiService.listConversations())
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    void aiService.status().then((s) => {
      setAiReady(s.ready)
      setAiProvider(s.provider)
    }).catch(() => setAiReady(false))
  }, [open])

  const noteContext = useNoteStore((s) => s.selectedId)

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus?.(), 100)
      void refreshList()
      void (async () => {
        try {
          const gd = await graphService.getGraphData(50)
          setGraph(gd)
        } catch {
          /* ignore */
        }
      })()
    }
  }, [open])

  const loadConversation = async (id: string) => {
    const detail = await aiService.getConversation(id)
    if (!detail) return
    setActiveId(id)
    setMessages(detail.messages.map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content, createdAt: m.createdAt })))
  }

  const startNew = () => {
    setActiveId(null)
    setMessages([])
    setTimeout(() => inputRef.current?.focus?.(), 50)
  }

  const removeConversation = async (id: string) => {
    await aiService.deleteConversation(id)
    if (id === activeId) {
      setActiveId(null)
      setMessages([])
    }
    await refreshList()
  }

  const send = async () => {
    const text = input.trim()
    if (!text || loading) return
    const optimistic: ConversationMessage = { role: 'user', content: text, createdAt: new Date().toISOString() }
    const next = [...messages, optimistic]
    setMessages(next)
    setInput('')
    setLoading(true)
    try {
      const noteDetail = noteContext ? await noteService.getById(noteContext) : null
      const { reply, conversationId } = await aiService.chat(text, noteDetail?.content, activeId ?? undefined)
      const withReply: ConversationMessage = { role: 'assistant', content: reply, createdAt: new Date().toISOString() }
      setMessages([...next, withReply])
      if (conversationId) {
        setActiveId(conversationId)
        await refreshList()
      }
    } catch {
      setMessages([...next, { role: 'assistant', content: '出错了，请确认服务器已启动。', createdAt: new Date().toISOString() }])
    } finally {
      setLoading(false)
    }
  }

  const askAbout = (title: string) => {
    setInput(title)
    void send()
  }

  const toggleVoice = async () => {
    if (recording) {
      recorderRef.current?.stop()
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        try {
          const json = await transcribeAudio(blob)
          if (json.transcript) {
            const t = json.transcript
            setInput((v) => (v ? `${v} ${t}` : t))
          }
        } catch {
          /* voice server offline; keep typing */
        }
      }
      rec.start()
      setRecording(true)
    } catch {
      /* mic denied */
    }
  }

  const onInputChange = async (value: string) => {
    setInput(value)
    const match = value.match(/@(\S*)$/)
    if (match) {
      const q = match[1].toLowerCase()
      const all = await tagService.list()
      const matched = all.filter((t) => t.name.toLowerCase().includes(q)).slice(0, 6)
      setTagSuggest(matched)
      setTagHi(0)
    } else {
      setTagSuggest([])
    }
  }

  const insertTag = (name: string) => {
    setInput((v) => v.replace(/@\S*$/, `@${name} `))
    setTagSuggest([])
    inputRef.current?.focus?.()
  }

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (tagSuggest.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setTagHi((h) => (h + 1) % tagSuggest.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setTagHi((h) => (h - 1 + tagSuggest.length) % tagSuggest.length)
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault()
      insertTag(tagSuggest[tagHi].name)
    } else if (e.key === 'Escape') {
      setTagSuggest([])
    }
  }

  if (!open) return null

  const topNodes = graph.nodes.slice(0, 6)
  const center = topNodes.slice(0, 4)

  const dropdownItems = (conv: ConversationSummary) => (
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
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'var(--shadow-3)', backgroundColor: 'rgba(5,8,15,0.4)', pointerEvents: 'auto', backdropFilter: 'blur(2px)' }} />
      <div
        style={{
          position: 'relative',
          marginLeft: 'auto',
          width: 408,
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
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--glass-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
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
                boxShadow: '0 0 14px var(--accent-soft)',
              }}
            >
              <Sparkles size={15} color="#fff" />
            </span>
            <span className="display" style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-1)' }}>
              Lumina AI
            </span>
            <Tag size="small" color={aiReady === null ? 'gray' : aiReady ? 'green' : 'red'} style={{ fontSize: 11 }}>
              {aiReady === null ? '…' : aiReady ? aiProvider : '未配置模型'}
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

        {/* History */}
        {conversations.length > 0 && (
          <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--glass-border)', maxHeight: 148, overflow: 'auto' }}>
            <span className="lumina-label" style={{ display: 'block', marginBottom: 6 }}>历史会话</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {conversations.map((c) => (
                <Dropdown key={c.id} droplist={dropdownItems(c)} trigger="contextMenu" position="bl">
                  <div
                    onClick={() => void loadConversation(c.id)}
                    className="lumina-ai-hist"
                    style={{
                      color: c.id === activeId ? 'var(--accent)' : 'var(--text-1)',
                      background: c.id === activeId ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    <MessageSquare size={12} className="lumina-ai-hist-ic" />
                    <span style={{ fontSize: 'var(--text-sm)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.title}
                    </span>
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{c.messageCount}</span>
                  </div>
                </Dropdown>
              ))}
            </div>
          </div>
        )}

        {/* Knowledge card graph layer */}
        <div
          style={{
            padding: '14px 16px',
            borderBottom: '1px solid var(--glass-border)',
            background: 'radial-gradient(120% 120% at 20% 0%, var(--accent-soft) 0%, transparent 60%)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <Map size={13} color="var(--accent)" />
            <span className="lumina-label" style={{ display: 'inline' }}>知识卡片图谱</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, minHeight: 56 }}>
            {center.map((n) => (
              <div
                key={n.id}
                onClick={() => askAbout(n.title)}
                className="glass lumina-ai-card"
              >
                <span style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-1)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.title || '(无标题)'}
                </span>
                <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                  <Tag size="small" color="arcoblue">
                    {n.type}
                  </Tag>
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                    {n.degree} 连接 · {n.tagCount} 标签
                  </span>
                </div>
              </div>
            ))}
            {center.length === 0 && (
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', gridColumn: '1 / -1' }}>
                知识库还没有卡片，去 Feed 记几条吧～
              </span>
            )}
          </div>
        </div>

        {/* Chat layer */}
        <div style={{ flex: 1, overflow: 'auto', padding: '16px' }}>
          {messages.map((m, i) => (
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
                  boxShadow: m.role === 'user' ? '0 2px 14px var(--accent-soft)' : 'var(--shadow-1)',
                }}
              >
                {m.content}
              </div>
            </div>
          ))}
          {messages.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: 'var(--sp-6) 0', color: 'var(--text-3)' }}>
              <Sparkles size={24} style={{ marginBottom: 10, opacity: 0.5 }} />
              <div style={{ fontSize: 'var(--text-sm)', lineHeight: 1.7 }}>
                开启一个新对话吧。
                <br />
                右键历史会话可删除，点卡片或直接提问。
              </div>
            </div>
          )}
          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', padding: 4 }}>
              <Spin size={15} />
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--glass-border)' }}>
          <div style={{ position: 'relative', display: 'flex', gap: 8, alignItems: 'center' }}>
            {tagSuggest.length > 0 && (
              <div
                style={{
                  position: 'absolute',
                  bottom: 'calc(100% + 8px)',
                  left: 0,
                  right: 0,
                  background: 'var(--glass-bg)',
                  backdropFilter: 'var(--glass-blur)',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-3)',
                  padding: 4,
                  zIndex: 5,
                }}
              >
                {tagSuggest.map((t, i) => (
                  <div
                    key={t.id}
                    onMouseEnter={() => setTagHi(i)}
                    onClick={() => insertTag(t.name)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 10px',
                      borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer',
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-1)',
                      background: i === tagHi ? 'var(--accent-soft)' : 'transparent',
                    }}
                  >
                    <Hash size={13} style={{ color: 'var(--text-3)' }} />
                    <span>#{t.name}</span>
                    <span style={{ marginLeft: 'auto', fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{t.useCount} 条</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{ flex: 1, position: 'relative' }}>
              <Input
                ref={inputRef}
                placeholder="问 AI，支持 @标签 / 语音..."
                value={input}
                onChange={(v: string) => void onInputChange(v)}
                onPressEnter={() => void send()}
                onKeyDown={onInputKeyDown}
                disabled={loading}
              />
            </div>
            <button
              className="lumina-iconbtn"
              onClick={() => void toggleVoice()}
              title={recording ? '结束录音' : '语音输入'}
              style={{ width: 32, height: 32, color: recording ? 'var(--danger)' : 'var(--text-2)', flexShrink: 0 }}
            >
              {recording ? <MicOff size={14} /> : <Mic size={14} />}
            </button>
            <button
              className="lumina-toolbtn lumina-toolbtn-primary"
              onClick={() => void send()}
              disabled={loading}
              style={{ opacity: loading ? 0.5 : 1 }}
            >
              <Send size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}