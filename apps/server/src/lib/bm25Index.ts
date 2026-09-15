/**
 * BM25 内存倒排索引（增量缓存）。
 *
 * 背景：纯函数 bm25Score 每次查询全库重分词 + 全表扫描，10k 篇 ≈ 2.6s（bench 实测），
 * 万级笔记不可用。本模块把分词/df/tf 预计算进内存倒排结构：
 * - 构建：O(全库分词) 一次（10k 篇 ≈ 0.8s，后台构建）
 * - 查询：O(Σ 候选文档) 而非 O(全库)，只对含查询词的文档打分
 * - 失效：笔记增删改时 bumpVersion → 下次查询惰性重建（或调用方主动 rebuild）
 */
import { tokenize } from './hybridSearch.js'
import type { Bm25Hit, SearchableDoc } from './hybridSearch.js'

interface PostingEntry {
  /** term -> docId -> 加权词频（标题词 ×2） */
  tf: Map<string, Map<string, number>>
  /** term -> 含该词文档数（df） */
  df: Map<string, number>
  /** docId -> 文档长度（加权 token 数） */
  docLen: Map<string, number>
  /** docId -> 标题（命中展示用） */
  title: Map<string, string>
  /** docId -> 内容（snippet 用，仅前 500 字） */
  contentHead: Map<string, string>
  totalLen: number
  docCount: number
}

const K1 = 1.5
const B = 0.75

export class Bm25Index {
  private posting: PostingEntry | null = null
  private version = 0
  private source: (() => SearchableDoc[] | Promise<SearchableDoc[]>) | null = null
  private rebuildPromise: Promise<void> | null = null

  /** 注册数据源并异步重建（fire-and-forget 安全）。返回重建 promise。 */
  bind(docs: SearchableDoc[] | (() => SearchableDoc[] | Promise<SearchableDoc[]>)): Promise<void> {
    this.source = typeof docs === 'function' ? docs : () => docs
    this.invalidate()
    return this.ensureBuilt()
  }

  invalidate(): void {
    this.version++
    this.posting = null
    this.rebuildPromise = null
  }

  get currentVersion(): number {
    return this.version
  }

  /** 确保索引已构建（单飞：并发调用共享一次构建）。 */
  ensureBuilt(): Promise<void> {
    if (this.posting) return Promise.resolve()
    if (!this.rebuildPromise) {
      this.rebuildPromise = (async () => {
        const docs = this.source ? await this.source() : []
        const p: PostingEntry = {
          tf: new Map(), df: new Map(), docLen: new Map(), title: new Map(),
          contentHead: new Map(), totalLen: 0, docCount: 0,
        }
        this.docTerms.clear()
        for (const d of docs) this.insertIntoPosting(p, d)
        this.posting = p
      })().catch((err) => {
        this.rebuildPromise = null
        throw err
      }) as Promise<void>
    }
    return this.rebuildPromise
  }

  /** 后台预热（不阻塞请求）。 */
  warmup(): void {
    void this.ensureBuilt().catch(() => {})
  }

  /**
   * O(1) 增量更新单文档（未构建完成时 no-op 返回 false，调用方可先 invalidate）。
   * 语义：先逆向剥离旧文档贡献（如有），再插入新文档。与全量重建后状态一致。
   */
  upsert(doc: SearchableDoc): boolean {
    const p = this.posting
    if (!p) return false
    this.removeFromPosting(p, doc.id)
    this.insertIntoPosting(p, doc)
    this.version++
    return true
  }

  /** O(1) 增量删除单文档。未构建完成时 no-op 返回 false。 */
  removeDoc(docId: string): boolean {
    const p = this.posting
    if (!p) return false
    this.removeFromPosting(p, docId)
    this.version++
    return true
  }

  /** 内部：文档插入倒排（与 buildPosting 单文档逻辑一致）。 */
  private insertIntoPosting(p: PostingEntry, d: SearchableDoc): void {
    const titleTokens = tokenize(d.title)
    const contentTokens = tokenize(d.content)
    const weighted = [...titleTokens, ...titleTokens, ...contentTokens]
    const len = titleTokens.length + contentTokens.length
    p.docLen.set(d.id, len)
    p.title.set(d.id, d.title || '(无标题)')
    p.contentHead.set(d.id, (d.content ?? '').slice(0, 500))
    p.totalLen += len
    p.docCount += 1

    const seen = new Set<string>()
    const localTf = new Map<string, number>()
    for (const w of weighted) {
      localTf.set(w, (localTf.get(w) ?? 0) + 1)
      if (!seen.has(w)) {
        seen.add(w)
        p.df.set(w, (p.df.get(w) ?? 0) + 1)
      }
    }
    for (const [w, f] of localTf) {
      let byDoc = p.tf.get(w)
      if (!byDoc) {
        byDoc = new Map()
        p.tf.set(w, byDoc)
      }
      byDoc.set(d.id, f)
    }
    // 记录 unique terms（增量删除逆向剥离依据）
    this.docTerms.set(d.id, new Set(localTf.keys()))
  }

