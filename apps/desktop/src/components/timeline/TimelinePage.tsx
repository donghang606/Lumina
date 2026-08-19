import { useEffect, useState } from 'react'
import { Typography, Empty, Spin } from '@arco-design/web-react'
import { History, CalendarDays, ArrowRight } from 'lucide-react'
import { feedService } from '../../services/feedService'
import { mdToPlainText } from '../../lib/markdown'
import type { FeedItem } from '@lumina/shared'
import { useNoteStore } from '../../stores/noteStore'
import { useLayoutStore } from '../../stores/layoutStore'

const { Text } = Typography

export default function TimelinePage() {
  const setSelected = useNoteStore((s) => s.setSelected)
  const setNav = useLayoutStore((s) => s.setNav)
  const openNote = (id: string) => {
    setSelected(id)
    setNav('notes')
  }
  const [items, setItems] = useState<FeedItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    feedService
      .list(0, 100, { order: 'asc' })
      .then((r) => {
        if (!cancelled) setItems(r.items)
      })
      .catch(() => {
        if (!cancelled) setItems([])
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 按日期分组（升序展示）
  const groups: { date: string; items: FeedItem[] }[] = []
  for (const it of items) {
    const d = (it.createdAt ?? '').slice(0, 10)
    const last = groups[groups.length - 1]
    if (last && last.date === d) last.items.push(it)
    else groups.push({ date: d, items: [it] })
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--sp-5)' }}>
        <History size={16} color="var(--accent)" />
        <Text className="display" style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-1)' }}>
          时间线
        </Text>
        <Text type="secondary" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
          按创建时间排布的笔记全景（KnowMe 全局时间线借鉴）
        </Text>
      </div>

      {loading ? (
        <div style={{ display: 'grid', placeItems: 'center', padding: 60 }}>
          <Spin />
        </div>
      ) : groups.length === 0 ? (
        <Empty description="还没有笔记" />
      ) : (
        groups.map((g) => (
          <div key={g.date} style={{ display: 'flex', gap: 16, marginBottom: 'var(--sp-5)' }}>
            {/* 时间轴 */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 90, flexShrink: 0 }}>
              <span style={{ fontSize: 'var(--text-md)', fontWeight: 700, color: 'var(--text-1)', whiteSpace: 'nowrap' }}>{g.date}</span>
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>
                {new Date(g.date).toLocaleDateString('zh-CN', { weekday: 'short' })}
              </span>
            </div>
            {/* 竖线 */}
            <div style={{ position: 'relative', width: 2, background: 'var(--glass-border)', borderRadius: 2 }}>
              <span style={{ position: 'absolute', top: 6, left: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', boxShadow: '0 0 10px var(--accent-soft)' }} />
            </div>
            {/* 当日条目 */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              {g.items.map((n) => (
                <div
                  key={n.id}
                  className="glass"
                  style={{ padding: 'var(--sp-3) var(--sp-4)', borderRadius: 'var(--radius-md)', cursor: 'pointer', display: 'flex', gap: 12, alignItems: 'center' }}
                  onClick={() => openNote(n.id)}
                >
                  <CalendarDays size={14} color="var(--text-3)" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--text-1)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {n.title || n.content.slice(0, 40) || '(无标题)'}
                    </Text>
                    <Text type="secondary" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)' }} ellipsis={{ rows: 1 }}>
                      {mdToPlainText(n.content).slice(0, 120)}
                    </Text>
                  </div>
                  <ArrowRight size={13} color="var(--text-3)" style={{ flexShrink: 0 }} />
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}