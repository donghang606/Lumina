import { useEffect, useState } from 'react'
import { Lightbulb, ArrowUpRight } from 'lucide-react'
import { Typography } from '@arco-design/web-react'
import { useNoteStore } from '../../../stores/noteStore'
import { useLayoutStore } from '../../../stores/layoutStore'
import { mdToPlainText } from '../../../lib/markdown'
import { useBoardStore } from '../../../stores/boardStore'
import WidgetCard from '../WidgetCard'

const { Text } = Typography

export default function InspirationWidget({ widgetId, title }: { widgetId: string; title: string }) {
  const { notes, loaded, loadNotes } = useNoteStore()
  const setSelected = useNoteStore((s) => s.setSelected)
  const setNav = useLayoutStore((s) => s.setNav)
  const { editing, removeWidget } = useBoardStore()
  const [items, setItems] = useState<typeof notes>([])

  useEffect(() => {
    if (!loaded) void loadNotes()
  }, [loaded, loadNotes])

  useEffect(() => {
    setItems(
      notes
        .filter((n) => (n.content || '').trim() || n.title)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 4),
    )
  }, [notes])

  const open = (id: string) => {
    setSelected(id)
    setNav('notes')
  }

  return (
    <WidgetCard icon={Lightbulb} title={title} editing={editing} onRemove={() => removeWidget(widgetId)}>
      {items.length === 0 && <Text style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>暂无灵感片段，去笔记/Feed 添加吧</Text>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
        {items.map((n) => {
          const text = mdToPlainText(n.content || '') || n.title
          return (
            <div key={n.id} onClick={() => open(n.id)} className="lumina-inspire" style={{ padding: 10 }}>
              <div className="lumina-inspire-title">
                <Text style={{ fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {n.title || '(无标题)'}
                </Text>
                <ArrowUpRight size={12} className="lumina-inspire-arrow" />
              </div>
              <Text style={{ fontSize: 'var(--text-xs)', color: 'var(--text-2)', lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', margin: '6px 0' }}>
                {text.slice(0, 50)}
              </Text>
            </div>
          )
        })}
      </div>
    </WidgetCard>
  )
}
