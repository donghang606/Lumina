import { useState } from 'react'
import { CheckCircle2, Circle, Plus, Trash2, ListChecks } from 'lucide-react'
import { useBoardStore } from '../../../stores/boardStore'
import { Typography } from '@arco-design/web-react'
import WidgetCard from '../WidgetCard'

const { Text } = Typography

export default function TodoWidget({ widgetId, title }: { widgetId: string; title: string }) {
  const widget = useBoardStore((s) => s.widgets.find((w) => w.id === widgetId))
  const { editing, removeWidget, addTodoItem, toggleTodoItem, removeTodoItem } = useBoardStore()
  const [text, setText] = useState('')

  const items = widget?.todoItems ?? []
  const done = items.filter((i) => i.done).length
  const pct = items.length ? Math.round((done / items.length) * 100) : 0

  const submit = () => {
    addTodoItem(widgetId, text)
    setText('')
  }

  return (
    <WidgetCard icon={ListChecks} title={title} editing={editing} onRemove={() => removeWidget(widgetId)}>
      {items.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 999, background: 'var(--bg-subtle)', overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: 'var(--success)', borderRadius: 999, transition: 'width var(--dur-2) var(--ease-out)' }} />
          </div>
          <Text style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', fontVariantNumeric: 'tabular-nums' }}>
            {done}/{items.length}
          </Text>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {items.map((item) => (
          <div
            key={item.id}
            style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--radius-sm)' }}
            className="lumina-board-todo"
          >
            <button
              onClick={() => toggleTodoItem(widgetId, item.id)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, display: 'inline-flex', color: item.done ? 'var(--success)' : 'var(--text-3)' }}
              title={item.done ? '标记未完成' : '标记完成'}
            >
              {item.done ? <CheckCircle2 size={16} /> : <Circle size={16} />}
            </button>
            <Text
              style={{
                flex: 1,
                fontSize: 'var(--text-md)',
                color: item.done ? 'var(--text-3)' : 'var(--text-1)',
                textDecoration: item.done ? 'line-through' : 'none',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.text}
            </Text>
            <button
              className="lumina-iconbtn lumina-board-del"
              onClick={() => removeTodoItem(widgetId, item.id)}
              title="删除"
              style={{ color: 'var(--danger)' }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {items.length === 0 && <Text style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>暂无待办，添加一条开始吧</Text>}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          className="lumina-board-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit()
          }}
          placeholder="新待办…"
        />
        <button className="lumina-tool" onClick={submit} title="添加" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
          <Plus size={14} />
        </button>
      </div>
    </WidgetCard>
  )
}
