import { useEffect, useRef, useCallback } from 'react'
import { Typography, Spin } from '@arco-design/web-react'
import {
  FileText,
  StickyNote,
  Bookmark,
  Paperclip,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Inbox,
  AtSign,
  LayoutList,
} from 'lucide-react'
import { useNoteStore } from '../../../stores/noteStore'
import { useLayoutStore } from '../../../stores/layoutStore'
import { mdToPlainText } from '../../../lib/markdown'
import { useBoardStore } from '../../../stores/boardStore'
import type { FeedItem, FeedType } from '@lumina/shared'
import WidgetCard from '../WidgetCard'

const { Text } = Typography

const TYPE_IDX: Record<string, { Icon: typeof FileText; label: string; color: string }> = {
  card: { Icon: Inbox, label: '卡片', color: 'var(--warning)' },
  note: { Icon: StickyNote, label: '笔记', color: 'var(--info)' },
  bookmark: { Icon: Bookmark, label: '收藏', color: 'var(--success)' },
  file: { Icon: Paperclip, label: '文件', color: 'var(--text-2)' },
}

const FILTERS: { key: FeedType | 'all'; label: string; Icon: typeof FileText | null }[] = [
  { key: 'all', label: '全部', Icon: null },
  { key: 'note', label: '笔记', Icon: StickyNote },
  { key: 'card', label: '卡片', Icon: Inbox },
  { key: 'bookmark', label: '收藏', Icon: Bookmark },
  { key: 'file', label: '文件', Icon: Paperclip },
]

export default function FeedWidget({ widgetId, title }: { widgetId: string; title: string }) {
  const { feed, feedHasMore, loadFeed, feedFilter, setFeedFilter, feedTotal } = useNoteStore()
  const setSelected = useNoteStore((s) => s.setSelected)
  const setNav = useLayoutStore((s) => s.setNav)
  const openAIPanel = useLayoutStore((s) => s.openAIPanel)
  const { editing, removeWidget } = useBoardStore()
  const loadingRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)
  const activeFilter = feedFilter.type ?? 'all'
  const order = feedFilter.order ?? 'desc'

  useEffect(() => {
    loadFeed(true)
  }, [loadFeed])

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !feedHasMore) return
    loadingRef.current = true
    await loadFeed()
    loadingRef.current = false
  }, [feedHasMore, loadFeed])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) void loadMore()
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loadMore])

  const openNote = (item: FeedItem) => {
    setSelected(item.id)
    setNav('notes')
  }

  const diveDeeper = (item: FeedItem) => {
    setSelected(item.id)
    openAIPanel()
  }

  return (
    <WidgetCard icon={LayoutList} title={title} editing={editing} onRemove={() => removeWidget(widgetId)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginRight: 'var(--sp-1)' }}>
          {FILTERS.map(({ key, label, Icon }) => {
            const active = activeFilter === key
            return (
              <button
                key={key}
                onClick={() => setFeedFilter({ type: key === 'all' ? undefined : key })}
                className="lumina-filter"
                style={{
                  background: active ? 'var(--accent-soft)' : 'transparent',
                  color: active ? 'var(--accent)' : 'var(--text-2)',
                  borderColor: active ? 'var(--accent)' : 'transparent',
                }}
              >
                {Icon && <Icon size={12} />}
                {label}
              </button>
            )
          })}
        </div>

        <button
          className="lumina-filter"
          onClick={() => setFeedFilter({ order: order === 'desc' ? 'asc' : 'desc' })}
          style={{ background: 'transparent', color: 'var(--text-2)', borderColor: 'transparent', display: 'flex', alignItems: 'center', gap: 4 }}
        >
          {order === 'desc' ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          排序
        </button>

        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
          {feedTotal} 条
        </span>
      </div>

      <div style={{ marginTop: 4 }}>
        {feed.length === 0 && (
          <div style={{ padding: 'var(--sp-6)', textAlign: 'center', color: 'var(--text-3)' }}>
            <Inbox size={26} style={{ marginBottom: 10, opacity: 0.5 }} />
            <div style={{ fontSize: 'var(--text-md)' }}>还在加载，或知识库还是空的～</div>
          </div>
        )}

        {feed.map((item) => {
          const t = TYPE_IDX[item.type] ?? { Icon: FileText, label: item.type, color: 'var(--text-2)' }
          return (
            <div key={item.id} className="lumina-feed-item" onClick={() => openNote(item)}>
              <div className="lumina-feed-icon" style={{ color: t.color }}>
                <t.Icon size={15} />
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  <Text style={{ fontSize: 'var(--text-base)', fontWeight: 600, color: 'var(--text-1)', display: 'block' }}>
                    {item.title || item.content.slice(0, 30) || '(无标题)'}
                  </Text>
                  {item.noteTags.map((tag) => (
                    <span
                      key={tag.id}
                      className="lumina-tagchip"
                      style={{ color: tag.color ?? 'var(--accent)', background: tag.color ? `${tag.color}1f` : 'var(--accent-soft)' }}
                    >
                      #{tag.name}
                    </span>
                  ))}
                </div>

                <Text
                  type="secondary"
                  style={{ fontSize: 'var(--text-md)', lineHeight: 1.6, color: 'var(--text-2)', display: 'block', marginTop: 4 }}
                >
                  {mdToPlainText(item.content).slice(0, 140) || '(空内容)'}
                </Text>

                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
                  <span className="lumina-feed-meta">
                    <t.Icon size={11} /> {t.label}
                  </span>
                  {item.type === 'bookmark' && typeof item.meta?.sourceUrl === 'string' && (
                    <a
                      href={item.meta.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="lumina-feed-meta lumina-feed-link"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {(item.meta.siteName ? `${item.meta.siteName} · ` : '') +
                        (() => {
                          try {
                            return new URL(item.meta.sourceUrl as string).hostname
                          } catch {
                            return item.meta.sourceUrl
                          }
                        })()}
                    </a>
                  )}
                  <span className="lumina-feed-meta">{new Date(item.createdAt).toLocaleString('zh-CN')}</span>
                  <div style={{ flex: 1 }} />
                  <button className="lumina-feed-dive" onClick={(e) => { e.stopPropagation(); diveDeeper(item) }}>
                    <Crosshair size={12} /> 深入
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {feed.length > 0 && feedHasMore && (
          <div ref={sentinelRef} style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>
            <Spin size={16} />
          </div>
        )}
        {feed.length > 0 && !feedHasMore && (
          <div style={{ padding: 'var(--sp-4)', textAlign: 'center', color: 'var(--text-3)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              <AtSign size={12} />
              <span style={{ fontSize: 'var(--text-sm)', letterSpacing: '0.06em' }}>已经到底啦</span>
            </div>
          </div>
        )}
      </div>
    </WidgetCard>
  )
}
