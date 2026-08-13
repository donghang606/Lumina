import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { notes, tags, tagsOnNotes } from '../db/schema.js'
import { and, desc, asc, sql, eq, like, or, inArray, type SQL } from 'drizzle-orm'

export const feedRouter = router({
  list: publicProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(100).default(20),
          offset: z.number().int().min(0).default(0),
          type: z.enum(['card', 'note', 'bookmark', 'file']).optional(),
          tagId: z.string().optional(),
          keyword: z.string().max(200).optional(),
          order: z.enum(['desc', 'asc']).default('desc'),
          onDate: z.string().optional(),
        })
        .optional(),
    )
    .query(async ({ ctx, input = { limit: 20, offset: 0 } }) => {
      const conds: SQL[] = []
      if (input.type) conds.push(eq(notes.type, input.type))
      if (input.keyword) {
        const kw = `%${input.keyword}%`
        conds.push(or(like(notes.title, kw), like(notes.content, kw)) as unknown as SQL)
      }
      if (input.onDate) {
        conds.push(sql`date(${notes.createdAt}) = date(${input.onDate})`)
      }
      if (input.tagId) {
        const ids = (await ctx.db.$client.execute({
          sql: `SELECT note_id FROM tags_on_notes WHERE tag_id = ?`,
          args: [input.tagId],
        })) as unknown as { rows: { note_id: string | null }[] }
        const noteIds = (ids.rows ?? []).map((r) => r.note_id).filter(Boolean) as string[]
        if (noteIds.length === 0) return { items: [], total: 0, hasMore: false }
        conds.push(sql`${notes.id} IN (${sql.join(noteIds.map((v) => sql`${v}`), sql`, `)})`)
      }

      const whereSql = conds.length > 0 ? and(...conds) : undefined

      const all = await ctx.db.select().from(notes).where(whereSql).all()
      const sorted = all.slice().sort((a, b) =>
        input.order === 'asc' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt),
      )

      const items = sorted.slice(input.offset, input.offset + input.limit)
      const ids = items.map((n) => n.id)

      let relations: { noteId: string | null; tagId: string | null; name: string; color: string | null }[] = []
      if (ids.length > 0) {
        const placeholders = ids.map(() => '?').join(', ')
        const res = await ctx.db.$client.execute({
          sql: `
            SELECT t_on.note_id as noteId, t_on.tag_id as tagId, t.name as name, t.color as color
            FROM tags_on_notes t_on
            JOIN tags t ON t.id = t_on.tag_id
            WHERE t_on.note_id IN (${placeholders})
          `,
          args: ids,
        })
        relations = (res as unknown as { rows: { noteId: string | null; tagId: string | null; name: string; color: string | null }[] }).rows ?? []
      }

      const tagsByNote = new Map<string, { id: string; name: string; color: string | null }[]>()
      for (const r of relations) {
        if (!r.noteId || !r.tagId) continue
        const list = tagsByNote.get(r.noteId) ?? []
        list.push({ id: r.tagId, name: r.name, color: r.color })
        tagsByNote.set(r.noteId, list)
      }

      const normalized = items.map((n) => ({
        ...n,
        meta: n.meta ?? {},
        noteTags: tagsByNote.get(n.id) ?? [],
      }))

      return {
        items: normalized,
        total: sorted.length,
        hasMore: input.offset + input.limit < sorted.length,
      }
    }),

  activity: publicProcedure
    .input(z.object({ days: z.number().int().min(7).max(365).default(90) }).optional())
    .query(async ({ ctx, input = { days: 90 } }) => {
      const startDate = new Date(Date.now() - (input.days - 1) * 86400000).toISOString()
      const res = (await ctx.db.$client.execute({
        sql: `SELECT date(created_at) as day, count(*) as cnt FROM notes WHERE created_at >= ? GROUP BY date(created_at)`,
        args: [startDate],
      })) as unknown as { rows: { day: string; cnt: number }[] }
      const counts = new Map<string, number>()
      for (const r of res.rows ?? []) counts.set(r.day, Number(r.cnt))

      const days: { date: string; count: number }[] = []
      for (let i = input.days - 1; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000)
        const key = d.toISOString().slice(0, 10)
        days.push({ date: key, count: counts.get(key) ?? 0 })
      }
      return { days }
    }),

  byTag: publicProcedure.input(z.object({ tagId: z.string() })).query(async ({ ctx, input }) => {
    const rels = await ctx.db.select({ noteId: tagsOnNotes.noteId }).from(tagsOnNotes).where(eq(tagsOnNotes.tagId, input.tagId)).all()
    const ids = rels.map((r) => r.noteId).filter(Boolean) as string[]
    if (ids.length === 0) return { items: [], total: 0, hasMore: false }
    const items = await ctx.db.select().from(notes).where(inArray(notes.id, ids)).all()
    return { items, total: items.length, hasMore: false }
  }),
})

export type FeedRouter = typeof feedRouter