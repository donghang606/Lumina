import { trpc } from '../lib/trpc'
import type { FeedPage, GraphData, Note, FeedType } from '@lumina/shared'

const PAGE_SIZE = 20

export interface FeedFilter {
  type?: FeedType
  tagId?: string
  keyword?: string
  order?: 'desc' | 'asc'
  onDate?: string
}

export const feedService = {
  async list(offset: number, limit = PAGE_SIZE, filter: FeedFilter = {}): Promise<FeedPage> {
    return trpc.feed.list.query({ offset, limit, ...filter })
  },
  async activity(days = 90): Promise<{ days: { date: string; count: number }[] }> {
    return trpc.feed.activity.query({ days })
  },
}

export const graphService = {
  async getGraphData(limit = 100): Promise<GraphData> {
    return trpc.graph.getGraphData.query({ limit })
  },
  async expandNode(nodeId: string): Promise<GraphData> {
    return trpc.graph.expandNode.query({ nodeId })
  },
}

export interface Insights {
  focusAreas: string[]
  connections: { a: string; b: string }[]
  questions: string[]
  quote: string
  _meta: { noteCount: number; linkCount: number }
}

export const insightService = {
  async get(): Promise<Insights> {
    return trpc.insight.get.query()
  },
  async heartbeat(text: string): Promise<{ ok: boolean }> {
    return trpc.insight.heartbeat.mutate({ text })
  },
}

export type { Note }