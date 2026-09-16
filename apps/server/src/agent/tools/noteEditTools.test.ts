import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../lib/bm25Index.js', () => ({
  noteBm25Index: { upsert: vi.fn(() => true), invalidate: vi.fn(), search: vi.fn(() => null) },
}))

import { listRegisteredTools } from '../registry.js'
import './noteTools.js'

const getTool = (name: string) => listRegisteredTools().find((t) => t.name === name)!

const data: { notes: any[] } = { notes: [] }
const mockDb: any = {
  select: () => ({
    from: () => ({
      where: () => ({
        get: async () => data.notes[0] ?? null,
      }),
      all: async () => data.notes,
    }),
  }),
  update: () => ({
    set: (patch: any) => ({ where: () => ({ run: async () => { Object.assign(data.notes[0] ?? {}, patch) } }) }),
  }),
  insert: () => ({ values: async (v: any) => { data.notes.push(...(Array.isArray(v) ? v : [v])) } }),
}
const ctx: any = { db: mockDb, threadId: 't', requestId: 'r', emit: () => {} }

describe('noteTools: edit_note / append_note', () => {
  beforeEach(() => { data.notes = []; vi.clearAllMocks() })

  it('edit_note 覆盖标题+正文，需审批', async () => {
    data.notes = [{ id: 'n1', title: '旧', content: '旧正文' }]
    const t = getTool('edit_note')
    expect(t.meta.requireApproval).toBe(true)
    const r = JSON.parse(await t.handler({ id: 'n1', title: '新标题', content: '新正文' }, ctx))
    expect(r.ok).toBe(true)
    expect(data.notes[0].title).toBe('新标题')
    expect(data.notes[0].content).toBe('新正文')
  })

  it('edit_note 笔记不存在返回 error', async () => {
    const t = getTool('edit_note')
    const r = JSON.parse(await t.handler({ id: 'nope', content: 'x' }, ctx))
    expect(r.error).toBe('笔记不存在')
  })

  it('append_note 追加不覆盖原文', async () => {
    data.notes = [{ id: 'n1', title: 'T', content: '原文' }]
    const t = getTool('append_note')
    expect(t.meta.requireApproval).toBe(true)
    const r = JSON.parse(await t.handler({ id: 'n1', content: '补充段' }, ctx))
    expect(r.ok).toBe(true)
    expect(data.notes[0].content).toBe('原文\n\n补充段')
    expect(r.charCount).toBe('原文\n\n补充段'.length)
  })

  it('append_note 不存在返回 error', async () => {
    const t = getTool('append_note')
    const r = JSON.parse(await t.handler({ id: 'x', content: 'y' }, ctx))
    expect(r.error).toBe('笔记不存在')
  })
})
