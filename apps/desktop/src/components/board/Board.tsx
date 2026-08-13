import { useState } from 'react'
import { LayoutDashboard, Plus, Check, RotateCcw, GripVertical } from 'lucide-react'
import { Modal, Typography } from '@arco-design/web-react'
import { useBoardStore } from '../../stores/boardStore'
import { WIDGET_INFO, type WidgetType } from '../../lib/board'
import UiButton from '../ui/UiButton'
import TodoWidget from './widgets/TodoWidget'
import CountdownWidget from './widgets/CountdownWidget'
import StatsWidget from './widgets/StatsWidget'
import InspirationWidget from './widgets/InspirationWidget'
import LinksWidget from './widgets/LinksWidget'
import WeeklyWidget from './widgets/WeeklyWidget'
import ActivityWidget from './widgets/ActivityWidget'
import QuadrantWidget from './widgets/QuadrantWidget'
import FeedWidget from './widgets/FeedWidget'

const { Text } = Typography

function renderWidget(w: { id: string; type: WidgetType; title: string }) {
  switch (w.type) {
    case 'todo':
      return <TodoWidget widgetId={w.id} title={w.title} />
    case 'countdown':
      return <CountdownWidget widgetId={w.id} title={w.title} />
    case 'stats':
      return <StatsWidget widgetId={w.id} title={w.title} />
    case 'inspiration':
      return <InspirationWidget widgetId={w.id} title={w.title} />
    case 'links':
      return <LinksWidget widgetId={w.id} title={w.title} />
    case 'weekly':
      return <WeeklyWidget widgetId={w.id} title={w.title} />
    case 'activity':
      return <ActivityWidget widgetId={w.id} title={w.title} />
    case 'quadrant':
      return <QuadrantWidget widgetId={w.id} title={w.title} />
    case 'feed':
      return <FeedWidget widgetId={w.id} title={w.title} />
  }
}

export default function Board() {
  const { widgets, editing, setEditing, addWidget, moveWidget, resetBoard } = useBoardStore()
  const [dragging, setDragging] = useState<number | null>(null)
  const [pickOpen, setPickOpen] = useState(false)

  const swap = (from: number, to: number) => {
    if (from === to || to < 0 || to >= widgets.length) return
    moveWidget(from, to)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--sp-3)' }}>
        <LayoutDashboard size={15} color="var(--accent)" />
        <Text style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-1)' }}>工作台</Text>
        <span style={{ flex: 1 }} />
        <UiButton variant="outline" icon={Plus} onClick={() => setPickOpen(true)}>
          添加组件
        </UiButton>
        <UiButton variant={editing ? 'primary' : 'subtle'} icon={Check} onClick={() => setEditing(!editing)}>
          {editing ? '完成' : '编辑'}
        </UiButton>
        {editing && (
          <UiButton variant="ghost" icon={RotateCcw} onClick={resetBoard} title="恢复默认">
            默认
          </UiButton>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
          gap: 14,
          alignItems: 'start',
        }}
      >
        {widgets.map((w, i) => (
          <div
            key={w.id}
            draggable={editing}
            onDragStart={() => setDragging(i)}
            onDragOver={(e) => {
              e.preventDefault()
              if (dragging !== null) swap(dragging, i)
            }}
            onDragEnd={() => setDragging(null)}
            style={{ cursor: editing ? 'grab' : 'default', position: 'relative', gridColumn: w.wide ? '1 / -1' : 'auto' }}
          >
            {editing && (
              <span
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  zIndex: 3,
                  color: 'var(--text-3)',
                  display: 'inline-flex',
                }}
                title="拖动排序"
              >
                <GripVertical size={13} />
              </span>
            )}
            {renderWidget(w)}
          </div>
        ))}
      </div>

      <Modal visible={pickOpen} onCancel={() => setPickOpen(false)} footer={null} title="添加组件">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {Object.entries(WIDGET_INFO).map(([type, info]) => (
            <div
              key={type}
              className="lumina-pick-item"
              onClick={() => {
                addWidget(type as WidgetType)
                setPickOpen(false)
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Plus size={14} color="var(--accent)" />
                {info.title}
              </span>
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
                {info.desc}
                {info.wide ? ' · 整行' : ''}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}
