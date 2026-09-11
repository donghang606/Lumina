import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './routers/_app.js'
import { createContext } from './trpc/context.js'
import { initDb, db } from './db/client.js'
import { settings } from './db/schema.js'
import { eq } from 'drizzle-orm'
import { getActiveProvider } from './llm/provider.js'
import { transcribeAudio, resolveTranscribeModel } from './lib/transcribe.js'
import { decryptSecret } from './lib/secrets.js'
import { createLuminaMcpServer, createLuminaMcpTransport } from './mcp/luminaServer.js'
import { runAgentTurn, type AgentEvent } from './agent/runner.js'

const app = express()
const PORT = Number(process.env.LUMINA_PORT ?? 3001)

app.use(cors())
app.use('/trpc', express.json({ limit: '10mb' }), createExpressMiddleware({ router: appRouter, createContext }))

// 无状态模式：每个 HTTP 请求独立 server+transport（官方无状态写法，支持任意 MCP 客户端并发连接）
const handleMcp = async (req: import('express').Request, res: import('express').Response, body?: unknown) => {
  const server = createLuminaMcpServer(db)
  const transport = createLuminaMcpTransport()
  try {
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  } catch (e) {
    if (!res.headersSent) res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
app.get('/mcp', (req, res) => handleMcp(req, res))
app.post('/mcp', express.json({ limit: '10mb' }), (req, res) => handleMcp(req, res, req.body))

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

// Agent SSE 流式端点：POST /api/agent/chat → text/event-stream
// 事件类型：tool-call / tool-result / interrupt / done / error
app.post('/api/agent/chat', express.json({ limit: '5mb' }), async (req, res) => {
  const ctx = createContext({ req, res } as never)
  const body = (req.body ?? {}) as { message?: string; conversationId?: string; resume?: { threadId: string; decision: 'approve' | 'reject' } }

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  const send = (event: AgentEvent) => {
    res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.payload ?? {})}\n\n`)
  }

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 15000)
  req.on('close', () => clearInterval(heartbeat))

  try {
    const result = await runAgentTurn(
      ctx,
      { message: body.message ?? '', conversationId: body.conversationId, resume: body.resume },
      send,
    )
    send({ type: 'done', payload: { conversationId: result.conversationId, reply: result.reply, pendingApproval: result.pendingApproval ?? null, threadId: result.threadId } })
  } catch (e) {
    send({ type: 'error', payload: e instanceof Error ? e.message : String(e) })
  } finally {
    clearInterval(heartbeat)
    res.end()
  }
})

app.post('/api/extension/collect', express.json({ limit: '10mb' }), async (req, res) => {
  try {
    const { doCollect } = await import('./routers/extension.js')
    const result = await doCollect({ db }, req.body ?? {})
    res.json(result)
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

app.post('/api/voice', express.json({ limit: '25mb' }), async (req, res) => {
  const audioB64 = req.body?.audio as string | undefined
  const mime = (req.body?.mime as string) || 'audio/webm'
  if (!audioB64) return res.status(400).json({ error: 'missing audio' })
  const audio = Buffer.from(audioB64, 'base64')
  if (audio.length === 0) return res.status(400).json({ error: 'empty audio' })
  try {
    let baseUrl = ''
    let apiKey = ''
    let model = ''
    let sourceLabel = ''

    const conf = await db.select().from(settings).where(eq(settings.id, 'main')).get()
    if (conf?.sttEnabled && conf?.sttBaseUrl) {
      baseUrl = conf.sttBaseUrl.replace(/\/+$/, '')
      apiKey = conf.sttApiKey ? decryptSecret(conf.sttApiKey) : ''
      model = (conf.sttModel ?? '').trim() || 'whisper-1'
      sourceLabel = 'stt'
    } else {
      const p = await getActiveProvider({ db, req, res }, 'transcribe')
      if (p.ready && p.baseUrl) {
        baseUrl = p.baseUrl
        apiKey = p.apiKey
        model = resolveTranscribeModel(p.model)
        sourceLabel = 'provider'
      }
    }

    if (baseUrl) {
      const models = [model]
      if (models[0] !== 'whisper-1') models.push('whisper-1')
      for (const m of models) {
        const out = await transcribeAudio({ baseUrl, apiKey, model: m, audio, mime })
        if (out) {
          return res.json({ ...out, source: sourceLabel })
        }
      }
    }
    const kb = Math.round((audioB64.length * 3 / 4) / 1024)
    res.json({
      transcript: [
        '未配置可用语音转写，暂为占位结果。',
        `已收到 ${kb} KB 音频（${mime}）。前往 Settings → AI → 语音转写 配置独立 STT，或让默认 Provider 支持 audio/transcriptions。`,
      ].join('\n'),
      source: 'fallback',
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

// Electron 生产模式：托管打包前端静态资源（LUMINA_WEB_DIST 指向 resources/web/dist）
const webDist = process.env.LUMINA_WEB_DIST
if (webDist) {
  app.use(express.static(webDist))
  // SPA fallback：非 /api / /trpc / /mcp / /health 请求回落 index.html
  app.get(/^(?!\/(api|trpc|mcp|health)).*/, (_req, res) => {
    res.sendFile(path.join(webDist, 'index.html'))
  })
}

initDb().then(async () => {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`[Lumina Server] http://127.0.0.1:${PORT}`)
  })
})

export type { AppRouter } from './routers/_app.js'