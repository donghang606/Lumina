import { z } from 'zod'
import { eq, desc } from 'drizzle-orm'
import { fileIngests, notes } from '../../db/schema.js'
import { deleteNoteChunks, listDimensions } from '../../lib/vectorstore.js'
import { noteBm25Index } from '../../lib/bm25Index.js'
import { doIngestFile } from '../../routers/ingest.js'
import { registerTool } from '../registry.js'

registerTool({
  name: 'ingest_file',
  description:
    '导入本地文件到知识库（提取文本→建 type=file 笔记→分块向量化双写）。支持 PDF/Word/Excel/PPT/EPUB/MD/TXT。重复导入同文件无变化则跳过；变化则更新。需审批。',
  schema: z.object({
    filePath: z.string().describe('本地文件绝对路径'),
  }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    const result = await doIngestFile(ctx.db, String(args.filePath), true)
    return JSON.stringify(result)
  },
})

registerTool({
  name: 'list_ingests',
  description: '列出已导入的文件记录（路径/文件名/字符数/导入时间），按时间倒序。',
  schema: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('条数，默认 20'),
  }),
  meta: {},
  handler: async (args, ctx) => {
    const limit = (args.limit as number) ?? 20
    const rows = await ctx.db.select().from(fileIngests).orderBy(desc(fileIngests.ingestedAt)).limit(limit).all()
    return JSON.stringify({
      count: rows.length,
      items: rows.map((r) => ({
        id: r.id,
        filePath: r.filePath,
        fileName: r.fileName,
        ext: r.ext,
        charCount: Number(r.charCount),
        noteId: r.noteId,
        ingestedAt: r.ingestedAt,
      })),
    })
  },
})

registerTool({
  name: 'remove_ingest',
  description: '删除一条导入记录及其关联笔记（同步清理 Zvec 全维度块）。需审批。',
  schema: z.object({ id: z.string().describe('导入记录 id') }),
  meta: { requireApproval: true },
  handler: async (args, ctx) => {
    const id = String(args.id)
    const row = await ctx.db.select().from(fileIngests).where(eq(fileIngests.id, id)).get()
    if (!row) return JSON.stringify({ error: '记录不存在' })

    // 清理 Zvec 全维度
    if (row.noteId) {
      try {
        for (const dim of listDimensions()) {
          try { deleteNoteChunks(dim, row.noteId) } catch { /* 维度不可用 */ }
        }
      } catch { /* zvec 不可用 */ }
      await ctx.db.delete(notes).where(eq(notes.id, row.noteId)).run()
      if (!noteBm25Index.removeDoc(row.noteId)) noteBm25Index.invalidate()
    }
    await ctx.db.delete(fileIngests).where(eq(fileIngests.id, id)).run()
    return JSON.stringify({ ok: true })
  },
})
