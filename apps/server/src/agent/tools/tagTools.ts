import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { tags, tagsOnNotes, notes } from '../../db/schema.js'
import { registerTool } from '../registry.js'

function slugify(name: string): string {
  const base = name.trim().toLowerCase().replace(/\s+/g, '-')
  return base || `tag-${Date.now()}`
}

registerTool({
  name: 'list_tags',
  description: '列出全部标签及每个标签的笔记数量。',
  schema: z.object({}),
  meta: {},
  handler: async (_args, ctx) => {
    const rows = await ctx.db
      .select({ id: tags.id, name: tags.name, noteId: tagsOnNotes.noteId })
      .from(tags)
      .leftJoin(tagsOnNotes, eq(tagsOnNotes.tagId, tags.id))
      .all()
    const byTag = new Map<string, { id: string; name: string; count: number }>()
    for (const r of rows) {
      const cur = byTag.get(r.id) ?? { id: r.id, name: r.name, count: 0 }
      if (r.noteId) cur.count++
      byTag.set(r.id, cur)
    }
    const items = [...byTag.values()].sort((a, b) => b.count - a.count)
    return JSON.stringify({ count: items.length, items })
  },
})

registerTool({
  name: 'set_tags',
  description: '为笔记设置标签（全量替换，需审批）。标签不存在会自动创建。',
  schema: z.object({
    noteId: z.string().describe('笔记 id'),
    tagNames: z.array(z.string()).describe('标签名列表（全量替换）'),
  }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    const noteId = String(args.noteId)
    const names = (args.tagNames as string[]) ?? []
    const note = await ctx.db.select({ id: notes.id }).from(notes).where(eq(notes.id, noteId)).get()
    if (!note) return JSON.stringify({ error: 'note not found' })

    const tagIds: string[] = []
    for (const name of names) {
      const existing = await ctx.db.select().from(tags).all()
      const found = existing.find((t) => t.name === name)
      if (found) {
        tagIds.push(found.id)
      } else {
        const id = crypto.randomUUID()
        const now = new Date().toISOString()
        await ctx.db.insert(tags).values({ id, name, slug: slugify(name), createdAt: now }).run()
        tagIds.push(id)
      }
    }

    await ctx.db.delete(tagsOnNotes).where(eq(tagsOnNotes.noteId, noteId)).run()
    if (tagIds.length) {
      await ctx.db.insert(tagsOnNotes).values(tagIds.map((tagId) => ({ noteId, tagId, assignedBy: 'manual' as const }))).run()
    }
    return JSON.stringify({ noteId, tags: names })
  },
})