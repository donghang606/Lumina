import { aiProviders, settings } from '../db/schema.js'
import { eq } from 'drizzle-orm'
import type { Context } from './../trpc/context.js'
import { decryptSecret } from '../lib/secrets.js'

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface ActiveProvider {
  name: string
  type: string
  apiKey: string
  baseUrl: string | null
  model: string
  ready: boolean
  reason?: string
}

const DEFAULT_BASE: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
  anthropic: '',
}

export async function getActiveProvider(ctx: Context): Promise<ActiveProvider> {
  const conf = await ctx.db.select().from(settings).where(eq(settings.id, 'main')).get()
  let provider = conf?.defaultProviderId
    ? await ctx.db.select().from(aiProviders).where(eq(aiProviders.id, conf.defaultProviderId)).get()
    : null
  if (!provider?.isActive) {
    provider = (await ctx.db.select().from(aiProviders).where(eq(aiProviders.isActive, true)).limit(1).all())[0] ?? null
  }
  const model = conf?.defaultModel || provider?.models?.[0] || 'gpt-4o-mini'

  if (!provider) {
    return { name: 'none', type: '', apiKey: '', baseUrl: null, model, ready: false, reason: '尚未配置 AI 服务商（Settings → AI Providers）' }
  }
  if (provider.type === 'anthropic') {
    return { name: provider.name, type: 'anthropic', apiKey: decryptSecret(provider.apiKey), baseUrl: provider.baseUrl, model, ready: false, reason: 'Anthropic 暂用 OpenAI 兼容网关接入（可在 baseUrl 配置代理）' }
  }

  const base = (provider.baseUrl || DEFAULT_BASE[provider.type] || '').replace(/\/$/, '')
  if (!base) return { name: provider.name, type: provider.type, apiKey: decryptSecret(provider.apiKey), baseUrl: null, model, ready: false, reason: '缺少 baseUrl' }

  return {
    name: provider.name,
    type: provider.type,
    apiKey: decryptSecret(provider.apiKey),
    baseUrl: base,
    model,
    ready: true,
  }
}

export async function llmChatChatCompletions(ctx: Context, messages: LlmMessage[], opts: { model?: string; maxTokens?: number; temperature?: number } = {}): Promise<string> {
  const p = await getActiveProvider(ctx)
  if (!p.ready) throw new Error(p.reason)
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: opts.model ?? p.model,
        messages,
        max_tokens: opts.maxTokens ?? 1200,
        temperature: opts.temperature ?? 0.4,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    const json = await res.json()
    const content = json?.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('LLM 空回复')
    return content.trim()
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('LLM HTTP')) throw e
    throw new Error(`请求 ${p.name} 失败：${e instanceof Error ? e.message : String(e)}`)
  }
}

export function isConfigured(ctx: Context): Promise<ActiveProvider> {
  return getActiveProvider(ctx)
}

export async function embedTexts(ctx: Context, texts: string[], model?: string): Promise<number[][]> {
  const p = await getActiveProvider(ctx)
  if (!p.ready) throw new Error(p.reason)
  const embedModel = model ?? p.model
  try {
    const res = await fetch(`${p.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}),
      },
      body: JSON.stringify({ model: embedModel, input: texts }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Embeddings HTTP ${res.status}: ${text.slice(0, 200)}`)
    }
    const json = await res.json()
    const data = json?.data as { embedding: number[] }[] | undefined
    if (!Array.isArray(data)) throw new Error('Embeddings 空返回')
    return data.map((d) => d.embedding ?? [])
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Embeddings HTTP')) throw e
    throw new Error(`请求嵌入服务失败：${e instanceof Error ? e.message : String(e)}`)
  }
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

export interface LlmTool {
  name: string
  description?: string
  inputSchema?: Record<string, unknown>
}

export interface LlmToolCallResult {
  content: string
  toolCalls?: { id: string; name: string; input: Record<string, unknown> }[]
}

export async function llmChatChatCompletionsTools(ctx: Context, messages: LlmMessage[], tools: LlmTool[], opts: { model?: string; maxTokens?: number } = {}): Promise<LlmToolCallResult> {
  const p = await getActiveProvider(ctx)
  if (!p.ready) throw new Error(p.reason)
  try {
    const res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(p.apiKey ? { Authorization: `Bearer ${p.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: opts.model ?? p.model,
        messages,
        max_tokens: opts.maxTokens ?? 1200,
        temperature: 0.4,
        tools: tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description ?? '', parameters: t.inputSchema ?? { type: 'object', properties: {} } },
        })),
        tool_choice: 'auto',
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`)
    }
    const json = await res.json()
    const msg = json?.choices?.[0]?.message
    const content = typeof msg?.content === 'string' ? msg.content.trim() : ''
    const calls = msg?.tool_calls as { id?: string; function?: { name?: string; arguments?: string } }[] | undefined
    const toolCalls = (calls ?? [])
      .filter((c) => c.function?.name)
      .map((c) => {
        let input: Record<string, unknown> = {}
        try {
          input = c.function?.arguments ? JSON.parse(c.function.arguments) : {}
        } catch {
          /* ignore */
        }
        return { id: c.id ?? '', name: c.function!.name!, input }
      })
    return { content, toolCalls }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('LLM HTTP')) throw e
    throw new Error(`请求 ${p.name} 失败：${e instanceof Error ? e.message : String(e)}`)
  }
}