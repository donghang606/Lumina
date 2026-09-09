import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { notes, noteLinks, tags, tagsOnNotes, aiSuggestions, views } from '../../db/schema.js'
import { bm25Score } from '../../lib/hybridSearch.js'
import { registerTool } from '../registry.js'

function strip(s: string): string {
  return (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

registerTool({
  name: 'search_notes',
  description: '混合检索用户笔记库（BM25 关键词），返回 id / 标题 / 摘要片段。查找资料、回答与笔记内容相关问题时应优先调用。',
  schema: z.object({
    query: z.string().describe('检索关键词'),
    limit: z.number().int().min(1).max(20).optional().describe('返回条数，默认 5'),
  }),
  meta: {},
  handler: async (args, ctx) => {
    const limit = (args.limit as number) ?? 5
    const rows = await ctx.db.select().from(notes).all()
    const docs = rows.map((n) => ({ id: n.id, title: n.title, content: n.content ?? '' }))
    const hits = bm25Score(String(args.query), docs).slice(0, limit)
    return JSON.stringify({
      count: hits.length,
      items: hits.map((h) => {
        const d = docs.find((x) => x.id === h.id)
        return { id: h.id, title: h.title, snippet: d ? strip(d.content).slice(0, 200) : '' }
      }),
    })
  },
})

registerTool({
  name: 'get_note',
  description: '按 id 获取笔记详情：正文、标签、反链与出链。配合 search_notes 使用。',
  schema: z.object({ noteId: z.string().describe('笔记 id') }),
  meta: {},
  handler: async (args, ctx) => {
    const noteId = String(args.noteId)
    const row = await ctx.db.select().from(notes).where(eq(notes.id, noteId)).get()
    if (!row) return JSON.stringify({ error: 'note not found' })
    const rels = await ctx.db
      .select({ id: tags.id, name: tags.name })
      .from(tagsOnNotes)
      .innerJoin(tags, eq(tagsOnNotes.tagId, tags.id))
      .where(eq(tagsOnNotes.noteId, noteId))
      .all()
    const backlinks = await ctx.db
      .select({ id: notes.id, title: notes.title })
      .from(noteLinks)
      .innerJoin(notes, eq(notes.id, noteLinks.sourceNoteId))
      .where(eq(noteLinks.targetNoteId, noteId))
      .all()
    const outlinks = await ctx.db
      .select({ id: notes.id, title: notes.title })
      .from(noteLinks)
      .innerJoin(notes, eq(notes.id, noteLinks.targetNoteId))
      .where(eq(noteLinks.sourceNoteId, noteId))
      .all()
    return JSON.stringify({
      id: row.id,
      title: row.title,
      type: row.type,
      content: row.content,
      tags: rels,
      backlinks,
      outlinks,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    })
  },
})

registerTool({
  name: 'list_recent',
  description: '列出最近更新的笔记（默认 10 条）。',
  schema: z.object({ limit: z.number().int().min(1).max(30).optional().describe('条数，默认 10') }),
  meta: {},
  handler: async (args, ctx) => {
    const rows = await ctx.db
      .select({ id: notes.id, title: notes.title, type: notes.type, updatedAt: notes.updatedAt })
      .from(notes)
      .orderBy(desc(notes.updatedAt))
      .limit((args.limit as number) ?? 10)
      .all()
    return JSON.stringify({ count: rows.length, items: rows })
  },
})

registerTool({
  name: 'suggest_note',
  description:
    '建议创建一篇新笔记（进入审核队列，用户确认后才会真正落库，不会直接写入）。适合整理对话结论、沉淀用户明确表示想保存的内容。比 create_note 更安全，优先使用。',
  schema: z.object({
    title: z.string().describe('笔记标题'),
    content: z.string().describe('笔记正文（Markdown）'),
    type: z.enum(['card', 'note', 'bookmark', 'file']).optional().describe('笔记类型，默认 note'),
    tags: z.array(z.string()).optional().describe('建议标签'),
  }),
  meta: {},
  handler: async (args, ctx) => {
    const now = new Date().toISOString()
    const id = randomUUID()
    await ctx.db.insert(aiSuggestions).values({
      id,
      kind: 'note',
      noteId: null,
      payload: { title: String(args.title), content: String(args.content), type: (args.type as string) ?? 'note', tags: (args.tags as string[]) ?? [] },
      status: 'pending',
      source: 'auto',
      createdAt: now,
    })
    return JSON.stringify({ suggestionId: id, status: 'pending', hint: '已进入审核队列，用户可在 ReviewQueue 中采纳' })
  },
})

registerTool({
  name: 'create_note',
  description: '直接创建笔记并落库（需用户审批）。仅在用户明确要求立即创建时使用；否则优先用 suggest_note。',
  schema: z.object({
    title: z.string().describe('标题'),
    content: z.string().describe('正文（Markdown）'),
    type: z.enum(['card', 'note', 'bookmark', 'file']).optional(),
  }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    const now = new Date().toISOString()
    const id = randomUUID()
    await ctx.db.insert(notes).values({
      id,
      title: String(args.title),
      content: String(args.content),
      type: (args.type as 'card' | 'note' | 'bookmark' | 'file') ?? 'note',
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    })
    return JSON.stringify({ id, createdAt: now })
  },
})

registerTool({
  name: 'get_note_stats',
  description: '获取笔记库统计：总数、今日新增、按类型分布。',
  schema: z.object({}),
  meta: {},
  handler: async (_args, ctx) => {
    const rows = await ctx.db.select({ id: notes.id, type: notes.type, createdAt: notes.createdAt }).from(notes).all()
    const today = new Date().toISOString().slice(0, 10)
    const byType: Record<string, number> = {}
    for (const r of rows) byType[r.type ?? 'note'] = (byType[r.type ?? 'note'] ?? 0) + 1
    return JSON.stringify({
      total: rows.length,
      today: rows.filter((r) => (r.createdAt ?? '').startsWith(today)).length,
      byType,
    })
  },
})

registerTool({
  name: 'get_graph',
  description: '获取笔记双链图谱：节点（笔记）与边（note_links 关系）。用于分析知识关联、找孤立节点。',
  schema: z.object({ limit: z.number().int().min(10).max(500).optional().describe('节点上限，默认 100') }),
  meta: {},
  handler: async (args, ctx) => {
    const limit = (args.limit as number) ?? 100
    const noteRows = await ctx.db.select({ id: notes.id, title: notes.title }).from(notes).limit(limit).all()
    const links = await ctx.db
      .select({ source: noteLinks.sourceNoteId, target: noteLinks.targetNoteId })
      .from(noteLinks)
      .limit(limit * 2)
      .all()
    return JSON.stringify({ nodes: noteRows, links })
  },
})

registerTool({
  name: 'run_query_view',
  description: '执行用户保存的查询视图（tag / keyword / recent / backlink 类型）。',
  schema: z.object({ viewName: z.string().describe('视图名') }),
  meta: {},
  handler: async (args, ctx) => {
    const view = await ctx.db.select().from(views).where(eq(views.name, String(args.viewName))).get()
    if (!view) return JSON.stringify({ error: 'view not found' })
    const all = await ctx.db.select({ id: notes.id, title: notes.title, content: notes.content, updatedAt: notes.updatedAt }).from(notes).all()
    const cfg = (view.config ?? {}) as Record<string, unknown>
    let ids: string[] = []
    if (view.type === 'recent') {
      ids = all.sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')).slice(0, Number(cfg.limit ?? 10)).map((n) => n.id)
    } else if (view.type === 'keyword' && cfg.keyword) {
      const kw = String(cfg.keyword).toLowerCase()
      ids = all.filter((n) => `${n.title} ${n.content}`.toLowerCase().includes(kw)).map((n) => n.id)
    } else if (view.type === 'tag' && cfg.tagId) {
      const rows = await ctx.db.select({ noteId: tagsOnNotes.noteId }).from(tagsOnNotes).where(eq(tagsOnNotes.tagId, String(cfg.tagId))).all()
      ids = rows.map((r) => r.noteId as string)
    } else if (view.type === 'backlink' && cfg.noteId) {
      const rows = await ctx.db.select({ sourceNoteId: noteLinks.sourceNoteId }).from(noteLinks).where(eq(noteLinks.targetNoteId, String(cfg.noteId))).all()
      ids = rows.map((r) => r.sourceNoteId as string)
    }
    const byId = new Map(all.map((n) => [n.id, n]))
    return JSON.stringify({
      view: { name: view.name, type: view.type },
      total: ids.length,
      items: [...new Set(ids)].slice(0, 20).map((id) => {
        const n = byId.get(id)
        return { id, title: n?.title ?? '', snippet: strip(n?.content ?? '').slice(0, 120) }
      }),
    })
  },
})