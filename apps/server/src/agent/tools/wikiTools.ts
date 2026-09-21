import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { wikiPages, wikiRevisions } from '../../db/schema.js'
import { registerTool } from '../registry.js'

registerTool({
  name: 'list_wiki_pages',
  description: '列出所有 Wiki 页面，按更新时间倒序。返回 id/标题/版本/更新时间列表。',
  schema: z.object({}),
  meta: {},
  handler: async (_args, ctx) => {
    const pages = await ctx.db.select().from(wikiPages).orderBy(desc(wikiPages.updatedAt)).all()
    return JSON.stringify({
      count: pages.length,
      items: pages.map((p: any) => ({
        id: p.id,
        title: p.title,
        version: p.version,
        updatedAt: p.updatedAt,
        sourceNoteIds: p.sourceNoteIds ?? [],
      })),
    })
  },
})

registerTool({
  name: 'get_wiki_page',
  description: '获取单个 Wiki 页面的完整内容（Markdown）。',
  schema: z.object({ id: z.string().describe('Wiki 页面 id') }),
  meta: {},
  handler: async (args, ctx) => {
    const page = await ctx.db.select().from(wikiPages).where(eq(wikiPages.id, String(args.id))).get()
    if (!page) return JSON.stringify({ error: '页面不存在' })
    return JSON.stringify(page)
  },
})

registerTool({
  name: 'create_wiki_page',
  description:
    '创建 Wiki 页面（需审批）。从笔记内容生成结构化 Wiki 时用此工具。content 为 Markdown 格式。',
  schema: z.object({
    title: z.string().describe('页面标题'),
    content: z.string().describe('页面正文（Markdown）'),
    sourceNoteIds: z.array(z.string()).optional().describe('来源笔记 id 列表（可选）'),
  }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    const now = new Date().toISOString()
    const id = randomUUID()
    await ctx.db
      .insert(wikiPages)
      .values({
        id,
        title: String(args.title),
        content: String(args.content),
        sourceNoteIds: (args.sourceNoteIds as string[]) ?? [],
        version: 1,
        createdAt: now,
        updatedAt: now,
      })
      .run()
    await ctx.db
      .insert(wikiRevisions)
      .values({ id: randomUUID(), pageId: id, title: String(args.title), content: String(args.content), version: 1, createdAt: now })
      .run()
    return JSON.stringify({ id, version: 1, createdAt: now })
  },
})

registerTool({
  name: 'update_wiki_page',
  description: '编辑 Wiki 页面（覆盖更新，需审批）。自动保存版本历史。',
  schema: z.object({
    id: z.string().describe('Wiki 页面 id'),
    title: z.string().optional().describe('新标题（不填则不改）'),
    content: z.string().optional().describe('新正文（不填则不改）'),
  }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    const id = String(args.id)
    const existing = await ctx.db.select().from(wikiPages).where(eq(wikiPages.id, id)).get()
    if (!existing) return JSON.stringify({ error: '页面不存在' })
    const now = new Date().toISOString()
    const newVersion = existing.version + 1
    const patch: Record<string, unknown> = { updatedAt: now, version: newVersion }
    if (args.title !== undefined) patch.title = String(args.title)
    if (args.content !== undefined) patch.content = String(args.content)
    await ctx.db.update(wikiPages).set(patch).where(eq(wikiPages.id, id)).run()
    await ctx.db
      .insert(wikiRevisions)
      .values({
        id: randomUUID(),
        pageId: id,
        title: (patch.title as string) ?? existing.title,
        content: (patch.content as string) ?? existing.content,
        version: newVersion,
        createdAt: now,
      })
      .run()
    return JSON.stringify({ id, version: newVersion })
  },
})

registerTool({
  name: 'delete_wiki_page',
  description: '删除 Wiki 页面及其所有版本历史（需审批）。',
  schema: z.object({ id: z.string().describe('Wiki 页面 id') }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    await ctx.db.delete(wikiPages).where(eq(wikiPages.id, String(args.id))).run()
    return JSON.stringify({ ok: true })
  },
})

registerTool({
  name: 'get_wiki_revisions',
  description: '获取 Wiki 页面的版本历史列表（倒序）。',
  schema: z.object({ pageId: z.string().describe('Wiki 页面 id') }),
  meta: {},
  handler: async (args, ctx) => {
    const revs = await ctx.db
      .select()
      .from(wikiRevisions)
      .where(eq(wikiRevisions.pageId, String(args.pageId)))
      .orderBy(desc(wikiRevisions.version))
      .all()
    return JSON.stringify({
      count: revs.length,
      items: revs.map((r: any) => ({ id: r.id, title: r.title, version: r.version, createdAt: r.createdAt })),
    })
  },
})

registerTool({
  name: 'rollback_wiki_page',
  description: '将 Wiki 页面回滚到指定版本（需审批）。会创建一个新版本。',
  schema: z.object({
    pageId: z.string().describe('Wiki 页面 id'),
    revisionId: z.string().describe('目标版本的 revision id'),
  }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    const rev = await ctx.db.select().from(wikiRevisions).where(eq(wikiRevisions.id, String(args.revisionId))).get()
    if (!rev) return JSON.stringify({ error: '版本不存在' })
    const existing = await ctx.db.select().from(wikiPages).where(eq(wikiPages.id, String(args.pageId))).get()
    if (!existing) return JSON.stringify({ error: '页面不存在' })
    const now = new Date().toISOString()
    const newVersion = existing.version + 1
    await ctx.db
      .update(wikiPages)
      .set({ title: rev.title, content: rev.content, version: newVersion, updatedAt: now })
      .where(eq(wikiPages.id, String(args.pageId)))
      .run()
    await ctx.db
      .insert(wikiRevisions)
      .values({ id: randomUUID(), pageId: String(args.pageId), title: rev.title, content: rev.content, version: newVersion, createdAt: now })
      .run()
    return JSON.stringify({ id: args.pageId, version: newVersion })
  },
})
