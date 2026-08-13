export function resolveTranscribeModel(providerModel: string | null | undefined): string {
  const m = (providerModel ?? '').trim()
  if (/whisper|transcrib|audio|stt|speech/i.test(m)) return m
  return 'whisper-1'
}

export function extForMime(mime: string): string {
  if (/mpeg|mp3/i.test(mime)) return 'mp3'
  if (/wav|wave/i.test(mime)) return 'wav'
  if (/m4a|aac|mp4/i.test(mime)) return 'm4a'
  if (/ogg|opus/i.test(mime)) return 'ogg'
  return 'webm'
}

export interface TranscribeResult {
  transcript: string
  source: string
}

export async function transcribeAudio(opts: {
  baseUrl: string
  apiKey: string
  model: string
  audio: Uint8Array
  mime: string
}): Promise<TranscribeResult | null> {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(opts.audio)], { type: opts.mime }), `recording.${extForMime(opts.mime)}`)
  form.append('model', opts.model)
  const res = await fetch(`${opts.baseUrl.replace(/\/$/, '')}/audio/transcriptions`, {
    method: 'POST',
    headers: opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : {},
    body: form,
  })
  if (!res.ok) return null
  const j = (await res.json()) as { text?: string }
  const t = j?.text?.trim()
  return t ? { transcript: t, source: 'whisper' } : null
}