  /** 内部：文档从倒排逆向剥离（依赖 df 的 unique-term 记录，需同时回退 tf 与统计量）。 */
  private removeFromPosting(p: PostingEntry, docId: string): void {
    const len = p.docLen.get(docId)
    if (len === undefined) return // 不存在（新文档）
    p.totalLen -= len
    p.docCount -= 1
    p.docLen.delete(docId)
    p.title.delete(docId)
    p.contentHead.delete(docId)

    // 遍历该文档的 unique terms：只能从 tf 入手（df 无 doc 归属记录）
    // 剥离策略：扫描 tf 中含 docId 的条目。为避免全库扫描 tf，维护 docTerms 反查表
    const terms = this.docTerms.get(docId)
    if (terms) {
      for (const w of terms) {
        const byDoc = p.tf.get(w)
        if (byDoc) {
          byDoc.delete(docId)
          if (byDoc.size === 0) p.tf.delete(w)
        }
        const n = (p.df.get(w) ?? 1) - 1
        if (n <= 0) p.df.delete(w)
        else p.df.set(w, n)
      }
      this.docTerms.delete(docId)
    }
  }

  /** docId -> unique terms（增量删除的逆向剥离依据）。 */
  private docTerms = new Map<string, Set<string>>()

  /** 索引是否就绪（未就绪时调用方回退纯函数 bm25Score）。 */
  get ready(): boolean {
    return !!this.posting
  }

  /**
   * 查询：只对含查询词的文档打分（倒排剪枝）。
   * 返回与 bm25Score 同构的 Bm25Hit 列表（按分排序）。
   * 未构建完成时返回 null（调用方回退）。
   */
  search(query: string, limit = 0): Bm25Hit[] | null {
    const p = this.posting
    if (!p) return null
    const qTokens = tokenize(query)
    if (qTokens.length === 0) return []
    if (p.docCount === 0) return []

    const avgdl = p.totalLen / p.docCount
    const N = p.docCount
    const idf = (w: string) => {
      const n = p.df.get(w) ?? 0
      return Math.log(1 + (N - n + 0.5) / (n + 0.5))
    }

    // 候选 = 至少含一个查询词的文档（倒排求并）
    const candidates = new Set<string>()
    for (const w of new Set(qTokens)) {
      const byDoc = p.tf.get(w)
      if (byDoc) for (const docId of byDoc.keys()) candidates.add(docId)
    }
    if (candidates.size === 0) return []

    const hits: Bm25Hit[] = []
    for (const docId of candidates) {
      const len = p.docLen.get(docId) ?? 1
      let score = 0
      for (const w of new Set(qTokens)) {
        const f = p.tf.get(w)?.get(docId) ?? 0
        if (f === 0) continue
        const denom = f + K1 * (1 - B + (B * len) / Math.max(1, avgdl))
        score += idf(w) * ((f * (K1 + 1)) / denom)
      }
      if (score > 0) {
        const raw = p.contentHead.get(docId) ?? ''
        const snippet = raw
          .replace(/<[^>]+>/g, ' ')
          .replace(/\[\[|\]\]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 160)
        hits.push({ id: docId, title: p.title.get(docId) ?? '', snippet, bm25: score })
      }
    }
    hits.sort((a, b) => b.bm25 - a.bm25)
    return limit > 0 ? hits.slice(0, limit) : hits
  }

    /** 索引就绪状态（诊断用）。 */
  get stats(): { built: boolean; docs: number; terms: number } {
    return { built: !!this.posting, docs: this.posting?.docCount ?? 0, terms: this.posting?.df.size ?? 0 }
  }
}

/** 全局共享单例：note.search / ingest 等写入方 invalidate，search 端惰性重建。 */
export const noteBm25Index = new Bm25Index()
