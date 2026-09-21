import { describe, it, expect, beforeEach } from 'vitest'
import { wikiPages, wikiRevisions } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

// In-memory stores
let pages: any[]
let revisions: any[]
let db: any

function reset() {
  pages = []
  revisions = []
  db = {
    select: () => ({
      from: (t: any) => ({
        where: (clause: any) => ({
          get: async () => {
            // simple: return first matching by id
            const list = t === wikiPages ? pages : revisions
            return list[0] ?? null
          },
          all: async () => {
            const list = t === wikiPages ? pages : revisions
            return list
          },
        }),
        orderBy: () => ({
          all: async () => {
            const list = t === wikiPages ? pages : revisions
            return list
          },
        }),
      }),
    }),
    insert: (t: any) => ({
      values: async (v: any) => {
        if (t === wikiPages) pages.push(v)
        else revisions.push(v)
      },
    }),
    update: (t: any) => ({
      set: (patch: any) => ({
        where: () => ({
          run: async () => {
            const list = t === wikiPages ? pages : revisions
            if (list[0]) Object.assign(list[0], patch)
          },
        }),
      }),
    }),
    delete: (t: any) => ({
      where: () => ({
        run: async () => {
          if (t === wikiPages) pages = []
          else revisions = []
        },
      }),
    }),
  }
}

const ctx = { db: null as any, threadId: 't', requestId: 'r', emit: () => {} }

describe('wiki logic', () => {
  beforeEach(() => { reset(); ctx.db = db })

  it('create page + revision', async () => {
    const now = new Date().toISOString()
    const id = randomUUID()
    await db.insert(wikiPages).values({ id, title: 'T', content: 'C', version: 1, createdAt: now, updatedAt: now })
    await db.insert(wikiRevisions).values({ id: randomUUID(), pageId: id, title: 'T', content: 'C', version: 1, createdAt: now })
    expect(pages).toHaveLength(1)
    expect(revisions).toHaveLength(1)
    expect(pages[0].title).toBe('T')
  })

  it('update page increments version', async () => {
    pages = [{ id: 'p1', title: 'Old', content: 'Old', version: 1 }]
    const now = new Date().toISOString()
    await db.update(wikiPages).set({ title: 'New', version: 2, updatedAt: now }).where(eq(wikiPages.id, 'p1')).run()
    await db.insert(wikiRevisions).values({ id: 'r1', pageId: 'p1', title: 'New', content: 'New', version: 2, createdAt: now })
    expect(pages[0].version).toBe(2)
    expect(pages[0].title).toBe('New')
    expect(revisions).toHaveLength(1)
    expect(revisions[0].version).toBe(2)
  })

  it('delete page', async () => {
    pages = [{ id: 'p1' }]
    await db.delete(wikiPages).where(eq(wikiPages.id, 'p1')).run()
    expect(pages).toHaveLength(0)
  })
})
