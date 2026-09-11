import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { eq, and, gte, lte, desc } from 'drizzle-orm'
import { scheduleEvents } from '../../db/schema.js'
import { registerTool } from '../registry.js'

registerTool({
  name: 'list_events',
  description: '列出日程事件（默认最近 20 条）。可按日期范围过滤，返回 id/标题/时间/优先级。',
  schema: z.object({
    start: z.string().optional().describe('起始日 YYYY-MM-DD（含）'),
    end: z.string().optional().describe('结束日 YYYY-MM-DD（含）'),
    limit: z.number().int().min(1).max(100).optional().describe('条数，默认 20'),
  }),
  meta: {},
  handler: async (args, ctx) => {
    const limit = (args.limit as number) ?? 20
    let rows
    if (args.start && args.end) {
      rows = await ctx.db
        .select()
        .from(scheduleEvents)
        .where(and(gte(scheduleEvents.start, String(args.start)), lte(scheduleEvents.start, String(args.end))))
        .orderBy(desc(scheduleEvents.start))
        .limit(limit)
        .all()
    } else {
      rows = await ctx.db.select().from(scheduleEvents).orderBy(desc(scheduleEvents.start)).limit(limit).all()
    }
    return JSON.stringify({
      count: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        title: r.title,
        start: r.start,
        end: r.end,
        startTime: r.startTime,
        endTime: r.endTime,
        allDay: r.allDay,
        priority: r.priority,
      })),
    })
  },
})

registerTool({
  name: 'create_event',
  description: '创建日程事件。适合用户提到"提醒我""安排""日历上记一下"时调用。需审批。',
  schema: z.object({
    title: z.string().describe('事件标题'),
    start: z.string().describe('开始日 YYYY-MM-DD'),
    end: z.string().optional().describe('结束日（跨天时填，默认同 start）'),
    startTime: z.string().optional().describe('HH:MM（非全天时填）'),
    endTime: z.string().optional().describe('HH:MM'),
    allDay: z.boolean().optional().describe('是否全天，默认 true'),
    description: z.string().optional().describe('备注'),
    priority: z.enum(['important', 'normal', 'low']).optional().describe('优先级，默认 important'),
  }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    const now = new Date().toISOString()
    const id = randomUUID()
    await ctx.db.insert(scheduleEvents).values({
      id,
      title: String(args.title),
      start: String(args.start),
      end: String(args.end ?? args.start),
      startTime: String(args.startTime ?? ''),
      endTime: String(args.endTime ?? ''),
      allDay: (args.allDay as boolean | undefined) ?? true,
      description: String(args.description ?? ''),
      color: '#60a5fa',
      priority: (args.priority as 'important' | 'normal' | 'low') ?? 'important',
      createdAt: now,
      updatedAt: now,
    })
    return JSON.stringify({ id, createdAt: now })
  },
})

registerTool({
  name: 'get_event',
  description: '按 id 获取日程详情（含描述）。',
  schema: z.object({ id: z.string() }),
  meta: {},
  handler: async (args, ctx) => {
    const row = await ctx.db.select().from(scheduleEvents).where(eq(scheduleEvents.id, String(args.id))).get()
    if (!row) return JSON.stringify({ error: 'event not found' })
    return JSON.stringify(row)
  },
})

registerTool({
  name: 'delete_event',
  description: '删除日程事件（需审批）。',
  schema: z.object({ id: z.string() }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    await ctx.db.delete(scheduleEvents).where(eq(scheduleEvents.id, String(args.id))).run()
    return JSON.stringify({ ok: true })
  },
})