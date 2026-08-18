/**
 * 网页搜索集成：支持 Tavily（推荐，含回答摘要）与 Brave Search API。
 * - Tavily：POST /search，返回 answer + results[]（title/url/content）。
 * - Brave：GET /res/v1/web/search，返回 web.results[]（title/url/description）。
 * 两者均无需额外 SDK，直接 fetch 即可。未配置时返回空结果，由调用方降级。
 */

export type WebSearchProvider = 'tavily' | 'brave' | 'none'

export interface WebSearchConfig {
  provider: WebSearchProvider
  apiKey: string | null
}

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
  score: number
}

const TAVILY_ENDPOINT = 'https://api.tavily.com/search'
const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search'

async function tavilySearch(apiKey: string, query: string, limit: number): Promise<WebSearchResult[]> {
  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      query,
      max_results: limit,
      search_depth: 'basic',
      include_answer: false,
    }),
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Tavily HTTP ${res.status}`)
  const data = (await res.json()) as {
    results?: { title?: string; url?: string; content?: string; score?: number }[]
  }
  return (data.results ?? []).map((r) => ({
    title: r.title ?? '(无标题)',
    url: r.url ?? '',
    snippet: (r.content ?? '').slice(0, 300),
    score: r.score ?? 0,
  }))
}

async function braveSearch(apiKey: string, query: string, limit: number): Promise<WebSearchResult[]> {
  const url = new URL(BRAVE_ENDPOINT)
  url.searchParams.set('q', query)
  url.searchParams.set('count', String(limit))
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    signal: AbortSignal.timeout(10000),
  })
  if (!res.ok) throw new Error(`Brave HTTP ${res.status}`)
  const data = (await res.json()) as {
    web?: { results?: { title?: string; url?: string; description?: string }[] }
  }
  return (data.web?.results ?? []).map((r) => ({
    title: r.title ?? '(无标题)',
    url: r.url ?? '',
    snippet: (r.description ?? '').slice(0, 300),
    score: 1,
  }))
}

/** 执行网页搜索。provider 为 none 或缺少 key 时返回空数组。 */
export async function webSearch(cfg: WebSearchConfig, query: string, limit = 5): Promise<WebSearchResult[]> {
  if (cfg.provider === 'none' || !cfg.apiKey) return []
  const useLimit = Math.max(1, Math.min(10, limit))
  try {
    if (cfg.provider === 'tavily') return await tavilySearch(cfg.apiKey, query, useLimit)
    if (cfg.provider === 'brave') return await braveSearch(cfg.apiKey, query, useLimit)
    return []
  } catch {
    return [] // 网络/鉴权失败静默降级，不影响本地 RAG
  }
}

/** 把搜索结果拼成给 LLM 的参考文本 */
export function renderWebResults(results: WebSearchResult[]): string {
  if (results.length === 0) return ''
  return results.map((r, i) => `[${i + 1}] ${r.title}\n${r.snippet}\n来源：${r.url}`).join('\n\n')
}