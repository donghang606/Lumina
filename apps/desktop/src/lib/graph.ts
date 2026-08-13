/**
 * 图谱数据纯逻辑：后端返回的边字段是 sourceNoteId/targetNoteId，
 * d3 forceLink 需要 source/target，这里统一映射（一次创建供 forceLink 与渲染共用）。
 */

export interface GraphEdgeInput {
  id: string
  sourceNoteId?: string | null
  targetNoteId?: string | null
}

export type ForceEdge<E extends GraphEdgeInput> = E & { source: string; target: string }

export function toForceEdges<E extends GraphEdgeInput>(edges: E[]): ForceEdge<E>[] {
  return edges.map((e) => ({ ...e, source: e.sourceNoteId ?? '', target: e.targetNoteId ?? '' }))
}

/** 只保留两端都出现在给定节点集合里的边 */
export function filterEdgesByNodes<E extends GraphEdgeInput>(edges: E[], nodeIds: Iterable<string>): E[] {
  const ids = new Set(nodeIds)
  return edges.filter((e) => ids.has(e.sourceNoteId ?? '') && ids.has(e.targetNoteId ?? ''))
}
