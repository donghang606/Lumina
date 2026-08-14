import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { eq, desc, sql } from 'drizzle-orm'
import type { db as LuminaDb } from '../db/client.js'
import { notes, noteLinks, tagsOnNotes, tags, noteBlocks, views } from '../db/schema.js'

export function createLuminaMcpServer(db: typeof LuminaDb): McpServer {
  const server = new McpServer({ name: 'lumina-mcp', version: '0.1.0' })

  server.tool(
    'search_notes',
    '关键词检索笔记，返回匹配的 id / 标题 / 摘要片段。',
    { query: z.string().describe('检索关键词'), limit: z.number().int().min(1).max(20).optional().describe('返回条数，默认 5') },
    async ({ query, limit = 5 }) => {
      const rows = await db.select().from(notes).all()
      const kw = query.toLowerCase()
      const hits = rows
        .map((n) => {
          const hay = `${n.title ?? ''} ${n.content ?? ''}`.toLowerCase()
          let score = 0
          for (const w of kw.split(/\s+/)) if (w && hay.includes(w)) score += w.length
          return score > 0 ? { id: n.id, title: n.title, content: strip(n.content), score } : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
      return { content: [{ type: 'text' as const, text: JSON.stringify({ count: hits.length, items: hits }) }] }
    },
  )

  server.tool(
    'get_note',
    '按 id 获取笔记详情，含正文、标签、反链与出链。',
    { noteId: z.string().describe('笔记 id') },
    async ({ noteId }) => {
      const row = await db.select().from(notes).where(eq(notes.id, noteId)).get()
      if (!row) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'note not found' }) }] }

      const rels = await db
        .select({ id: tags.id, name: tags.name, color: tags.color })
        .from(tagsOnNotes)
        .innerJoin(tags, eq(tagsOnNotes.tagId, tags.id))
        .where(eq(tagsOnNotes.noteId, noteId))
        .all()
      const backlinks = await db
        .select({ id: notes.id, title: notes.title })
        .from(noteLinks)
        .innerJoin(notes, eq(notes.id, noteLinks.sourceNoteId))
        .where(eq(noteLinks.targetNoteId, noteId))
        .all()
      const outlinks = await db
        .select({ id: notes.id, title: notes.title })
        .from(noteLinks)
        .innerJoin(notes, eq(notes.id, noteLinks.targetNoteId))
        .where(eq(noteLinks.sourceNoteId, noteId))
        .all()
      const blocks = await db.select().from(noteBlocks).where(eq(noteBlocks.noteId, noteId)).all()

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              id: row.id,
              title: row.title,
              type: row.type,
              content: row.content,
              summary: row.summary,
              createdAt: row.createdAt,
              updatedAt: row.updatedAt,
              tags: rels,
              backlinks,
              outlinks,
              chunks: blocks.map((b) => b.chunkContent),
            }),
          },
        ],
      }
    },
  )

  server.tool(
    'create_note',
    '新建笔记，可选标题/正文/类型/标签名，返回新笔记 id。',
    {
      title: z.string().optional().describe('标题'),
      content: z.string().optional().describe('正文（Markdown）'),
      type: z.enum(['card', 'note', 'bookmark', 'file']).optional().describe('类型，默认 note'),
      tagNames: z.array(z.string()).optional().describe('标签名列表，不存在则自动创建'),
    },
    async ({ title = '', content = '', type = 'note', tagNames = [] }) => {
      if (!title.trim() && !content.trim()) {
        return { content: [{ type: 'text' as const, text: JSON.stringify({ error: '标题和内容不能都为空' }) }] }
      }
      const now = new Date().toISOString()
      const id = randomUUID()
      await db.insert(notes).values({ id, title, content, type, createdAt: now, updatedAt: now })

      const tagIds: string[] = []
      for (const name of tagNames) {
        const slug = name.toLowerCase().replace(/\s+/g, '-')
        let [tag] = await db.select().from(tags).where(eq(tags.slug, slug)).all()
        if (!tag) {
          const tagId = randomUUID()
          await db.insert(tags).values({ id: tagId, name, slug, createdAt: now }).onConflictDoNothing().run()
          ;[tag] = await db.select().from(tags).where(eq(tags.slug, slug)).all()
        }
        if (tag) tagIds.push(tag.id)
      }
      if (tagIds.length) {
        await db.insert(tagsOnNotes).values(tagIds.map((tagId) => ({ noteId: id, tagId, assignedBy: 'manual' as const })))
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify({ ok: true, id }) }] }
    },
  )

  server.tool(
    'list_recent',
    '列出最近创建的笔记。',
    { limit: z.number().int().min(1).max(50).optional().describe('返回条数，默认 10') },
    async ({ limit = 10 }) => {
      const rows = await db.select().from(notes).orderBy(desc(notes.createdAt)).limit(limit).all()
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(rows.map((r) => ({ id: r.id, title: r.title, type: r.type, createdAt: r.createdAt }))),
          },
        ],
      }
    },
  )

  server.tool(
    'get_graph',
    '获取知识图谱：节点（笔记）与边（笔记间链接）。',
    { limit: z.number().int().min(1).max(200).optional().describe('节点上限，默认 100') },
    async ({ limit = 100 }) => {
      const nodeRows = await db.select({ id: notes.id, title: notes.title, type: notes.type }).from(notes).limit(limit).all()
      const linkRows = await db.select().from(noteLinks).all()
      const ids = new Set(nodeRows.map((n) => n.id))
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({
              nodes: nodeRows,
              links: linkRows
                .filter((l) => ids.has(l.sourceNoteId ?? '') && ids.has(l.targetNoteId ?? ''))
                .map((l) => ({ source: l.sourceNoteId, target: l.targetNoteId })),
            }),
          },
        ],
      }
    },
  )

  server.tool('get_note_stats', '获取笔记统计：总数、今日新增、按类型分布。', {}, async () => {
    const total = await db.select({ count: sql<number>`count(*)` }).from(notes).all()
    const byType = await db.select({ type: notes.type, count: sql<number>`count(*)` }).from(notes).groupBy(notes.type).all()
    const today = new Date().toISOString().slice(0, 10)
    const todayCount = await db.select({ count: sql<number>`count(*)` }).from(notes).where(sql`date(${notes.createdAt}) = date('${sql.raw(today)}')`).all()
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            total: Number(total[0]?.count ?? 0),
            today: Number(todayCount[0]?.count ?? 0),
            byType: Object.fromEntries(byType.map((r) => [r.type, Number(r.count)])),
          }),
        },
      ],
    }
  })

  server.tool(
    'run_query_view',
    '按保存的查询视图聚合笔记（如按标签 / 关键词 / 最近更新 / 反链）。',
    {
      viewId: z.string().describe('视图 id'),
      limit: z.number().int().min(1).max(100).optional().describe('返回条数，默认 20'),
    },
    async ({ viewId, limit = 20 }) => {
      const view = await db.select().from(views).where(eq(views.id, viewId)).get()
      if (!view) return { content: [{ type: 'text' as const, text: JSON.stringify({ error: 'view not found' }) }] }
      const cfg = view.config ?? {}
      const all = await db.select().from(notes).all()
      let ids: string[] = []
      if (view.type === 'tag' && cfg.tagId) {
        const rows = await db.select({ noteId: tagsOnNotes.noteId }).from(tagsOnNotes).where(eq(tagsOnNotes.tagId, String(cfg.tagId))).all()
        ids = rows.map((r) => r.noteId as string)
      } else if (view.type === 'keyword' && cfg.query) {
        const kw = String(cfg.query).toLowerCase()
        ids = all.filter((n) => `${n.title ?? ''} ${n.content ?? ''}`.toLowerCase().includes(kw)).map((n) => n.id)
      } else if (view.type === 'recent') {
        const days = Number(cfg.days ?? 30)
        const since = new Date(Date.now() - days * 86400000).toISOString()
        ids = all.filter((n) => (n.updatedAt ?? '') >= since).map((n) => n.id)
      } else if (view.type === 'backlink' && cfg.noteId) {
        const rows = await db.select({ sourceNoteId: noteLinks.sourceNoteId }).from(noteLinks).where(eq(noteLinks.targetNoteId, String(cfg.noteId))).all()
        ids = rows.map((r) => r.sourceNoteId as string)
      }
      const byId = new Map(all.map((n) => [n.id, n]))
      const items = [...new Set(ids)]
        .slice(0, limit)
        .map((id) => byId.get(id))
        .filter((n): n is NonNullable<typeof n> => !!n)
        .map((n) => ({ id: n.id, title: n.title, snippet: strip(n.content) }))
      return { content: [{ type: 'text' as const, text: JSON.stringify({ view: { name: view.name, type: view.type }, total: ids.length, items }) }] }
    },
  )

  return server
}

export function createLuminaMcpTransport(): StreamableHTTPServerTransport {
  return new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  })
}

function strip(s: string) {
  return (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
}
