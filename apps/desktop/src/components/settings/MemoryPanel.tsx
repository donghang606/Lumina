import { useEffect, useState, useCallback } from 'react'
import { Typography, Button, Input, Select, Empty, Space, Popconfirm, Message, Tag } from '@arco-design/web-react'
import { Plus, Trash2, Pencil, Search, Brain } from 'lucide-react'
import { trpc } from '../../lib/trpc'

const { Text } = Typography

interface Memory {
  id: string
  type: string
  content: string
  source: string
  createdAt: string
  updatedAt: string
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  profile: { label: '身份', color: 'blue' },
  preference: { label: '偏好', color: 'green' },
  fact: { label: '事实', color: 'orange' },
  task: { label: '任务', color: 'purple' },
  interest: { label: '兴趣', color: 'cyan' },
}

export default function MemoryPanel() {
  const [memories, setMemories] = useState<Memory[]>([])
  const [filter, setFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [editModal, setEditModal] = useState<{ mode: 'create' | 'edit'; memory?: Memory } | null>(null)
  const [editType, setEditType] = useState('fact')
  const [editContent, setEditContent] = useState('')
  const [editSource, setEditSource] = useState('')

  const loadMemories = useCallback(async () => {
    try {
      const data = await trpc.memory.list.query()
      setMemories(data as Memory[])
    } catch (e) {
      console.error('Failed to load memories', e)
    }
  }, [])

  useEffect(() => { void loadMemories() }, [loadMemories])

  const filtered = memories.filter((m) => {
    if (filter && m.type !== filter) return false
    if (search && !m.content.toLowerCase().includes(search.toLowerCase()) && !m.source.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const handleCreate = () => {
    setEditModal({ mode: 'create' })
    setEditType('fact')
    setEditContent('')
    setEditSource('')
  }

  const handleEdit = (m: Memory) => {
    setEditModal({ mode: 'edit', memory: m })
    setEditType(m.type)
    setEditContent(m.content)
    setEditSource(m.source)
  }

  const handleSave = async () => {
    if (!editContent.trim()) { Message.warning('内容不能为空'); return }
    try {
      if (editModal?.mode === 'create') {
        await trpc.memory.create.mutate({ type: editType as any, content: editContent, source: editSource })
        Message.success('记忆已创建')
      } else if (editModal?.memory) {
        await trpc.memory.update.mutate({ id: editModal.memory.id, content: editContent, type: editType })
        Message.success('记忆已更新')
      }
      setEditModal(null)
      void loadMemories()
    } catch {
      Message.error('保存失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await trpc.memory.delete.mutate({ id })
      Message.success('已删除')
      void loadMemories()
    } catch {
      Message.error('删除失败')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* 工具栏 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          <Input
            prefix={<Search size={14} />}
            placeholder="搜索记忆..."
            value={search}
            onChange={setSearch}
            style={{ width: 200 }}
            allowClear
          />
          <Select
            placeholder="按类型筛选"
            value={filter || undefined}
            onChange={(v) => setFilter(v ?? '')}
            allowClear
            style={{ width: 120 }}
          >
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <Select.Option key={k} value={k}>{v.label}</Select.Option>
            ))}
          </Select>
        </Space>
        <Button type="primary" size="small" icon={<Plus size={14} />} onClick={handleCreate}>新建记忆</Button>
      </div>

      {/* 列表 */}
      {filtered.length === 0 ? (
        <Empty description="暂无记忆" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map((m) => {
            const typeInfo = TYPE_LABELS[m.type] ?? { label: m.type, color: 'default' }
            return (
              <div
                key={m.id}
                style={{
                  padding: '10px 14px',
                  border: '1px solid var(--color-border)',
                  borderRadius: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  gap: 12,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <Tag color={typeInfo.color} style={{ fontSize: 11 }}>{typeInfo.label}</Tag>
                    {m.source && <Text type="secondary" style={{ fontSize: 11 }}>({m.source})</Text>}
                  </div>
                  <Text style={{ fontSize: 13, lineHeight: 1.5 }}>{m.content}</Text>
                  <br />
                  <Text type="secondary" style={{ fontSize: 11 }}>
                    {new Date(m.updatedAt).toLocaleString()}
                  </Text>
                </div>
                <Space size={4}>
                  <Button size="mini" type="text" icon={<Pencil size={12} />} onClick={() => handleEdit(m)} />
                  <Popconfirm title="确定删除？" onOk={() => void handleDelete(m.id)}>
                    <Button size="mini" type="text" status="danger" icon={<Trash2 size={12} />} />
                  </Popconfirm>
                </Space>
              </div>
            )
          })}
        </div>
      )}

      {/* 编辑弹窗 */}
      {editModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.4)',
          }}
          onClick={() => setEditModal(null)}
        >
          <div
            style={{
              background: 'var(--bg-card)', borderRadius: 12, padding: 24,
              width: 480, maxHeight: '80vh', overflow: 'auto',
              boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <Text bold style={{ fontSize: 16, marginBottom: 16, display: 'block' }}>
              {editModal.mode === 'create' ? '新建记忆' : '编辑记忆'}
            </Text>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>类型</Text>
                <Select value={editType} onChange={setEditType} style={{ width: '100%' }}>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => (
                    <Select.Option key={k} value={k}>{v.label}</Select.Option>
                  ))}
                </Select>
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>内容</Text>
                <Input.TextArea
                  value={editContent}
                  onChange={setEditContent}
                  rows={4}
                  placeholder="记忆内容..."
                />
              </div>
              <div>
                <Text type="secondary" style={{ fontSize: 12, marginBottom: 4, display: 'block' }}>来源（可选）</Text>
                <Input
                  value={editSource}
                  onChange={setEditSource}
                  placeholder="如：对话 / 文件导入 / Agent"
                />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
              <Button onClick={() => setEditModal(null)}>取消</Button>
              <Button type="primary" onClick={() => void handleSave()}>保存</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
