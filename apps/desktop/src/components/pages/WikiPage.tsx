import { useEffect, useState, useCallback } from 'react'
import { Typography, Button, Modal, Input, Empty, Tag, Space, Popconfirm, Message } from '@arco-design/web-react'
import { Plus, Pencil, Trash2, History, RotateCcw } from 'lucide-react'
import { trpc } from '../../lib/trpc'

const { Title, Text } = Typography
const { TextArea } = Input

interface WikiPageData {
  id: string
  title: string
  content: string
  sourceNoteIds: string[]
  version: number
  createdAt: string
  updatedAt: string
}

interface WikiRevisionData {
  id: string
  pageId: string
  title: string
  content: string
  version: number
  createdAt: string
}

export default function WikiPageView() {
  const [pages, setPages] = useState<WikiPageData[]>([])
  const [selectedPage, setSelectedPage] = useState<WikiPageData | null>(null)
  const [revisions, setRevisions] = useState<WikiRevisionData[]>([])
  const [showRevisions, setShowRevisions] = useState(false)
  const [editModal, setEditModal] = useState<{ mode: 'create' | 'edit'; page?: WikiPageData } | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [editContent, setEditContent] = useState('')

  const loadPages = useCallback(async () => {
    try {
      const data = await trpc.wiki.list.query()
      setPages(data as WikiPageData[])
    } catch (e) {
      console.error('Failed to load wiki pages', e)
    }
  }, [])

  useEffect(() => { void loadPages() }, [loadPages])

  const handleSelect = async (page: WikiPageData) => {
    try {
      const data = await trpc.wiki.get.query({ id: page.id })
      setSelectedPage(data as WikiPageData)
    } catch (e) {
      console.error('Failed to load page', e)
    }
  }

  const handleCreate = () => {
    setEditModal({ mode: 'create' })
    setEditTitle('')
    setEditContent('')
  }

  const handleEdit = () => {
    if (!selectedPage) return
    setEditModal({ mode: 'edit', page: selectedPage })
    setEditTitle(selectedPage.title)
    setEditContent(selectedPage.content)
  }

  const handleSave = async () => {
    if (!editTitle.trim()) { Message.warning('标题不能为空'); return }
    try {
      if (editModal?.mode === 'create') {
        const result = await trpc.wiki.create.mutate({ title: editTitle, content: editContent, sourceNoteIds: [] })
        Message.success('页面已创建')
        await loadPages()
        if (result?.id) {
          handleSelect({ id: result.id, title: editTitle, content: editContent, version: 1, sourceNoteIds: [], createdAt: result.createdAt, updatedAt: result.createdAt } as WikiPageData)
        }
      } else if (editModal?.page) {
        await trpc.wiki.update.mutate({ id: editModal.page.id, title: editTitle, content: editContent })
        Message.success('页面已更新')
        await loadPages()
        setSelectedPage((p) => p ? { ...p, title: editTitle, content: editContent } : p)
      }
      setEditModal(null)
    } catch {
      Message.error('保存失败')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await trpc.wiki.delete.mutate({ id })
      Message.success('已删除')
      if (selectedPage?.id === id) setSelectedPage(null)
      await loadPages()
    } catch {
      Message.error('删除失败')
    }
  }

  const handleShowRevisions = async () => {
    if (!selectedPage) return
    try {
      const data = await trpc.wiki.revisions.query({ pageId: selectedPage.id })
      setRevisions(data as WikiRevisionData[])
      setShowRevisions(true)
    } catch (e) {
      console.error('Failed to load revisions', e)
    }
  }

  const handleRollback = async (revisionId: string) => {
    if (!selectedPage) return
    try {
      await trpc.wiki.rollback.mutate({ pageId: selectedPage.id, revisionId })
      Message.success('已回滚')
      const data = await trpc.wiki.get.query({ id: selectedPage.id })
      setSelectedPage(data as WikiPageData)
      await loadPages()
      setShowRevisions(false)
    } catch {
      Message.error('回滚失败')
    }
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Left: page list */}
      <div style={{ width: 280, borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Title heading={6} style={{ margin: 0 }}>Wiki</Title>
          <Button type="primary" size="small" icon={<Plus size={14} />} onClick={handleCreate}>新建</Button>
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {pages.length === 0 ? (
            <Empty description="暂无 Wiki 页面" style={{ marginTop: 40 }} />
          ) : (
            pages.map((page) => (
              <div
                key={page.id}
                onClick={() => void handleSelect(page)}
                style={{
                  padding: '8px 16px',
                  cursor: 'pointer',
                  background: selectedPage?.id === page.id ? 'var(--color-fill-2)' : 'transparent',
                  borderLeft: selectedPage?.id === page.id ? '2px solid var(--color-primary-6)' : '2px solid transparent',
                }}
              >
                <Text style={{ fontWeight: selectedPage?.id === page.id ? 600 : 400 }}>
                  {page.title || '(无标题)'}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  v{page.version} · {new Date(page.updatedAt).toLocaleDateString()}
                </Text>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right: page content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!selectedPage ? (
          <Empty description="选择或创建一个 Wiki 页面" style={{ marginTop: 100 }} />
        ) : (
          <>
            <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <Title heading={4} style={{ margin: 0 }}>{selectedPage.title}</Title>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  版本 v{selectedPage.version} · 更新于 {new Date(selectedPage.updatedAt).toLocaleString()}
                </Text>
              </div>
              <Space>
                <Button size="small" icon={<Pencil size={14} />} onClick={handleEdit}>编辑</Button>
                <Button size="small" icon={<History size={14} />} onClick={() => void handleShowRevisions()}>版本历史</Button>
                <Popconfirm title="确定删除此页面？" onOk={() => void handleDelete(selectedPage.id)}>
                  <Button size="small" status="danger" icon={<Trash2 size={14} />}>删除</Button>
                </Popconfirm>
              </Space>
            </div>
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 24px' }}>
              <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.8 }}>{selectedPage.content}</div>
            </div>
          </>
        )}
      </div>

      {/* Edit modal */}
      <Modal
        title={editModal?.mode === 'create' ? '新建 Wiki 页面' : '编辑 Wiki 页面'}
        visible={!!editModal}
        onCancel={() => setEditModal(null)}
        onOk={() => void handleSave()}
        style={{ width: 700 }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <Input placeholder="页面标题" value={editTitle} onChange={setEditTitle} />
          <TextArea
            placeholder="页面正文（Markdown）"
            value={editContent}
            onChange={setEditContent}
            rows={16}
            style={{ fontFamily: 'monospace' }}
          />
        </div>
      </Modal>

      {/* Revisions modal */}
      <Modal
        title="版本历史"
        visible={showRevisions}
        onCancel={() => setShowRevisions(false)}
        footer={null}
        style={{ width: 600 }}
      >
        {revisions.length === 0 ? (
          <Empty description="暂无版本历史" />
        ) : (
          revisions.map((rev) => (
            <div
              key={rev.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 0',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <div>
                <Text>v{rev.version}</Text>
                <Text type="secondary" style={{ marginLeft: 8, fontSize: 12 }}>
                  {new Date(rev.createdAt).toLocaleString()}
                </Text>
                <br />
                <Text type="secondary" style={{ fontSize: 12 }}>{rev.title}</Text>
              </div>
              {rev.version < (selectedPage?.version ?? 0) ? (
                <Popconfirm
                  title={`回滚到 v${rev.version}？当前版本将保留为新版本。`}
                  onOk={() => void handleRollback(rev.id)}
                >
                  <Button size="small" type="text" icon={<RotateCcw size={14} />}>回滚</Button>
                </Popconfirm>
              ) : (
                <Tag color="green">当前</Tag>
              )}
            </div>
          ))
        )}
      </Modal>
    </div>
  )
}
