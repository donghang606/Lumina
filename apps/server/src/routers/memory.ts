import { z } from 'zod'
import { router, publicProcedure } from '../trpc/context.js'
import { userMemories } from '../db/schema.js'
import { eq, desc, like, or } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

export const memoryRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(userMemories).orderBy(desc(userMemories.updatedAt)).all()
  }),

  search: publicProcedure.input(z.object({ q: z.string() })).query(async ({ ctx, input }) => {
    const q = `%${input.q}%`
    return ctx.db
      .select()
      .from(userMemories)
      .where(or(like(userMemories.content, q), like(userMemories.source, q)))
      .orderBy(desc(userMemories.updatedAt))
      .all()
  }),

  create: publicProcedure
    .input(
      z.object({
        type: z.enum(['profile', 'preference', 'fact', 'task', 'interest']),
        content: z.string(),
        source: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      const id = randomUUID()
      await ctx.db
        .insert(userMemories)
        .values({ id, type: input.type, content: input.content, source: input.source ?? '', createdAt: now, updatedAt: now })
        .run()
      return { id, createdAt: now }
    }),

  update: publicProcedure
    .input(z.object({ id: z.string(), content: z.string().optional(), type: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
      if (input.content !== undefined) patch.content = input.content
      if (input.type !== undefined) patch.type = input.type
      await ctx.db.update(userMemories).set(patch).where(eq(userMemories.id, input.id)).run()
      return { ok: true }
    }),

  delete: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(userMemories).where(eq(userMemories.id, input.id)).run()
    return { ok: true }
  }),
})
