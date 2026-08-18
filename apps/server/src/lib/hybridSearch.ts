/**
 * 混合检索：BM25 关键词 + 语义向量，经 RRF（Reciprocal Rank Fusion）融合排序。
 * - BM25 基于词频/文档长度/逆文档频率，无需外部服务，纯本地全文检索。
 * - 语义分数由向量余弦相似度提供（依赖嵌入 provider）。
 * - RRF 融合两个排名列表：score = Σ 1/(k + rank)，k 通常取 60。
 */

export interface SearchableDoc {
  id: string
  title: string
  content: string
}

export interface Bm25Hit {
  id: string
  title: string
  snippet: string
  bm25: number
}

const K = 60 // RRF 常量
const B = 0.75
const K1 = 1.5

/** 词元化：小写、按非字母数字切分，中文按字切分 */
export function tokenize(text: string): string[] {
  const s = (text ?? '').toLowerCase()
  const ascii = s.match(/[a-z0-9]+/g) ?? []
  const cjk = (s.match(/[\u4e00-\u9fff]/g) ?? [])
  return [...ascii, ...cjk]
}

function docLen(tokens: string[]): number {
  return tokens.length
}

/** 计算每个文档的 BM25 得分（与查询逐词打分） */
export function bm25Score(query: string, docs: SearchableDoc[]): Bm25Hit[] {
  const qTokens = tokenize(query)
  if (qTokens.length === 0) return []

  const tokenized = docs.map((d) => {
    const titleTokens = tokenize(d.title)
    const contentTokens = tokenize(d.content)
    return { d, titleTokens, contentTokens, len: titleTokens.length + contentTokens.length }
  })

  const avgdl = tokenized.reduce((sum, t) => sum + t.len, 0) / Math.max(1, tokenized.length)

  // 逆文档频率（对标题加权：标题词计 2 次）
  const df = new Map<string, number>()
  for (const t of tokenized) {
    const seen = new Set<string>()
    for (const w of [...t.titleTokens, ...t.titleTokens, ...t.contentTokens]) {
      if (!seen.has(w)) {
        seen.add(w)
        df.set(w, (df.get(w) ?? 0) + 1)
      }
    }
  }
  const N = tokenized.length
  const idf = (w: string) => {
    const n = df.get(w) ?? 0
    return Math.log(1 + (N - n + 0.5) / (n + 0.5))
  }

  const hits: Bm25Hit[] = []
  for (const { d, titleTokens, contentTokens, len } of tokenized) {
    const tf = new Map<string, number>()
    for (const w of [...titleTokens, ...titleTokens, ...contentTokens]) tf.set(w, (tf.get(w) ?? 0) + 1)

    let score = 0
    for (const w of qTokens) {
      const f = tf.get(w) ?? 0
      if (f === 0) continue
      const denom = f + K1 * (1 - B + (B * len) / Math.max(1, avgdl))
      score += idf(w) * ((f * (K1 + 1)) / denom)
    }
    if (score > 0) {
      const title = d.title || '(无标题)'
      const snippet = stripHtml(d.content).slice(0, 160)
      hits.push({ id: d.id, title, snippet, bm25: score })
    }
  }

  hits.sort((a, b) => b.bm25 - a.bm25)
  return hits
}

/** 将候选集按分数排序得到排名（降序，同分并列给相同名次） */
export function rankByScores<T>(items: T[], scoreOf: (t: T) => number): Map<string, number> {
  const sorted = [...items].sort((a, b) => scoreOf(b) - scoreOf(a))
  const rank = new Map<string, number>()
  sorted.forEach((item, i) => rank.set((item as { id: string }).id, i + 1))
  return rank
}

export interface FusedHit {
  id: string
  title: string
  snippet: string
  score: number
  bm25: number | null
  semantic: number | null
}

/** RRF 融合 BM25 排名与语义排名 */
export function fuseRanks(
  bm25Hits: Bm25Hit[],
  semanticRank: Map<string, number>,
  semanticScores: Map<string, number>,
): FusedHit[] {
  const bm25Rank = rankByScores(bm25Hits, (h) => h.bm25)
  const seen = new Map<string, FusedHit>()

  for (const h of bm25Hits) {
    const r = bm25Rank.get(h.id) ?? Infinity
    const sr = semanticRank.get(h.id)
    const score = 1 / (K + r) + (sr ? 1 / (K + sr) : 0)
    seen.set(h.id, {
      id: h.id,
      title: h.title,
      snippet: h.snippet,
      score,
      bm25: h.bm25,
      semantic: sr ? (semanticScores.get(h.id) ?? null) : null,
    })
  }
  // 仅命中语义、未命中关键词的文档也纳入
  for (const [id, r] of semanticRank) {
    if (seen.has(id)) continue
    const score = 1 / (K + r)
    seen.set(id, {
      id,
      title: '',
      snippet: '',
      score,
      bm25: null,
      semantic: semanticScores.get(id) ?? null,
    })
  }

  return [...seen.values()].sort((a, b) => b.score - a.score)
}

function stripHtml(s: string): string {
  return (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\[\[|\]\]/g, ' ').replace(/\s+/g, ' ').trim()
}
