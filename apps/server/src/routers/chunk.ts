import { z } from 'zod'
import { router, publicProcedure } from '../trpc/context.js'
import { noteBlocks, chunkRevisions } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

export const chunkRouter = router({
  /** 获取笔记的所有 chunk */
  listByNote: publicProcedure.input(z.object({ noteId: z.string() })).query(async ({ ctx, input }) => {
    return ctx.db
      .select()
      .from(noteBlocks)
      .where(eq(noteBlocks.noteId, input.noteId))
      .orderBy(noteBlocks.index)
      .all()
  }),

  /** 获取单个 chunk */
  get: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    return ctx.db.select().from(noteBlocks).where(eq(noteBlocks.id, input.id)).get() ?? null
  }),

  /** 编辑 chunk 内容（保存版本历史，需审批） */
  update: publicProcedure
    .input(z.object({ id: z.string(), chunkContent: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const block = await ctx.db.select().from(noteBlocks).where(eq(noteBlocks.id, input.id)).get()
      if (!block) return { error: '块不存在' }
      const now = new Date().toISOString()

      // 获取当前最大版本号
      const lastRev = await ctx.db
        .select()
        .from(chunkRevisions)
        .where(eq(chunkRevisions.blockId, input.id))
        .orderBy(desc(chunkRevisions.version))
        .get()
      const newVersion = (lastRev?.version ?? 0) + 1

      // 保存旧版本到 chunkRevisions
      await ctx.db.insert(chunkRevisions).values({
        id: randomUUID(),
        blockId: input.id,
        chunkContent: block.chunkContent,
        version: newVersion,
        editedBy: 'user',
        createdAt: now,
      }).run()

      // 更新 noteBlocks
      await ctx.db
        .update(noteBlocks)
        .set({ chunkContent: input.chunkContent, tokenCount: Math.round(input.chunkContent.length / 4) })
        .where(eq(noteBlocks.id, input.id))
        .run()

      return { id: input.id, version: newVersion }
    }),

  /** 获取 chunk 版本历史 */
  revisions: publicProcedure.input(z.object({ blockId: z.string() })).query(async ({ ctx, input }) => {
    return ctx.db
      .select()
      .from(chunkRevisions)
      .where(eq(chunkRevisions.blockId, input.blockId))
      .orderBy(desc(chunkRevisions.version))
      .all()
  }),

  /** 回滚 chunk 到指定版本（需审批） */
  rollback: publicProcedure
    .input(z.object({ blockId: z.string(), revisionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const rev = await ctx.db.select().from(chunkRevisions).where(eq(chunkRevisions.id, input.revisionId)).get()
      if (!rev) return { error: '版本不存在' }
      const block = await ctx.db.select().from(noteBlocks).where(eq(noteBlocks.id, input.blockId)).get()
      if (!block) return { error: '块不存在' }
      const now = new Date().toISOString()

      // 获取当前最大版本号
      const lastRev = await ctx.db
        .select()
        .from(chunkRevisions)
        .where(eq(chunkRevisions.blockId, input.blockId))
        .orderBy(desc(chunkRevisions.version))
        .get()
      const newVersion = (lastRev?.version ?? 0) + 1

      // 保存当前版本到 chunkRevisions（回滚前的版本）
      await ctx.db.insert(chunkRevisions).values({
        id: randomUUID(),
        blockId: input.blockId,
        chunkContent: block.chunkContent,
        version: newVersion,
        editedBy: 'rollback',
        createdAt: now,
      }).run()

      // 回滚内容
      await ctx.db
        .update(noteBlocks)
        .set({ chunkContent: rev.chunkContent, tokenCount: Math.round(rev.chunkContent.length / 4) })
        .where(eq(noteBlocks.id, input.blockId))
        .run()

      return { id: input.blockId, version: newVersion }
    }),
})
