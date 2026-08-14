import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { views, notes, tagsOnNotes, noteLinks, tags } from '../db/schema.js'
import { randomUUID } from 'node:crypto'
import { eq, desc, sql, inArray } from 'drizzle-orm'

const viewSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1),
  type: z.enum(['tag', 'keyword', 'recent', 'backlink']),
  config: z.record(z.string(), z.unknown()).default({}),
})

function strip(s: string) {
  return (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)
}

export const viewRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(views).orderBy(views.name).all()
  }),

  upsert: publicProcedure.input(viewSchema).mutation(async ({ ctx, input }) => {
    const now = new Date().toISOString()
    if (input.id) {
      await ctx.db
        .update(views)
        .set({ name: input.name, type: input.type, config: input.config, updatedAt: now })
        .where(eq(views.id, input.id))
        .run()
      return ctx.db.select().from(views).where(eq(views.id, input.id)).get()
    }
    const id = randomUUID()
    await ctx.db.insert(views).values({ id, name: input.name, type: input.type, config: input.config, createdAt: now, updatedAt: now })
    return ctx.db.select().from(views).where(eq(views.id, id)).get()
  }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(views).where(eq(views.id, input.id)).run()
    return { ok: true }
  }),

  run: publicProcedure.input(z.object({ id: z.string(), limit: z.number().int().min(1).max(100).default(20) })).query(async ({ ctx, input }) => {
    const view = await ctx.db.select().from(views).where(eq(views.id, input.id)).get()
    if (!view) return { view: null, items: [], total: 0 }

    const limit = input.limit
    const cfg = view.config ?? {}
    const all = await ctx.db.select().from(notes).all()

    let ids: string[] = []
    switch (view.type) {
      case 'tag': {
        const tagId = cfg.tagId as string | undefined
        if (tagId) {
          const rows = await ctx.db.select({ noteId: tagsOnNotes.noteId }).from(tagsOnNotes).where(eq(tagsOnNotes.tagId, tagId)).all()
          ids = rows.map((r) => r.noteId as string)
        }
        break
      }
      case 'keyword': {
        const kw = String(cfg.query ?? '').toLowerCase()
        if (kw) {
          ids = all
            .filter((n) => `${n.title ?? ''} ${n.content ?? ''}`.toLowerCase().includes(kw))
            .map((n) => n.id)
        }
        break
      }
      case 'recent': {
        const days = Number(cfg.days ?? 30)
        const since = new Date(Date.now() - days * 86400000).toISOString()
        ids = all.filter((n) => (n.updatedAt ?? '') >= since).map((n) => n.id)
        break
      }
      case 'backlink': {
        const targetId = cfg.noteId as string | undefined
        if (targetId) {
          const rows = await ctx.db.select({ sourceNoteId: noteLinks.sourceNoteId }).from(noteLinks).where(eq(noteLinks.targetNoteId, targetId)).all()
          ids = rows.map((r) => r.sourceNoteId as string)
        }
        break
      }
    }

    const uniq = [...new Set(ids)].slice(0, limit)
    const byId = new Map(all.map((n) => [n.id, n]))
    const items = uniq
      .map((id) => byId.get(id))
      .filter((n): n is NonNullable<typeof n> => !!n)
      .sort((a, b) => (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''))
      .map((n) => ({
        id: n.id,
        title: n.title,
        type: n.type,
        snippet: strip(n.content),
        updatedAt: n.updatedAt,
      }))

    return { view, items, total: ids.length }
  }),
})

export type ViewRouter = typeof viewRouter
