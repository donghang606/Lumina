import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { notes, tags, tagsOnNotes, aiSuggestions } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

export const reviewRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: aiSuggestions.id,
        kind: aiSuggestions.kind,
        noteId: aiSuggestions.noteId,
        payload: aiSuggestions.payload,
        status: aiSuggestions.status,
        source: aiSuggestions.source,
        createdAt: aiSuggestions.createdAt,
        noteTitle: notes.title,
      })
      .from(aiSuggestions)
      .leftJoin(notes, eq(notes.id, aiSuggestions.noteId))
      .where(eq(aiSuggestions.status, 'pending'))
      .orderBy(desc(aiSuggestions.createdAt))
      .all()
    return rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      noteId: r.noteId,
      noteTitle: r.noteTitle ?? null,
      payload: r.payload as Record<string, unknown>,
      status: r.status,
      source: r.source,
      createdAt: r.createdAt,
    }))
  }),

  accept: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(aiSuggestions).where(eq(aiSuggestions.id, input.id)).get()
      if (!row) return { ok: false, reason: 'suggestion not found' }
      if (row.status !== 'pending') return { ok: false, reason: 'already processed' }

      const payload = row.payload as Record<string, unknown>

      if (row.kind === 'summary') {
        const summary = String(payload.summary ?? '')
        if (row.noteId && summary) {
          await ctx.db.update(notes).set({ summary }).where(eq(notes.id, row.noteId)).run()
        }
      } else if (row.kind === 'tags') {
        const tagList = Array.isArray(payload.tags) ? (payload.tags as { id?: string; name?: string }[]) : []
        if (row.noteId) {
          for (const t of tagList) {
            if (!t.name) continue
            let tagId = t.id
            if (!tagId) {
              const hit = await ctx.db.select().from(tags).where(eq(tags.name, t.name)).get()
              tagId = hit?.id
            }
            if (!tagId) continue
            await ctx.db.insert(tagsOnNotes).values({ noteId: row.noteId, tagId, assignedBy: 'auto', confidence: 0.8 }).onConflictDoNothing().run()
          }
        }
      } else if (row.kind === 'note') {
        // note suggestions carry a full note payload (used by MCP propose_note)
        const title = String(payload.title ?? '(未命名)').slice(0, 200)
        const content = String(payload.content ?? '')
        const type = String(payload.type ?? 'card') as 'card' | 'note' | 'bookmark' | 'file'
        const now = new Date().toISOString()
        const noteId = row.noteId ?? randomUUID()
        await ctx.db.insert(notes).values({
          id: noteId,
          title,
          content,
          type,
          status: 'draft',
          summary: null,
          createdAt: now,
          updatedAt: now,
        }).onConflictDoNothing().run()
        // suggested tags
        const tagList = Array.isArray(payload.tags) ? (payload.tags as string[]) : []
        for (const name of tagList.slice(0, 5)) {
          if (!name.trim()) continue
          const slug = name.trim().toLowerCase().replace(/\s+/g, '-')
          let tagId: string | undefined
          const existing = await ctx.db.select({ id: tags.id }).from(tags).where(eq(tags.slug, slug)).get()
          if (existing) {
            tagId = existing.id
          } else {
            tagId = randomUUID()
            await ctx.db.insert(tags).values({ id: tagId, name: name.trim(), slug, createdAt: now }).run()
          }
          await ctx.db.insert(tagsOnNotes).values({ noteId, tagId, assignedBy: 'auto', confidence: 0.8 }).onConflictDoNothing().run()
        }
      } else {
        return { ok: false, reason: 'unsupported kind' }
      }

      await ctx.db.update(aiSuggestions).set({ status: 'applied' }).where(eq(aiSuggestions.id, input.id)).run()
      return { ok: true }
    }),

  reject: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(aiSuggestions).set({ status: 'rejected' }).where(eq(aiSuggestions.id, input.id)).run()
      return { ok: true }
    }),

  dismissAll: publicProcedure.mutation(async ({ ctx }) => {
    await ctx.db.update(aiSuggestions).set({ status: 'rejected' }).where(eq(aiSuggestions.status, 'pending')).run()
    return { ok: true }
  }),
})