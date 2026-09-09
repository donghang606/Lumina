import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { eq, desc } from 'drizzle-orm'
import { notes, fileIngests } from '../db/schema.js'
import { getActiveProvider, embedTexts } from '../llm/provider.js'
import { extractFileText, isSupportedFile, SUPPORTED_EXTS } from '../lib/fileLoaders.js'
import { deleteNoteChunks } from '../lib/vectorstore.js'
import { indexNoteChunks } from './note.js'

type Db = typeof import('../db/client.js').db

/** 700 字符滑窗分块（与笔记索引一致）。 */
function chunkText(text: string, size = 700): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

interface IngestOutcome {
  ok: boolean
  skipped?: boolean
  noteId?: string | null
  charCount?: number
  chunks?: number
  reason?: string
}

/** 单文件导入核心（router 与目录扫描共用）。 */
async function doIngestFile(db: Db, absPath: string, skipDup: boolean): Promise<IngestOutcome> {
  if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) return { ok: false, reason: '文件不存在' }
  if (!isSupportedFile(absPath)) return { ok: false, reason: `不支持的类型（支持：${SUPPORTED_EXTS.join('/')}）` }

  const buf = await fsp.readFile(absPath)
  const hash = createHash('md5').update(buf).digest('hex')
  const existing = await db.select().from(fileIngests).where(eq(fileIngests.filePath, absPath)).get()
  if (skipDup && existing && existing.contentHash === hash) {
    return { ok: true, skipped: true, noteId: existing.noteId }
  }

  const p = await getActiveProvider({ db } as never, 'embed')
  if (!p.ready) return { ok: false, reason: `需要可用的 embedding Provider：${p.reason ?? p.name}` }

  const text = await extractFileText(absPath)
  const clean = text.replace(/\s+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  if (!clean) return { ok: false, reason: '未提取到文本' }

  const now = new Date().toISOString()
  const fileName = path.basename(absPath)
  const noteId = existing?.noteId ?? randomUUID()

  if (existing?.noteId) {
    await db.update(notes).set({ content: clean, title: fileName, updatedAt: now }).where(eq(notes.id, existing.noteId)).run()
  } else {
    await db.insert(notes).values({
      id: noteId,
      title: fileName,
      content: clean,
      type: 'file',
      status: 'draft',
      meta: { sourcePath: absPath, charCount: clean.length },
      createdAt: now,
      updatedAt: now,
    })
  }

  const chunks = chunkText(clean)
  let embedded = 0
  try {
    const vectors = await embedTexts({ db } as never, chunks, { task: 'embed' })
    await indexNoteChunks({ db }, noteId, chunks, vectors)
    embedded = chunks.length
  } catch {
    // 嵌入失败仍保留笔记文本（BM25 可检索）
  }

  const record = {
    id: existing?.id ?? randomUUID(),
    filePath: absPath,
    fileName,
    ext: path.extname(absPath).toLowerCase().slice(1),
    contentHash: hash,
    charCount: String(clean.length),
    noteId,
    ingestedAt: now,
  }
  if (existing) {
    await db.update(fileIngests).set(record).where(eq(fileIngests.id, existing.id)).run()
  } else {
    await db.insert(fileIngests).values(record).run()
  }

  return { ok: true, skipped: false, noteId, charCount: clean.length, chunks: embedded }
}

/**
 * 本地文件导入：提取文本 → 建笔记（type=file）→ 嵌入双写索引。
 * - 增量：同路径 hash 未变跳过；变化则更新笔记并重建索引
 * - 移除：删笔记 + 记录 + 各维度 Zvec 清理
 */
export const ingestRouter = router({
  ingestFile: publicProcedure
    .input(z.object({ filePath: z.string().min(1), skipDup: z.boolean().optional().default(true) }))
    .mutation(async ({ ctx, input }) => doIngestFile(ctx.db, path.resolve(input.filePath), input.skipDup)),

  /** 扫描目录（跳过隐藏目录）：只处理支持类型，逐文件增量。 */
  ingestDirectory: publicProcedure
    .input(z.object({ dirPath: z.string().min(1), maxFiles: z.number().int().min(1).max(2000).optional().default(500) }))
    .mutation(async ({ ctx, input }) => {
      const abs = path.resolve(input.dirPath)
      if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) return { ok: false, reason: '目录不存在', total: 0, imported: 0, skipped: 0, failed: 0, results: [] }

      const files: string[] = []
      const walk = (dir: string) => {
        if (files.length >= (input.maxFiles ?? 500)) return
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (files.length >= (input.maxFiles ?? 500)) break
          if (entry.name.startsWith('.')) continue
          const full = path.join(dir, entry.name)
          if (entry.isDirectory()) walk(full)
          else if (isSupportedFile(entry.name)) files.push(full)
        }
      }
      walk(abs)

      const results: { file: string; ok: boolean; skipped?: boolean; reason?: string }[] = []
      for (const file of files) {
        try {
          const r = await doIngestFile(ctx.db, file, true)
          results.push({ file: path.basename(file), ok: r.ok, skipped: r.skipped, reason: r.reason })
        } catch (e) {
          results.push({ file: path.basename(file), ok: false, reason: e instanceof Error ? e.message : String(e) })
        }
      }
      return {
        ok: true,
        total: results.length,
        imported: results.filter((r) => r.ok && !r.skipped).length,
        skipped: results.filter((r) => r.skipped).length,
        failed: results.filter((r) => !r.ok).length,
        results,
      }
    }),

  list: publicProcedure.query(async ({ ctx }) => {
    return await ctx.db.select().from(fileIngests).orderBy(desc(fileIngests.ingestedAt)).limit(500).all()
  }),

  remove: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const row = await ctx.db.select().from(fileIngests).where(eq(fileIngests.id, input.id)).get()
    if (!row) return { ok: false, reason: '记录不存在' }
    const { listDimensions } = await import('../lib/vectorstore.js')
    for (const dim of listDimensions()) {
      try {
        deleteNoteChunks(dim, row.noteId ?? '')
      } catch {
        /* 该维度不可用 */
      }
    }
    if (row.noteId) await ctx.db.delete(notes).where(eq(notes.id, row.noteId)).run()
    await ctx.db.delete(fileIngests).where(eq(fileIngests.id, input.id)).run()
    return { ok: true }
  }),
})