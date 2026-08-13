import { describe, it, expect, vi, afterEach } from 'vitest'
import { resolveTranscribeModel, extForMime, transcribeAudio } from './transcribe.js'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveTranscribeModel', () => {
  it('defaults to whisper-1 for chat models', () => {
    expect(resolveTranscribeModel('gpt-4o-mini')).toBe('whisper-1')
    expect(resolveTranscribeModel(null)).toBe('whisper-1')
    expect(resolveTranscribeModel('')).toBe('whisper-1')
  })

  it('keeps audio-capable models', () => {
    expect(resolveTranscribeModel('whisper-1')).toBe('whisper-1')
    expect(resolveTranscribeModel('gpt-4o-transcribe')).toBe('gpt-4o-transcribe')
    expect(resolveTranscribeModel('whisper-large-v3')).toBe('whisper-large-v3')
    expect(resolveTranscribeModel('some-stt-model')).toBe('some-stt-model')
  })
})

describe('extForMime', () => {
  it('maps common mime types to extensions', () => {
    expect(extForMime('audio/webm')).toBe('webm')
    expect(extForMime('audio/mp3')).toBe('mp3')
    expect(extForMime('audio/mpeg')).toBe('mp3')
    expect(extForMime('audio/wav')).toBe('wav')
    expect(extForMime('audio/m4a')).toBe('m4a')
    expect(extForMime('audio/ogg')).toBe('ogg')
  })
})

describe('transcribeAudio', () => {
  const okJson = () => new Response(JSON.stringify({ text: '  hello  ' }), { status: 200 })
  const errJson = () => new Response('{}', { status: 500 })

  it('posts multipart form and returns the transcript', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson())
    vi.stubGlobal('fetch', fetchMock)
    const out = await transcribeAudio({
      baseUrl: 'https://api.openai.com/v1/',
      apiKey: 'sk-test',
      model: 'whisper-1',
      audio: new Uint8Array([1, 2, 3]),
      mime: 'audio/webm',
    })
    expect(out).toEqual({ transcript: 'hello', source: 'whisper' })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.openai.com/v1/audio/transcriptions')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer sk-test')
    const body = init.body as FormData
    const file = body.get('file') as File
    expect(file.name).toBe('recording.webm')
    expect(body.get('model')).toBe('whisper-1')
  })

  it('returns null on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(errJson()))
    const out = await transcribeAudio({ baseUrl: 'https://x', apiKey: '', model: 'whisper-1', audio: new Uint8Array([1]), mime: 'audio/webm' })
    expect(out).toBeNull()
  })

  it('returns null on empty transcript', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{"text":"   "}', { status: 200 })))
    const out = await transcribeAudio({ baseUrl: 'https://x', apiKey: '', model: 'whisper-1', audio: new Uint8Array([1]), mime: 'audio/webm' })
    expect(out).toBeNull()
  })
})
