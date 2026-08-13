import { trpc } from '../lib/trpc'
import type { AiProvider, McpServer } from '@lumina/shared'
import type { Skin } from '../lib/theme'

export interface Settings {
  id: string
  theme: 'light' | 'dark'
  skin: Skin
  locale: string
  autoTag: boolean
  autoSummary: boolean
  autoClassify: boolean
  defaultProviderId: string | null
  defaultModel: string | null
  serverUrl: string | null
}

function normalizeProvider(p: any): AiProvider {
  return { ...p, models: p.models ?? [] }
}

function normalizeMcp(m: any): McpServer {
  return { ...m, args: m.args ?? [], env: m.env ?? {}, tools: m.tools ?? [] }
}

export const configService = {
  async getSettings(): Promise<Settings | null> {
    return (await trpc.config.get.query()) ?? null
  },
  async updateSettings(input: Partial<Settings>): Promise<Settings | null> {
    return (await trpc.config.update.mutate(input)) ?? null
  },
  async listProviders(): Promise<AiProvider[]> {
    const list = await trpc.config.listProviders.query()
    return list.map(normalizeProvider)
  },
  async upsertProvider(input: {
    id?: string
    name: string
    type: AiProvider['type']
    apiKey?: string
    baseUrl?: string | null
    models?: string[]
    isActive?: boolean
  }): Promise<AiProvider | null> {
    const r = await trpc.config.upsertProvider.mutate(input)
    return r ? normalizeProvider(r) : null
  },
  async deleteProvider(id: string): Promise<{ ok: boolean }> {
    return trpc.config.deleteProvider.mutate({ id })
  },
  async listMcpServers(): Promise<McpServer[]> {
    const list = await trpc.config.listMcpServers.query()
    return list.map(normalizeMcp)
  },
  async upsertMcpServer(input: {
    id?: string
    name: string
    command: string
    args?: string[]
    isActive?: boolean
  }): Promise<McpServer | null> {
    const r = await trpc.config.upsertMcpServer.mutate(input)
    return r ? normalizeMcp(r) : null
  },
  async deleteMcpServer(id: string): Promise<{ ok: boolean }> {
    return trpc.config.deleteMcpServer.mutate({ id })
  },
}