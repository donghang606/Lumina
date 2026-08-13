import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { noteLinks, notes, tagsOnNotes } from '../db/schema.js'
import { eq, or, inArray } from 'drizzle-orm'

export const graphRouter = router({
  getAll: publicProcedure.query(async ({ ctx }) => {
    const links = await ctx.db.select().from(noteLinks).all()
    const allNotes = await ctx.db.select({ id: notes.id, title: notes.title, type: notes.type }).from(notes).all()
    return { nodes: allNotes, edges: links }
  }),

  getGraphData: publicProcedure
    .input(z.object({ limit: z.number().int().min(1).max(500).default(100) }).optional())
    .query(async ({ ctx, input = { limit: 100 } }) => {
      const allNotes = await ctx.db
        .select({
          id: notes.id,
          title: notes.title,
          type: notes.type,
          summary: notes.summary,
          createdAt: notes.createdAt,
        })
        .from(notes)
        .orderBy(notes.createdAt)
        .limit(input.limit)
        .all()

      if (allNotes.length === 0) return { nodes: [], edges: [] }

      const idSet = new Set(allNotes.map((n) => n.id))
      const allLinks = await ctx.db.select().from(noteLinks).all()
      const links = allLinks.filter((l) => idSet.has(l.sourceNoteId ?? '') && idSet.has(l.targetNoteId ?? ''))

      const rels = await ctx.db.select({ noteId: tagsOnNotes.noteId }).from(tagsOnNotes).all()
      const tagCounts = new Map<string, number>()
      for (const r of rels) {
        if (r.noteId) tagCounts.set(r.noteId, (tagCounts.get(r.noteId) ?? 0) + 1)
      }

      const degreeMap = new Map<string, number>()
      for (const l of links) {
        if (l.sourceNoteId) degreeMap.set(l.sourceNoteId, (degreeMap.get(l.sourceNoteId) ?? 0) + 1)
        if (l.targetNoteId) degreeMap.set(l.targetNoteId, (degreeMap.get(l.targetNoteId) ?? 0) + 1)
      }

      return {
        nodes: allNotes.map((n) => ({
          id: n.id,
          title: n.title,
          type: n.type,
          summary: n.summary,
          createdAt: n.createdAt,
          degree: degreeMap.get(n.id) ?? 0,
          tagCount: tagCounts.get(n.id) ?? 0,
        })),
        edges: links,
      }
    }),

  getNodeNeighbors: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.select().from(noteLinks).where(() => or(eq(noteLinks.sourceNoteId, input.nodeId), eq(noteLinks.targetNoteId, input.nodeId))).all()
    }),

  expandNode: publicProcedure
    .input(z.object({ nodeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const links = await ctx.db
        .select()
        .from(noteLinks)
        .where(() => or(eq(noteLinks.sourceNoteId, input.nodeId), eq(noteLinks.targetNoteId, input.nodeId)))
        .all()

      const neighborIds = new Set<string>()
      for (const l of links) {
        if (l.sourceNoteId && l.sourceNoteId !== input.nodeId) neighborIds.add(l.sourceNoteId)
        if (l.targetNoteId && l.targetNoteId !== input.nodeId) neighborIds.add(l.targetNoteId)
      }
      if (neighborIds.size === 0) return { nodes: [], edges: [] }

      const ns = await ctx.db
        .select({ id: notes.id, title: notes.title, type: notes.type, summary: notes.summary, createdAt: notes.createdAt })
        .from(notes)
        .where(inArray(notes.id, [...neighborIds]))
        .all()

      const degree = new Map<string, number>()
      for (const l of links) {
        if (l.sourceNoteId) degree.set(l.sourceNoteId, (degree.get(l.sourceNoteId) ?? 0) + 1)
        if (l.targetNoteId) degree.set(l.targetNoteId, (degree.get(l.targetNoteId) ?? 0) + 1)
      }

      const rels = await ctx.db.select({ noteId: tagsOnNotes.noteId }).from(tagsOnNotes).all()
      const tagCounts = new Map<string, number>()
      for (const r of rels) {
        if (r.noteId) tagCounts.set(r.noteId, (tagCounts.get(r.noteId) ?? 0) + 1)
      }

      return {
        nodes: ns.map((n) => ({
          id: n.id,
          title: n.title,
          type: n.type,
          summary: n.summary,
          createdAt: n.createdAt,
          degree: degree.get(n.id) ?? 0,
          tagCount: tagCounts.get(n.id) ?? 0,
        })),
        edges: links,
      }
    }),
})