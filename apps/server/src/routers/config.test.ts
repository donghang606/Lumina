import { describe, it, expect, vi, beforeEach } from 'vitest'
import { configRouter } from './config.js'

function createMockDb() {
  return {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn(),
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    all: vi.fn().mockReturnValue([]),
    run: vi.fn(),
  }
}

const DEFAULT_SETTINGS = {
  id: 'main',
  theme: 'light',
  skin: 'glass',
  locale: 'zh-CN',
  autoTag: true,
  autoSummary: true,
  autoClassify: false,
  defaultProviderId: null,
  defaultModel: null,
  serverUrl: null,
}

describe('configRouter', () => {
  describe('get', () => {
    it('returns existing settings', async () => {
      const db = createMockDb()
      db.get.mockReturnValue(DEFAULT_SETTINGS)
      const caller = configRouter.createCaller({ db: db as any, req: {} as any, res: {} as any })
      const result = await caller.get()
      expect(result).toEqual(DEFAULT_SETTINGS)
    })

    it('creates default settings when none exist', async () => {
      const db = createMockDb()
      db.get.mockReturnValueOnce(null).mockReturnValueOnce(DEFAULT_SETTINGS)
      const caller = configRouter.createCaller({ db: db as any, req: {} as any, res: {} as any })
      const result = await caller.get()
      expect(result).toEqual(DEFAULT_SETTINGS)
      expect(db.insert).toHaveBeenCalled()
    })
  })

  describe('update', () => {
    it('updates skin', async () => {
      const db = createMockDb()
      db.get.mockReturnValue({ ...DEFAULT_SETTINGS, skin: 'nothing' })
      const caller = configRouter.createCaller({ db: db as any, req: {} as any, res: {} as any })
      const result = await caller.update({ skin: 'nothing' })
      expect(result?.skin).toBe('nothing')
      expect(db.update).toHaveBeenCalled()
    })

    it('updates serverUrl', async () => {
      const db = createMockDb()
      db.get.mockReturnValue({ ...DEFAULT_SETTINGS, serverUrl: 'http://remote:3001' })
      const caller = configRouter.createCaller({ db: db as any, req: {} as any, res: {} as any })
      const result = await caller.update({ serverUrl: 'http://remote:3001' })
      expect(result?.serverUrl).toBe('http://remote:3001')
    })

    it('sets serverUrl to null', async () => {
      const db = createMockDb()
      db.get.mockReturnValue({ ...DEFAULT_SETTINGS, serverUrl: null })
      const caller = configRouter.createCaller({ db: db as any, req: {} as any, res: {} as any })
      const result = await caller.update({ serverUrl: null })
      expect(result?.serverUrl).toBeNull()
    })
  })

  describe('listProviders', () => {
    it('returns empty array when no providers', async () => {
      const db = createMockDb()
      db.all.mockReturnValue([])
      const caller = configRouter.createCaller({ db: db as any, req: {} as any, res: {} as any })
      const result = await caller.listProviders()
      expect(result).toEqual([])
    })
  })

  describe('listMcpServers', () => {
    it('returns empty array when no mcp servers', async () => {
      const db = createMockDb()
      db.all.mockReturnValue([])
      const caller = configRouter.createCaller({ db: db as any, req: {} as any, res: {} as any })
      const result = await caller.listMcpServers()
      expect(result).toEqual([])
    })
  })
})
