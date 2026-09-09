import { describe, it, expect, vi, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import { aiSuggestions, notes, tags, tagsOnNotes } from '../db/schema.js'

function createMockDb() {
  const data: {
    notes: Array<Record<string, unknown>>
    suggestions: Array<Record<string, unknown>>
    tags: Array<Record<string, unknown>>
    tagsOnNotes: Array<Record<string, unknown>>
  } = { notes: [], suggestions: [], tags: [], tagsOnNotes: [] }
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: (t: any) => ({
      all: async () => {
        const name = t?.[Symbol.for('drizzle:Name')]
        return data[name as keyof typeof data] ?? []
      },
      get: async () => undefined,
      limit: () => ({ all: async () => data.notes.slice(0, 10) }),
      orderBy: () => ({ limit: () => ({ all: async () => data.notes }) }),
      leftJoin: () => ({ all: async () => data.tagsOnNotes.map((r) => ({ ...r })) }),
      innerJoin: () => ({ where: () => ({ all: async () => [] }) }),
      where: () => ({ get: async () => undefined, all: async () => data.notes, run: async () => {} }),
    }),
    insert: (t: any) => ({
      values: async (v: any) => {
        const name = t?.[Symbol.for('drizzle:Name')]
        const rows = Array.isArray(v) ? v : [v]
        if (name === 'ai_suggestions') data.suggestions.push(...rows)
        if (name === 'notes') data.notes.push(...rows)
        if (name === 'tags') data.tags.push(...rows)
        if (name === 'tags_on_notes') data.tagsOnNotes.push(...rows)
        return { run: async () => {} }
      },
    }),
    delete: () => ({ where: () => ({ run: async () => {} }) }),
    update: () => ({ set: () => ({ where: () => ({ run: async () => {} }) }) }),
  }
  return { db, data }
}

const ctx = (db: any) => ({ db, threadId: 't1', requestId: 'r1', emit: () => {} })

describe('agent 工具注册表', () => {
  it('内置工具全部注册且审批标记正确', async () => {
    const { listRegisteredTools, buildInterruptConfig } = await import('./registry.js')
    await import('./tools/index.js')
    const names = listRegisteredTools().map((t) => t.name)
    expect(names).toContain('search_notes')
    expect(names).toContain('get_note')
    expect(names).toContain('suggest_note')
    expect(names).toContain('create_note')
    expect(names).toContain('get_graph')
    expect(names).toContain('run_query_view')
    expect(names).toContain('list_tags')
    expect(names).toContain('set_tags')
    const interrupts = buildInterruptConfig()
    expect(interrupts['create_note']).toBe(true)
    expect(interrupts['set_tags']).toBe(true)
    expect(interrupts['search_notes']).toBeUndefined()
    expect(interrupts['suggest_note']).toBeUndefined()
  })

  it('search_notes 返回 BM25 命中', async () => {
    await import('./tools/index.js')
    const { listRegisteredTools } = await import('./registry.js')
    const { db, data } = createMockDb()
    data.notes.push(
      { id: 'a', title: '深度学习入门', content: '神经网络与反向传播算法' },
      { id: 'b', title: '美食日记', content: '今天做了红烧肉' },
    )
    const tool = listRegisteredTools().find((t) => t.name === 'search_notes')!
    const out = JSON.parse(await tool.handler({ query: '神经网络' }, ctx(db)))
    expect(out.count).toBeGreaterThan(0)
    expect(out.items[0].id).toBe('a')
  })

  it('suggest_note 写入审核队列（pending，不落 notes）', async () => {
    await import('./tools/index.js')
    const { listRegisteredTools } = await import('./registry.js')
    const { db, data } = createMockDb()
    const tool = listRegisteredTools().find((t) => t.name === 'suggest_note')!
    const out = JSON.parse(await tool.handler({ title: '测试建议', content: '内容', tags: ['AI'] }, ctx(db)))
    expect(out.status).toBe('pending')
    expect(data.suggestions).toHaveLength(1)
    expect(data.suggestions[0]).toMatchObject({ kind: 'note', status: 'pending', source: 'auto' })
    expect(data.notes).toHaveLength(0)
  })

  it('create_note 直接落 notes（HITL 已在外层拦截）', async () => {
    await import('./tools/index.js')
    const { listRegisteredTools } = await import('./registry.js')
    const { db, data } = createMockDb()
    const tool = listRegisteredTools().find((t) => t.name === 'create_note')!
    const out = JSON.parse(await tool.handler({ title: '直接建', content: 'x' }, ctx(db)))
    expect(out.id).toBeTruthy()
    expect(data.notes).toHaveLength(1)
  })

  it('get_note 不存在时返回 error', async () => {
    await import('./tools/index.js')
    const { listRegisteredTools } = await import('./registry.js')
    const { db } = createMockDb()
    const tool = listRegisteredTools().find((t) => t.name === 'get_note')!
    const out = JSON.parse(await tool.handler({ noteId: 'ghost' }, ctx(db)))
    expect(out.error).toBe('note not found')
  })
})

describe('agent 记忆文件', () => {
  it('四份记忆文件生成并可读取', async () => {
    const { ensureMemoryFiles, listMemoryFiles } = await import('./model.js')
    ensureMemoryFiles()
    const files = listMemoryFiles()
    expect(files.map((f) => f.fileName)).toEqual(['SOUL.md', 'USER.md', 'MEMORY.md', 'Agent.md'])
    expect(files[0].content).toContain('Lumina Agent')
  })
})