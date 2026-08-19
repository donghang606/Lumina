import { useEffect, useState } from 'react'
import { Typography, Tag as ATag, Empty, Message, Spin } from '@arco-design/web-react'
import { Plus, Tag as TagIcon, CornerUpLeft, CornerUpRight, ArrowRight, Sparkles, Blocks, Inbox, X } from 'lucide-react'
import { useNoteStore } from '../../stores/noteStore'
import { noteService } from '../../services/noteService'
import { configService } from '../../services/configService'
import { mdToPlainText } from '../../lib/markdown'
import NoteEditor from './NoteEditor'
import ReviewQueue, { useReviewCount } from '../review/ReviewQueue'
import type { NoteDetail, RelatedNote, BlockRef } from '@lumina/shared'
import UiButton from '../ui/UiButton'
import { Glass } from '../ui/primitives'

const { Text } = Typography

interface TabState {
  noteId: string
  title: string
  content: string
  savedTitle: string
  savedContent: string
}

export default function NotesPage() {
  const { notes, loaded, loadNotes, tags, loadTags, createNote, updateNote, setTagsForNote, selectedId } = useNoteStore()
  const [detailMap, setDetailMap] = useState<Record<string, NoteDetail>>({})
  const [tabs, setTabs] = useState<TabState[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [related, setRelated] = useState<RelatedNote[]>([])
  const [relatedLoading, setRelatedLoading] = useState(false)
  const [blockRefs, setBlockRefs] = useState<BlockRef[]>([])
  const [reviewOpen, setReviewOpen] = useState(false)
  const { count: reviewCount, refresh: refreshReview } = useReviewCount()

  const active = tabs.find((t) => t.noteId === activeId) ?? null

  const updateTab = (id: string, patch: Partial<Pick<TabState, 'title' | 'content'>>) => {
    setTabs((ts) => ts.map((t) => (t.noteId === id ? { ...t, ...patch } : t)))
  }

  useEffect(() => {
    if (active?.noteId) {
      let cancelled = false
      noteService
        .listBlockRefs(active.noteId)
        .then((refs) => {
          if (!cancelled) setBlockRefs(refs)
        })
        .catch(() => {
          if (!cancelled) setBlockRefs([])
        })
      return () => {
        cancelled = true
      }
    }
    setBlockRefs([])
  }, [active?.noteId, active?.content])

  useEffect(() => {
    if (active?.noteId) {
      let cancelled = false
      setRelatedLoading(true)
      const t = setTimeout(async () => {
        try {
          const items = await noteService.related(active.noteId)
          if (!cancelled) setRelated(items)
        } catch {
          if (!cancelled) setRelated([])
        } finally {
          if (!cancelled) setRelatedLoading(false)
        }
      }, 300)
      return () => {
        cancelled = true
        clearTimeout(t)
      }
    }
    setRelated([])
  }, [active?.noteId, active?.content])

  useEffect(() => {
    if (!loaded) void loadNotes()
    void loadTags()
  }, [loaded, loadNotes, loadTags])

  useEffect(() => {
    if (selectedId) {
      void openNote(selectedId)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  const openNote = async (id: string) => {
    if (tabs.some((t) => t.noteId === id)) {
      setActiveId(id)
      return
    }
    const detail = await noteService.getWithDetails(id)
    if (!detail) return
    setDetailMap((m) => ({ ...m, [id]: detail }))
    setTabs((ts) => [
      ...ts,
      { noteId: id, title: detail.note.title, content: detail.note.content, savedTitle: detail.note.title, savedContent: detail.note.content },
    ])
    setActiveId(id)
  }

  const startNew = async () => {
    const id = await createNote({ title: '', content: '' })
    if (!id) return
    setTabs((ts) => [...ts, { noteId: id, title: '', content: '', savedTitle: '', savedContent: '' }])
    setActiveId(id)
  }

  const closeTab = (id: string) => {
    const idx = tabs.findIndex((t) => t.noteId === id)
    setTabs((ts) => ts.filter((t) => t.noteId !== id))
    if (activeId === id) {
      const remaining = tabs.filter((t) => t.noteId !== id)
      setActiveId(remaining[Math.max(0, idx - 1)]?.noteId ?? null)
    }
  }

  const persistEditing = async (e: TabState) => {
    await updateNote({ id: e.noteId, title: e.title, content: e.content })
    await publishLinks(e.noteId, e.content)
    setTabs((ts) => ts.map((t) => (t.noteId === e.noteId ? { ...t, savedTitle: t.title, savedContent: t.content } : t)))
    void runAutoProcess(e.noteId, e.content)
  }

  const saveEditing = async () => {
    if (!active) return
    await persistEditing(active)
  }

  const runAutoProcess = async (id: string, content: string) => {
    const settings = await configService.getSettings()
    if (!settings?.autoSummary && !settings?.autoTag) return
    if (!content.replace(/<[^>]+>/g, '').trim()) return
    try {
      const r = await noteService.autoProcess(id)
      if (r.ok && r.results) {
        const reviewed = r.results.reviewPending ?? false
        const hints = [
          r.results.summary ? (reviewed ? `摘要已生成，待审核` : `摘要已生成`) : '',
          r.results.tags?.length ? (reviewed ? `标签已建议，待审核` : `添加了标签 #${r.results.tags.join(' #')}`) : '',
        ]
          .filter(Boolean)
          .join('，')
        if (hints) Message.success(`✨ ${hints}`)
      } else if (r.reason) {
        // no provider configured — silent, keep manual flow
      }
      await loadNotes()
    } catch {
      // silent
    }
  }

  const publishLinks = async (noteId: string, content: string) => {
    const links: { targetNoteId?: string; title: string }[] = []
    const hrefs = content.match(/href="lumina:\/\/note\/([^"]+)"/g) ?? []
    const mdLinks = content.match(/\]\(lumina:\/\/note\/([^)]+)\)/g) ?? []
    const titles = content.match(/\[\[([^\[\]]+)\]\]/g) ?? []
    for (const h of hrefs) {
      const id = h.match(/lumina:\/\/note\/([^"]+)/)?.[1]
      if (id) links.push({ targetNoteId: id, title: '' })
    }
    for (const h of mdLinks) {
      const id = h.match(/lumina:\/\/note\/([^)]+)/)?.[1]
      if (id) links.push({ targetNoteId: id, title: '' })
    }
    for (const t of titles) {
      const title = t.replace(/\[\[|\]\]/g, '').trim()
      if (title && !links.some((l) => l.title === title)) links.push({ title })
    }
    if (links.length === 0) return

    const resolved: { targetNoteId: string; context?: string }[] = []
    const all = await noteService.list()
    const byTitle = new Map(all.map((n) => [n.title.toLowerCase(), n.id]))
    for (const l of links) {
      if (l.targetNoteId) {
        resolved.push({ targetNoteId: l.targetNoteId, context: l.title })
      } else {
        const id = byTitle.get(l.title.toLowerCase())
        if (id) resolved.push({ targetNoteId: id, context: l.title })
      }
    }
    if (resolved.length) await noteService.publishParsedLinks(noteId, resolved)
  }

  const toggleTag = async (tagId: string) => {
    if (!active) return
    const detail = detailMap[active.noteId]
    const current = detail?.tags.map((t) => t.id) ?? []
    const next = current.includes(tagId) ? current.filter((id) => id !== tagId) : [...current, tagId]
    await setTagsForNote(active.noteId, next)
    const fresh = await noteService.getWithDetails(active.noteId)
    if (fresh) setDetailMap((m) => ({ ...m, [active.noteId]: fresh }))
  }

  const deleteEditing = async () => {
    if (!active) return
    await noteService.remove(active.noteId)
    await loadNotes()
    closeTab(active.noteId)
  }

  if (active) {
    const detail = detailMap[active.noteId]
    return (
      <div style={{ display: 'flex', height: '100%', gap: 18, flexDirection: 'column' }}>
        {/* 标签页栏 */}
        {tabs.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {tabs.map((t) => {
              const dirty = t.title !== t.savedTitle || t.content !== t.savedContent
              return (
                <div
                  key={t.noteId}
                  className={`lumina-tab${t.noteId === activeId ? ' is-active' : ''}`}
                  onClick={() => setActiveId(t.noteId)}
                  title={t.title || '(无标题)'}
                >
                  <span className={`lumina-tab-label${dirty ? ' lumina-tab-dirty' : ''}`}>{t.title || '(无标题)'}</span>
                  <button className="lumina-tab-close" onClick={(e) => { e.stopPropagation(); closeTab(t.noteId) }}>
                    <X size={11} />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: 18 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <NoteEditor
              noteId={active.noteId}
              title={active.title}
              content={active.content}
              onTitleChange={(v) => updateTab(active.noteId, { title: v })}
              onContentChange={(v) => updateTab(active.noteId, { content: v })}
              onSave={() => void saveEditing()}
              onAutoSave={() => void persistEditing(active)}
              onClose={() => closeTab(active.noteId)}
              onOpenLink={(id) => void openNote(id)}
            />
          </div>

        {/* 侧栏：标签 / 链接 */}
        {detail && (
          <Glass style={{ width: 240, padding: 'var(--sp-4)', overflow: 'auto', alignSelf: 'flex-start' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--sp-3)' }}>
              <TagIcon size={13} color="var(--accent)" />
              <Text style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--text-1)' }}>标签</Text>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 'var(--sp-5)' }}>
              {tags.map((t) => (
                <ATag
                  key={t.id}
                  color={t.color ?? 'arcoblue'}
                  closable={false}
                  onClick={() => void toggleTag(t.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {detail.tags.some((x) => x.id === t.id) ? '✓ ' : ''}#{t.name}
                </ATag>
              ))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 'var(--sp-3)' }}>
              <CornerUpLeft size={13} color="var(--success)" />
              <Text style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--text-1)' }}>反向链接 {detail.backlinks.length}</Text>
            </div>
            {detail.backlinks.map((b) => (
              <div
                key={b.id}
                className="lumina-side-link"
                onClick={() => void openNote(b.id)}
              >
                {b.title || '(无标题)'}
              </div>
            ))}
            {detail.backlinks.length === 0 && <Text type="secondary" style={{ fontSize: 'var(--text-sm)' }}>暂无反向链接</Text>}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 'var(--sp-4) 0 var(--sp-2)' }}>
              <Blocks size={13} color="var(--accent)" />
              <Text style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--text-1)' }}>块级引用 {blockRefs.length}</Text>
            </div>
            {blockRefs.length > 0 ? (
              blockRefs.map((r) => (
                <div key={r.id} style={{ marginBottom: 10 }}>
                  <div
                    className="lumina-side-link"
                    onClick={() => r.sourceNoteId && void openNote(r.sourceNoteId)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.sourceNoteTitle || '(无标题)'}</span>
                  </div>
                  {r.blockSnippet && (
                    <Text type="secondary" style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', display: 'block', lineHeight: 1.5, padding: '4px 8px' }}>
                      {mdToPlainText(r.blockSnippet).slice(0, 60)}
                    </Text>
                  )}
                </div>
              ))
            ) : (
              <Text type="secondary" style={{ fontSize: 'var(--text-sm)' }}>暂无块级引用</Text>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 'var(--sp-4) 0 var(--sp-2)' }}>
              <CornerUpRight size={13} color="var(--warning)" />
              <Text style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--text-1)' }}>出链 {detail.outlinks.length}</Text>
            </div>
            {detail.outlinks.map((o) => (
              <div
                key={o.id}
                className="lumina-side-link"
                onClick={() => void openNote(o.id)}
              >
                {o.title || '(无标题)'}
              </div>
            ))}
            {detail.outlinks.length === 0 && <Text type="secondary" style={{ fontSize: 'var(--text-sm)' }}>暂未链接其他笔记</Text>}

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: 'var(--sp-4) 0 var(--sp-2)' }}>
              <Sparkles size={13} color="var(--accent)" />
              <Text style={{ fontWeight: 600, fontSize: 'var(--text-md)', color: 'var(--text-1)' }}>语义相关</Text>
              {relatedLoading && <Spin size={12} />}
            </div>
            {related.length > 0 ? (
              related.map((r) => (
                <div
                  key={r.id}
                  className="lumina-side-link"
                  onClick={() => void openNote(r.id)}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{r.title || '(无标题)'}</span>
                  {r.score > 0 && (
                    <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-3)', flexShrink: 0 }}>{Math.round(r.score * 100)}%</span>
                  )}
                </div>
              ))
            ) : (
              !relatedLoading && <Text type="secondary" style={{ fontSize: 'var(--text-sm)' }}>暂无语义相关（先向量化笔记后生效）</Text>
            )}
          </Glass>
        )}
        </div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--sp-5)' }}>
        <Text className="display" style={{ fontSize: 'var(--text-2xl)', fontWeight: 700, color: 'var(--text-1)' }}>
          全部笔记
        </Text>
        <div style={{ display: 'flex', gap: 8 }}>
          <UiButton icon={Inbox} onClick={() => { setReviewOpen(true); void refreshReview() }}>
            审核队列{reviewCount > 0 ? ` (${reviewCount})` : ''}
          </UiButton>
          <UiButton variant="primary" icon={Plus} onClick={() => void startNew()}>
            新建笔记
          </UiButton>
        </div>
      </div>

      {notes.length === 0 && <Empty description="还没有笔记，点击右上角新建" />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
        {notes.map((note) => (
          <Glass key={note.id} hover style={{ padding: 'var(--sp-4)', cursor: 'pointer' }} onClick={() => void openNote(note.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span className="lumina-note-dot" />
              <Text style={{ fontSize: 'var(--text-lg)', fontWeight: 600, color: 'var(--text-1)', display: 'block', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {note.title || note.content.slice(0, 40) || '(无标题)'}
              </Text>
            </div>
            <Text type="secondary" style={{ fontSize: 'var(--text-md)', color: 'var(--text-2)' }} ellipsis={{ rows: 2 }}>
              {mdToPlainText(note.content).slice(0, 120)}
            </Text>
            <div style={{ marginTop: 'var(--sp-3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text type="secondary" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-3)' }}>
                {new Date(note.updatedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit' })}
              </Text>
              <ArrowRight size={13} color="var(--text-3)" />
            </div>
          </Glass>
        ))}
      </div>

      {reviewOpen && <ReviewQueue onClose={() => setReviewOpen(false)} onOpenNote={(id) => void openNote(id)} />}
    </div>
  )
}