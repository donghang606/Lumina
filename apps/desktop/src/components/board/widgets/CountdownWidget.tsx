import { useState } from 'react'
import { Timer, Pencil, Check } from 'lucide-react'
import { useBoardStore } from '../../../stores/boardStore'
import { daysUntil } from '../../../lib/board'
import { Typography } from '@arco-design/web-react'
import WidgetCard from '../WidgetCard'
import UiButton from '../../ui/UiButton'

const { Text } = Typography

export default function CountdownWidget({ widgetId, title }: { widgetId: string; title: string }) {
  const widget = useBoardStore((s) => s.widgets.find((w) => w.id === widgetId))
  const { editing, removeWidget, updateWidget } = useBoardStore()
  const [setting, setSetting] = useState(false)
  const [label, setLabel] = useState(widget?.countdown?.label ?? '')
  const [date, setDate] = useState(widget?.countdown?.date ?? '')

  const cd = widget?.countdown
  const days = daysUntil(cd?.date)

  const color = days < 0 ? 'var(--danger)' : days <= 7 ? 'var(--warning)' : 'var(--success)'

  const save = () => {
    if (!date) return
    updateWidget(widgetId, { countdown: { label: label.trim() || '目标日', date } })
    setSetting(false)
  }

  const body = !cd || setting ? (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input className="lumina-board-input" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="目标名称（如 项目上线）" />
      <input className="lumina-board-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <UiButton variant="primary" onClick={save} disabled={!date}>
        设置
      </UiButton>
    </div>
  ) : (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 'var(--text-4xl)', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color, fontFamily: 'var(--font-doto, var(--font-display))' }}>
        {days < 0 ? 0 : days}
        <span style={{ fontSize: 'var(--text-base)', fontWeight: 500, color: 'var(--text-3)', marginLeft: 6 }}>天</span>
      </div>
      <Text style={{ fontSize: 'var(--text-md)', color: 'var(--text-1)', fontWeight: 600 }}>{cd.label}</Text>
      <Text style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
        {cd.date} · {days < 0 ? '已到期' : days === 0 ? '就是今天' : '剩余'}
      </Text>
      <div>
        <button
          className="lumina-btn lumina-btn-ghost"
          onClick={() => {
            setLabel(cd.label)
            setDate(cd.date)
            setSetting(true)
          }}
          style={{ padding: '3px 10px', fontSize: 'var(--text-xs)', gap: 4, display: 'inline-flex', alignItems: 'center' }}
        >
          <Pencil size={12} /> 修改
        </button>
      </div>
    </div>
  )

  return (
    <WidgetCard
      icon={Timer}
      title={title}
      editing={editing}
      onRemove={() => removeWidget(widgetId)}
      children={body}
    />
  )
}
