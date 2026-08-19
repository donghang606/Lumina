import { describe, it, expect, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  collectDocument: vi.fn(),
}))

vi.mock('../lib/collector/index.js', () => ({
  collectDocument: mocks.collectDocument,
}))

import { doCollect } from './extension.js'

function createMockDb() {
  const inserted: Record<string, unknown[]> = {}
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    get: vi.fn(() => null),
    all: vi.fn(async () => []),
    insert: (t: any) => {
      const table = t?.[Symbol.for('drizzle:Name')] ?? 'unknown'
      return {
        values: (v: Record<string, unknown>) => {
          ;(inserted[table] ??= []).push(v)
          return { run: vi.fn().mockResolvedValue({}), onConflictDoNothing: vi.fn().mockReturnValue({ run: vi.fn().mockResolvedValue({}) }) }
        },
      }
    },
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => ({ run: vi.fn().mockResolvedValue({}) })) })) })),
  }
  return { db, inserted }
}

describe('doCollect', () => {
  it('重复 URL 返回 duplicate', async () => {
    mocks.collectDocument.mockResolvedValue({ title: 'P', content: '<p>内容</p>', siteName: null })
    const { db } = createMockDb()
    db.get.mockReturnValueOnce({ noteId: 'existing-id' })
    db.get.mockReturnValueOnce({ id: 'existing-id', title: '旧笔记' })
    const result = await doCollect({ db }, { url: 'https://a.com' })
    expect(result.duplicate).toBe(true)
  })

  it('无 tag/summary 时创建笔记与收藏', async () => {
    mocks.collectDocument.mockResolvedValue({ title: 'P', content: '<p>内容</p>', siteName: null })
    const { db, inserted } = createMockDb()
    const result = await doCollect({ db }, { url: 'https://a.com', title: 'T', content: 'body' })
    expect(result.ok).toBe(true)
    expect(result.duplicate).toBe(false)
    expect(inserted.notes).toHaveLength(1)
    expect(inserted.collections).toHaveLength(1)
    expect(inserted.tags).toBeUndefined()
    expect(inserted.tags_on_notes).toBeUndefined()
  })

  it('带 tag 时自动建标签并关联', async () => {
    mocks.collectDocument.mockResolvedValue({ title: 'P', content: '<p>内容</p>', siteName: null })
    const { db, inserted } = createMockDb()
    const result = await doCollect({ db }, { url: 'https://a.com', title: 'T', content: 'body', tag: '网页收藏' })
    expect(result.ok).toBe(true)
    expect(inserted.tags).toHaveLength(1)
    expect(inserted.tags?.[0]).toMatchObject({ name: '网页收藏', slug: '网页收藏' })
    expect(inserted.tags_on_notes).toHaveLength(1)
  })
})