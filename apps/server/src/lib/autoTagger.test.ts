import { describe, it, expect, beforeEach } from 'vitest'
import { autoTagNote } from './autoTagger.js'

// In-memory db mock
function mkDb(tags: any[], existingAssignments: any[] = []) {
  const assignments = [...existingAssignments]
  return {
    select: () => ({
      from: (t: any) => ({
        all: async () => tags,
        get: async () => tags[0] ?? null,
        where: () => ({
          all: async () => assignments,
        }),
      }),
    }),
    insert: () => ({
      values: async (rows: any[]) => { assignments.push(...rows) },
    }),
    delete: () => ({ where: () => ({ run: async () => {} }) }),
  }
}

describe('autoTagNote', () => {
  it('匹配内容中的标签名', async () => {
    const db = mkDb([
      { id: 't1', name: 'React' },
      { id: 't2', name: 'TypeScript' },
      { id: 't3', name: 'Vue' },
    ])
    const added = await autoTagNote(db as any, 'n1', 'This project uses React and TypeScript for the frontend.')
    expect(added).toContain('t1')
    expect(added).toContain('t2')
    expect(added).not.toContain('t3')
  })

  it('不重复打已有标签', async () => {
    const db = mkDb(
      [{ id: 't1', name: 'React' }, { id: 't2', name: 'TS' }],
      [{ noteId: 'n1', tagId: 't1' }], // t1 already assigned
    )
    const added = await autoTagNote(db as any, 'n1', 'React and TS project.')
    expect(added).not.toContain('t1')
    expect(added).toContain('t2')
  })

  it('标签太短（<2字符）跳过', async () => {
    const db = mkDb([{ id: 't1', name: 'A' }])
    const added = await autoTagNote(db as any, 'n1', 'A simple note.')
    expect(added).toHaveLength(0)
  })

  it('无匹配返回空', async () => {
    const db = mkDb([{ id: 't1', name: 'Python' }])
    const added = await autoTagNote(db as any, 'n1', 'This is about Go and Rust.')
    expect(added).toHaveLength(0)
  })

  it('中文标签匹配', async () => {
    const db = mkDb([
      { id: 't1', name: '机器学习' },
      { id: 't2', name: '深度学习' },
    ])
    const added = await autoTagNote(db as any, 'n1', '这篇文章介绍机器学习的基础知识，深度学习是其中一个重要分支。')
    expect(added).toContain('t1')
    expect(added).toContain('t2')
  })

  it('空内容返回空', async () => {
    const db = mkDb([{ id: 't1', name: 'React' }])
    const added = await autoTagNote(db as any, 'n1', '')
    expect(added).toHaveLength(0)
  })
})
