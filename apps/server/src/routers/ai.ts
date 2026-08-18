import { router, publicProcedure, type Context } from '../trpc/context.js'
import { z } from 'zod'
import { notes, noteBlocks, conversations, messages, settings as settingsTable } from '../db/schema.js'
import { like, or, eq, desc, asc, sql } from 'drizzle-orm'
import { llmChatChatCompletions, llmChatChatCompletionsTools, getActiveProvider } from '../llm/provider.js'
import { listMcpTools, callMcpTool } from '../mcp/runner.js'
import { webSearch, renderWebResults } from '../lib/webSearch.js'
import { decryptSecret } from '../lib/secrets.js'

const uuid = () => crypto.randomUUID()

function stripHtml(s: string) {
  return (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

async function saveMessage(ctx: Context, conversationId: string, role: 'user' | 'assistant' | 'system' | 'tool', content: string, toolCalls?: unknown[]) {
  const id = uuid()
  await ctx.db.insert(messages).values({ id, conversationId, role, content, toolCalls: toolCalls ?? undefined, createdAt: new Date().toISOString() })
}

export const aiRouter = router({
  status: publicProcedure.query(async ({ ctx }) => {
    const p = await getActiveProvider(ctx)
    const blocks = await ctx.db.select({ noteId: noteBlocks.noteId }).from(noteBlocks).limit(1).all()
    return {
      ready: p.ready,
      provider: p.name,
      model: p.model,
      reason: p.reason ?? null,
      rag: { hasEmbeddings: blocks.length > 0 },
    }
  }),

  chat: publicProcedure
    .input(z.object({ message: z.string(), noteContext: z.string().optional(), conversationId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const q = input.message.trim()
      if (!q) return { reply: '请说点什么吧～' }
      const p = await getActiveProvider(ctx)

      // Resolve or create conversation
      let convId = input.conversationId
      if (!convId) {
        const id = uuid()
        await ctx.db.insert(conversations).values({ id, title: q.slice(0, 30), model: p.model, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() })
        convId = id
      } else {
        const existing = await ctx.db.select().from(conversations).where(eq(conversations.id, convId)).get()
        if (!existing) return { reply: '⚠️ 会话不存在，请刷新后重试', source: 'error' }
        await ctx.db.update(conversations).set({ updatedAt: new Date().toISOString() }).where(eq(conversations.id, convId))
      }
      await saveMessage(ctx, convId, 'user', q)

      // Load recent history (last 12 messages) for multi-turn context
      const history = await ctx.db
        .select({ role: messages.role, content: messages.content })
        .from(messages)
        .where(eq(messages.conversationId, convId))
        .orderBy(asc(messages.createdAt))
        .limit(50)
        .all()

      // Semantic RAG search (falls back to keyword when no provider / no vectors).
      // Returns structured sources so the frontend can show retrievable citations.
      let sources: { noteId: string; title: string; content: string; score: number }[] = []
      try {
        const r = await ctx.db.select().from(notes).all()
        const blocks = await ctx.db.select().from(noteBlocks).all()
        if (blocks.some((b) => b.embedding)) {
        const { embedTexts, cosineSimilarity } = await import('../llm/provider.js')
          const vector = (await embedTexts(ctx, [q], { task: 'embed' }))[0]
          if (vector?.length) {
            const scored = blocks
              .filter((b) => b.embedding)
              .map((b) => {
                const buf = b.embedding as unknown as Uint8Array
                const stored = new Float64Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
                const note = r.find((n) => n.id === b.noteId)
                return { noteId: b.noteId as string, title: note?.title ?? '(无标题)', content: b.chunkContent, score: cosineSimilarity(vector, Array.from(stored)) }
              })
              .sort((a, b) => b.score - a.score)
              .slice(0, 6)
            if (scored[0]?.score && scored[0].score > 0.15) sources = scored
          }
        }
      } catch {
        // ignore, fall to keyword
      }

      if (sources.length === 0) {
        const kw = q.length <= 8 ? q : q.split(/\s+/).slice(-1)[0]
        const kwHits = await ctx.db
          .select({ title: notes.title, content: notes.content, id: notes.id })
          .from(notes)
          .where(or(like(notes.title, `%${q}%`), like(notes.content, `%${q}%`), like(notes.title, `%${kw}%`), like(notes.content, `%${kw}%`)))
          .limit(6)
          .all()
        sources = kwHits.map((m) => ({ noteId: m.id as string, title: m.title ?? '(无标题)', content: m.content, score: 0 }))
      }
      const cached = sources.map((s) => ({ id: s.noteId, title: s.title, content: s.content }))

      if (!p.ready) {
        const reply = cached.length > 0
          ? `📚 未配置 AI，先给你知识库命中结果（${cached.length} 条）：\n${cached.map((m) => `- ${m.title}: ${stripHtml(m.content).slice(0, 60) || '(空)'}`).join('\n')}\n\n去 Settings → AI Providers 配置后，我会给出真实回答。`
          : '✨ 尚未配置 AI 服务商。请在「设置 → AI Providers」填入 apiKey/model 后回来提问。'
        await saveMessage(ctx, convId, 'assistant', reply)
        return { reply, source: 'fallback', conversationId: convId, sources: sources.map((s) => ({ ...s, score: Math.round(s.score * 1000) / 1000 })) }
      }

      const contextBlock = input.noteContext
        ? `你正在查看笔记：\n${stripHtml(input.noteContext).slice(0, 1500)}`
        : cached.length
          ? `知识库相关内容（供参考）：\n${cached.map((m) => `- [${m.title}] ${stripHtml(m.content).slice(0, 300)}`).join('\n')}`
          : '当前知识库没有直接相关的内容。'

      // 网页搜索增强：配置了 web search 时，联网补充实时信息（失败静默降级）
      let webContext = ''
      try {
        const row = await ctx.db.select().from(settingsTable).limit(1).get()
        const cfg = {
          provider: ((row as any)?.webSearchProvider ?? 'none') as 'none' | 'tavily' | 'brave',
          apiKey: (row as any)?.webSearchApiKey ? decryptSecret((row as any).webSearchApiKey) : null,
        }
        if (cfg.provider !== 'none' && cfg.apiKey) {
          const hits = await webSearch(cfg, q, 4)
          if (hits.length > 0) webContext = `\n\n联网搜索结果（供参考，注意时效性）：\n${renderWebResults(hits)}`
        }
      } catch {
        webContext = ''
      }

      const historyForLlm: { role: 'user' | 'assistant'; content: string }[] = history
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .slice(-12, -1)
        .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content }))

      try {
        // MCP tools round-trip: if configured MCP servers expose tools, give the model one chance to call them
        let mcpTools = [] as Awaited<ReturnType<typeof listMcpTools>>
        try {
          mcpTools = await listMcpTools(ctx)
        } catch {
          /* ignore */
        }
        const system = '你是 Lumina——一个本地优先的个人知识助手。回答简洁、中文、有结构；引用知识库时说明你的判断依据。不要编造笔记中不存在的事实。'
        const finalUserMsg = { role: 'user' as const, content: `${contextBlock}${webContext}\n\n用户问题：${q}` }

        let reply: string
        let source: string
        if (mcpTools.length > 0) {
          const first = await llmChatChatCompletionsTools(ctx, [
            { role: 'system', content: `${system}\n\n你有以下可用工具（MCP）：\n${mcpTools.map((t) => `- ${t.name}${t.description ? `：${t.description}` : ''}（${t.server}）`).join('\n')}` },
            ...historyForLlm,
            finalUserMsg,
          ], mcpTools.map((t) => ({ name: t.name, description: t.description, inputSchema: undefined })), { task: 'chat' })
          if (first.toolCalls?.length) {
            const toolResults = []
            for (const tc of first.toolCalls) {
              const server = mcpTools.find((t) => t.name === tc.name)?.server
              if (!server) continue
              const r = await callMcpTool(ctx, { server, tool: tc.name, input: tc.input })
              toolResults.push(`工具 ${tc.name} 返回：${r.error ?? JSON.stringify(r.result).slice(0, 1000)}`)
            }
            const msgs: { role: 'user' | 'assistant'; content: string }[] = [
              { role: 'assistant', content: first.content },
              { role: 'user', content: toolResults.join('\n') || '工具没有返回结果。' },
            ]
            reply = await llmChatChatCompletions(ctx, [
              { role: 'system', content: system },
              ...historyForLlm,
              finalUserMsg,
              ...msgs,
            ], { task: 'chat' })
            source = 'mcp'
          } else {
            reply = first.content || '（模型未返回文字）'
            source = 'mcp'
          }
        } else {
          reply = await llmChatChatCompletions(ctx, [
            { role: 'system', content: system },
            ...historyForLlm,
            finalUserMsg,
          ], { task: 'chat' })
          source = 'llm'
        }

        await saveMessage(ctx, convId, 'assistant', reply)
        return { reply, source, conversationId: convId, sources: sources.map((s) => ({ ...s, score: Math.round(s.score * 1000) / 1000 })) }
      } catch (e) {
        const reply = `⚠️ ${e instanceof Error ? e.message : 'AI 调用失败'}`
        await saveMessage(ctx, convId, 'assistant', reply)
        return { reply, source: 'error', conversationId: convId, sources: sources.map((s) => ({ ...s, score: Math.round(s.score * 1000) / 1000 })) }
      }
    }),

  summarize: publicProcedure
    .input(z.object({ text: z.string().min(1).max(20000) }))
    .mutation(async ({ ctx, input }) => {
      const p = await getActiveProvider(ctx)
      if (!p.ready) throw new Error(p.reason)
      const clean = stripHtml(input.text).slice(0, 4000)
      return llmChatChatCompletions(ctx, [
        { role: 'system', content: '为这段内容生成一句 ≤40 字的中文摘要，只输出摘要本身，不要引号。' },
        { role: 'user', content: clean },
      ], { maxTokens: 120, task: 'summary' })
    }),

  transform: publicProcedure
    .input(
      z.object({
        text: z.string().min(1).max(20000),
        mode: z.enum(['polish', 'rewrite', 'translate', 'shorten', 'expand']),
        targetLang: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const p = await getActiveProvider(ctx)
      if (!p.ready) throw new Error(p.reason)
      const clean = stripHtml(input.text).slice(0, 6000)
      const PROMPTS: Record<string, string> = {
        polish: '润色以下文本：保持原意与语气，修正错别字和病句，让表达更流畅自然。只输出润色后的文本。',
        rewrite: '改写以下文本：保留核心信息，用更清晰、有感染力的方式重新表达。只输出改写后的文本。',
        translate: `把以下文本翻译成${input.targetLang || '中文'}，保持原意与格式。只输出译文。`,
        shorten: '把以下文本压缩到一半以内，保留关键信息。只输出压缩后的文本。',
        expand: '扩写以下文本：补充细节与示例，使其更充实完整，保持原有结构。只输出扩写后的文本。',
      }
      return llmChatChatCompletions(ctx, [
        { role: 'system', content: PROMPTS[input.mode] },
        { role: 'user', content: clean },
      ], { task: 'chat' })
    }),

  suggestTags: publicProcedure
    .input(z.object({ title: z.string().max(200), text: z.string().max(20000), existing: z.array(z.string()).default([]) }))
    .mutation(async ({ ctx, input }) => {
      const p = await getActiveProvider(ctx)
      if (!p.ready) throw new Error(p.reason)
      let existing = input.existing
      if (existing.length === 0) {
        const tags = await ctx.db.select({ name: notes.title }).from(notes).where(like(notes.type, '%')).limit(50).all().catch(() => [])
        existing = []
      }
      const clean = `${input.title}\n${stripHtml(input.text).slice(0, 2000)}`
      const raw = await llmChatChatCompletions(ctx, [
        { role: 'system', content: '为下面内容推荐 1~3 个中文标签，用顿号分隔，只输出标签本身。' },
        { role: 'user', content: clean },
      ], { maxTokens: 60, task: 'tags' })
      const tags = raw.split(/[、,，\s]+/).map((t) => t.replace(/^#/, '').trim()).filter(Boolean).slice(0, 3)
      return tags
    }),

  listConversations: publicProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: conversations.id,
        title: conversations.title,
        model: conversations.model,
        updatedAt: conversations.updatedAt,
        createdAt: conversations.createdAt,
      })
      .from(conversations)
      .orderBy(desc(conversations.updatedAt))
      .all()
    const counts = await ctx.db.select({ conversationId: messages.conversationId, count: sql<number>`count(*)` }).from(messages).groupBy(messages.conversationId).all()
    const countMap = new Map(counts.map((c) => [c.conversationId as string, c.count as number]))
    return rows.map((r) => ({ ...r, messageCount: countMap.get(r.id) ?? 0 }))
  }),

  getConversation: publicProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const conv = await ctx.db.select().from(conversations).where(eq(conversations.id, input.id)).get()
    if (!conv) return null
    const msgs = await ctx.db
      .select({ role: messages.role, content: messages.content, createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.conversationId, input.id))
      .orderBy(asc(messages.createdAt))
      .all()
    return { ...conv, messages: msgs }
  }),

  deleteConversation: publicProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await ctx.db.delete(conversations).where(eq(conversations.id, input.id))
    return { ok: true }
  }),

  renameConversation: publicProcedure
    .input(z.object({ id: z.string(), title: z.string().min(1).max(60) }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.update(conversations).set({ title: input.title }).where(eq(conversations.id, input.id))
      return { ok: true }
    }),
})

export type AiRouter = typeof aiRouter