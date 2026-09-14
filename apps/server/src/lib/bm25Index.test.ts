import { describe, it, expect } from 'vitest'
import { Bm25Index } from './bm25Index.js'
import { bm25Score } from './hybridSearch.js'

const DOCS = [
  { id: 'n1', title: '算法导论', content: 'vector index 算法与数据结构' },
  { id: 'n2', title: '数据库系统', content: 'sql index 优化' },
  { id: 'n3', title: '前端性能', content: 'render 优化 virtual dom' },
  { id: 'n4', title: '机器学习', content: 'vector embedding 相似度' },
  { id: 'n5', title: '无主题', content: '完全无关内容' },
]

describe('Bm25Index（倒排剪枝版）', () => {
  it('得分与纯函数 bm25Score 一致（同构排序）', async () => {
    const idx = new Bm25Index()
    await idx.bind(() => DOCS)
    for (const q of ['算法', 'vector', 'index 优化', '机器学习 相似度']) {
      const a = idx.search(q)
      const b = bm25Score(q, DOCS)
      expect(a).not.toBeNull()
      expect(a!.map((h) => h.id)).toEqual(b.map((h) => h.id))
      for (let i = 0; i < a!.length; i++) {
        expect(Math.abs(a![i].bm25 - b[i].bm25)).toBeLessThan(1e-9)
      }
    }
  })

  it('未构建时 search 返回 null（回退信号）', () => {
    const idx = new Bm25Index()
    expect(idx.search('anything')).toBeNull()
  })

  it('invalidate 后需重建，重建前 search 返回 null', async () => {
    const idx = new Bm25Index()
    await idx.bind(() => DOCS)
    expect(idx.search('算法')).not.toBeNull()
    idx.invalidate()
    expect(idx.search('算法')).toBeNull()
    await idx.ensureBuilt()
    expect(idx.search('算法')).not.toBeNull()
  })

  it('无命中返回空数组', async () => {
    const idx = new Bm25Index()
    await idx.bind(() => DOCS)
    expect(idx.search('不存在的词')).toEqual([])
  })

  it('limit 截断', async () => {
    const idx = new Bm25Index()
    await idx.bind(() => DOCS)
    const full = idx.search('优化')!
    expect(idx.search('优化', 1)!.length).toBeLessThanOrEqual(1)
    expect(idx.search('优化', 1)![0]?.id).toBe(full[0]?.id)
  })

  it('并发 ensureBuilt 单飞（不重复构建）', async () => {
    const idx = new Bm25Index()
    let builds = 0
    await idx.bind(() => {
      builds++
      return DOCS
    })
    // bind 已构建一次；invalidate 后并发两次 ensureBuilt 应只构建一次
    idx.invalidate()
    await Promise.all([idx.ensureBuilt(), idx.ensureBuilt()])
    expect(builds).toBe(2)
  })

  it('10k 篇查询 < 50ms（倒排剪枝）', async () => {
    const big = Array.from({ length: 10000 }, (_, i) => ({
      id: `n${i}`,
      title: `笔记${i}`,
      content: `内容 ${i % 100} 词 ${i % 50} 文本`,
    }))
    const idx = new Bm25Index()
    const t0 = performance.now()
    await idx.bind(() => big)
    const buildMs = performance.now() - t0

    const t1 = performance.now()
    const hits = idx.search('内容 词')!
    const queryMs = performance.now() - t1
    expect(hits.length).toBeGreaterThan(0)
    // 建索引 10k 篇 < 3s；单查 < 50ms（原纯函数全扫 ~2.6s）
    expect(buildMs).toBeLessThan(3000)
    expect(queryMs).toBeLessThan(50)
  })
})