import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import { Glass } from '../ui/primitives'

interface WidgetCardProps {
  icon: LucideIcon
  title: string
  editing: boolean
  onRemove: () => void
  children: ReactNode
}

export default function WidgetCard({ icon: Icon, title, editing, onRemove, children }: WidgetCardProps) {
  return (
    <Glass
      className="lumina-board-widget"
      style={{ padding: 'var(--sp-4)', display: 'flex', flexDirection: 'column', gap: 10, minHeight: 120 }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
        <Icon size={14} color="var(--accent)" style={{ flexShrink: 0 }} />
        <span
          style={{
            fontSize: 'var(--text-md)',
            fontWeight: 600,
            color: 'var(--text-1)',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>
        {editing && (
          <button className="lumina-iconbtn" title="移除组件" onClick={onRemove} style={{ color: 'var(--danger)' }}>
            <X size={13} />
          </button>
        )}
      </div>
      {children}
    </Glass>
  )
}
