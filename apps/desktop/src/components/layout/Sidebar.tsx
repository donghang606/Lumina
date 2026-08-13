import { useEffect, useMemo, useState } from 'react'
import { Typography, Input, Tooltip, Modal } from '@arco-design/web-react'
import {
  LayoutDashboard,
  StickyNote,
  Network,
  Settings,
  Plus,
  ChevronRight,
  ChevronDown,
  Trash2,
  Hash,
  Pencil,
  FolderPlus,
  FileText,
  Ghost,
} from 'lucide-react'
import { useNoteStore } from '../../stores/noteStore'
import { useLayoutStore, type NavKey } from '../../stores/layoutStore'
import { tagService } from '../../services/noteService'

const { Text } = Typography

const navItems: { key: NavKey; label: string; Icon: typeof LayoutDashboard }[] = [
  { key: 'feed', label: '工作台', Icon: LayoutDashboard },
  { key: 'notes', label: '笔记', Icon: StickyNote },
  { key: 'graph', label: '图谱', Icon: Network },
  { key: 'settings', label: '设置', Icon: Settings },
]

export default function Sidebar() {
  const { tags, loadTags, createTag } = useNoteStore()
  const { nav, setNav } = useLayoutStore()
  const [addingTag, setAddingTag] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [newParentId, setNewParentId] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; tagId: string; name: string } | null>(null)
  const [renameModal, setRenameModal] = useState<{ id: string; name: string } | null>(null)
  const [renameVal, setRenameVal] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)

  useEffect(() => {
    void loadTags()
  }, [loadTags])

  const roots = useMemo(() => tags.filter((t) => !t.parentId), [tags])
  const childrenOf = useMemo(() => {
    const map = new Map<string, typeof tags>()
    for (const t of tags) {
      if (!t.parentId) continue
      const list = map.get(t.parentId) ?? []
      list.push(t)
      map.set(t.parentId, list)
    }
    return map
  }, [tags])

  const onAddTag = async () => {
    const name = newTagName.trim()
    if (!name) return
    const ok = await createTag(name, undefined, newParentId ?? undefined)
    if (ok) {
      if (newParentId) setExpanded((s) => ({ ...s, [newParentId]: true }))
      setNewTagName('')
      setAddingTag(false)
      setNewParentId(null)
    }
  }

  useEffect(() => {
    if (!ctxMenu) return
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [ctxMenu])

  const openCtx = (e: React.MouseEvent, tagId: string, name: string) => {
    e.preventDefault()
    e.stopPropagation()
    setCtxMenu({ x: e.clientX, y: e.clientY, tagId, name })
  }

  const handleRename = async () => {
    if (!renameModal) return
    const name = renameVal.trim()
    if (name) await tagService.rename(renameModal.id, name)
    void loadTags()
    setRenameModal(null)
  }

  const handleDelete = async (id: string) => {
    await tagService.remove(id)
    void loadTags()
    setCtxMenu(null)
  }

  const renderTag = (t: (typeof tags)[number], depth: number): React.ReactElement => {
    const kids = childrenOf.get(t.id) ?? []
    const open = expanded[t.id] ?? false
    return (
      <div key={t.id}>
        <div
          draggable
          onDragStart={() => setDragId(t.id)}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            if (dragId && dragId !== t.id) {
              void (async () => {
                await tagService.setParent(dragId, t.id)
                setExpanded((s) => ({ ...s, [t.id]: true }))
                await loadTags()
              })()
            }
            setDragId(null)
          }}
          onClick={() => setNav('notes')}
          onContextMenu={(e) => openCtx(e, t.id, t.name)}
          className="lumina-tag"
          style={{ paddingLeft: 6 + depth * 16 }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--glass-hi)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <span
            className="lumina-tag-toggle"
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={(e) => {
              if (kids.length > 0) {
                e.stopPropagation()
                setExpanded((s) => ({ ...s, [t.id]: !open }))
              }
            }}
          >
            {kids.length > 0 ? (
              open ? (
                <ChevronDown size={12} className="lumina-chev" />
              ) : (
                <ChevronRight size={12} className="lumina-chev" />
              )
            ) : (
              <span className="lumina-chev" style={{ width: 12 }} />
            )}
            <Hash size={12} className="lumina-tag-hash" />
            <Text style={{ fontSize: 'var(--text-md)', color: 'var(--text-1)' }}>{t.name}</Text>
          </span>
          <span className="lumina-tag-count">{t.useCount}</span>
        </div>
        {open && kids.map((k) => <div key={k.id}>{renderTag(k, depth + 1)}</div>)}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* 主导航 */}
      <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 'var(--sp-5)' }}>
        {navItems.map(({ key, label, Icon }) => {
          const active = nav === key
          return (
            <button
              key={key}
              onClick={() => setNav(key)}
              className={active ? 'lumina-nav is-active' : 'lumina-nav'}
              style={{
                background: active ? 'var(--accent-soft)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-2)',
                borderColor: active ? 'var(--accent)' : 'transparent',
              }}
            >
              <Icon size={15} strokeWidth={active ? 2.4 : 2} />
              <span style={{ fontSize: 'var(--text-base)', fontWeight: active ? 600 : 500 }}>{label}</span>
            </button>
          )
        })}
      </nav>

      {/* 标签区 */}
      <div className="lumina-side-head" style={{ marginBottom: 'var(--sp-2)' }}>
        <span className="lumina-label">标签</span>
        <Tooltip content="新建标签">
          <button
            className="lumina-iconbtn"
            onClick={() => setAddingTag((v) => !v)}
            aria-label="新建标签"
          >
            <Plus size={13} />
          </button>
        </Tooltip>
      </div>

      <div style={{ flex: 1, overflow: 'auto', margin: '0 -4px', padding: '0 4px' }}>
        {addingTag && (
          <div style={{ padding: '0 6px var(--sp-2)' }}>
            <Input
              size="small"
              autoFocus
              value={newTagName}
              placeholder="标签名"
              onChange={setNewTagName}
              onPressEnter={onAddTag}
              onBlur={() => {
                if (!newTagName.trim()) setAddingTag(false)
              }}
              style={{ borderRadius: 'var(--radius-sm)' }}
            />
          </div>
        )}

        {ctxMenu && (
          <div style={{ padding: '0 6px var(--sp-2)' }}>
            <Text style={{ fontSize: 11, color: 'var(--color-text-3)' }}>右键 #标签 → 重命名 / 删除 / 建子标签</Text>
          </div>
        )}

        {roots.length === 0 && tags.length === 0 && (
          <div style={{ padding: 'var(--sp-4)', textAlign: 'center' }}>
            <Ghost size={22} strokeWidth={1.4} color="var(--text-3)" style={{ marginBottom: 8 }} />
            <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>
              还没有标签
            </Text>
          </div>
        )}
        {roots.map((t) => renderTag(t, 0))}
        {tags.length > 0 && roots.length === 0 && (
          <Text type="secondary" style={{ fontSize: 12, padding: '0 12px' }}>
            全部标签都是子标签
          </Text>
        )}
      </div>

      {/* 底部 */}
      <div className="lumina-archive" onClick={() => setNav('notes')}>
        <Trash2 size={14} />
        <span>回收站</span>
      </div>

      {/* 右键菜单 */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed',
            left: ctxMenu.x,
            top: ctxMenu.y,
            zIndex: 3000,
            background: 'var(--color-bg-2)',
            border: '1px solid var(--color-border-2)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-3)',
            padding: '4px 0',
            minWidth: 160,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <CtxItem icon={FileText} label="查看笔记" onClick={() => setNav('notes')} />
          <CtxItem
            icon={Pencil}
            label="重命名"
            onClick={() => {
              setRenameModal({ id: ctxMenu.tagId, name: ctxMenu.name })
              setRenameVal(ctxMenu.name)
              setCtxMenu(null)
            }}
          />
          <CtxItem
            icon={FolderPlus}
            label="建子标签"
            onClick={() => {
              setNewParentId(ctxMenu.tagId)
              setCtxMenu(null)
              setAddingTag(true)
            }}
          />
          <CtxItem icon={Trash2} label="删除" danger onClick={() => void handleDelete(ctxMenu.tagId)} />
        </div>
      )}

      <Modal
        visible={!!renameModal}
        title="重命名标签"
        onCancel={() => setRenameModal(null)}
        onOk={() => void handleRename()}
        autoFocus
      >
        <Input value={renameVal} onChange={setRenameVal} placeholder="新名称" onPressEnter={() => void handleRename()} />
      </Modal>
    </div>
  )
}

function CtxItem({
  icon: Icon,
  label,
  danger,
  onClick,
}: {
  icon: typeof FileText
  label: string
  danger?: boolean
  onClick: () => void
}) {
  return (
    <div
      onClick={onClick}
      className="lumina-ctxitem"
      style={{ color: danger ? 'var(--danger)' : 'var(--text-1)' }}
    >
      <Icon size={13} />
      <span>{label}</span>
    </div>
  )
}