import { z } from 'zod'
import { eq, desc, like, or } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { userMemories } from '../../db/schema.js'
import { registerTool } from '../registry.js'

registerTool({
  name: 'save_memory',
  description:
    '保存跨会话长期记忆（需审批）。类型：profile（用户身份）、preference（偏好）、fact（事实）、task（任务）、interest（兴趣）。在对话中发现值得跨会话记住的信息时主动使用。',
  schema: z.object({
    type: z.enum(['profile', 'preference', 'fact', 'task', 'interest']).describe('记忆类型'),
    content: z.string().describe('记忆内容（简洁描述）'),
    source: z.string().optional().describe('来源说明（可选）'),
  }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    const now = new Date().toISOString()
    const id = randomUUID()
    await ctx.db
      .insert(userMemories)
      .values({ id, type: args.type as any, content: String(args.content), source: String(args.source ?? ''), createdAt: now, updatedAt: now })
      .run()
    return JSON.stringify({ id, type: args.type, createdAt: now })
  },
})

registerTool({
  name: 'search_memory',
  description: '搜索跨会话长期记忆。模糊匹配内容和来源，返回相关记忆列表。',
  schema: z.object({ q: z.string().describe('搜索关键词') }),
  meta: {},
  handler: async (args, ctx) => {
    const q = `%${String(args.q)}%`
    const rows = await ctx.db
      .select()
      .from(userMemories)
      .where(or(like(userMemories.content, q), like(userMemories.source, q)))
      .orderBy(desc(userMemories.updatedAt))
      .all()
    return JSON.stringify({ count: rows.length, items: rows })
  },
})

registerTool({
  name: 'list_memories',
  description: '列出所有长期记忆，按更新时间倒序。可按类型筛选。',
  schema: z.object({
    type: z
      .enum(['profile', 'preference', 'fact', 'task', 'interest'])
      .optional()
      .describe('按类型筛选（不填返回全部）'),
  }),
  meta: {},
  handler: async (args, ctx) => {
    let rows: any[]
    if (args.type) {
      rows = await ctx.db.select().from(userMemories).where(eq(userMemories.type, args.type as any)).orderBy(desc(userMemories.updatedAt)).all()
    } else {
      rows = await ctx.db.select().from(userMemories).orderBy(desc(userMemories.updatedAt)).all()
    }
    return JSON.stringify({ count: rows.length, items: rows })
  },
})

registerTool({
  name: 'update_memory',
  description: '更新已有长期记忆的内容或类型（需审批）。',
  schema: z.object({
    id: z.string().describe('记忆 id'),
    content: z.string().optional().describe('新内容（不填则不改）'),
    type: z.enum(['profile', 'preference', 'fact', 'task', 'interest']).optional().describe('新类型（不填则不改）'),
  }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (args.content !== undefined) patch.content = String(args.content)
    if (args.type !== undefined) patch.type = args.type
    await ctx.db.update(userMemories).set(patch).where(eq(userMemories.id, String(args.id))).run()
    return JSON.stringify({ ok: true })
  },
})

registerTool({
  name: 'delete_memory',
  description: '删除长期记忆（需审批）。',
  schema: z.object({ id: z.string().describe('记忆 id') }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    await ctx.db.delete(userMemories).where(eq(userMemories.id, String(args.id))).run()
    return JSON.stringify({ ok: true })
  },
})
