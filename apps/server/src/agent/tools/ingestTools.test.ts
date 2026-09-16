import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../routers/ingest.js', () => ({
  doIngestFile: vi.fn(async () => ({ ok: true, skipped: false, noteId: 'n-new', charCount: 1200, chunks: 3 })),
}))
vi.mock('../../lib/vectorstore.js', () => ({
  deleteNoteChunks: vi.fn(),
  listDimensions: vi.fn(() => [1536]),
}))
vi.mock('../../lib/bm25Index.js', () => ({
  noteBm25Index: { removeDoc: vi.fn(() => true), invalidate: vi.fn() },
}))

import { registerTool } from '../registry.js'
import './ingestTools.js'

const findTool = (name: string) => registerTool.length // placeholder

// 直接从 registry 拿已注册工具
async function getTool(name: string) {
  const { listRegisteredTools } = await import('../registry.js')
  return listRegisteredTools().find((t) => t.name === name)!
}

const mockDb: any = {
  select: () => ({
    from: () => ({
      where: () => ({ get: async () => null }),
      orderBy: () => ({ limit: () => ({ all: async () => [] }) }),
    }),
  }),
  delete: () => ({ where: () => ({ run: async () => {} }) }),
}
const ctx: any = { db: mockDb, threadId: 't1', requestId: 'r1', emit: () => {} }

describe('ingestTools', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ingest_file 调 doIngestFile 并返回结果', async () => {
    const t = await getTool('ingest_file')
    expect(t.meta.requireApproval).toBe(true)
    const r = JSON.parse(await t.handler({ filePath: '/tmp/x.pdf' }, ctx))
    expect(r.ok).toBe(true)
    expect(r.noteId).toBe('n-new')
    const { doIngestFile } = await import('../../routers/ingest.js')
    expect(doIngestFile).toHaveBeenCalledWith(mockDb, '/tmp/x.pdf', true)
  })

  it('list_ingests 返回空列表结构', async () => {
    const t = await getTool('list_ingests')
    expect(t.meta.requireApproval).toBeFalsy()
    const r = JSON.parse(await t.handler({}, ctx))
    expect(r.count).toBe(0)
    expect(r.items).toEqual([])
  })

  it('remove_ingest 记录不存在返回 error', async () => {
    const t = await getTool('remove_ingest')
    expect(t.meta.requireApproval).toBe(true)
    const r = JSON.parse(await t.handler({ id: 'nope' }, ctx))
    expect(r.error).toBe('记录不存在')
  })
})
