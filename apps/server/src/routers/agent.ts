import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { eq, desc, asc } from 'drizzle-orm'
import { conversations, messages } from '../db/schema.js'
import { listAgentConversations, runAgentTurn } from '../agent/runner.js'

export const agentRouter = router({
  /** 触发一轮 Agent 对话（非流式；HITL 中断时返回 pendingApproval）。 */
  chat: publicProcedure
    .input(
      z
        .object({
          message: z.string().min(1).max(20000).optional(),
          conversationId: z.string().optional(),
          resume: z
            .object({ threadId: z.string(), decision: z.enum(['approve', 'reject']) })
            .optional(),
        })
        .optional(),
    )
    .mutation(async ({ ctx, input = {} }) => {
      
      if (!input.message && !input.resume) throw new Error('message 或 resume 必填其一')
      const result = await runAgentTurn(ctx, {
        message: input.message ?? '',
        conversationId: input.conversationId,
        resume: input.resume,
      })
      return {
        conversationId: result.conversationId,
        reply: result.reply,
        pendingApproval: result.pendingApproval ?? null,
      }
    }),

  listConversations: publicProcedure.query(async ({ ctx }) => listAgentConversations(ctx)),

  getConversation: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const conv = await ctx.db.select().from(conversations).where(eq(conversations.id, input.id)).get()
    if (!conv) return null
    const msgs = await ctx.db.select().from(messages).where(eq(messages.conversationId, input.id)).orderBy(asc(messages.createdAt)).all()
    return { conversation: conv, messages: msgs }
  }),

  deleteConversation: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(conversations).where(eq(conversations.id, input.id)).run()
    return { ok: true }
  }),

  renameConversation: publicProcedure
    .input(z.object({ id: z.string(), title: z.string().min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(conversations)
        .set({ title: input.title, updatedAt: new Date().toISOString() })
        .where(eq(conversations.id, input.id))
        .run()
      return { ok: true }
    }),
})