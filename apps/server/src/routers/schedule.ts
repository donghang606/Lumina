import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { eq, and, gte, lte, desc } from 'drizzle-orm'
import { scheduleEvents } from '../db/schema.js'

const eventSchema = z.object({
  title: z.string().min(1).max(200),
  start: z.string().describe('YYYY-MM-DD'),
  end: z.string().optional().describe('YYYY-MM-DD（跨天结束日，默认同 start）'),
  startTime: z.string().optional().describe('HH:MM（非全天时填）'),
  endTime: z.string().optional().describe('HH:MM（非全天时填）'),
  allDay: z.boolean().optional().default(true),
  description: z.string().optional().default(''),
  color: z.string().optional().default('#60a5fa'),
  priority: z.enum(['important', 'normal', 'low']).optional().default('important'),
})

export const scheduleRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    return await ctx.db.select().from(scheduleEvents).orderBy(desc(scheduleEvents.start)).limit(500).all()
  }),

  /** 按日期范围取事件（含端点）。 */
  byRange: publicProcedure
    .input(z.object({ start: z.string(), end: z.string() }))
    .query(async ({ ctx, input }) => {
      return await ctx.db
        .select()
        .from(scheduleEvents)
        .where(and(gte(scheduleEvents.start, input.start), lte(scheduleEvents.start, input.end)))
        .orderBy(desc(scheduleEvents.start))
        .all()
    }),

  create: publicProcedure.input(eventSchema).mutation(async ({ ctx, input }) => {
    const now = new Date().toISOString()
    const id = randomUUID()
    await ctx.db.insert(scheduleEvents).values({
      id,
      title: input.title,
      start: input.start,
      end: input.end ?? input.start,
      startTime: input.startTime ?? '',
      endTime: input.endTime ?? '',
      allDay: input.allDay ?? true,
      description: input.description ?? '',
      color: input.color ?? '#60a5fa',
      priority: input.priority ?? 'important',
      createdAt: now,
      updatedAt: now,
    })
    return { id }
  }),

  update: publicProcedure
    .input(z.object({ id: z.string() }).extend(eventSchema.partial().shape))
    .mutation(async ({ ctx, input }) => {
      const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
      for (const k of ['title', 'start', 'end', 'startTime', 'endTime', 'allDay', 'description', 'color', 'priority'] as const) {
        if (input[k] !== undefined) patch[k] = input[k]
      }
      await ctx.db.update(scheduleEvents).set(patch).where(eq(scheduleEvents.id, input.id)).run()
      return { ok: true }
    }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(scheduleEvents).where(eq(scheduleEvents.id, input.id)).run()
    return { ok: true }
  }),
})