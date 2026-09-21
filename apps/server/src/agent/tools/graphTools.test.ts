import { describe, it, expect, vi, beforeEach } from 'vitest'

import { listRegisteredTools } from '../registry.js'
import './graphTools.js'

const getTool = (name: string) => listRegisteredTools().find((t) => t.name === name)!

// 内存数据
let store: { notes: any[]; links: any[]; ton: any[] }

function mkCtx() {
  const db: any = {
    select: (cols?: any) => ({
      from: (t: any) => {
        const name = (t as any)?.[Symbol.for('drizzle:Name')] ?? ''
        if (name === 'note_links') {
          // select({s, t}).from(noteLinks) 或 select().from(noteLinks) 都返回 links
          return {
            all: async () => store.links.map((l) => ({ s: l.sourceNoteId, t: l.targetNoteId, sourceNoteId: l.sourceNoteId, targetNoteId: l.targetNoteId })),
            limit: () => ({ all: async () => store.links }),
          }
        }
        if (name === 'tags_on_notes') {
          return { all: async () => store.ton }
        }
        if (name === 'notes') {
          return {
            limit: () => ({ all: async () => store.notes.map((n) => ({ id: n.id, title: n.title })) }),
            all: async () => store.notes.map((n) => ({ id: n.id, title: n.title })),
          }
        }
        return { all: async () => [] }
      },
    }),
  }
  return { db, threadId: 't', requestId: 'r', emit: () => {} } as any
}

describe('graphTools', () => {
  beforeEach(() => {
    store = {
      notes: [
        { id: 'n1', title: 'A' },
        { id: 'n2', title: 'B' },
        { id: 'n3', title: 'C（孤岛）' },
      ],
      links: [{ sourceNoteId: 'n1', targetNoteId: 'n2' }],
      ton: [
        { noteId: 'n1', tagId: 't1' },
        { noteId: 'n2', tagId: 't1' },
        { noteId: 'n1', tagId: 't2' },
        { noteId: 'n2', tagId: 't2' },
      ],
    }
  })

  it('find_orphan_notes 找出无连接的笔记', async () => {
    const t = getTool('find_orphan_notes')
    expect(t.meta.requireApproval).toBeFalsy()
    const r = JSON.parse(await t.handler({ limit: 50 }, mkCtx()))
    expect(r.orphanCount).toBe(1)
    expect(r.items[0]).toMatchObject({ id: 'n3', title: 'C（孤岛）' })
  })

  it('find_orphan_notes 全连时返回空', async () => {
    store.links.push({ sourceNoteId: 'n3', targetNoteId: 'n1' })
    const t = getTool('find_orphan_notes')
    const r = JSON.parse(await t.handler({}, mkCtx()))
    expect(r.orphanCount).toBe(0)
    expect(r.items).toEqual([])
  })

  it('suggest_connections 推荐共享标签但无连接的笔记对', async () => {
    // n1/n2 共享 t1,t2，但已有 n1→n2 连接 → 应被过滤
    // 加 n3 共享 t1 with n1/n2，无连接 → 候选
    store.ton.push({ noteId: 'n3', tagId: 't1' })
    const t = getTool('suggest_connections')
    expect(t.meta.requireApproval).toBeFalsy()
    const r = JSON.parse(await t.handler({ limit: 15 }, mkCtx()))
    // n1-n2 已连接被过滤；n1-n3 / n2-n3 候选
    expect(r.suggestionCount).toBe(2)
    const pairs = r.items.map((i: any) => `${i.source.id}-${i.target.id}`.split('-').sort().join('|'))
    expect(pairs).toContain('n1|n3')
    expect(pairs).toContain('n2|n3')
  })

  it('suggest_connections 无标签共现返回空', async () => {
    store.ton = []
    const t = getTool('suggest_connections')
    const r = JSON.parse(await t.handler({}, mkCtx()))
    expect(r.suggestionCount).toBe(0)
  })
})
