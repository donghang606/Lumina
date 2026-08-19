import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { notes, collections, tags, tagsOnNotes } from '../db/schema.js'
import { randomUUID, createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { collectDocument } from '../lib/collector/index.js'

function stripHtml(s: string) {
  return (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

export interface CollectInput {
  url: string
  title?: string
  content?: string
  html?: string
  siteName?: string
  favicon?: string
  note?: string
  tag?: string
  summary?: boolean
}

export async function doCollect(ctx: { db: typeof import('../db/client.js').db }, input: CollectInput): Promise<{ ok: boolean; duplicate: boolean; noteId: string }> {
  const now = new Date().toISOString()

  // Parse document (HTML → markdown) via the pluggable collector; fall back to raw text
  const parsed = await collectDocument({ url: input.url, html: input.html, text: input.content })
  const bodyText = parsed.content
  const finalTitle = input.title?.trim() || parsed.title || hostOf(input.url)

  // 内容指纹去重：同 URL 或内容 hash 命中即视为重复（KnowMe 借鉴）
  const contentHash = createHash('md5').update(bodyText || '').digest('hex')

  const existing = await ctx.db.select({ noteId: collections.noteId }).from(collections).where(eq(collections.url, input.url)).get()
  const existingNote = existing?.noteId
    ? await ctx.db.select().from(notes).where(eq(notes.id, existing.noteId)).get()
    : null
  if (existingNote) {
    return { ok: true, duplicate: true, noteId: existingNote.id }
  }

  if (bodyText) {
    const dupByHash = await ctx.db.select({ noteId: collections.noteId }).from(collections).where(eq(collections.contentHash, contentHash)).get()
    const dupNote = dupByHash?.noteId
      ? await ctx.db.select().from(notes).where(eq(notes.id, dupByHash.noteId)).get()
      : null
    if (dupNote) {
      return { ok: true, duplicate: true, noteId: dupNote.id }
    }
  }

  // Create a bookmark note
  const id = randomUUID()
  const host = hostOf(input.url)
  const body = [
    input.note?.trim() ? `> 备注：${input.note.trim()}` : '',
    bodyText,
  ].filter(Boolean).join('\n\n')

  await ctx.db.insert(notes).values({
    id,
    title: finalTitle,
    content: body,
    type: 'bookmark',
    summary: null,
    status: 'draft',
    meta: {
      sourceUrl: input.url,
      siteName: input.siteName ?? parsed.siteName ?? host,
      favicon: input.favicon ?? null,
    },
    createdAt: now,
    updatedAt: now,
  })

  await ctx.db.insert(collections).values({
    id: randomUUID(),
    url: input.url,
    title: finalTitle,
    description: stripHtml(bodyText).slice(0, 240) || null,
    siteName: input.siteName ?? parsed.siteName ?? null,
    favicon: input.favicon ?? null,
    content: bodyText,
    contentHash,
    noteId: id,
    collectedAt: now,
  })

  if (input.tag) {
    await assignDefaultTag(ctx, id, input.tag)
  }

  if (input.summary) {
    await generateSummary(ctx, id, finalTitle, bodyText)
  }

  return { ok: true, duplicate: false, noteId: id }
}

async function assignDefaultTag(ctx: { db: typeof import('../db/client.js').db }, noteId: string, name: string) {
  const slug = name.toLowerCase().trim().replace(/\s+/g, '-')
  const existing = await ctx.db.select().from(tags).where(eq(tags.slug, slug)).get()
  const tagId = existing?.id ?? randomUUID()
  if (!existing) {
    await ctx.db.insert(tags).values({ id: tagId, name: name.trim(), slug, createdAt: new Date().toISOString() }).run()
  }
  await ctx.db.insert(tagsOnNotes).values({ noteId, tagId, assignedBy: 'manual' }).onConflictDoNothing().run()
}

async function generateSummary(ctx: { db: typeof import('../db/client.js').db }, noteId: string, title: string, content: string) {
  try {
    const clean = stripHtml(content).slice(0, 2000)
    if (!clean) return
    const { getActiveProvider, llmChatChatCompletions } = await import('../llm/provider.js')
    const p = await getActiveProvider(ctx as any)
    if (!p.ready) return
    const summary = await llmChatChatCompletions(ctx as any, [
      { role: 'system', content: '为内容生成一句 ≤30字 中文摘要，只输出摘要。' },
      { role: 'user', content: `${title}\n${clean}` },
    ], { maxTokens: 80 })
    if (summary) {
      await ctx.db.update(notes).set({ summary }).where(eq(notes.id, noteId)).run()
    }
  } catch {
    // best-effort
  }
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export const extensionRouter = router({
  collect: publicProcedure
    .input(
      z.object({
        url: z.string().url(),
        title: z.string().default(''),
        content: z.string().optional(),
        html: z.string().optional(),
        siteName: z.string().optional(),
        favicon: z.string().optional(),
        note: z.string().optional(),
        tag: z.string().optional(),
        summary: z.boolean().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      return doCollect(ctx, { ...input, note: input.note })
    }),
  listCollections: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(collections).orderBy(collections.collectedAt).all()
  }),

  deleteCollection: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(collections).where(eq(collections.id, input.id)).run()
    return { ok: true }
  }),
})

export type ExtensionRouter = typeof extensionRouter