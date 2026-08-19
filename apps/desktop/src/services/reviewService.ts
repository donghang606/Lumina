import { trpc } from '../lib/trpc'
import type { ReviewSuggestion } from '@lumina/shared'

export const reviewService = {
  async list(): Promise<ReviewSuggestion[]> {
    return trpc.review.list.query()
  },
  async accept(id: string): Promise<{ ok: boolean; reason?: string }> {
    return trpc.review.accept.mutate({ id })
  },
  async reject(id: string): Promise<{ ok: boolean }> {
    return trpc.review.reject.mutate({ id })
  },
  async dismissAll(): Promise<{ ok: boolean }> {
    return trpc.review.dismissAll.mutate()
  },
}