import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const fetchMock = vi.fn()

vi.stubGlobal('fetch', fetchMock)

import { webSearch, renderWebResults } from './webSearch.js'

describe('webSearch', () => {
  beforeEach(() => {
    fetchMock.mockReset()
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('provider none 返回空', async () => {
    expect(await webSearch({ provider: 'none', apiKey: null }, 'q')).toEqual([])
    expect(await webSearch({ provider: 'tavily', apiKey: null }, 'q')).toEqual([])
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('Tavily 解析 results', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { title: 'A', url: 'https://a.com', content: '内容甲', score: 0.9 },
          { title: 'B', url: 'https://b.com', content: '<b>内容乙</b>', score: 0.5 },
        ],
      }),
    })
    const r = await webSearch({ provider: 'tavily', apiKey: 'k' }, '问题', 2)
    expect(r).toHaveLength(2)
    expect(r[0].title).toBe('A')
    expect(r[0].url).toBe('https://a.com')
    expect(r[0].snippet).toContain('内容甲')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.tavily.com/search',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer k' }),
      }),
    )
  })

  it('Brave 解析 web.results', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        web: {
          results: [
            { title: 'X', url: 'https://x.com', description: '描述x' },
          ],
        },
      }),
    })
    const r = await webSearch({ provider: 'brave', apiKey: 'k' }, 'q', 3)
    expect(r).toHaveLength(1)
    expect(r[0].title).toBe('X')
    expect(r[0].snippet).toContain('描述x')
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toContain('api.search.brave.com/res/v1/web/search')
    expect(init.headers['X-Subscription-Token']).toBe('k')
  })

  it('网络/鉴权失败静默降级为空', async () => {
    fetchMock.mockRejectedValue(new Error('network down'))
    expect(await webSearch({ provider: 'tavily', apiKey: 'k' }, 'q')).toEqual([])
  })

  it('HTTP 非 2xx 返回空', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 401 })
    expect(await webSearch({ provider: 'tavily', apiKey: 'k' }, 'q')).toEqual([])
  })

  it('renderWebResults 拼接参考文本', () => {
    const text = renderWebResults([{ title: 'T', url: 'https://t.com', snippet: '片段', score: 1 }])
    expect(text).toContain('[1] T')
    expect(text).toContain('来源：https://t.com')
    expect(renderWebResults([])).toBe('')
  })
})
