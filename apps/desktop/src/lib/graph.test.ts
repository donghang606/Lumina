import { describe, it, expect } from 'vitest'
import { toForceEdges, filterEdgesByNodes } from './graph'

describe('toForceEdges', () => {
  it('将 sourceNoteId/targetNoteId 映射为 source/target', () => {
    const edges = [
      { id: 'e1', sourceNoteId: 'n1', targetNoteId: 'n2' },
      { id: 'e2', sourceNoteId: 'n3', targetNoteId: 'n4' },
    ]
    const out = toForceEdges(edges)
    expect(out[0]).toMatchObject({ source: 'n1', target: 'n2', sourceNoteId: 'n1', targetNoteId: 'n2' })
    expect(out[1]).toMatchObject({ source: 'n3', target: 'n4' })
  })

  it('空 source/target 回退为空字符串而非 undefined', () => {
    const out = toForceEdges([{ id: 'e1', sourceNoteId: null, targetNoteId: undefined }])
    expect(out[0].source).toBe('')
    expect(out[0].target).toBe('')
  })

  it('保持原对象字段（id 等）', () => {
    const out = toForceEdges([{ id: 'e1', sourceNoteId: 'a', targetNoteId: 'b', degree: 3 }])
    expect(out[0].id).toBe('e1')
    expect(out[0].degree).toBe(3)
  })
})

describe('filterEdgesByNodes', () => {
  it('只保留两端都存在的边', () => {
    const edges = [
      { id: 'e1', sourceNoteId: 'n1', targetNoteId: 'n2' },
      { id: 'e2', sourceNoteId: 'n1', targetNoteId: 'n9' },
      { id: 'e3', sourceNoteId: 'n3', targetNoteId: 'n2' },
    ]
    const out = filterEdgesByNodes(edges, ['n1', 'n2'])
    expect(out.map((e) => e.id)).toEqual(['e1'])
  })
})
