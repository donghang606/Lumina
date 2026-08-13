import express from 'express'
import cors from 'cors'
import { createExpressMiddleware } from '@trpc/server/adapters/express'
import { appRouter } from './routers/_app.js'
import { createContext } from './trpc/context.js'
import { initDb } from './db/client.js'
import { getActiveProvider } from './llm/provider.js'
import { db } from './db/client.js'
import { transcribeAudio, resolveTranscribeModel } from './lib/transcribe.js'

const app = express()
const PORT = 3001

app.use(cors())
app.use('/trpc', createExpressMiddleware({ router: appRouter, createContext }))

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
  try {
    const p = await getActiveProvider({ db, req, res })
    if (p.ready && p.baseUrl) {
      const audio = Buffer.from(audioB64, 'base64')
      if (audio.length > 0) {
        const models = [resolveTranscribeModel(p.model)]
        if (models[0] !== 'whisper-1') models.push('whisper-1')
        for (const model of models) {
          const out = await transcribeAudio({ baseUrl: p.baseUrl, apiKey: p.apiKey, model, audio, mime })
          if (out) return res.json(out)
        }
      }
    }
    const kb = Math.round((audioB64.length * 3 / 4) / 1024)
    res.json({
      transcript: [
        '未配置可用语音转写，暂为占位结果。',
        `已收到 ${kb} KB 音频（${mime}）。前往 Settings → AI Providers 配置支持 audio/transcriptions 的服务商后自动启用。`,
      ].join('\n'),
      source: 'fallback',
    })
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
})

initDb().then(() => {
  app.listen(PORT, () => {
    console.log(`[Lumina Server] http://localhost:${PORT}`)
  })
})

export type { AppRouter } from './routers/_app.js'