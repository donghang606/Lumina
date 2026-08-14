import { useEffect, useState } from 'react'
import { ListFilter, Plus, Trash2, RefreshCw, CornerUpRight } from 'lucide-react'
import { Modal, Input, Select, Button, Empty } from '@arco-design/web-react'
import { useBoardStore } from '../../../stores/boardStore'
import { useNoteStore } from '../../../stores/noteStore'
import { viewService } from '../../../services/viewService'
import { tagService } from '../../../services/noteService'
import WidgetCard from '../WidgetCard'
import type { QueryView, TagWithCount } from '@lumina/shared'

const FormItem = Input

export default function QueryWidget({ widgetId, title }: { widgetId: string; title: string }) {
  const { editing, removeWidget } = useBoardStore()
  const setSelected = useNoteStore((s) => s.setSelected)
  const [views, setViews] = useState<QueryView[]>([])
  const [results, setResults] = useState<Record<string, { id: string; title: string; snippet: string }[]>>({})
  const [modal, setModal] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState<'tag' | 'keyword' | 'recent' | 'backlink'>('keyword')
  const [query, setQuery] = useState('')
  const [tagId, setTagId] = useState<string | undefined>()
  const [days, setDays] = useState(30)
  const [tags, setTags] = useState<TagWithCount[]>([])
  const [saving, setSaving] = useState(false)

  const refresh = async () => {
    const list = await viewService.list()
    setViews(list)
    const entries = await Promise.all(
      list.map(async (v) => {
        try {
          const r = await viewService.run(v.id, 6)
          return [v.id, r.items] as const
        } catch {
          return [v.id, []] as const
        }
      }),
    )
    setResults(Object.fromEntries(entries))
  }

  useEffect(() => {
    void refresh()
    void tagService.list().then(setTags)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [widgetId])

  const save = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      const config: Record<string, unknown> =
        type === 'keyword'
          ? { query }
          : type === 'tag'
            ? { tagId }
            : type === 'recent'
              ? { days }
              : {}
      await viewService.upsert({ name: name.trim(), type, config })
      setModal(false)
      setName('')
      setQuery('')
      await refresh()
    } finally {
      setSaving(false)
    }
  }

  const removeView = async (id: string) => {
    await viewService.remove(id)
    await refresh()
  }

  return (
    <WidgetCard icon={ListFilter} title={title} editing={editing} onRemove={() => removeWidget(widgetId)}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button size="small" icon={<RefreshCw size={12} />} onClick={() => void refresh()}>
          刷新
        </Button>
        <Button size="small" type="primary" icon={<Plus size={12} />} onClick={() => setModal(true)}>
          新建视图
        </Button>
      </div>

      {views.length === 0 ? (
        <Empty description="暂无查询视图，点击上方新建" style={{ padding: '12px 0' }} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto', maxHeight: 'calc(100% - 60px)' }}>
          {views.map((v) => (
            <div key={v.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontWeight: 600, fontSize: 'var(--text-sm)', color: 'var(--text-1)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {v.name}
                </span>
                <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)' }}>{v.type}</span>
                {editing && (
                  <button className="lumina-iconbtn" title="删除视图" onClick={() => void removeView(v.id)} style={{ color: 'var(--danger)' }}>
                    <Trash2 size={11} />
                  </button>
                )}
              </div>
              {(results[v.id] ?? []).slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="lumina-side-link"
                  onClick={() => setSelected(item.id)}
                  style={{ marginTop: 6, fontSize: 'var(--text-sm)' }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <CornerUpRight size={11} color="var(--accent)" />
                    {item.title || '(无标题)'}
                  </span>
                </div>
              ))}
              {(results[v.id] ?? []).length === 0 && (
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', marginTop: 6 }}>暂无匹配笔记</div>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal visible={modal} title="新建查询视图" onCancel={() => setModal(false)} onOk={() => void save()} confirmLoading={saving} unmountOnExit>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div className="lumina-label" style={{ marginBottom: 6 }}>视图名称</div>
            <Input value={name} onChange={setName} placeholder="如「最近一周」" />
          </div>
          <div>
            <div className="lumina-label" style={{ marginBottom: 6 }}>聚合方式</div>
            <Select value={type} onChange={setType} style={{ width: '100%' }}>
              <Select.Option value="keyword">关键词</Select.Option>
              <Select.Option value="tag">按标签</Select.Option>
              <Select.Option value="recent">最近更新</Select.Option>
              <Select.Option value="backlink">反向链接</Select.Option>
            </Select>
          </div>
          {type === 'keyword' && (
            <div>
              <div className="lumina-label" style={{ marginBottom: 6 }}>关键词</div>
              <Input value={query} onChange={setQuery} placeholder="如 ai、架构" />
            </div>
          )}
          {type === 'tag' && (
            <div>
              <div className="lumina-label" style={{ marginBottom: 6 }}>标签</div>
              <Select value={tagId} onChange={setTagId} allowClear style={{ width: '100%' }} placeholder="选择标签">
                {tags.map((t) => (
                  <Select.Option key={t.id} value={t.id}>
                    #{t.name} ({t.useCount})
                  </Select.Option>
                ))}
              </Select>
            </div>
          )}
          {type === 'recent' && (
            <div>
              <div className="lumina-label" style={{ marginBottom: 6 }}>近 N 天更新</div>
              <Input type="number" value={String(days)} onChange={(v) => setDays(Number(v))} style={{ width: 120 }} />
            </div>
          )}
          {type === 'backlink' && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
              反向链接视图需在创建后通过 API 指定目标笔记，当前返回空集。
            </div>
          )}
        </div>
      </Modal>
    </WidgetCard>
  )
}
