import { trpc } from '../lib/trpc'
import type { QueryView, QueryViewResult } from '@lumina/shared'

function normalizeView(v: any): QueryView {
  return { ...v, config: v.config ?? {} }
}

function normalizeResult(r: any): QueryViewResult {
  return {
    view: r.view ? normalizeView(r.view) : null,
    items: r.items ?? [],
    total: r.total ?? 0,
  }
}

export const viewService = {
  async list(): Promise<QueryView[]> {
    const list = await trpc.view.list.query()
    return (list ?? []).map(normalizeView)
  },
  async upsert(input: { id?: string; name: string; type: QueryView['type']; config: Record<string, unknown> }): Promise<QueryView | null> {
    const r = await trpc.view.upsert.mutate(input)
    return r ? normalizeView(r) : null
  },
  async remove(id: string): Promise<{ ok: boolean }> {
    return trpc.view.remove.mutate({ id })
  },
  async run(id: string, limit?: number): Promise<QueryViewResult> {
    const r = await trpc.view.run.query({ id, limit: limit ?? 20 })
    return normalizeResult(r)
  },
}
