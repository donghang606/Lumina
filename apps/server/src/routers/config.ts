import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { settings, aiProviders, mcpServers } from '../db/schema.js'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { disposeMcp } from '../mcp/runner.js'
import { encryptSecret, decryptSecret, maskSecret } from '../lib/secrets.js'

const DEFAULT_SETTINGS_ID = 'main'

function resolveApiKey(stored: string | null | undefined, submitted: string | null | undefined): string {
  const current = stored ?? ''
  if (!submitted) return current
  const plain = decryptSecret(current)
  if (plain === submitted || submitted.startsWith('****')) return current
  return encryptSecret(submitted)
}

export const configRouter = router({
  get: publicProcedure.query(async ({ ctx }) => {
    let row = await ctx.db.select().from(settings).where(eq(settings.id, DEFAULT_SETTINGS_ID)).get()
    if (!row) {
      const now = new Date().toISOString()
      row = {
        id: DEFAULT_SETTINGS_ID,
        theme: 'light' as const,
        skin: 'glass' as const,
        locale: 'zh-CN',
        autoTag: true,
        autoSummary: true,
        autoClassify: false,
        defaultProviderId: null,
        defaultModel: null,
        taskModels: {},
        serverUrl: null,
        sttEnabled: false,
        sttBaseUrl: null,
        sttApiKey: null,
        sttModel: null,
      }
      await ctx.db.insert(settings).values(row).run()
    }
    return {
      ...row,
      sttApiKey: row.sttApiKey ? maskSecret(decryptSecret(row.sttApiKey)) : null,
    }
  }),

  update: publicProcedure
    .input(
      z.object({
        theme: z.enum(['light', 'dark']).optional(),
        skin: z.enum(['glass', 'nothing', 'bloomberg', 'effect']).optional(),
        locale: z.string().optional(),
        autoTag: z.boolean().optional(),
        autoSummary: z.boolean().optional(),
        autoClassify: z.boolean().optional(),
        defaultProviderId: z.string().nullable().optional(),
        defaultModel: z.string().nullable().optional(),
        taskModels: z.record(z.string(), z.string()).optional(),
        serverUrl: z.string().nullable().optional(),
        sttEnabled: z.boolean().optional(),
        sttBaseUrl: z.string().nullable().optional(),
        sttApiKey: z.string().nullable().optional(),
        sttModel: z.string().nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { sttApiKey, ...rest } = input
      const current = await ctx.db.select().from(settings).where(eq(settings.id, DEFAULT_SETTINGS_ID)).get()
      const payload: Record<string, unknown> = { ...rest }
      if (sttApiKey !== undefined) {
        payload.sttApiKey = resolveApiKey(current?.sttApiKey, sttApiKey)
      }
      await ctx.db
        .update(settings)
        .set(payload)
        .where(eq(settings.id, DEFAULT_SETTINGS_ID))
        .run()
      const saved = await ctx.db.select().from(settings).where(eq(settings.id, DEFAULT_SETTINGS_ID)).get()
      return {
        ...saved,
        sttApiKey: saved?.sttApiKey ? maskSecret(decryptSecret(saved.sttApiKey)) : null,
      }
    }),

  listProviders: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.select().from(aiProviders).orderBy(aiProviders.order).all()
    return rows.map((p) => ({ ...p, apiKey: maskSecret(decryptSecret(p.apiKey)) }))
  }),

  upsertProvider: publicProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        type: z.enum(['openai', 'anthropic', 'ollama', 'deepseek', 'custom']),
        apiKey: z.string().default(''),
        baseUrl: z.string().nullable().optional(),
        models: z.array(z.string()).default([]),
        isActive: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      if (input.id) {
        const existing = await ctx.db.select().from(aiProviders).where(eq(aiProviders.id, input.id)).get()
        await ctx.db
          .update(aiProviders)
          .set({
            name: input.name,
            type: input.type,
            apiKey: resolveApiKey(existing?.apiKey, input.apiKey),
            baseUrl: input.baseUrl ?? null,
            models: input.models,
            isActive: input.isActive,
          })
          .where(eq(aiProviders.id, input.id))
          .run()
        return ctx.db.select().from(aiProviders).where(eq(aiProviders.id, input.id)).get()
      }
      const id = randomUUID()
      await ctx.db.insert(aiProviders).values({
        id,
        name: input.name,
        type: input.type,
        apiKey: encryptSecret(input.apiKey),
        baseUrl: input.baseUrl ?? null,
        models: input.models,
        isActive: input.isActive,
        order: 0,
      })
      return ctx.db.select().from(aiProviders).where(eq(aiProviders.id, id)).get()
    }),

  deleteProvider: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(aiProviders).where(eq(aiProviders.id, input.id)).run()
    return { ok: true }
  }),

  listOllamaModels: publicProcedure
    .input(z.object({ baseUrl: z.string().optional().nullable() }))
    .query(async ({ input }) => {
      const { fetchOllamaModels } = await import('../llm/provider.js')
      return fetchOllamaModels(input.baseUrl ?? '')
    }),

  listMcpServers: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(mcpServers).orderBy(mcpServers.name).all()
  }),

  upsertMcpServer: publicProcedure
    .input(
      z.object({
        id: z.string().optional(),
        name: z.string(),
        command: z.string(),
        args: z.array(z.string()).default([]),
        env: z.record(z.string(), z.string()).default({}),
        isActive: z.boolean().default(false),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      if (input.id) {
        await ctx.db
          .update(mcpServers)
          .set({ name: input.name, command: input.command, args: input.args, env: input.env, isActive: input.isActive })
          .where(eq(mcpServers.id, input.id))
          .run()
        await disposeMcp()
        return ctx.db.select().from(mcpServers).where(eq(mcpServers.id, input.id)).get()
      }
      const id = randomUUID()
      await ctx.db.insert(mcpServers).values({ id, name: input.name, command: input.command, args: input.args, env: input.env, isActive: input.isActive, createdAt: now })
      await disposeMcp()
      return ctx.db.select().from(mcpServers).where(eq(mcpServers.id, id)).get()
    }),

  deleteMcpServer: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(mcpServers).where(eq(mcpServers.id, input.id)).run()
    await disposeMcp()
    return { ok: true }
  }),
})