import { useEffect } from 'react'
import { BarChart3 } from 'lucide-react'
import { useNoteStore } from '../../../stores/noteStore'
import { useBoardStore } from '../../../stores/boardStore'
import WidgetCard from '../WidgetCard'

export default function StatsWidget({ widgetId, title }: { widgetId: string; title: string }) {
  const { notes, loaded, loadNotes, tags, loadTags } = useNoteStore()
  const { editing, removeWidget } = useBoardStore()
  const { widgets } = useBoardStore()

  useEffect(() => {
    if (!loaded) void loadNotes()
    void loadTags()
  }, [loaded, loadNotes, loadTags])

  const today = new Date().toISOString().slice(0, 10)
  const todayCount = notes.filter((n) => n.createdAt.startsWith(today)).length
  const openTodos = widgets.reduce((acc, w) => acc + (w.todoItems ?? []).filter((i) => !i.done).length, 0)

  const stats = [
    { label: '笔记', value: notes.length },
    { label: '今日新增', value: todayCount },
    { label: '标签', value: tags.length },
    { label: '待办未完成', value: openTodos },
  ]

  return (
    <WidgetCard icon={BarChart3} title={title} editing={editing} onRemove={() => removeWidget(widgetId)}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
        {stats.map((s) => (
          <div key={s.label} style={{ background: 'var(--bg-subtle)', borderRadius: 'var(--radius-md)', padding: '10px 12px' }}>
            <div style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', fontFamily: 'var(--font-display)', color: 'var(--accent)' }}>
              {s.value}
            </div>
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 2 }}>{s.label}</div>
          </div>
        ))}
      </div>
    </WidgetCard>
  )
}
