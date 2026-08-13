import { useEffect, useState } from 'react'
import { Typography, Tooltip } from '@arco-design/web-react'
import { Flame } from 'lucide-react'
import { feedService } from '../../../services/feedService'
import { useNoteStore } from '../../../stores/noteStore'
import { useBoardStore } from '../../../stores/boardStore'
import WidgetCard from '../WidgetCard'

const { Text } = Typography

export default function ActivityWidget({ widgetId, title }: { widgetId: string; title: string }) {
  const { editing, removeWidget } = useBoardStore()
  const { setFeedFilter } = useNoteStore()
  const [days, setDays] = useState<{ date: string; count: number }[]>([])
  const [activeDate, setActiveDate] = useState<string | null>(null)

  useEffect(() => {
    void feedService.activity(90).then((r) => setDays(r.days))
  }, [])

  const max = Math.max(1, ...days.map((d) => d.count))
  const levels = (n: number) => {
    if (n === 0) return 'var(--lvl-0, rgba(120,150,190,0.12))'
    const t = n / max
    if (t < 0.25) return 'var(--lvl-1, rgba(58,164,255,0.3))'
    if (t < 0.5) return 'var(--lvl-2, rgba(58,164,255,0.5))'
    if (t < 0.75) return 'var(--lvl-3, rgba(58,164,255,0.75))'
    return 'var(--accent)'
  }

  const clickDay = (date: string) => {
    const next = activeDate === date ? null : date
    setActiveDate(next)
    setFeedFilter({ onDate: next ?? undefined })
  }

  return (
    <WidgetCard icon={Flame} title={title} editing={editing} onRemove={() => removeWidget(widgetId)}>
      <div style={{ display: 'flex', flexDirection: 'column', flexWrap: 'wrap', maxHeight: 132, gap: 4 }}>
        {days.map((d) => (
          <Tooltip key={d.date} content={`${d.date}：${d.count} 条`}>
            <div
              className="lumina-heat"
              onClick={() => clickDay(d.date)}
              style={{
                background: activeDate === d.date ? 'var(--warning)' : levels(d.count),
                boxShadow: activeDate === d.date ? '0 0 0 2px var(--bg-app), 0 0 12px var(--accent-soft)' : undefined,
              }}
            />
          </Tooltip>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 5 }}>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>少</span>
        {['var(--lvl-0, rgba(120,150,190,0.12))', 'var(--lvl-1, rgba(58,164,255,0.3))', 'var(--lvl-2, rgba(58,164,255,0.5))', 'var(--lvl-3, rgba(58,164,255,0.75))', 'var(--accent)'].map(
          (c) => (
            <span key={c} className="lumina-heat" style={{ background: c }} />
          ),
        )}
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>多</span>
      </div>

      <Text style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block', marginTop: 6 }}>
        {activeDate ? `${activeDate} 已筛选，再点取消` : '点击格子可在信息流筛选该日'}
      </Text>
    </WidgetCard>
  )
}
