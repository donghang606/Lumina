import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { syncDevices, noteTombstones, notes } from '../db/schema.js'
import { randomUUID } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'

/**
 * 本地优先同步（LWW + 墓碑）：
 * - 每条笔记以 updatedAt 作为版本时钟；合并取较新者（等值回退到设备 id 字典序）。
 * - 删除写入 note_tombstones，跨端合并时以墓碑消除已删笔记。
 * - push/pull 均以 ISO 时间游标增量传输，未来可平滑升级为 CRDT（见设计文档）。
 */

const noteSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  type: z.enum(['card', 'note', 'bookmark', 'file']),
  summary: z.string().nullable().optional(),
  status: z.enum(['draft', 'indexed', 'failed']).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export const syncRouter = router({
  registerDevice: publicProcedure
    .input(z.object({ name: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      const id = randomUUID()
      await ctx.db.insert(syncDevices).values({ id, name: input.name, lastSeenAt: now, createdAt: now })
      return { deviceId: id }
    }),

  heartbeat: publicProcedure
    .input(z.object({ deviceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(syncDevices)
        .set({ lastSeenAt: new Date().toISOString() })
        .where(eq(syncDevices.id, input.deviceId))
        .run()
      return { ok: true }
    }),

  pull: publicProcedure
    .input(z.object({ since: z.string(), deviceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const updated = await ctx.db
        .select()
        .from(notes)
        .where(sql`${notes.updatedAt} > ${input.since}`)
        .all()
      const tombstones = await ctx.db
        .select()
        .from(noteTombstones)
        .where(sql`${noteTombstones.deletedAt} > ${input.since}`)
        .all()
      return {
        notes: updated.map((n) => ({ ...n, meta: n.meta ?? {} })),
        tombstones: tombstones.map((t) => ({ noteId: t.noteId, deletedAt: t.deletedAt })),
      }
    }),

  push: publicProcedure
    .input(
      z.object({
        deviceId: z.string(),
        notes: z.array(noteSchema).default([]),
        tombstones: z.array(z.object({ noteId: z.string(), deletedAt: z.string() })).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(syncDevices)
        .set({ lastSeenAt: new Date().toISOString() })
        .where(eq(syncDevices.id, input.deviceId))
        .run()

      // LWW：仅当远端较旧（或等值但本设备 id 更小）时覆盖
      const remote = await ctx.db.select().from(notes).all()
      const remoteById = new Map(remote.map((n) => [n.id, n]))
      let applied = 0
      for (const change of input.notes) {
        const cur = remoteById.get(change.id)
        if (cur) {
          if (cur.updatedAt > change.updatedAt) continue
          if (cur.updatedAt === change.updatedAt && cur.id >= input.deviceId) continue
        }
        await ctx.db
          .insert(notes)
          .values({
            id: change.id,
            title: change.title,
            content: change.content,
            type: change.type,
            summary: change.summary ?? null,
            status: change.status ?? 'draft',
            meta: change.meta ?? {},
            createdAt: change.createdAt,
            updatedAt: change.updatedAt,
          })
          .onConflictDoUpdate({
            target: notes.id,
            set: {
              title: change.title,
              content: change.content,
              type: change.type,
              summary: change.summary ?? null,
              status: change.status ?? 'draft',
              meta: change.meta ?? {},
              updatedAt: change.updatedAt,
            },
          })
          .run()
        applied++
      }

      // 墓碑：删除比本地 updatedAt 新的笔记，或直接写入墓碑
      let tombApplied = 0
      for (const t of input.tombstones) {
        const cur = remoteById.get(t.noteId)
        if (cur && cur.updatedAt > t.deletedAt) continue
        await ctx.db.delete(notes).where(eq(notes.id, t.noteId)).run()
        await ctx.db
          .insert(noteTombstones)
          .values({ noteId: t.noteId, deletedAt: t.deletedAt, deletedBy: input.deviceId })
          .onConflictDoUpdate({ target: noteTombstones.noteId, set: { deletedAt: t.deletedAt, deletedBy: input.deviceId } })
          .run()
        tombApplied++
      }

      return { applied, tombApplied }
    }),
})

export type SyncRouter = typeof syncRouter
