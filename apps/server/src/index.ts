import express from 'express'
import cors from 'cors'
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

const app = express()
const PORT = 3001

app.use(cors())
app.use('/trpc', createExpressMiddleware({ router: appRouter, createContext }))

const luminaMcp = createLuminaMcpServer(db)
const mcpTransport = createLuminaMcpTransport()
app.get('/mcp', (req, res) => {
  mcpTransport.handleRequest(req, res)
})
app.post('/mcp', express.json({ limit: '10mb' }), (req, res) => {
  mcpTransport.handleRequest(req, res, req.body)
})

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

app.get('/health', (_req, res) => res.json({ status: 'ok' }))

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

initDb().then(async () => {
  await luminaMcp.connect(mcpTransport)
  app.listen(PORT, () => {
    console.log(`[Lumina Server] http://localhost:${PORT}`)
  })
})

export type { AppRouter } from './routers/_app.js'