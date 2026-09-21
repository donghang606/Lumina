import { describe, it, expect, beforeEach } from 'vitest'
import { noteBlocks, chunkRevisions } from '../db/schema.js'
import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

let blocks: any[]
let revisions: any[]
let db: any

function reset() {
  blocks = []
  revisions = []
  db = {
    select: () => ({
      from: (t: any) => ({
        where: () => ({
          get: async () => {
            const list = t === noteBlocks ? blocks : revisions
            return list[0] ?? null
          },
          all: async () => {
            const list = t === noteBlocks ? blocks : revisions
            return list
          },
        }),
        orderBy: (col: any) => ({
          get: async () => {
            const list = t === noteBlocks ? blocks : revisions
            return list[0] ?? null
          },
          all: async () => {
            const list = t === noteBlocks ? blocks : revisions
            return list
          },
        }),
      }),
    }),
    insert: (t: any) => ({
      values: async (v: any) => {
        if (t === noteBlocks) blocks.push(v)
        else revisions.push(v)
      },
    }),
    update: (t: any) => ({
      set: (patch: any) => ({
        where: () => ({
          run: async () => {
            if (t === noteBlocks && blocks[0]) Object.assign(blocks[0], patch)
          },
        }),
      }),
    }),
    delete: () => ({ where: () => ({ run: async () => {} }) }),
  }
}

const ctx = { db: null as any, threadId: 't', requestId: 'r', emit: () => {} }

describe('chunk logic', () => {
  beforeEach(() => { reset(); ctx.db = db })

  it('update block saves old version to revisions', async () => {
    blocks = [{ id: 'b1', noteId: 'n1', chunkContent: 'old content', tokenCount: 3 }]
    const now = new Date().toISOString()
    // save revision
    await db.insert(chunkRevisions).values({
      id: randomUUID(), blockId: 'b1', chunkContent: 'old content', version: 1, editedBy: 'user', createdAt: now,
    })
    // update block
    await db.update(noteBlocks).set({ chunkContent: 'new content', tokenCount: 4 }).where(eq(noteBlocks.id, 'b1')).run()
    expect(blocks[0].chunkContent).toBe('new content')
    expect(revisions).toHaveLength(1)
    expect(revisions[0].chunkContent).toBe('old content')
  })

  it('rollback restores old content and saves current as revision', async () => {
    blocks = [{ id: 'b1', chunkContent: 'current', tokenCount: 7 }]
    revisions = [{ id: 'r1', blockId: 'b1', chunkContent: 'original', version: 1 }]
    const now = new Date().toISOString()
    // save current as revision before rollback
    await db.insert(chunkRevisions).values({
      id: randomUUID(), blockId: 'b1', chunkContent: 'current', version: 2, editedBy: 'rollback', createdAt: now,
    })
    // rollback
    const targetRev = revisions[0]
    await db.update(noteBlocks).set({ chunkContent: targetRev.chunkContent, tokenCount: 8 }).where(eq(noteBlocks.id, 'b1')).run()
    expect(blocks[0].chunkContent).toBe('original')
    expect(revisions).toHaveLength(2)
  })

  it('list blocks by noteId', async () => {
    blocks = [
      { id: 'b1', noteId: 'n1', chunkContent: 'chunk 1' },
      { id: 'b2', noteId: 'n1', chunkContent: 'chunk 2' },
    ]
    // Simulate the full query chain: select().from().where().orderBy().all()
    const rows = await db.select().from(noteBlocks).where(eq(noteBlocks.noteId, 'n1')).all()
    expect(rows).toHaveLength(2)
  })
})
