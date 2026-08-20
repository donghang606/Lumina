import { describe, it, expect, vi, beforeEach } from 'vitest'
import { bookmarkRouter } from './bookmark.js'

function createMockDb() {
  const updated: Record<string, unknown[]> = {}
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn(() => ({ get: vi.fn(() => null), run: vi.fn().mockResolvedValue({}) })),
    all: vi.fn(async () => []),
    update: vi.fn((t: any) => {
      const table = t?.[Symbol.for('drizzle:Name')] ?? 'unknown'
      return {
        set: (v: Record<string, unknown>) => {
          ;(updated[table] ??= []).push(v)
          return { where: vi.fn(() => ({ run: vi.fn().mockResolvedValue({}) })) }
        },
      }
    }),
  }
  return { db, updated }
}

function caller(db: any) {
  return bookmarkRouter.createCaller({ db, req: {} as any, res: {} as any })
}

describe('bookmarkRouter', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('list 无健康记录时默认 ok', async () => {
    const { db } = createMockDb()
    db.all.mockResolvedValueOnce([{ id: 'c1', title: '收藏A', url: 'https://a.com', noteId: 'n1' }])
    db.select.mockReturnThis()
    db.where.mockReturnValue({ get: vi.fn(() => ({ meta: {} })) })
    const res = await caller(db).list()
    expect(res).toHaveLength(1)
    expect(res[0].ok).toBe(true)
    expect(res[0].url).toBe('https://a.com')
  })

  it('list 读取已存 bookmarkHealth 标记', async () => {
    const { db } = createMockDb()
    db.all.mockResolvedValueOnce([{ id: 'c1', title: '收藏A', url: 'https://a.com', noteId: 'n1' }])
    db.select.mockReturnThis()
    db.where.mockReturnValue({
      get: vi.fn(() => ({ meta: { bookmarkHealth: { ok: false, status: 404, error: null } } })),
    })
    const res = await caller(db).list()
    expect(res[0].ok).toBe(false)
    expect(res[0].status).toBe(404)
  })

  it('checkHealth 探测并把结果写回 meta', async () => {
    const { db, updated } = createMockDb()
    db.all.mockResolvedValueOnce([{ id: 'c1', title: '收藏A', url: 'https://example.com', noteId: 'n1' }])
    db.select.mockReturnThis()
    db.where.mockReturnValue({ get: vi.fn(() => ({ meta: {} })) })

    const realFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
    try {
      const res = await caller(db).checkHealth({ timeoutMs: 500 })
      expect(res.checked).toBe(1)
      expect(res.ok).toBe(true)
      expect(res.broken).toHaveLength(0)
      expect(updated.notes?.[0]).toMatchObject({ meta: { bookmarkHealth: { ok: true, status: 200 } } })
    } finally {
      globalThis.fetch = realFetch
    }
  })

  it('checkHealth 记录坏链', async () => {
    const { db } = createMockDb()
    db.all.mockResolvedValueOnce([{ id: 'c1', title: '收藏A', url: 'https://dead.example.com', noteId: 'n1' }])
    db.select.mockReturnThis()
    db.where.mockReturnValue({ get: vi.fn(() => ({ meta: {} })) })

    const realFetch = globalThis.fetch
    globalThis.fetch = vi.fn(async () => new Response(null, { status: 404 })) as unknown as typeof fetch
    try {
      const res = await caller(db).checkHealth({ timeoutMs: 500 })
      expect(res.checked).toBe(1)
      expect(res.ok).toBe(false)
      expect(res.broken[0]).toMatchObject({ url: 'https://dead.example.com', status: 404 })
    } finally {
      globalThis.fetch = realFetch
    }
  })
})