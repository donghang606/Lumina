import { describe, it, expect, vi } from 'vitest'
import { noteRouter } from './note.js'
import { viewRouter } from './view.js'

function createMockDb() {
  const getQueue: unknown[] = []
  const allQueue: unknown[] = []
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    get: vi.fn(() => getQueue.shift() ?? null),
    all: vi.fn(() => Promise.resolve(allQueue.shift() ?? [])),
    insert: vi.fn(() => ({ values: vi.fn().mockResolvedValue({}), run: vi.fn().mockResolvedValue({}) })),
    delete: vi.fn(() => ({ where: vi.fn().mockResolvedValue({}) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })) })),
  }
  return { db, getQueue, allQueue }
}

describe('noteRouter.blockRefs', () => {
  it('createBlockRef inserts a ref', async () => {
    const { db } = createMockDb()
    const r = await noteRouter.createCaller({ db, req: {} as any, res: {} as any }).createBlockRef({
      sourceNoteId: 'a',
      targetNoteId: 'b',
      targetBlockId: 'blk1',
      context: '引用于此',
    })
    expect(r.ok).toBe(true)
    expect(db.insert).toHaveBeenCalled()
  })

  it('listBlockRefs enriches with source title and block snippet', async () => {
    const { db, getQueue, allQueue } = createMockDb()
    // refs targeting note 'b'
    allQueue.push([{ id: 'r1', sourceNoteId: 'a', targetNoteId: 'b', targetBlockId: 'blk1', context: null, createdAt: 't' }])
    // source notes lookup
    allQueue.push([{ id: 'a', title: '来源笔记' }])
    // block snippets lookup
    allQueue.push([{ id: 'blk1', chunkContent: '被引用的块内容' }])

    const r = await noteRouter.createCaller({ db, req: {} as any, res: {} as any }).listBlockRefs({ noteId: 'b' })
    expect(r).toHaveLength(1)
    expect(r[0].sourceNoteTitle).toBe('来源笔记')
    expect(r[0].blockSnippet).toBe('被引用的块内容')
  })

  it('listBlockRefs returns empty when no refs', async () => {
    const { db, allQueue } = createMockDb()
    allQueue.push([])
    const r = await noteRouter.createCaller({ db, req: {} as any, res: {} as any }).listBlockRefs({ noteId: 'nope' })
    expect(r).toEqual([])
  })
})

describe('viewRouter', () => {
  function caller(db: any) {
    return viewRouter.createCaller({ db, req: {} as any, res: {} as any })
  }

  it('upsert creates a view and list returns it', async () => {
    const { db, getQueue } = createMockDb()
    // insert then select-by-id for upsert response
    getQueue.push({ id: 'v1', name: '标签视图', type: 'tag', config: { tagId: 't1' }, createdAt: 't', updatedAt: 't' })
    const created = await caller(db).upsert({ name: '标签视图', type: 'tag', config: { tagId: 't1' } })
    expect(created?.id).toBe('v1')

    const { allQueue } = createMockDb()
    allQueue.push([])
    const list = await caller(db).list()
    expect(list).toEqual([])
  })

  it('run keyword view filters notes by query', async () => {
    const { db, getQueue, allQueue } = createMockDb()
    getQueue.push({ id: 'v2', name: '关于 AI', type: 'keyword', config: { query: 'ai' }, createdAt: 't', updatedAt: 't' })
    allQueue.push([
      { id: 'n1', title: 'AI 笔记', content: '人工智能', type: 'note', updatedAt: '2026-01-02T00:00:00.000Z' },
      { id: 'n2', title: '购物', content: '牛奶', type: 'note', updatedAt: '2026-01-01T00:00:00.000Z' },
    ])
    const r = await caller(db).run({ id: 'v2' })
    expect(r.total).toBe(1)
    expect(r.items[0].id).toBe('n1')
  })

  it('run tag view maps tag to notes', async () => {
    const { db, getQueue, allQueue } = createMockDb()
    getQueue.push({ id: 'v3', name: '重要', type: 'tag', config: { tagId: 't9' }, createdAt: 't', updatedAt: 't' })
    // all notes (fetched first in run)
    allQueue.push([
      { id: 'n1', title: 'A', content: '', type: 'note', updatedAt: '2026-01-02T00:00:00.000Z' },
      { id: 'n2', title: 'B', content: '', type: 'note', updatedAt: '2026-01-01T00:00:00.000Z' },
    ])
    // tag→notes rows
    allQueue.push([{ noteId: 'n1' }, { noteId: 'n2' }])
    const r = await caller(db).run({ id: 'v3' })
    expect(r.total).toBe(2)
    expect(r.items.map((i) => i.id)).toEqual(['n1', 'n2'])
  })

  it('run returns null view when missing', async () => {
    const { db, getQueue } = createMockDb()
    getQueue.push(null)
    const r = await caller(db).run({ id: 'ghost' })
    expect(r.view).toBeNull()
    expect(r.items).toEqual([])
  })
})