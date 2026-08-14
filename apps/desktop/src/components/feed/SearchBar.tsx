import { useState, useRef, useCallback } from 'react'
import { Message } from '@arco-design/web-react'
import { Search, Mic, MicOff, Sparkles, StickyNote, Hash, ArrowRight, MessageSquareText, X, ExternalLink } from 'lucide-react'
import { useNoteStore } from '../../stores/noteStore'
import { noteService, tagService } from '../../services/noteService'
import { aiService, type ChatSource } from '../../services/aiService'
import { transcribeAudio } from '../../services/voiceService'
import { useLayoutStore } from '../../stores/layoutStore'
import { setFeedKeyword } from '../../stores/searchStore'
import UiButton from '../ui/UiButton'
import { Glass } from '../ui/primitives'

interface Suggestion {
  type: 'note' | 'tag' | 'action'
  id?: string
  label: string
  sub?: string
}

export default function SearchBar() {
  const { createNote, loadNotes } = useNoteStore()
  const setSelected = useNoteStore((s) => s.setSelected)
  const setNav = useLayoutStore((s) => s.setNav)
  const [value, setValue] = useState('')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [hi, setHi] = useState(0)
  const [recording, setRecording] = useState(false)
  const [searching, setSearching] = useState<string | null>(null)
  const [askMode, setAskMode] = useState(false)
  const [asking, setAsking] = useState(false)
  const [answer, setAnswer] = useState<{ reply: string; sources: ChatSource[] } | null>(null)
  const mediaRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const runSearch = useCallback((q: string, select = false) => {
    setSearching(q)
    setFeedKeyword(q)
    setSuggestions([])
    if (select) setHi(0)
  }, [])

  const toggleAskMode = () => {
    setAskMode((m) => !m)
    setAnswer(null)
    setSuggestions([])
  }

  const openSource = (noteId: string) => {
    setSelected(noteId)
    setNav('notes')
  }

  const askAi = async (q: string) => {
    setAsking(true)
    setSuggestions([])
    setAnswer(null)
    try {
      const res = await aiService.chat(q)
      setAnswer({ reply: res.reply, sources: res.sources ?? [] })
      setSearching(null)
    } catch {
      setAnswer({ reply: '⚠️ 无法连接 AI 服务，请确认服务端已启动。', sources: [] })
    } finally {
      setAsking(false)
    }
  }

  const loadSuggestions = async (q: string) => {
    if (!q.trim()) {
      setSuggestions([])
      return
    }
    const hasAt = q.includes('@')
    const tail = q.replace(/^.*@/, '')
    const isSearch = !hasAt
    const opts: Suggestion[] = []

    if (isSearch) {
      const notes = await noteService.search(q)
      for (const n of notes) opts.push({ type: 'note', id: n.id, label: n.title || '(无标题)', sub: '打开笔记' })
      opts.push({ type: 'action', label: `搜索笔记「${q}」`, sub: '回车执行' })
    } else if (q.trim().length > 0 && q !== '@') {
      const tags = await tagService.list()
      const matched = tags.filter((t) => t.name.toLowerCase().includes(tail.toLowerCase()))
      for (const t of matched.slice(0, 5)) opts.push({ type: 'tag', id: t.id, label: `#${t.name}`, sub: '添加标签' })
    }
    setSuggestions(opts)
    setHi(0)
  }

  const onInput = (q: string) => {
    setValue(q)
    runSearch(q, true)
    void loadSuggestions(q)
  }

  const pickSuggestion = async (s: Suggestion) => {
    if (s.type === 'note' && s.id) {
      setSelected(s.id)
      setNav('notes')
      setSuggestions([])
      setValue('')
      return
    }
    Message.info(s.label)
  }

  const doSearch = async () => {
    const q = value.trim()
    if (!q) return
    if (askMode) {
      void askAi(q)
      return
    }
    const tags = [...q.matchAll(/@(\S+)/g)].map((m) => m[1])
    const title = q.replace(/@\S+/g, '').trim()
    if (tags.length > 0 && title) {
      const id = await createNote({ title })
      if (id) {
        Message.success(`已记录「${title}」`)
        const allTags = await tagService.list()
        const ids = tags
          .map((t) => allTags.find((x) => x.name.toLowerCase() === t.toLowerCase())?.id)
          .filter((x): x is string => !!x)
        if (ids.length) await noteService.setTags(id, ids)
        await loadNotes()
        setSelected(id)
        setValue('')
        setSuggestions([])
        return
      }
    }
    runSearch(q)
  }

  const toggleRecord = async () => {
    if (recording) {
      mediaRef.current?.stop()
      setRecording(false)
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const rec = new MediaRecorder(stream)
      mediaRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data)
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' })
        Message.loading('转写中…')
        try {
          const json = await transcribeAudio(blob)
          Message.success(json.transcript ? '已将语音转写结果填入' : '语音转写完成')
          if (json.transcript) setValue(json.transcript)
        } catch {
          Message.error('语音接口未连接，先手动输入吧')
        }
      }
      rec.start()
      setRecording(true)
      Message.success('正在录音，再点一次结束')
    } catch {
      Message.error('无法访问麦克风')
    }
  }

  return (
    <div style={{ position: 'relative', marginBottom: 'var(--sp-4)' }}>
      <div
        className="glass lumina-search"
      >
        <Search size={16} className="lumina-search-icon" />
        <input
          className="lumina-search-input"
          placeholder={askMode ? '提问知识库，Enter 获取 AI 回答…' : '搜索笔记 / @标签快速记录 / Enter 搜索'}
          value={value}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void doSearch()
            if (e.key === 'ArrowDown') setHi((h) => Math.min(h + 1, suggestions.length - 1))
            if (e.key === 'ArrowUp') setHi((h) => Math.max(h - 1, 0))
            if (e.key === 'Escape') setSuggestions([])
          }}
        />
        <div className="lumina-search-actions">
          <button
            className="lumina-iconbtn"
            onClick={() => void toggleRecord()}
            style={{ color: recording ? 'var(--danger)' : 'var(--text-3)' }}
            title={recording ? '结束录音' : '语音记录'}
          >
            {recording ? <MicOff size={15} /> : <Mic size={15} />}
          </button>
          <button
            className="lumina-iconbtn"
            onClick={toggleAskMode}
            title="AI 问答模式"
            style={{ color: askMode ? 'var(--accent)' : 'var(--text-3)' }}
          >
            {askMode ? <X size={15} /> : <MessageSquareText size={15} />}
          </button>
          <button className="lumina-iconbtn" onClick={() => void doSearch()} title={askMode ? '提问' : '搜索'} style={{ color: 'var(--accent)' }}>
            <Sparkles size={15} />
          </button>
        </div>
      </div>

      {suggestions.length > 0 && (
        <Glass className="lumina-suggest">
          {suggestions.map((s, i) => (
            <div
              key={`${s.type}-${s.id ?? s.label}`}
              onMouseEnter={() => setHi(i)}
              onClick={() => void pickSuggestion(s)}
              className="lumina-suggest-item"
              style={{ background: i === hi ? 'var(--accent-soft)' : 'transparent' }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {s.type === 'tag' ? (
                  <Hash size={13} color="var(--text-3)" />
                ) : s.type === 'note' ? (
                  <StickyNote size={13} color="var(--text-3)" />
                ) : (
                  <ArrowRight size={13} color="var(--accent)" />
                )}
                <span style={{ fontSize: 'var(--text-md)', color: 'var(--text-1)' }}>{s.label}</span>
              </span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>{s.sub}</span>
            </div>
          ))}
        </Glass>
      )}

      {answer && (
        <Glass style={{ marginTop: 'var(--sp-3)', padding: '14px 16px', borderRadius: 'var(--radius-md)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ fontSize: 'var(--text-md)', color: 'var(--text-1)', lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word', flex: 1 }}>
              {answer.reply}
            </div>
            <button
              className="lumina-iconbtn"
              onClick={() => setAnswer(null)}
              title="收起"
              style={{ color: 'var(--text-3)', flexShrink: 0 }}
            >
              <X size={14} />
            </button>
          </div>
          {answer.sources.length > 0 && (
            <div style={{ marginTop: 'var(--sp-3)', borderTop: '1px solid color-mix(in srgb, var(--border) 50%, transparent)', paddingTop: 'var(--sp-2)' }}>
              <span className="lumina-label" style={{ display: 'block', marginBottom: 6 }}>
                检索来源（{answer.sources.length}）
              </span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {answer.sources.map((s, i) => (
                  <button
                    key={`${s.noteId}-${i}`}
                    onClick={() => openSource(s.noteId)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                      padding: '8px 10px',
                      border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
                      borderRadius: 'var(--radius-sm)',
                      background: 'color-mix(in srgb, var(--bg-2) 40%, transparent)',
                      cursor: 'pointer',
                      color: 'var(--text-1)',
                      fontSize: 'var(--text-sm)',
                      textAlign: 'left',
                    }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      <span style={{ color: 'var(--accent)', marginRight: 6 }}>#{i + 1}</span>
                      {s.title || '(无标题)'}
                    </span>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0, color: 'var(--text-3)' }}>
                      {s.score > 0 && <span style={{ fontSize: 'var(--text-xs)' }}>{Math.round(s.score * 100)}%</span>}
                      <ExternalLink size={12} />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </Glass>
      )}

      <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span className="lumina-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {askMode ? (
            <MessageSquareText size={11} />
          ) : (
            <Search size={11} />
          )}
          {askMode
            ? 'AI 问答模式：基于知识库语义检索回答，并列出引用来源'
            : searching
              ? `已锁定「${searching}」 ${feedbackSuffix(searching)}`
              : '回车记录带 @ 内容 · 其余为全文搜索'}
        </span>
        {asking && <span className="lumina-label" style={{ color: 'var(--accent)' }}>AI 思考中…</span>}
      </div>
    </div>
  )
}

function feedbackSuffix(q: string): string {
  const tags = [...q.matchAll(/@(\S+)/g)]
  return tags.length > 0 && q.replace(/@\S+/g, '').trim() ? '（已作为标签+记录保存）' : ''
}