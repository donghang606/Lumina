import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  getActiveProvider: vi.fn(),
  llmChatChatCompletions: vi.fn(),
}))

vi.mock('../llm/provider.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../llm/provider.js')>()
  return {
    ...actual,
    getActiveProvider: mocks.getActiveProvider,
    llmChatChatCompletions: mocks.llmChatChatCompletions,
  }
})

import { aiRouter } from './ai.js'

function createMockDb() {
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    asc: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    get: vi.fn(() => null),
    all: vi.fn(async () => []),
    insert: vi.fn(() => ({ values: () => Promise.resolve({}), run: vi.fn().mockResolvedValue({}) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve({})) })),
  }
  return db
}

describe('aiRouter.transform', () => {
  beforeEach(() => {
    mocks.getActiveProvider.mockReset()
    mocks.llmChatChatCompletions.mockReset()
  })

  it('provider 未配置时报错', async () => {
    mocks.getActiveProvider.mockResolvedValue({ ready: false, reason: '未配置模型' })
    const c = aiRouter.createCaller({ db: createMockDb() as any, req: {} as any, res: {} as any })
    await expect(c.transform({ text: '你好', mode: 'polish' })).rejects.toThrow('未配置模型')
  })

  it('polish 走润色提示词并返回结果', async () => {
    mocks.getActiveProvider.mockResolvedValue({ ready: true, name: 'mock', model: 'm' })
    mocks.llmChatChatCompletions.mockResolvedValue('润色后的文本')
    const c = aiRouter.createCaller({ db: createMockDb() as any, req: {} as any, res: {} as any })
    const result = await c.transform({ text: '我今天很开心', mode: 'polish' })
    expect(result).toBe('润色后的文本')
    const msgs = mocks.llmChatChatCompletions.mock.calls[0][1]
    expect(msgs[0].content).toContain('润色')
    expect(msgs[1].content).toBe('我今天很开心')
  })

  it('translate 使用 targetLang', async () => {
    mocks.getActiveProvider.mockResolvedValue({ ready: true, name: 'mock', model: 'm' })
    mocks.llmChatChatCompletions.mockResolvedValue('English text')
    const c = aiRouter.createCaller({ db: createMockDb() as any, req: {} as any, res: {} as any })
    await c.transform({ text: '你好世界', mode: 'translate', targetLang: '英语' })
    const msgs = mocks.llmChatChatCompletions.mock.calls[0][1]
    expect(msgs[0].content).toContain('英语')
  })

  it('shorten 保留关键信息提示词', async () => {
    mocks.getActiveProvider.mockResolvedValue({ ready: true, name: 'mock', model: 'm' })
    mocks.llmChatChatCompletions.mockResolvedValue('精简')
    const c = aiRouter.createCaller({ db: createMockDb() as any, req: {} as any, res: {} as any })
    await c.transform({ text: '很长的内容', mode: 'shorten' })
    const msgs = mocks.llmChatChatCompletions.mock.calls[0][1]
    expect(msgs[0].content).toContain('压缩')
  })
})