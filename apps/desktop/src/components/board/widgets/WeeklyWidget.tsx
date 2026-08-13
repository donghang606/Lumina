import { useEffect, useState, useCallback } from 'react'
import { Typography, Spin } from '@arco-design/web-react'
import { Radar, RefreshCw, Link2, HelpCircle, Quote, ArrowUpRight } from 'lucide-react'
import { insightService, type Insights } from '../../../services/feedService'
import { useBoardStore } from '../../../stores/boardStore'
import WidgetCard from '../WidgetCard'

const { Text } = Typography

const FALLBACK: Insights = {
  focusAreas: ['尚未积累'],
  connections: [],
  questions: ['积累更多笔记后，这里会出现值得深入的问题'],
  quote: '知识的价值不在于储存，而在于连接。',
  _meta: { noteCount: 0, linkCount: 0 },
}

const SECTIONS: { key: keyof Pick<Insights, 'focusAreas' | 'connections' | 'questions'>; title: string; desc: string; Icon: typeof Radar; color: string }[] = [
  { key: 'focusAreas', title: '重点领域', desc: '高频主题', Icon: Radar, color: 'var(--accent)' },
  { key: 'connections', title: '概念连接', desc: '跨领域桥接', Icon: Link2, color: 'var(--success)' },
  { key: 'questions', title: '值得追问', desc: '待深入的问题', Icon: HelpCircle, color: 'var(--warning)' },
]

export default function WeeklyWidget({ widgetId, title }: { widgetId: string; title: string }) {
  const { editing, removeWidget } = useBoardStore()
  const [data, setData] = useState<Insights | null>(null)
  const [loading, setLoading] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await insightService.get())
    } catch {
      setData(FALLBACK)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <WidgetCard icon={Radar} title={title} editing={editing} onRemove={() => removeWidget(widgetId)}>
      <div
        style={{
          position: 'relative',
          borderRadius: 'var(--radius-md)',
          margin: -2,
          padding: 2,
          background: 'radial-gradient(circle at 100% 0%, var(--accent-soft) 0%, transparent 55%)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 'var(--sp-4)' }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', flex: 1, minWidth: 0 }}>
            <Quote size={26} className="lumina-quote-mark" style={{ color: 'var(--accent)', flexShrink: 0, marginTop: 2 }} />
            <Text
              style={{
                fontSize: 'var(--text-lg)',
                fontStyle: 'italic',
                lineHeight: 1.65,
                color: 'var(--text-1)',
                display: 'block',
                flex: 1,
              }}
            >
              “{data?.quote ?? FALLBACK.quote}”
            </Text>
          </div>
          <button
            className="lumina-iconbtn"
            onClick={() => void load()}
            title="刷新洞察"
            style={{ marginTop: 2, width: 28, height: 28, flexShrink: 0 }}
          >
            {loading ? <Spin size={14} /> : <RefreshCw size={15} />}
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
          {SECTIONS.map(({ key, title, desc, Icon, color }) => {
            const raw = data?.[key] ?? FALLBACK[key]
            const items: string[] =
              key === 'connections'
                ? (raw as { a: string; b: string }[]).map((c) => `${c.a} ↔ ${c.b}`)
                : (raw as string[])
            return (
              <div key={key} className="glass" style={{ padding: 14, borderRadius: 'var(--radius-md)', borderColor: 'var(--border-1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: 'grid',
                      placeItems: 'center',
                      background: `${color}1a`,
                      color,
                    }}
                  >
                    <Icon size={14} />
                  </span>
                  <div>
                    <Text style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--text-1)', display: 'block', lineHeight: 1.2 }}>
                      {title}
                    </Text>
                    <Text style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block' }}>{desc}</Text>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {items.length === 0 && <Text style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>暂无</Text>}
                  {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 2, padding: '2px 0' }}>
                      <Text
                        style={{
                          fontSize: 'var(--text-sm)',
                          color: 'var(--text-2)',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                          lineHeight: 1.5,
                        }}
                      >
                        {item}
                      </Text>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'var(--sp-3)', color: 'var(--text-3)' }}>
          <ArrowUpRight size={12} />
          <span style={{ fontSize: 'var(--text-xs)' }}>
            基于 {data?._meta.noteCount ?? 0} 篇笔记 · {data?._meta.linkCount ?? 0} 条连接的实时统计
          </span>
        </div>
      </div>
    </WidgetCard>
  )
}
