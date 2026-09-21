import { z } from 'zod'
import { router, publicProcedure } from '../trpc/context.js'
import { wikiPages, wikiRevisions } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

export const wikiRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(wikiPages).orderBy(desc(wikiPages.updatedAt)).all()
  }),

  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    return ctx.db.select().from(wikiPages).where(eq(wikiPages.id, input.id)).get() ?? null
  }),

  create: publicProcedure
    .input(
      z.object({
        title: z.string(),
        content: z.string(),
        sourceNoteIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      const id = randomUUID()
      await ctx.db
        .insert(wikiPages)
        .values({
          id,
          title: input.title,
          content: input.content,
          sourceNoteIds: input.sourceNoteIds ?? [],
          version: 1,
          createdAt: now,
          updatedAt: now,
        })
        .run()
      // save initial revision
      await ctx.db
        .insert(wikiRevisions)
        .values({ id: randomUUID(), pageId: id, title: input.title, content: input.content, version: 1, createdAt: now })
        .run()
      return { id, createdAt: now }
    }),

  update: publicProcedure
    .input(z.object({ id: z.string(), title: z.string().optional(), content: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.select().from(wikiPages).where(eq(wikiPages.id, input.id)).get()
      if (!existing) return { error: '页面不存在' }
      const now = new Date().toISOString()
      const newVersion = existing.version + 1
      const patch: Record<string, unknown> = { updatedAt: now, version: newVersion }
      if (input.title !== undefined) patch.title = input.title
      if (input.content !== undefined) patch.content = input.content
      await ctx.db.update(wikiPages).set(patch).where(eq(wikiPages.id, input.id)).run()
      // save revision
      await ctx.db
        .insert(wikiRevisions)
        .values({
          id: randomUUID(),
          pageId: input.id,
          title: patch.title as string ?? existing.title,
          content: patch.content as string ?? existing.content,
          version: newVersion,
          createdAt: now,
        })
        .run()
      return { id: input.id, version: newVersion }
    }),

  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(wikiPages).where(eq(wikiPages.id, input.id)).run()
    return { ok: true }
  }),

  revisions: publicProcedure.input(z.object({ pageId: z.string() })).query(async ({ ctx, input }) => {
    return ctx.db
      .select()
      .from(wikiRevisions)
      .where(eq(wikiRevisions.pageId, input.pageId))
      .orderBy(desc(wikiRevisions.version))
      .all()
  }),

  rollback: publicProcedure
    .input(z.object({ pageId: z.string(), revisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rev = await ctx.db.select().from(wikiRevisions).where(eq(wikiRevisions.id, input.revisionId)).get()
      if (!rev) return { error: '版本不存在' }
      const existing = await ctx.db.select().from(wikiPages).where(eq(wikiPages.id, input.pageId)).get()
      if (!existing) return { error: '页面不存在' }
      const now = new Date().toISOString()
      const newVersion = existing.version + 1
      await ctx.db
        .update(wikiPages)
        .set({ title: rev.title, content: rev.content, version: newVersion, updatedAt: now })
        .where(eq(wikiPages.id, input.pageId))
        .run()
      // save rollback as new revision
      await ctx.db
        .insert(wikiRevisions)
        .values({ id: randomUUID(), pageId: input.pageId, title: rev.title, content: rev.content, version: newVersion, createdAt: now })
        .run()
      return { id: input.pageId, version: newVersion }
    }),
})
