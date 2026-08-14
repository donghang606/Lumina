import { describe, it, expect, vi } from 'vitest'
import { noteRouter } from './note.js'

function createMockDb() {
  const getQueue: unknown[] = []
  const allQueue: unknown[] = []
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(() => getQueue.shift() ?? null),
    all: vi.fn(() => Promise.resolve(allQueue.shift() ?? [])),
    insert: vi.fn(() => ({ values: () => Promise.resolve({}), run: vi.fn().mockResolvedValue({}) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })),
  }
  return { db, getQueue, allQueue }
}

function caller(db: any) {
  return noteRouter.createCaller({ db, req: {} as any, res: {} as any })
}

describe('noteRouter.related', () => {
  it('returns empty list when note not found', async () => {
    const { db, getQueue } = createMockDb()
    getQueue.push(null)
    const result = await caller(db).related({ noteId: 'nope' })
    expect(result.items).toEqual([])
  })

  it('falls back to keyword matches excluding self', async () => {
    const { db, getQueue, allQueue } = createMockDb()

    // current note (noteId lookup)
    getQueue.push({ id: 'me', title: 'Lumina 架构', content: '本地优先的个人知识库 语义检索 向量化' })
    // getActiveProvider: settings → null, active provider scan → none (not ready)
    getQueue.push(null)
    allQueue.push([])
    // rows (all notes)
    allQueue.push([
      { id: 'me', title: 'Lumina 架构', content: '本地优先的个人知识库' },
      { id: 'o1', title: '向量化笔记', content: '关于语义检索和向量嵌入的实现' },
      { id: 'o2', title: '购物清单', content: '牛奶 面包 鸡蛋' },
    ])

    const result = await caller(db).related({ noteId: 'me', limit: 5 })
    expect(result.source).toBe('keyword')
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('o1')
    expect(result.items[0].source).toBe('keyword')
    expect(result.items[0].score).toBeGreaterThan(0)
  })
})