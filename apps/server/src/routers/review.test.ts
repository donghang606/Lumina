import { describe, it, expect, vi } from 'vitest'
import { reviewRouter } from './review.js'

function createMockDb() {
  const inserted: Record<string, unknown[]> = {}
  const updated: Record<string, unknown[]> = {}
  const rowQueue: unknown[] = []
  const selectChain = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    leftJoin: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    all: vi.fn(async () => []),
    where: vi.fn(() => ({
      get: vi.fn(() => rowQueue.shift() ?? null),
      run: vi.fn().mockResolvedValue({}),
      orderBy: vi.fn(() => ({ all: selectChain.all })),
      all: selectChain.all,
    })),
  }

  const db: any = {
    select: selectChain.select,
    from: selectChain.from,
    leftJoin: selectChain.leftJoin,
    orderBy: selectChain.orderBy,
    all: selectChain.all,
    where: selectChain.where,
    insert: (t: any) => {
      const table = t?.[Symbol.for('drizzle:Name')] ?? 'unknown'
      return {
        values: (v: Record<string, unknown>) => {
          ;(inserted[table] ??= []).push(v)
          return { run: vi.fn().mockResolvedValue({}), onConflictDoNothing: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }) }
        },
      }
    },
    update: vi.fn((t: any) => {
      const table = t?.[Symbol.for('drizzle:Name')] ?? 'unknown'
      return {
        set: (v: Record<string, unknown>) => {
          ;(updated[table] ??= []).push(v)
          return { where: vi.fn(() => ({ run: vi.fn().mockResolvedValue({}) })) }
        },
      }
    }),
  }
  return { db, inserted, updated, rowQueue }
}

function caller(db: any) {
  return reviewRouter.createCaller({ db, req: {} as any, res: {} as any })
}

describe('reviewRouter', () => {
  it('list 只返回 pending 建议', async () => {
    const { db } = createMockDb()
    db.all.mockResolvedValueOnce([
      { id: 's1', kind: 'summary', noteId: 'n1', payload: { summary: 'x' }, status: 'pending', source: 'auto', createdAt: '2026-01-01', noteTitle: '笔记' },
    ])
    const res = await caller(db).list()
    expect(res).toHaveLength(1)
    expect(res[0].noteTitle).toBe('笔记')
  })

  it('accept summary 更新笔记摘要并置为 applied', async () => {
    const { db, updated, rowQueue } = createMockDb()
    rowQueue.push({ id: 's1', kind: 'summary', noteId: 'n1', payload: { summary: '新摘要' }, status: 'pending', source: 'auto', createdAt: '2026-01-01' })
    const res = await caller(db).accept({ id: 's1' })
    expect(res.ok).toBe(true)
    expect(updated.notes?.[0]).toMatchObject({ summary: '新摘要' })
    expect(updated.ai_suggestions?.[0]).toMatchObject({ status: 'applied' })
  })

  it('accept tags 关联标签', async () => {
    const { db, updated, inserted, rowQueue } = createMockDb()
    rowQueue.push({ id: 's2', kind: 'tags', noteId: 'n1', payload: { tags: [{ id: 't1', name: '工作' }] }, status: 'pending', source: 'auto', createdAt: '2026-01-01' })
    const res = await caller(db).accept({ id: 's2' })
    expect(res.ok).toBe(true)
    expect(inserted.tags_on_notes?.[0]).toMatchObject({ noteId: 'n1', tagId: 't1' })
    expect(updated.ai_suggestions?.[0]).toMatchObject({ status: 'applied' })
  })

  it('accept note 创建草稿笔记', async () => {
    const { db, inserted, rowQueue } = createMockDb()
    rowQueue.push({ id: 's3', kind: 'note', noteId: null, payload: { title: 'MCP 笔记', content: '正文', tags: ['AI'] }, status: 'pending', source: 'mcp', createdAt: '2026-01-01' })
    const res = await caller(db).accept({ id: 's3' })
    expect(res.ok).toBe(true)
    expect(inserted.notes?.[0]).toMatchObject({ title: 'MCP 笔记', type: 'card', status: 'draft' })
    expect(inserted.tags?.[0]).toMatchObject({ name: 'AI' })
  })

  it('reject 置为 rejected；非 pending 不允许 accept', async () => {
    const { db, updated, rowQueue } = createMockDb()
    await caller(db).reject({ id: 's4' })
    expect(updated.ai_suggestions?.[0]).toMatchObject({ status: 'rejected' })

    rowQueue.push({ id: 's5', kind: 'summary', noteId: 'n1', payload: {}, status: 'applied', source: 'auto', createdAt: '2026-01-01' })
    const res = await caller(db).accept({ id: 's5' })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('already processed')
  })
})