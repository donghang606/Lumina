import { useRef, useState } from 'react'
import { LayoutDashboard, Plus, Check, RotateCcw, Move, Maximize2 } from 'lucide-react'
import { Modal, Typography } from '@arco-design/web-react'
import { useBoardStore } from '../../stores/boardStore'
import { WIDGET_INFO, type WidgetType, type BoardWidget } from '../../lib/board'
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
import QueryWidget from './widgets/QueryWidget'

const { Text } = Typography

const MIN_W = 200
const MIN_H = 120

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
    case 'query':
      return <QueryWidget widgetId={w.id} title={w.title} />
  }
}

export default function Board() {
  const { widgets, editing, setEditing, addWidget, updateLayout, resetBoard } = useBoardStore()
  const [pickOpen, setPickOpen] = useState(false)
  const dragRef = useRef<{ id: string; mode: 'move' | 'resize'; startX: number; startY: number; orig: { x: number; y: number; w: number; h: number } } | null>(null)

  const onPointerDown = (e: React.PointerEvent, w: BoardWidget, mode: 'move' | 'resize') => {
    if (!editing) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      id: w.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { x: w.x ?? 0, y: w.y ?? 0, w: w.w ?? 300, h: w.h ?? 200 },
    }
  }

  const onPointerMove = (e: React.PointerEvent, w: BoardWidget) => {
    const d = dragRef.current
    if (!d || d.id !== w.id) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (d.mode === 'move') {
      updateLayout(w.id, {
        x: Math.max(0, d.orig.x + dx),
        y: Math.max(0, d.orig.y + dy),
        w: d.orig.w,
        h: d.orig.h,
      })
    } else {
      updateLayout(w.id, {
        x: d.orig.x,
        y: d.orig.y,
        w: Math.max(MIN_W, d.orig.w + dx),
        h: Math.max(MIN_H, d.orig.h + dy),
      })
    }
  }

  const onPointerUp = () => {
    dragRef.current = null
  }

  const canvasBottom = widgets.reduce((max, w) => Math.max(max, (w.y ?? 0) + (w.h ?? 0)), 0) + 60

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
          position: 'relative',
          minHeight: canvasBottom,
          touchAction: 'none',
        }}
      >
        {widgets.map((w) => {
          const x = w.x ?? 0
          const y = w.y ?? 0
          const width = w.w ?? 300
          const height = w.h ?? 200
          return (
            <div
              key={w.id}
              onPointerMove={(e) => onPointerMove(e, w)}
              onPointerUp={onPointerUp}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                width,
                height,
                zIndex: dragRef.current?.id === w.id ? 20 : 1,
              }}
            >
              <div style={{ position: 'relative', width: '100%', height: '100%' }}>
                {renderWidget(w)}
                {editing && (
                  <>
                    <span
                      onPointerDown={(e) => onPointerDown(e, w, 'move')}
                      style={{
                        position: 'absolute',
                        top: 6,
                        left: 6,
                        zIndex: 5,
                        color: 'var(--text-3)',
                        cursor: 'move',
                        display: 'inline-flex',
                        padding: 2,
                        background: 'var(--bg-raised)',
                        borderRadius: 4,
                      }}
                      title="拖动移动"
                    >
                      <Move size={13} />
                    </span>
                    <span
                      onPointerDown={(e) => onPointerDown(e, w, 'resize')}
                      style={{
                        position: 'absolute',
                        right: 4,
                        bottom: 4,
                        zIndex: 5,
                        color: 'var(--text-3)',
                        cursor: 'nwse-resize',
                        display: 'inline-flex',
                        padding: 2,
                        background: 'var(--bg-raised)',
                        borderRadius: 4,
                      }}
                      title="拖动调整大小"
                    >
                      <Maximize2 size={12} />
                    </span>
                  </>
                )}
              </div>
            </div>
          )
        })}
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
                {info.size.w >= 600 ? ' · 整行' : ''}
              </span>
            </div>
          ))}
        </div>
      </Modal>
    </div>
  )
}