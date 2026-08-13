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
      await ctx.db.insert(tags).values({
        id,
        name: input.name,
        slug,
        color: input.color,
        parentId: input.parentId,
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
})