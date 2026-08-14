import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../db/schema.js'
import { initDb } from '../db/client.js'
import { getActiveProvider, cosineSimilarity, fetchOllamaModels } from './provider.js'
import type { Context } from '../trpc/context.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('provider', () => {
  let client: Client
  let ctx: Context
  let tmpFile: string
  const now = new Date().toISOString()

  beforeEach(async () => {
    tmpFile = path.join(os.tmpdir(), `lumina-provider-${randomUUID()}.db`)
    client = createClient({ url: `file:${tmpFile}` })
    await initDb(client)
    const db = drizzle(client, { schema })
    ctx = { db } as unknown as Context
  })

  afterEach(async () => {
    try {
      const r = (client as unknown as { close?: () => unknown }).close?.()
      if (r && typeof (r as Promise<void>).catch === 'function') await (r as Promise<void>).catch(() => undefined)
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpFile, { force: true })
  })

  async function insertProvider(row: Partial<typeof schema.aiProviders.$inferInsert> & { id: string }) {
    await ctx.db.insert(schema.aiProviders).values({
      name: 'p',
      type: 'openai',
      apiKey: '',
      isActive: false,
      order: 0,
      models: [],
      ...row,
    })
  }

  describe('getActiveProvider', () => {
    it('returns not-ready when nothing configured', async () => {
      const p = await getActiveProvider(ctx)
      expect(p.ready).toBe(false)
      expect(p.name).toBe('none')
      expect(p.reason).toContain('尚未配置')
    })

    it('picks the active provider as fallback', async () => {
      await insertProvider({ id: 'a', isActive: false, apiKey: 'sk-a' })
      await insertProvider({ id: 'b', isActive: true, apiKey: 'sk-b', type: 'openai' })
      const p = await getActiveProvider(ctx)
      expect(p.ready).toBe(true)
      expect(p.apiKey).toBe('sk-b')
      expect(p.baseUrl).toBe('https://api.openai.com/v1')
    })

    it('prefers the default provider', async () => {
      await insertProvider({ id: 'def', isActive: true, apiKey: 'sk-def' })
      await insertProvider({ id: 'act', isActive: true, apiKey: 'sk-act' })
      await ctx.db.insert(schema.settings).values({ id: 'main', defaultProviderId: 'def' })
      const p = await getActiveProvider(ctx)
      expect(p.apiKey).toBe('sk-def')
    })

    it('strips trailing slash and uses configured baseUrl', async () => {
      await insertProvider({ id: 'x', isActive: true, apiKey: 'sk-x', baseUrl: 'https://proxy.example.com/v1/' })
      const p = await getActiveProvider(ctx)
      expect(p.baseUrl).toBe('https://proxy.example.com/v1')
      expect(p.ready).toBe(true)
    })

    it('flags anthropic as not-ready via proxy note', async () => {
      await insertProvider({ id: 'a', isActive: true, type: 'anthropic', apiKey: 'sk-a' })
      const p = await getActiveProvider(ctx)
      expect(p.type).toBe('anthropic')
      expect(p.ready).toBe(false)
      expect(p.reason).toContain('网关')
    })

    it('missing baseUrl for unknown type → not ready', async () => {
      await insertProvider({ id: 'c', isActive: true, type: 'custom', apiKey: '' })
      const p = await getActiveProvider(ctx)
      expect(p.ready).toBe(false)
      expect(p.reason).toContain('缺少 baseUrl')
    })

    it('uses task-specific model when configured', async () => {
      await insertProvider({ id: 'a', isActive: true, apiKey: 'sk-a', models: ['gpt-4o'] })
      await ctx.db.insert(schema.settings).values({ id: 'main', taskModels: { chat: 'gpt-4o', embed: 'text-embedding-3-small' } })
      const chat = await getActiveProvider(ctx, 'chat')
      expect(chat.model).toBe('gpt-4o')
      const embed = await getActiveProvider(ctx, 'embed')
      expect(embed.model).toBe('text-embedding-3-small')
    })

    it('falls back to defaultModel then provider model for tasks', async () => {
      await insertProvider({ id: 'a', isActive: true, apiKey: 'sk-a', models: ['deepseek-chat'] })
      await ctx.db.insert(schema.settings).values({ id: 'main', defaultModel: 'deepseek-chat', taskModels: {} })
      const p = await getActiveProvider(ctx, 'tags')
      expect(p.model).toBe('deepseek-chat')
    })

    it('task routing does not change default behavior when no settings', async () => {
      await insertProvider({ id: 'a', isActive: true, apiKey: 'sk-a', models: ['gpt-4o-mini'] })
      const p = await getActiveProvider(ctx, 'summary')
      expect(p.model).toBe('gpt-4o-mini')
    })
  })

  describe('cosineSimilarity', () => {
    it('identical vectors → 1', () => {
      expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1)
    })
    it('orthogonal → 0', () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0)
    })
    it('opposite → -1', () => {
      expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1)
    })
    it('proportional → 1', () => {
      expect(cosineSimilarity([1, 2, 3], [2, 4, 6])).toBeCloseTo(1)
    })
    it('empty or mismatched → 0', () => {
      expect(cosineSimilarity([], [1, 2])).toBe(0)
      expect(cosineSimilarity([1, 2], [1])).toBe(0)
      expect(cosineSimilarity([0, 0], [0, 0])).toBe(0)
    })
  })

  describe('fetchOllamaModels', () => {
    it('partitions chat vs embedding models', async () => {
      const fake = async (url: string) => {
        expect(url).toBe('http://localhost:11434/api/tags')
        return {
          ok: true,
          json: async () => ({
            models: [
              { name: 'llama3.2:3b' },
              { name: 'qwen2.5:7b' },
              { name: 'nomic-embed-text:latest' },
              { name: 'bge-m3:latest' },
            ],
          }),
        } as unknown as Response
      }
      const orig = globalThis.fetch
      globalThis.fetch = fake as any
      try {
        const r = await fetchOllamaModels('http://localhost:11434')
        expect(r.chat).toEqual(['llama3.2:3b', 'qwen2.5:7b'])
        expect(r.embed).toEqual(['nomic-embed-text:latest', 'bge-m3:latest'])
      } finally {
        globalThis.fetch = orig
      }
    })

    it('returns empty lists when no models', async () => {
      const orig = globalThis.fetch
      globalThis.fetch = (async () => ({ ok: true, json: async () => ({ models: [] }) })) as any
      try {
        const r = await fetchOllamaModels('')
        expect(r.chat).toEqual([])
        expect(r.embed).toEqual([])
      } finally {
        globalThis.fetch = orig
      }
    })
  })
})
