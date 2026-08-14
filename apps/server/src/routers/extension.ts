import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { notes, collections } from '../db/schema.js'
import { randomUUID } from 'node:crypto'
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
}

export async function doCollect(ctx: { db: typeof import('../db/client.js').db }, input: CollectInput): Promise<{ ok: boolean; duplicate: boolean; noteId: string }> {
  const now = new Date().toISOString()

  // Dedupe: same URL already collected?
  const existing = await ctx.db.select({ noteId: collections.noteId }).from(collections).where(eq(collections.url, input.url)).get()
  const existingNote = existing?.noteId
    ? await ctx.db.select().from(notes).where(eq(notes.id, existing.noteId)).get()
    : null
  if (existingNote) {
    return { ok: true, duplicate: true, noteId: existingNote.id }
  }

  // Parse document (HTML → markdown) via the pluggable collector; fall back to raw text
  const parsed = await collectDocument({ url: input.url, html: input.html, text: input.content })
  const bodyText = parsed.content
  const finalTitle = input.title?.trim() || parsed.title || hostOf(input.url)

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
    noteId: id,
    collectedAt: now,
  })

  return { ok: true, duplicate: false, noteId: id }
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