import { useState } from 'react'
import { Link2, Plus, ExternalLink, Trash2 } from 'lucide-react'
import { useBoardStore } from '../../../stores/boardStore'
import { Typography } from '@arco-design/web-react'
import WidgetCard from '../WidgetCard'

const { Text } = Typography

export default function LinksWidget({ widgetId, title }: { widgetId: string; title: string }) {
  const widget = useBoardStore((s) => s.widgets.find((w) => w.id === widgetId))
  const { editing, removeWidget, addLink, removeLink } = useBoardStore()
  const [t, setT] = useState('')
  const [u, setU] = useState('')

  const links = widget?.links ?? []

  const submit = () => {
    if (!u.trim()) return
    const url = /^[a-z]+:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`
    addLink(widgetId, t.trim() || url, url)
    setT('')
    setU('')
  }

  return (
    <WidgetCard icon={Link2} title={title} editing={editing} onRemove={() => removeWidget(widgetId)}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        {links.map((l) => (
          <div key={l.id} className="lumina-board-link" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 'var(--radius-sm)' }}>
            <a href={l.url} target="_blank" rel="noreferrer" style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8, color: 'inherit', textDecoration: 'none' }}>
              <ExternalLink size={12} color="var(--text-3)" style={{ flexShrink: 0 }} />
              <Text style={{ flex: 1, fontSize: 'var(--text-md)', color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.title}</Text>
            </a>
            <button
              className="lumina-iconbtn lumina-board-del"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                removeLink(widgetId, l.id)
              }}
              title="删除"
              style={{ color: 'var(--danger)' }}
            >
              <Trash2 size={12} />
            </button>
          </div>
        ))}
        {links.length === 0 && <Text style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>暂无链接，添加常用入口吧</Text>}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <input className="lumina-board-input" value={t} onChange={(e) => setT(e.target.value)} placeholder="名称（可选）" />
        <div style={{ display: 'flex', gap: 6 }}>
          <input className="lumina-board-input" value={u} onChange={(e) => setU(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="https://…" />
          <button className="lumina-tool" onClick={submit} title="添加" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <Plus size={14} />
          </button>
        </div>
      </div>
    </WidgetCard>
  )
}
