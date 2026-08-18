import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { tags, tagsOnNotes } from '../db/schema.js'
import { randomUUID } from 'node:crypto'
import { sql, eq } from 'drizzle-orm'

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, '-')
}

export const tagRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: tags.id,
        name: tags.name,
        slug: tags.slug,
        color: tags.color,
        parentId: tags.parentId,
        order: tags.order,
        createdAt: tags.createdAt,
        useCount: sql<number>`count(${tagsOnNotes.noteId})`,
      })
      .from(tags)
      .leftJoin(tagsOnNotes, sql`${tagsOnNotes.tagId} = ${tags.id}`)
      .groupBy(tags.id)
      .orderBy(tags.order, tags.name)
      .all()
    return rows.map((r) => ({ ...r, useCount: Number(r.useCount) }))
  }),

  create: publicProcedure
    .input(z.object({ name: z.string(), color: z.string().optional(), parentId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      const slug = slugify(input.name)
      const existing = await ctx.db.select().from(tags).where(eq(tags.slug, slug)).get()
      if (existing) return { id: existing.id, ok: true }
      const id = randomUUID()
      const parentSiblings = await ctx.db
        .select({ order: tags.order })
        .from(tags)
        .where(input.parentId ? eq(tags.parentId, input.parentId) : sql`${tags.parentId} is null`)
        .all()
      const maxOrder = parentSiblings.reduce((m, s) => Math.max(m, Number(s.order)), -1)
      await ctx.db.insert(tags).values({
        id,
        name: input.name,
        slug,
        color: input.color,
        parentId: input.parentId,
        order: maxOrder + 1,
        createdAt: now,
      })
      return { id, ok: true }
    }),

  rename: publicProcedure
    .input(z.object({ id: z.string(), name: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(tags).set({ name: input.name, slug: slugify(input.name) }).where(eq(tags.id, input.id)).run()
      return { ok: true }
    }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(tags).where(eq(tags.id, input.id)).run()
    return { ok: true }
  }),

  setParent: publicProcedure
    .input(z.object({ id: z.string(), parentId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.parentId && input.parentId === input.id) return { ok: false, reason: '不能把自己设为父级' }
      await ctx.db
        .update(tags)
        .set({ parentId: input.parentId })
        .where(eq(tags.id, input.id))
        .run()
      return { ok: true }
    }),

  reorder: publicProcedure
    .input(z.object({ id: z.string(), parentId: z.string().nullable(), beforeId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      if (input.parentId && input.parentId === input.id) return { ok: false, reason: '不能把自己设为父级' }
      if (input.beforeId && input.beforeId === input.id) return { ok: false, reason: '不能移动到自身位置' }
      await ctx.db.update(tags).set({ parentId: input.parentId }).where(eq(tags.id, input.id)).run()

      const siblings = await ctx.db
        .select({ id: tags.id, order: tags.order })
        .from(tags)
        .where(input.parentId ? eq(tags.parentId, input.parentId) : sql`${tags.parentId} is null`)
        .all()
      const ids = siblings.map((s) => s.id).filter((s) => s !== input.id)
      const beforeIdx = input.beforeId ? ids.indexOf(input.beforeId) : -1
      const insertAt = beforeIdx >= 0 ? beforeIdx : ids.length
      ids.splice(insertAt, 0, input.id)

      for (let i = 0; i < ids.length; i++) {
        await ctx.db.update(tags).set({ order: i }).where(eq(tags.id, ids[i])).run()
      }
      return { ok: true }
    }),
})