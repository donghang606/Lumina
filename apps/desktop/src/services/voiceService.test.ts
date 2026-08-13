import { describe, it, expect, vi, afterEach } from 'vitest'
import { bytesToBase64, transcribeAudio } from './voiceService'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('bytesToBase64', () => {
  it('roundtrips through atob', () => {
    const bytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
    expect(atob(bytesToBase64(bytes))).toBe('Hello')
  })

  it('handles chunks larger than the 0x8000 apply limit without overflowing the stack', () => {
    const size = 200_000
    const bytes = new Uint8Array(size).fill(65) // 'A'
    const out = bytesToBase64(bytes)
    expect(out.length).toBe(Math.ceil(size / 3) * 4)
    const decoded = atob(out)
    expect(decoded.charCodeAt(0)).toBe(65)
    expect(decoded.charCodeAt(size - 1)).toBe(65)
  })

  it('handles empty input', () => {
    expect(bytesToBase64(new Uint8Array(0))).toBe('')
  })
})

describe('transcribeAudio', () => {
  it('posts base64 audio with mime and returns the transcript', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ transcript: '转写结果' }), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const blob = new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' })
    const out = await transcribeAudio(blob)

    expect(out.transcript).toBe('转写结果')
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('http://localhost:3001/api/voice')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/json')
    const body = JSON.parse(init.body)
    expect(body.mime).toBe('audio/webm')
    expect(atob(body.audio)).toBe('\u0001\u0002\u0003')
  })

  it('throws on non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 500 })))
    await expect(transcribeAudio(new Blob([new Uint8Array([1])]))).rejects.toThrow('语音接口 HTTP 500')
  })

  it('defaults the mime to audio/webm when the blob has no type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await transcribeAudio(new Blob([new Uint8Array([1])]))
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body.mime).toBe('audio/webm')
  })
})
