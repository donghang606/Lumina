import { describe, it, expect, vi } from 'vitest'
import { tagRouter } from './tag.js'

function createMockDb() {
  const orderSets: number[] = []
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn(() => null),
    all: vi.fn(async () => []),
    insert: vi.fn(() => ({ values: vi.fn(() => Promise.resolve({})) })),
    update: vi.fn(() => ({
      set: (set: Record<string, unknown>) => ({
        where: () => {
          if ('order' in set) orderSets.push(set.order as number)
          return { run: vi.fn().mockResolvedValue({}) }
        },
      }),
    })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })),
  }
  return { db, orderSets }
}

describe('tagRouter.reorder', () => {
  it('插入到 beforeId 之前并重排同层 order', async () => {
    const { db, orderSets } = createMockDb()
    db.all.mockImplementation(async () => [
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
      { id: 'c', order: 2 },
    ])
    const caller = tagRouter.createCaller({ db, req: {} as any, res: {} as any })
    const result = await caller.reorder({ id: 'c', parentId: null, beforeId: 'a' })
    expect(result.ok).toBe(true)
    // 目标顺序 c,a,b → order 依次 0,1,2
    expect(orderSets).toEqual([0, 1, 2])
  })

  it('beforeId 为 null 时追加到末尾', async () => {
    const { db, orderSets } = createMockDb()
    db.all.mockImplementation(async () => [
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
    ])
    const caller = tagRouter.createCaller({ db, req: {} as any, res: {} as any })
    const result = await caller.reorder({ id: 'b', parentId: null, beforeId: null })
    expect(result.ok).toBe(true)
    expect(orderSets).toEqual([0, 1])
  })

  it('拒绝把自己设为父级或移动到自身', async () => {
    const { db } = createMockDb()
    const caller = tagRouter.createCaller({ db, req: {} as any, res: {} as any })
    expect((await caller.reorder({ id: 'x', parentId: 'x', beforeId: null })).ok).toBe(false)
    expect((await caller.reorder({ id: 'x', parentId: null, beforeId: 'x' })).ok).toBe(false)
  })
})