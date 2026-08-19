import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { notes, noteLinks, tagsOnNotes, tags, noteBlocks, blockRefs, noteTombstones, aiSuggestions } from '../db/schema.js'
import { randomUUID } from 'node:crypto'
import { eq, or, sql, desc, inArray } from 'drizzle-orm'
import { embedTexts, cosineSimilarity, getActiveProvider } from '../llm/provider.js'
import { bm25Score, fuseRanks, rankByScores, type SearchableDoc } from '../lib/hybridSearch.js'

const noteUpdateSchema = z.object({
  id: z.string(),
  title: z.string().optional(),
  content: z.string().optional(),
  type: z.enum(['card', 'note', 'bookmark', 'file']).optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export const noteRouter = router({
  list: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(notes).all()
    return rows.map((r) => ({ ...r, meta: r.meta ?? {} }))
  }),

  getById: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const row = await ctx.db.select().from(notes).where(eq(notes.id, input.id)).get()
    return row ? { ...row, meta: row.meta ?? {} } : null
  }),

  create: publicProcedure
    .input(
      z.object({
        title: z.string().default(''),
        content: z.string().default(''),
        type: z.enum(['card', 'note', 'bookmark', 'file']).default('note'),
        tagIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      const id = randomUUID()

      if (!input.title.trim() && !input.content.trim()) {
        throw new Error('标题和内容不能都为空')
      }

      await ctx.db.insert(notes).values({
        id,
        title: input.title,
        content: input.content,
        type: input.type,
        createdAt: now,
        updatedAt: now,
      })

      if (input.tagIds?.length) {
        await ctx.db.insert(tagsOnNotes).values(input.tagIds.map((tagId) => ({ noteId: id, tagId, assignedBy: 'manual' as const })))
      }

      return { id }
    }),

  update: publicProcedure.input(noteUpdateSchema).mutation(async ({ ctx, input }) => {
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() }
    if (input.title !== undefined) patch.title = input.title
    if (input.content !== undefined) patch.content = input.content
    if (input.type !== undefined) patch.type = input.type
    if (input.meta !== undefined) patch.meta = JSON.stringify(input.meta)

    await ctx.db.update(notes).set(patch as never).where(eq(notes.id, input.id)).run()
    const row = await ctx.db.select().from(notes).where(eq(notes.id, input.id)).get()
    return row ? { ...row, meta: row.meta ?? {} } : null
  }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const now = new Date().toISOString()
    await ctx.db.delete(notes).where(eq(notes.id, input.id)).run()
    await ctx.db
      .insert(noteTombstones)
      .values({ noteId: input.id, deletedAt: now, deletedBy: 'local' })
      .onConflictDoUpdate({ target: noteTombstones.noteId, set: { deletedAt: now, deletedBy: 'local' } })
      .run()
    return { ok: true }
  }),

  stats: publicProcedure.query(async ({ ctx }) => {
    const total = await ctx.db.select({ count: sql<number>`count(*)` }).from(notes).all()
    const byTypeRows = await ctx.db
      .select({ type: notes.type, count: sql<number>`count(*)` })
      .from(notes)
      .groupBy(notes.type)
      .all()
    const today = new Date().toISOString().slice(0, 10)
    const todayCount = await ctx.db
      .select({ count: sql<number>`count(*)` })
      .from(notes)
      .where(sql`date(${notes.createdAt}) = date('${sql.raw(today)}')`)
      .all()
    return {
      total: Number(total[0]?.count ?? 0),
      today: Number(todayCount[0]?.count ?? 0),
      byType: Object.fromEntries(byTypeRows.map((r) => [r.type, Number(r.count)])),
    }
  }),

  recent: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(notes).orderBy(desc(notes.createdAt)).limit(10).all()
    return rows.map((r) => ({ ...r, meta: r.meta ?? {} }))
  }),

  createLink: publicProcedure
    .input(z.object({ sourceNoteId: z.string(), targetNoteId: z.string(), context: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      await ctx.db.insert(noteLinks).values({
        id: randomUUID(),
        sourceNoteId: input.sourceNoteId,
        targetNoteId: input.targetNoteId,
        context: input.context,
        createdAt: now,
      })
      return { ok: true }
    }),

  deleteLink: publicProcedure
    .input(z.object({ sourceNoteId: z.string(), targetNoteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .delete(noteLinks)
        .where(sql`${noteLinks.sourceNoteId} = ${input.sourceNoteId} AND ${noteLinks.targetNoteId} = ${input.targetNoteId}`)
        .run()
      return { ok: true }
    }),

  createBlockRef: publicProcedure
    .input(
      z.object({
        sourceNoteId: z.string(),
        targetNoteId: z.string(),
        targetBlockId: z.string().nullable().optional(),
        context: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      await ctx.db.insert(blockRefs).values({
        id: randomUUID(),
        sourceNoteId: input.sourceNoteId,
        targetNoteId: input.targetNoteId,
        targetBlockId: input.targetBlockId,
        context: input.context,
        createdAt: now,
      })
      return { ok: true }
    }),

  deleteBlockRef: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(blockRefs).where(eq(blockRefs.id, input.id)).run()
    return { ok: true }
  }),

  listBlockRefs: publicProcedure
    .input(z.object({ noteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const refs = await ctx.db.select().from(blockRefs).where(eq(blockRefs.targetNoteId, input.noteId)).all()
      if (refs.length === 0) return []
      const sourceIds = [...new Set(refs.map((r) => r.sourceNoteId).filter(Boolean))] as string[]
      const sources = await ctx.db.select({ id: notes.id, title: notes.title }).from(notes).where(inArray(notes.id, sourceIds)).all()
      const sourceTitle = new Map(sources.map((s) => [s.id, s.title]))
      const blockIds = [...new Set(refs.map((r) => r.targetBlockId).filter(Boolean))] as string[]
      const snippets = new Map<string, string>()
      if (blockIds.length) {
        const blocks = await ctx.db.select({ id: noteBlocks.id, chunkContent: noteBlocks.chunkContent }).from(noteBlocks).where(inArray(noteBlocks.id, blockIds)).all()
        for (const b of blocks) snippets.set(b.id, b.chunkContent)
      }
      return refs.map((r) => ({
        ...r,
        sourceNoteTitle: sourceTitle.get(r.sourceNoteId as string) ?? '(无标题)',
        blockSnippet: r.targetBlockId ? snippets.get(r.targetBlockId) : undefined,
      }))
    }),

  getBacklinks: publicProcedure.input(z.object({ noteId: z.string() })).query(async ({ ctx, input }) => {
    const links = await ctx.db
      .select()
      .from(noteLinks)
      .where(eq(noteLinks.targetNoteId, input.noteId))
      .all()
    if (links.length === 0) return []
    const ids = links.map((l) => l.sourceNoteId).filter(Boolean) as string[]
    const sources = await ctx.db
      .select({ id: notes.id, title: notes.title })
      .from(notes)
      .where(inArray(notes.id, ids))
      .all()
    return sources
  }),

  setTags: publicProcedure
    .input(z.object({ noteId: z.string(), tagIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.delete(tagsOnNotes).where(eq(tagsOnNotes.noteId, input.noteId)).run()
      if (input.tagIds.length) {
        await ctx.db.insert(tagsOnNotes).values(input.tagIds.map((tagId) => ({ noteId: input.noteId, tagId, assignedBy: 'manual' as const })))
      }
      return { ok: true }
    }),

  autoProcess: publicProcedure
    .input(
      z.object({
        noteId: z.string(),
        useSummary: z.boolean().default(true),
        useTags: z.boolean().default(true),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(notes).where(eq(notes.id, input.noteId)).get()
      if (!row) return { ok: false, reason: 'note not found' }
      const results: { summary?: string; tags?: string[] } = {}
      const { getActiveProvider } = await import('../llm/provider.js')
      const p = await getActiveProvider(ctx)
      if (!p.ready) return { ok: false, reason: p.reason }

      const clean = (row.content ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
      const { llmChatChatCompletions } = await import('../llm/provider.js')

      // vectorize for RAG (best-effort)
      if (clean.length > 0) {
        try {
          const { embedTexts } = await import('../llm/provider.js')
          const CHUNK = 700
          const chunks: string[] = []
          for (let i = 0; i < clean.length; i += CHUNK) chunks.push(clean.slice(i, i + CHUNK))
          await ctx.db.delete(noteBlocks).where(eq(noteBlocks.noteId, input.noteId)).run()
          const vectors = await embedTexts(ctx, chunks, { task: 'embed' })
          if (vectors.length && vectors[0].length) {
            await ctx.db.insert(noteBlocks).values(
              chunks.map((c, i) => ({
                id: randomUUID(),
                noteId: input.noteId,
                index: i,
                chunkContent: c,
                embedding: Buffer.from(Float64Array.from(vectors[i]).buffer),
                tokenCount: Math.round(c.length / 4),
              })),
            )
          }
        } catch {
          // no provider — skip rag
        }
      }

      if (input.useSummary && clean.length > 0) {
        try {
          const summary = await llmChatChatCompletions(ctx, [
            { role: 'system', content: '为内容生成一句 ≤30字 中文摘要，只输出摘要。' },
            { role: 'user', content: `${row.title}\n${clean.slice(0, 2000)}` },
          ], { maxTokens: 80 })
          if (summary) {
            results.summary = summary
            if (row.summary !== summary) {
              await ctx.db.insert(aiSuggestions).values({
                id: randomUUID(),
                kind: 'summary',
                noteId: input.noteId,
                payload: { summary },
                source: 'auto',
                createdAt: new Date().toISOString(),
              }).run()
            }
          }
        } catch (e) {
          results.summary = undefined
        }
      }

      if (input.useTags) {
        const existingTags = await ctx.db.select({ name: tags.name }).from(tagsOnNotes).innerJoin(tags, eq(tags.id, tagsOnNotes.tagId)).where(eq(tagsOnNotes.noteId, input.noteId)).all()
        const known = await ctx.db.select({ id: tags.id, name: tags.name, slug: tags.slug }).from(tags).all()
        const knownNames = new Set(known.map((t) => t.name.toLowerCase()))
        const already = new Set(existingTags.map((t) => t.name.toLowerCase()))
        try {
          const suggested = await llmChatChatCompletions(ctx, [
            { role: 'system', content: '为内容推荐最多 3 个标签，中文词，用顿号分隔，只输出标签。' },
            { role: 'user', content: `${row.title}\n${clean.slice(0, 2000)}` },
          ], { maxTokens: 60 })
          const parsed = suggested.split(/[、,，\s]+/).map((s) => s.replace(/^#/, '').trim()).filter(Boolean).slice(0, 3)
          const toAdd: { id: string; name: string; slug: string }[] = []
          for (const name of parsed) {
            if (already.has(name.toLowerCase())) continue
            const hit = known.find((t) => t.name.toLowerCase() === name.toLowerCase())
            if (hit) {
              toAdd.push(hit)
              already.add(name.toLowerCase())
            } else {
              const slug = name.toLowerCase().replace(/\s+/g, '-')
              const id = randomUUID()
              const now = new Date().toISOString()
              await ctx.db.insert(tags).values({ id, name, slug, createdAt: now }).onConflictDoNothing().run()
              toAdd.push({ id, name, slug })
              already.add(name.toLowerCase())
            }
          }
          if (toAdd.length > 0) {
            await ctx.db.insert(aiSuggestions).values({
              id: randomUUID(),
              kind: 'tags',
              noteId: input.noteId,
              payload: { tags: toAdd.map((t) => ({ id: t.id, name: t.name })) },
              source: 'auto',
              createdAt: new Date().toISOString(),
            }).run()
          }
          results.tags = toAdd.map((t) => t.name)
        } catch {
          results.tags = undefined
        }
      }
      return { ok: true, results, reviewPending: true }
    }),

  publishParsedLinks: publicProcedure
    .input(
      z.object({
        noteId: z.string(),
        links: z.array(z.object({ targetNoteId: z.string(), context: z.string().optional() })),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      for (const l of input.links) {
        await ctx.db
          .insert(noteLinks)
          .values({
            id: randomUUID(),
            sourceNoteId: input.noteId,
            targetNoteId: l.targetNoteId,
            context: l.context,
            createdAt: now,
          })
          .onConflictDoNothing()
      }
      return { ok: true }
    }),

  getWithDetails: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const row = await ctx.db.select().from(notes).where(eq(notes.id, input.id)).get()
    if (!row) return null

    const rels = await ctx.db
      .select({ tagId: tagsOnNotes.tagId, name: tags.name, color: tags.color })
      .from(tagsOnNotes)
      .innerJoin(tags, eq(tagsOnNotes.tagId, tags.id))
      .where(eq(tagsOnNotes.noteId, input.id))
      .all()

    const backlinks = await ctx.db
      .select({ id: notes.id, title: notes.title })
      .from(noteLinks)
      .innerJoin(notes, eq(notes.id, noteLinks.sourceNoteId))
      .where(eq(noteLinks.targetNoteId, input.id))
      .all()

    const outlinks = await ctx.db
      .select({ id: notes.id, title: notes.title, context: noteLinks.context })
      .from(noteLinks)
      .innerJoin(notes, eq(notes.id, noteLinks.targetNoteId))
      .where(eq(noteLinks.sourceNoteId, input.id))
      .all()

    return {
      note: { ...row, meta: row.meta ?? {} },
      tags: rels.filter((r) => r.tagId).map((r) => ({ id: r.tagId as string, name: r.name, color: r.color })),
      backlinks,
      outlinks,
      blocks: await ctx.db.select().from(noteBlocks).where(eq(noteBlocks.noteId, input.id)).all(),
    }
  }),

  embed: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const p = await getActiveProvider(ctx)
    if (!p.ready) return { ok: false, reason: p.reason }
    const row = await ctx.db.select().from(notes).where(eq(notes.id, input.id)).get()
    if (!row) return { ok: false, reason: 'note not found' }
    const clean = (row.content ?? '').replace(/<[^>]+>/g, ' ').replace(/\[\[|\]\]/g, ' ').replace(/\s+/g, ' ').trim()
    if (!clean) return { ok: false, reason: 'empty content' }

    // chunk into ~700 char windows
    const CHUNK = 700
    const chunks: string[] = []
    for (let i = 0; i < clean.length; i += CHUNK) chunks.push(clean.slice(i, i + CHUNK))
    if (chunks.length === 0) return { ok: false, reason: 'no chunks' }

    await ctx.db.delete(noteBlocks).where(eq(noteBlocks.noteId, input.id)).run()
    const vectors = await embedTexts(ctx, chunks, { task: 'embed' })
    await ctx.db.insert(noteBlocks).values(
      chunks.map((c, i) => ({
        id: randomUUID(),
        noteId: input.id,
        index: i,
        chunkContent: c,
        embedding: Buffer.from(Float64Array.from(vectors[i] ?? []).buffer),
        tokenCount: Math.round(c.length / 4),
      })),
    )
    return { ok: true, chunks: chunks.length, noteTitle: row.title }
  }),

  embedAll: publicProcedure.mutation(async ({ ctx }) => {
    const p = await getActiveProvider(ctx)
    if (!p.ready) return { ok: false, reason: p.reason }
    const all = await ctx.db.select().from(notes).all()
    let embedded = 0
    for (const row of all) {
      const clean = (row.content ?? '').replace(/<[^>]+>/g, ' ').replace(/\[\[|\]\]/g, ' ').replace(/\s+/g, ' ').trim()
      if (!clean) continue
      const CHUNK = 700
      const chunks: string[] = []
      for (let i = 0; i < clean.length; i += CHUNK) chunks.push(clean.slice(i, i + CHUNK))
      if (!chunks.length) continue
      try {
        const vectors = await embedTexts(ctx, chunks, { task: 'embed' })
        await ctx.db.delete(noteBlocks).where(eq(noteBlocks.noteId, row.id)).run()
        await ctx.db.insert(noteBlocks).values(
          chunks.map((c, i) => ({
            id: randomUUID(),
            noteId: row.id,
            index: i,
            chunkContent: c,
            embedding: Buffer.from(Float64Array.from(vectors[i] ?? []).buffer),
            tokenCount: Math.round(c.length / 4),
          })),
        )
        embedded++
      } catch {
        // skip note on failure
      }
    }
    return { ok: true, embedded }
  }),

  search: publicProcedure
    .input(z.object({ query: z.string().min(1).max(500), limit: z.number().int().min(1).max(20).default(8) }))
    .query(async ({ ctx, input }) => {
      const p = await getActiveProvider(ctx)
      const rows = await ctx.db.select().from(notes).all()
      const docs = rows.map((n) => ({ id: n.id, title: n.title, content: n.content ?? '' }))

      // BM25 关键词检索（纯本地，始终可用）
      const bm25Hits = bm25Score(input.query, docs)
      const kwMatches = bm25Hits.slice(0, input.limit)

      if (!p.ready) {
        return {
          source: 'hybrid' as const,
          items: kwMatches.map((m) => ({
            id: m.id,
            title: m.title,
            snippet: stripNote(docs.find((d) => d.id === m.id)?.content ?? ''),
            score: m.bm25,
          })),
        }
      }

      // 语义向量检索
      let semanticRank = new Map<string, number>()
      let semanticScores = new Map<string, number>()
      try {
        const blocks = await ctx.db.select().from(noteBlocks).all()
        const vector = (await embedTexts(ctx, [input.query], { task: 'embed' }))[0]
        if (!vector || vector.length === 0) throw new Error('no query vector')

        const scored: { noteId: string; chunkContent: string; title: string; sim: number }[] = []
        for (const b of blocks) {
          if (!b.embedding) continue
          const buf = b.embedding as unknown as Uint8Array
          const stored = new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
          const vec = Array.from(stored)
          if (vec.length !== vector.length) continue
          const sim = cosineSimilarity(vector, vec)
          const note = rows.find((n) => n.id === b.noteId)
          scored.push({ noteId: b.noteId as string, chunkContent: b.chunkContent, title: note?.title ?? '(无标题)', sim })
        }
        scored.sort((a, b) => b.sim - a.sim)

        const threshold = Math.max(0.15, (scored[0]?.sim ?? 0) * 0.6)
        const above = scored.filter((s) => s.sim >= threshold)
        const perNote = new Map<string, { noteId: string; chunkContent: string; sim: number }>()
        for (const s of above) {
          const cur = perNote.get(s.noteId)
          if (!cur || s.sim > cur.sim) perNote.set(s.noteId, s)
        }
        const noteScores = [...perNote.values()]
        const topBySim = [...noteScores].sort((a, b) => b.sim - a.sim)
        semanticRank = rankByScores(topBySim, (s) => s.sim)
        for (const s of noteScores) semanticScores.set(s.noteId, s.sim)
      } catch {
        // 语义不可用时退回纯 BM25
      }

      // RRF 融合 BM25 与语义排名
      const fused = fuseRanks(bm25Hits, semanticRank, semanticScores).slice(0, input.limit)

      const snippetOf = (id: string, d: SearchableDoc | undefined, fallback: string) =>
        d ? stripNote(d.content) : fallback

      return {
        source: 'hybrid' as const,
        items: fused.map((f) => ({
          id: f.id,
          title: f.title,
          snippet: snippetOf(f.id, docs.find((d) => d.id === f.id), f.snippet),
          score: Math.round(f.score * 1000) / 1000,
        })),
      }
    }),

  related: publicProcedure
    .input(z.object({ noteId: z.string(), limit: z.number().int().min(1).max(10).default(5) }))
    .query(async ({ ctx, input }) => {
      const row = await ctx.db.select().from(notes).where(eq(notes.id, input.noteId)).get()
      if (!row) return { source: 'keyword' as const, items: [] }

      const clean = (row.content ?? '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\[\[|\]\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
      const p = await getActiveProvider(ctx)
      const rows = await ctx.db.select().from(notes).all()

      // semantic: embed up to 3 chunks of the current note, compare against all blocks, exclude self
      if (p.ready && clean.length > 0) {
        try {
          const blocks = await ctx.db.select().from(noteBlocks).all()
          const vecBlocks = blocks.filter((b) => b.embedding && b.noteId !== input.noteId)
          if (vecBlocks.length > 0) {
            const CHUNK = 700
            const chunks: string[] = []
            for (let i = 0; i < clean.length; i += CHUNK) chunks.push(clean.slice(i, i + CHUNK))
            const vectors = await embedTexts(ctx, chunks.slice(0, 3), { task: 'embed' })
            if (vectors.some((v) => v.length > 0)) {
              const scored = new Map<string, { noteId: string; chunkContent: string; title: string; sim: number }>()
              for (const v of vectors) {
                if (!v.length) continue
                for (const b of vecBlocks) {
                  const buf = b.embedding as unknown as Uint8Array
                  const stored = new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
                  const vec = Array.from(stored)
                  if (vec.length !== v.length) continue
                  const sim = cosineSimilarity(v, vec)
                  const note = rows.find((n) => n.id === b.noteId)
                  const prev = scored.get(b.noteId as string)
                  if (!prev || sim > prev.sim) {
                    scored.set(b.noteId as string, { noteId: b.noteId as string, chunkContent: b.chunkContent, title: note?.title ?? '(无标题)', sim })
                  }
                }
              }
              const list = [...scored.values()].sort((a, b) => b.sim - a.sim).slice(0, input.limit)
              if (list[0]?.sim && list[0].sim > 0.15) {
                return {
                  source: 'semantic' as const,
                  items: list.map((s) => ({ id: s.noteId, title: s.title, snippet: s.chunkContent, score: Math.round(s.sim * 1000) / 1000, source: 'semantic' as const })),
                }
              }
            }
          }
        } catch {
          // fall through to keyword
        }
      }

      // keyword fallback: match against title words / content
      const words = `${row.title ?? ''} ${clean}`.split(/\s+/).filter((w) => w.length >= 2).slice(0, 6)
      const kwMatches = rows
        .filter((n) => n.id !== input.noteId)
        .map((n) => {
          const hay = `${n.title ?? ''} ${n.content ?? ''}`.toLowerCase()
          let score = 0
          for (const w of words) {
            if (w && hay.includes(w.toLowerCase())) score += w.length
          }
          return score > 0 ? { id: n.id, title: n.title, snippet: stripNote(n.content), score } : null
        })
        .filter((x): x is NonNullable<typeof x> => x !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, input.limit)
      return { source: 'keyword' as const, items: kwMatches.map((m) => ({ ...m, source: 'keyword' as const })) }
    }),
})

function stripNote(s: string) {
  return (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160)
}

export type NoteRouter = typeof noteRouter