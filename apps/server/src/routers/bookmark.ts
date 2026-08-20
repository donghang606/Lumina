import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { notes, collections } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'

interface BookmarkRow {
  id: string
  title: string
  url: string
  noteId: string | null
  meta: Record<string, unknown>
  collectedAt: string | null
}

function checkUrl(url: string, timeoutMs: number): Promise<{ ok: boolean; status: number; error?: string }> {
  return new Promise((resolve) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const doHead = () =>
      fetch(url, { method: 'HEAD', redirect: 'follow', signal: controller.signal })
        .then((res) => ({ ok: res.ok, status: res.status }))
        .catch((e: unknown) => {
          // HEAD 被拒（部分站点只允许 GET）时回退到 GET
          if (e instanceof Error && e.name === 'AbortError') return { ok: false, status: 0, error: 'timeout' }
          return fetch(url, { method: 'GET', redirect: 'follow', signal: controller.signal })
            .then((res) => ({ ok: res.ok, status: res.status }))
            .catch(() => ({ ok: false, status: 0, error: 'unreachable' }))
        })
    doHead()
      .then((r) => {
        clearTimeout(timer)
        resolve({ ok: r.ok, status: r.status, error: r.ok ? undefined : (r as { error?: string }).error })
      })
      .catch(() => {
        clearTimeout(timer)
        resolve({ ok: false, status: 0, error: 'unreachable' })
      })
  })
}

export const bookmarkRouter = router({
  // 扫描全部收藏，逐个探测 URL 可达性，把结果写回 notes.meta.bookmarkHealth
  checkHealth: publicProcedure
    .input(z.object({ timeoutMs: z.number().int().min(500).max(30000).default(8000) }).optional())
    .mutation(async ({ ctx, input = { timeoutMs: 8000 } }) => {
      const rows = (await ctx.db
        .select({
          id: collections.id,
          title: collections.title,
          url: collections.url,
          noteId: collections.noteId,
          collectedAt: collections.collectedAt,
        })
        .from(collections)
        .all()) as unknown as BookmarkRow[]

      const results: {
        collectionId: string
        noteId: string | null
        title: string
        url: string
        ok: boolean
        status: number
        error?: string
      }[] = []

      for (const r of rows) {
        if (!r.url) continue
        const probe = await checkUrl(r.url, input.timeoutMs)
        const status = probe.status ?? 0
        results.push({
          collectionId: r.id,
          noteId: r.noteId,
          title: r.title || r.url,
          url: r.url,
          ok: probe.ok,
          status,
          error: probe.error,
        })

        // 写回元数据供前端/图谱展示
        if (r.noteId) {
          const note = await ctx.db.select({ meta: notes.meta }).from(notes).where(eq(notes.id, r.noteId)).get()
          const meta = { ...(note?.meta ?? {}) } as Record<string, unknown>
          meta.bookmarkHealth = {
            checkedAt: new Date().toISOString(),
            ok: probe.ok,
            status,
            error: probe.error ?? null,
          }
          await ctx.db.update(notes).set({ meta, updatedAt: new Date().toISOString() }).where(eq(notes.id, r.noteId)).run()
        }
      }

      const broken = results.filter((r) => !r.ok)
      return { checked: results.length, broken, ok: broken.length === 0 }
    }),

  // 只返回最近一次健康检查结果（不发起探测）
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = (await ctx.db
      .select({
        id: collections.id,
        title: collections.title,
        url: collections.url,
        noteId: collections.noteId,
      })
      .from(collections)
      .all()) as unknown as { id: string; title: string; url: string; noteId: string | null }[]

    const items: { collectionId: string; noteId: string | null; title: string; url: string; ok: boolean; status: number; error: string | null }[] = []
    for (const r of rows) {
      const note = r.noteId ? await ctx.db.select({ meta: notes.meta }).from(notes).where(eq(notes.id, r.noteId)).get() : null
      const meta = (note?.meta ?? {}) as Record<string, unknown>
      const h = (meta.bookmarkHealth ?? null) as { ok: boolean; status: number; error?: string | null } | null
      items.push({
        collectionId: r.id,
        noteId: r.noteId,
        title: r.title || r.url,
        url: r.url,
        ok: h?.ok ?? true,
        status: h?.status ?? 0,
        error: h?.error ?? null,
      })
    }
    return items
  }),
})

export type BookmarkRouter = typeof bookmarkRouter