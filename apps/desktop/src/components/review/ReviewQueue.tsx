import { useEffect, useState } from 'react'
import { Message, Spin } from '@arco-design/web-react'
import { Check, X, Inbox, Sparkles, Tags, FilePlus2, Bot } from 'lucide-react'
import { reviewService } from '../../services/reviewService'
import type { ReviewSuggestion } from '@lumina/shared'
import { Glass } from '../ui/primitives'

export default function ReviewQueue({ onClose, onOpenNote }: { onClose: () => void; onOpenNote?: (id: string) => void }) {
  const [items, setItems] = useState<ReviewSuggestion[]>([])
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      setItems(await reviewService.list())
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const apply = async (s: ReviewSuggestion) => {
    setBusyId(s.id)
    try {
      const r = await reviewService.accept(s.id)
      if (r.ok) {
        Message.success(s.kind === 'summary' ? '摘要已应用' : s.kind === 'tags' ? '标签已应用' : '笔记已创建')
        await load()
        if (s.kind === 'note' && onOpenNote && s.noteId) onOpenNote(s.noteId)
      } else {
        Message.error(r.reason ?? '应用失败')      }
    } catch {
      Message.error('应用失败')
    } finally {
      setBusyId(null)
    }
  }

  const reject = async (id: string) => {
    try {
      await reviewService.reject(id)
      await load()
    } catch {
      /* ignore */
    }
  }

  const renderPayload = (s: ReviewSuggestion) => {
    const p = s.payload ?? {}
    if (s.kind === 'summary') {
      return <div className="lumina-review-text">{String(p.summary ?? '')}</div>
    }
    if (s.kind === 'tags') {
      const tags = Array.isArray(p.tags) ? (p.tags as { name?: string }[]) : []
      return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {tags.map((t, i) => (
            <span key={i} className="lumina-review-chip">
              #{t.name}
            </span>
          ))}
        </div>
      )
    }
    if (s.kind === 'note') {
      return (
        <div>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{String(p.title ?? '(未命名)')}</div>
          <div className="lumina-review-text" style={{ WebkitLineClamp: 4 }}>
            {String(p.content ?? '').slice(0, 400)}
          </div>
          {Array.isArray(p.tags) && (p.tags as string[]).length > 0 && (
            <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {(p.tags as string[]).map((t, i) => (
                <span key={i} className="lumina-review-chip">
                  #{t}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    }
    return null
  }

  const kindMeta: Record<string, { icon: typeof Sparkles; label: string }> = {
    summary: { icon: Sparkles, label: 'AI 摘要' },
    tags: { icon: Tags, label: 'AI 标签' },
    note: { icon: FilePlus2, label: '建议笔记' },
    wiki: { icon: Bot, label: 'Wiki' },
  }

  return (
    <Glass style={{ position: 'fixed', top: 60, right: 20, width: 380, maxHeight: 'calc(100vh - 120px)', zIndex: 2200, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 0, boxShadow: 'var(--shadow-3)' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <Inbox size={15} color="var(--accent)" />
        <span style={{ fontWeight: 700, fontSize: 'var(--text-lg)', color: 'var(--text-1)' }}>审核队列</span>
        {!loading && items.length > 0 && (
          <span className="lumina-review-badge">{items.length}</span>
        )}
        <div style={{ flex: 1 }} />
        {items.length > 0 && (
          <button className="lumina-toolbtn" style={{ fontSize: 'var(--text-sm)' }} onClick={() => void reviewService.dismissAll().then(load)}>
            全部忽略
          </button>
        )}
        <button className="lumina-iconbtn" onClick={onClose} style={{ width: 28, height: 28 }}>
          <X size={14} />
        </button>
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 'var(--sp-3)' }}>
        {loading ? (
          <div style={{ display: 'grid', placeItems: 'center', padding: 30 }}>
            <Spin />
          </div>
        ) : items.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 30, color: 'var(--text-3)', fontSize: 'var(--text-md)' }}>
            队列为空，AI 生成的摘要 / 标签 / 建议笔记会先到这里等你确认
          </div>
        ) : (
          items.map((s) => {
            const meta = kindMeta[s.kind] ?? kindMeta.summary
            const Icon = meta.icon
            return (
              <div key={s.id} className="glass" style={{ padding: 'var(--sp-3)', marginBottom: 'var(--sp-3)', borderRadius: 'var(--radius-md)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                  <Icon size={13} color="var(--accent)" />
                  <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-1)' }}>{meta.label}</span>
                  {s.source === 'mcp' && <span className="lumina-review-chip" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>MCP</span>}
                  <span style={{ flex: 1 }} />
                  {s.noteTitle && (
                    <span
                      className="lumina-side-link"
                      style={{ fontSize: 'var(--text-xs)', cursor: 'pointer' }}
                      onClick={() => s.noteId && onOpenNote?.(s.noteId)}
                    >
                      {s.noteTitle}
                    </span>
                  )}
                </div>
                {renderPayload(s)}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button
                    className="lumina-toolbtn lumina-toolbtn-primary"
                    disabled={busyId === s.id}
                    onClick={() => void apply(s)}
                  >
                    <Check size={13} /> 采纳
                  </button>
                  <button className="lumina-toolbtn" disabled={busyId === s.id} onClick={() => void reject(s.id)}>
                    <X size={13} /> 忽略
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </Glass>
  )
}

export function useReviewCount() {
  const [count, setCount] = useState(0)
  const refresh = async () => {
    try {
      setCount((await reviewService.list()).length)
    } catch {
      setCount(0)
    }
  }
  useEffect(() => {
    void refresh()
    const t = setInterval(() => void refresh(), 30000)
    return () => clearInterval(t)
  }, [])
  return { count, refresh }
}
