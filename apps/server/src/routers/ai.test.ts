import { describe, it, expect, vi } from 'vitest'
import { aiRouter } from './ai.js'

function createMockDb() {
  const getQueue: unknown[] = []
  const allQueue: unknown[] = []
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    asc: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    get: vi.fn(() => getQueue.shift() ?? null),
    all: vi.fn(() => Promise.resolve(allQueue.shift() ?? [])),
    insert: vi.fn(() => ({
      values: () => Promise.resolve({}),
      run: vi.fn().mockResolvedValue({}),
    })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })),
  }
  return { db, getQueue, allQueue }
}

function caller(db: any) {
  return aiRouter.createCaller({ db, req: {} as any, res: {} as any })
}

describe('aiRouter.chat', () => {
  it('returns structured sources from keyword fallback when provider is not configured', async () => {
    const { db, getQueue, allQueue } = createMockDb()

    // getActiveProvider: settings.get → null (no conf)
    getQueue.push(null)
    // active provider scan → none
    allQueue.push([])
    // conversation history → empty
    allQueue.push([])
    // semantic retrieval: notes → [], noteBlocks → []
    allQueue.push([])
    allQueue.push([])
    // keyword fallback hits
    allQueue.push([
      { id: 'n1', title: 'Lumina 架构', content: '<p>本地优先的个人知识库</p>' },
    ])

    const result = await caller(db).chat({ message: '什么是 Lumina？' })

    expect(result.conversationId).toBeTruthy()
    expect(result.source).toBe('fallback')
    expect(result.sources).toBeDefined()
    expect(result.sources).toHaveLength(1)
    expect(result.sources?.[0]).toMatchObject({ noteId: 'n1', title: 'Lumina 架构' })
    expect(typeof result.sources?.[0].score).toBe('number')
  })
})
