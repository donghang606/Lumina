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
  taskModels: {},
  serverUrl: null,
  sttEnabled: false,
  sttBaseUrl: null,
  sttApiKey: null,
  sttModel: null,
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

    it('updates stt settings', async () => {
      const db = createMockDb()
      db.get.mockReturnValue({
        ...DEFAULT_SETTINGS,
        sttEnabled: true,
        sttBaseUrl: 'https://api.groq.com/openai/v1',
        sttModel: 'whisper-large-v3',
      })
      const caller = configRouter.createCaller({ db: db as any, req: {} as any, res: {} as any })
      const result = await caller.update({
        sttEnabled: true,
        sttBaseUrl: 'https://api.groq.com/openai/v1',
        sttModel: 'whisper-large-v3',
      })
      expect(result?.sttEnabled).toBe(true)
      expect(result?.sttBaseUrl).toBe('https://api.groq.com/openai/v1')
      expect(result?.sttModel).toBe('whisper-large-v3')
      const payload = db.set.mock.calls[0][0]
      expect(payload.sttEnabled).toBe(true)
      expect(payload.sttBaseUrl).toBe('https://api.groq.com/openai/v1')
    })

    it('encrypts stt api key on save', async () => {
      const db = createMockDb()
      db.get.mockReturnValue({ ...DEFAULT_SETTINGS })
      const caller = configRouter.createCaller({ db: db as any, req: {} as any, res: {} as any })
      await caller.update({ sttApiKey: 'sk-stt-secret' })
      const payload = db.set.mock.calls[0][0]
      expect(String(payload.sttApiKey)).toMatch(/^enc:v1:/)
      expect(payload.sttApiKey).not.toContain('sk-stt-secret')
    })

    it('keeps existing stt api key when submitting empty', async () => {
      const db = createMockDb()
      db.get.mockReturnValue({ ...DEFAULT_SETTINGS, sttApiKey: 'enc:v1:keep' })
      const caller = configRouter.createCaller({ db: db as any, req: {} as any, res: {} as any })
      await caller.update({ sttApiKey: '' })
      const payload = db.set.mock.calls[0][0]
      expect(payload.sttApiKey).toBe('enc:v1:keep')
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
