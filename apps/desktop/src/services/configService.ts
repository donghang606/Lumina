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
  taskModels: Record<string, string>
  serverUrl: string | null
  sttEnabled: boolean
  sttBaseUrl: string | null
  sttApiKey: string | null
  sttModel: string | null
  webSearchProvider: 'none' | 'tavily' | 'brave'
  webSearchApiKey: string | null
}

function normalizeSettings(s: any): Settings {
  return {
    id: s.id ?? 'main',
    theme: s.theme ?? 'light',
    skin: s.skin ?? 'glass',
    locale: s.locale ?? 'zh-CN',
    autoTag: s.autoTag ?? true,
    autoSummary: s.autoSummary ?? true,
    autoClassify: s.autoClassify ?? false,
    defaultProviderId: s.defaultProviderId ?? null,
    defaultModel: s.defaultModel ?? null,
    taskModels: s.taskModels ?? {},
    serverUrl: s.serverUrl ?? null,
    sttEnabled: s.sttEnabled ?? false,
    sttBaseUrl: s.sttBaseUrl ?? null,
    sttApiKey: s.sttApiKey ?? null,
    sttModel: s.sttModel ?? null,
    webSearchProvider: s.webSearchProvider ?? 'none',
    webSearchApiKey: s.webSearchApiKey ?? null,
  }
}

function normalizeProvider(p: any): AiProvider {
  return { ...p, models: p.models ?? [] }
}

function normalizeMcp(m: any): McpServer {
  return { ...m, args: m.args ?? [], env: m.env ?? {}, tools: m.tools ?? [] }
}

export const configService = {
  async getSettings(): Promise<Settings | null> {
    const r = await trpc.config.get.query()
    return r ? normalizeSettings(r) : null
  },
  async updateSettings(input: Partial<Settings>): Promise<Settings | null> {
    const r = await trpc.config.update.mutate(input)
    return r ? normalizeSettings(r) : null
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
  async listOllamaModels(baseUrl?: string | null): Promise<{ chat: string[]; embed: string[] }> {
    return trpc.config.listOllamaModels.query({ baseUrl: baseUrl ?? '' })
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
  async webSearchNow(query: string): Promise<{ configured: boolean; provider: string; results: { title: string; url: string; snippet: string; score: number }[] }> {
    return trpc.config.webSearchNow.query({ query })
  },
}