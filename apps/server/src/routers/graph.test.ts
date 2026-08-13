import { describe, it, expect, vi } from 'vitest'
import { graphRouter } from './graph.js'

function createMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    get: vi.fn(),
    all: vi.fn().mockReturnValue([]),
    run: vi.fn(),
  }
}

function caller(db: ReturnType<typeof createMockDb>) {
  return graphRouter.createCaller({ db: db as any, req: {} as any, res: {} as any })
}

describe('graphRouter', () => {
  describe('getAll', () => {
    it('returns empty nodes and edges when no data', async () => {
      const db = createMockDb()
      db.all.mockReturnValue([])
      const result = await caller(db).getAll()
      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
    })
  })

  describe('getGraphData', () => {
    it('returns empty graph when no notes', async () => {
      const db = createMockDb()
      db.all.mockReturnValue([])
      const result = await caller(db).getGraphData()
      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
    })

    it('returns nodes with degree and tagCount', async () => {
      const db = createMockDb()
      const notes = [
        { id: 'n1', title: 'Note 1', type: 'note', summary: null, createdAt: '2026-01-01' },
        { id: 'n2', title: 'Note 2', type: 'card', summary: 'Summary', createdAt: '2026-01-02' },
      ]
      const links = [
        { id: 'l1', sourceNoteId: 'n1', targetNoteId: 'n2', context: null, createdAt: '2026-01-01' },
      ]
      const tagRels = [{ noteId: 'n1' }, { noteId: 'n1' }, { noteId: 'n2' }]

      db.all.mockReturnValueOnce(notes).mockReturnValueOnce(links).mockReturnValueOnce(tagRels)

      const result = await caller(db).getGraphData({ limit: 100 })
      expect(result.nodes).toHaveLength(2)
      expect(result.nodes[0].degree).toBe(1)
      expect(result.nodes[0].tagCount).toBe(2)
      expect(result.nodes[1].degree).toBe(1)
      expect(result.nodes[1].tagCount).toBe(1)
      expect(result.edges).toHaveLength(1)
    })

    it('respects limit parameter', async () => {
      const db = createMockDb()
      db.all.mockReturnValue([])
      await caller(db).getGraphData({ limit: 50 })
      expect(db.limit).toHaveBeenCalledWith(50)
    })
  })

  describe('expandNode', () => {
    it('returns empty when no neighbors', async () => {
      const db = createMockDb()
      db.all.mockReturnValue([])
      const result = await caller(db).expandNode({ nodeId: 'n1' })
      expect(result.nodes).toEqual([])
      expect(result.edges).toEqual([])
    })
  })
})
