import { useEffect, useState } from 'react'
import { Typography } from '@arco-design/web-react'
import { Target, Flame, Pin, Zap, Leaf } from 'lucide-react'
import { useNoteStore } from '../../../stores/noteStore'
import { mdToPlainText } from '../../../lib/markdown'
import { useBoardStore } from '../../../stores/boardStore'
import type { Note } from '@lumina/shared'
import WidgetCard from '../WidgetCard'

const { Text } = Typography

const QUADS = [
  { key: 'q1', title: '重要且紧急', color: 'var(--danger)', Icon: Flame },
  { key: 'q2', title: '重要不紧急', color: 'var(--warning)', Icon: Pin },
  { key: 'q3', title: '紧急不重要', color: 'var(--success)', Icon: Zap },
  { key: 'q4', title: '不重要不紧急', color: 'var(--text-3)', Icon: Leaf },
] as const

function classify(n: Note): (typeof QUADS)[number]['key'] {
  const meta = (n.meta ?? {}) as Record<string, unknown>
  const urgent = meta.urgent === true || meta.priority === 'high' || (meta.due && new Date(String(meta.due)).getTime() - Date.now() < 48 * 3600 * 1000)
  const important = meta.important === true || meta.priority === 'high' || meta.priority === 'medium'
  const recent = Date.now() - new Date(n.updatedAt).getTime() < 3 * 86400000
  if (urgent && important) return 'q1'
  if (important) return 'q2'
  if (urgent) return 'q3'
  if (recent) return 'q2'
  return 'q4'
}

export default function QuadrantWidget({ widgetId, title }: { widgetId: string; title: string }) {
  const { editing, removeWidget } = useBoardStore()
  const { notes, loaded, loadNotes } = useNoteStore()
  const [local, setLocal] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!loaded) void loadNotes()
  }, [loaded, loadNotes])

  const placement = (n: Note) => local[n.id] ?? (n.meta?.quadrant as string) ?? classify(n)
  const groups = Object.fromEntries(QUADS.map((q) => [q.key, notes.filter((n) => placement(n) === q.key)])) as Record<
    string,
    Note[]
  >

  return (
    <WidgetCard icon={Target} title={title} editing={editing} onRemove={() => removeWidget(widgetId)}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {QUADS.map((q) => (
          <div key={q.key} className="lumina-quad">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
              <q.Icon size={12} color={q.color} />
              <Text style={{ fontSize: 'var(--text-xs)', fontWeight: 600, color: q.color }}>{q.title}</Text>
            </div>
            {(groups[q.key] ?? []).map((n) => (
              <div key={n.id} style={{ fontSize: 'var(--text-sm)', color: 'var(--text-2)', padding: '2px 0' }}>
                · {n.title || mdToPlainText(n.content).slice(0, 16) || '(无标题)'}
              </div>
            ))}
            {(groups[q.key] ?? []).length === 0 && (
              <Text style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>—</Text>
            )}
          </div>
        ))}
      </div>

      <Text style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block', marginTop: 8 }}>
        按 meta.urgent / important / due 自动归类；开启自动四象限后可拖动调整
      </Text>
    </WidgetCard>
  )
}
