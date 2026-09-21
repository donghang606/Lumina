import { describe, it, expect, beforeEach } from 'vitest'
import { userMemories } from '../db/schema.js'
import { eq, desc, like, or } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

let store: any[]
let db: any

function reset() {
  store = []
  db = {
    select: () => ({
      from: () => ({
        where: (clause: any) => ({
          all: async () => store,
          get: async () => store[0] ?? null,
        }),
        orderBy: () => ({
          all: async () => store,
        }),
      }),
    }),
    insert: () => ({
      values: async (v: any) => { store.push(v) },
    }),
    update: () => ({
      set: (patch: any) => ({
        where: () => ({
          run: async () => { if (store[0]) Object.assign(store[0], patch) },
        }),
      }),
    }),
    delete: () => ({
      where: () => ({ run: async () => { store = [] } }),
    }),
  }
}

const ctx = { db: null as any, threadId: 't', requestId: 'r', emit: () => {} }

describe('memory logic', () => {
  beforeEach(() => { reset(); ctx.db = db })

  it('create memory', async () => {
    const now = new Date().toISOString()
    await db.insert(userMemories).values({ id: randomUUID(), type: 'preference', content: '喜欢深色', source: '对话', createdAt: now, updatedAt: now })
    expect(store).toHaveLength(1)
    expect(store[0].type).toBe('preference')
  })

  it('list memories', async () => {
    store = [{ id: '1', type: 'profile' }, { id: '2', type: 'fact' }]
    const rows = await db.select().from(userMemories).orderBy(desc(userMemories.updatedAt)).all()
    expect(rows).toHaveLength(2)
  })

  it('delete memory', async () => {
    store = [{ id: '1' }]
    await db.delete(userMemories).where(eq(userMemories.id, '1')).run()
    expect(store).toHaveLength(0)
  })
})
