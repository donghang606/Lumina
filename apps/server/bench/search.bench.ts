/**
 * 万级笔记 RAG 性能基准（纯函数级，不起 server）：
 *   node apps/server/bench/search.bench.mjs
 *
 * 测：
 *   1. BM25 检索延迟（1k / 5k / 10k 合成笔记，p50/p95）
 *   2. BLOB 暴力余弦（万块回退路径）
 *   3. RRF 融合开销
 *   4. tokenize 吞吐
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const { bm25Score, fuseRanks, rankByScores, tokenize } = await import(
  '../src/lib/hybridSearch.js'
)

// ---- 合成数据：中英混合伪笔记 ----
const TOPICS = ['算法', '数据库', '前端', '系统设计', '机器学习', '网络', '编译原理', '操作系统', '安全', '测试']
const WORDS_EN = ['vector', 'index', 'query', 'cache', 'stream', 'kernel', 'schema', 'token', 'runtime', 'engine']
const rnd = (n) => Math.floor(Math.random() * n)

function synthNote(i) {
  const topic = TOPICS[i % TOPICS.length]
  const paras = Array.from({ length: 4 + rnd(6) }, () =>
    `${topic}领域：${Array.from({ length: 30 + rnd(40) }, () => TOPICS[rnd(10)] + WORDS_EN[rnd(10)]).join(' ')} 的组合研究。`,
  )
  return { id: `note-${i}`, title: `${topic}笔记#${i}`, content: paras.join('\n') }
}

// ---- 计时工具 ----
function pct(arr, p) {
  const s = [...arr].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]
}
function bench(name, fn, { warmup = 2, runs = 20 } = {}) {
  for (let i = 0; i < warmup; i++) fn()
  const times = []
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now()
    fn()
    times.push(performance.now() - t0)
  }
  console.log(
    `  ${name}: p50=${pct(times, 50).toFixed(1)}ms p95=${pct(times, 95).toFixed(1)}ms min=${Math.min(...times).toFixed(1)}ms`,
  )
  return { p50: pct(times, 50), p95: pct(times, 95) }
}

const QUERIES = ['算法 数据库', 'vector index', '操作系统 kernel', '前端 性能', '机器学习']

// ---- 1. BM25 规模曲线 ----
console.log('\n=== BM25 检索（含全表 docs 构造）===')
for (const n of [1000, 5000, 10000]) {
  const docs = Array.from({ length: n }, (_, i) => synthNote(i))
  console.log(`-- ${n} 篇 --`)
  let last = 0
  for (const q of QUERIES) {
    last = bench(`  bm25 "${q}"`, () => bm25Score(q, docs), { runs: 10 })
  }
  void last
}

// ---- 2. BLOB 暴力余弦（万块模拟） ----
console.log('\n=== BLOB 暴力余弦（模拟回退路径）===')
const DIM = 1536
const queryVec = Array.from({ length: DIM }, () => Math.random() - 0.5)
function cosine(a, b) {
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  return dot / Math.sqrt(na * nb)
}
for (const blocks of [5000, 20000]) {
  const vecs = Array.from({ length: blocks }, () => Array.from({ length: DIM }, () => Math.random() - 0.5))
  bench(`  ${blocks} 块 x ${DIM} 维`, () => {
    const scored = vecs.map((v, i) => ({ i, sim: cosine(queryVec, v) }))
    scored.sort((a, b) => b.sim - a.sim)
    return scored.slice(0, 24)
  }, { runs: 5 })
}

// ---- 3. RRF 融合开销 ----
console.log('\n=== RRF 融合 ===')
{
  const docs = Array.from({ length: 10000 }, (_, i) => synthNote(i))
  const bm25Hits = bm25Score(QUERIES[0], docs)
  const semantic = new Map(bm25Hits.slice(0, 50).map((h, i) => [h.id, i + 1]))
  const scores = new Map(bm25Hits.slice(0, 50).map((h) => [h.id, Math.random()]))
  bench('  fuseRanks（10k 库）', () => fuseRanks(bm25Hits, semantic, scores))
}

// ---- 4. tokenize 吞吐 ----
console.log('\n=== tokenize 吞吐 ===')
{
  const doc = synthNote(1).content
  const t0 = performance.now()
  const N = 200
  for (let i = 0; i < N; i++) tokenize(doc)
  const ms = (performance.now() - t0) / N
  console.log(`  单篇（${doc.length} 字符）：${ms.toFixed(3)}ms/篇 → 1万篇全量分词 ≈ ${(ms * 10000 / 1000).toFixed(1)}s`)
}

console.log('\n=== 结论 ===')
console.log('见上方数据：BM25 全表扫描 + 每查询全库重分词是首要瓶颈')
void mkdtempSync
void rmSync
void tmpdir
void path
// ---- 5. Bm25Index 倒排版对比（优化后） ----
console.log('\n=== Bm25Index（倒排剪枝，优化后）===')
{
  const { Bm25Index } = await import('../src/lib/bm25Index.js')
  for (const n of [1000, 5000, 10000]) {
    const docs = Array.from({ length: n }, (_, i) => synthNote(i))
    const idx = new Bm25Index()
    const t0 = performance.now()
    await idx.bind(() => docs)
    const buildMs = performance.now() - t0
    console.log(`-- ${n} 篇（构建 ${buildMs.toFixed(0)}ms，一次性）--`)
    for (const q of QUERIES.slice(0, 3)) {
      bench(`  idx "${q}"`, () => idx.search(q), { runs: 20 })
    }
  }
}
