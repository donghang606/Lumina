export interface VoiceResult {
  transcript?: string
  source?: string
  error?: string
}

const VOICE_URL = 'http://localhost:3001/api/voice'
const MAX_BYTES = 1024 * 500

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

export async function transcribeAudio(blob: Blob): Promise<VoiceResult> {
  const raw = await blob.arrayBuffer()
  const bytes = new Uint8Array(raw.slice(0, MAX_BYTES))
  const res = await fetch(VOICE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio: bytesToBase64(bytes), mime: blob.type || 'audio/webm' }),
  })
  if (!res.ok) throw new Error(`语音接口 HTTP ${res.status}`)
  return (await res.json()) as VoiceResult
}
