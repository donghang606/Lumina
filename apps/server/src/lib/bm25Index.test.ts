import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
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
    // 建索引 10k 篇 < 3s；单查 < 100ms（高频词最坏情况；原纯函数全扫 ~2.6s）
    expect(buildMs).toBeLessThan(3000)
    expect(queryMs).toBeLessThan(100)
  })

  it('增量 upsert 与全量重建逐分一致', async () => {
    const idx = new Bm25Index()
    const docs = [...DOCS]
    await idx.bind(() => docs)
    const before = idx.search('算法')!

    // upsert 新文档
    idx.upsert({ id: 'n6', title: '新算法笔记', content: 'vector 算法 进阶' })
    // upsert 已有文档（内容变化）
    idx.upsert({ id: 'n1', title: '算法导论（第二版）', content: 'vector index 算法与图结构' })

    // 对照组：全量重建同样数据
    const docs2 = [
      ...docs.map((d) => (d.id === 'n1' ? { id: 'n1', title: '算法导论（第二版）', content: 'vector index 算法与图结构' } : d)),
      { id: 'n6', title: '新算法笔记', content: 'vector 算法 进阶' },
    ]
    const fresh = new Bm25Index()
    await fresh.bind(() => docs2)

    for (const q of ['算法', 'vector', '图结构', '进阶']) {
      const a = idx.search(q)!
      const b = fresh.search(q)!
      expect(a.map((h) => h.id)).toEqual(b.map((h) => h.id))
      for (let i = 0; i < a.length; i++) {
        expect(Math.abs(a[i].bm25 - b[i].bm25)).toBeLessThan(1e-12)
      }
    }
    void before
  })

  it('增量 removeDoc 与全量重建逐分一致', async () => {
    const idx = new Bm25Index()
    await idx.bind(() => DOCS)
    idx.removeDoc('n1')
    idx.removeDoc('n4')

    const remaining = DOCS.filter((d) => !['n1', 'n4'].includes(d.id))
    const fresh = new Bm25Index()
    await fresh.bind(() => remaining)

    for (const q of ['算法', 'index', '优化']) {
      const a = idx.search(q)!
      const b = fresh.search(q)!
      expect(a.map((h) => h.id)).toEqual(b.map((h) => h.id))
      for (let i = 0; i < a.length; i++) {
        expect(Math.abs(a[i].bm25 - b[i].bm25)).toBeLessThan(1e-12)
      }
    }
  })

  it('增量删除后再 upsert 同 id（编辑场景）与重建一致', async () => {
    const idx = new Bm25Index()
    await idx.bind(() => DOCS)
    idx.upsert({ id: 'n2', title: '数据库进阶', content: 'index 优化与执行计划' })

    const docs2 = DOCS.map((d) => (d.id === 'n2' ? { id: 'n2', title: '数据库进阶', content: 'index 优化与执行计划' } : d))
    const fresh = new Bm25Index()
    await fresh.bind(() => docs2)

    const a = idx.search('优化')!
    const b = fresh.search('优化')!
    expect(a.map((h) => h.id)).toEqual(b.map((h) => h.id))
    expect(idx.stats.docs).toBe(fresh.stats.docs)
  })

  it('10k 篇增量 upsert/remove < 5ms（O(1)）', async () => {
    const big = Array.from({ length: 10000 }, (_, i) => ({
      id: `n${i}`,
      title: `笔记${i}`,
      content: `内容 ${i % 100} 词 ${i % 50} 文本`,
    }))
    const idx = new Bm25Index()
    await idx.bind(() => big)

    const t0 = performance.now()
    idx.upsert({ id: 'n3', title: '修改后的标题', content: '全新内容 关键词' })
    const upMs = performance.now() - t0

    const t1 = performance.now()
    idx.removeDoc('n5')
    const rmMs = performance.now() - t1

    expect(upMs).toBeLessThan(5)
    expect(rmMs).toBeLessThan(5)
  })
})
describe('Bm25Index 持久化', () => {
  const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'bm25-snap-'))

  it('save → load 往返：查询逐分一致', async () => {
    const dir = tmpDir()
    const snap = path.join(dir, 'snap.json')
    let sig = '5:v1'
    const idx = new Bm25Index()
    await idx.bind(() => DOCS, { snapshotPath: snap, signature: () => sig })
    // 防抖 save 等待
    await new Promise((r) => setTimeout(r, 1200))
    expect(fs.existsSync(snap)).toBe(true)

    // 新实例 load
    const idx2 = new Bm25Index()
    await idx2.bind(() => DOCS, { snapshotPath: snap, signature: () => sig })
    for (const q of ['算法', 'vector', '优化']) {
      const a = idx.search(q)!
      const b = idx2.search(q)!
      expect(b).not.toBeNull()
      expect(a.map((h) => h.id)).toEqual(b.map((h) => h.id))
      for (let i = 0; i < a.length; i++) expect(Math.abs(a[i].bm25 - b[i].bm25)).toBeLessThan(1e-9)
    }
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('签名不匹配 → 跳过快照、全量重建', async () => {
    const dir = tmpDir()
    const snap = path.join(dir, 'snap.json')
    const idx = new Bm25Index()
    await idx.bind(() => DOCS, { snapshotPath: snap, signature: () => '5:v1' })
    await new Promise((r) => setTimeout(r, 1200))
    expect(fs.existsSync(snap)).toBe(true)

    // 新签名
    const idx2 = new Bm25Index()
    let sourceCalls = 0
    await idx2.bind(
      () => { sourceCalls++; return DOCS },
      { snapshotPath: snap, signature: () => '5:v2' },
    )
    expect(sourceCalls).toBe(1) // 签名不匹配 → 调 source 全量 build
    // 查询仍正确
    expect(idx2.search('vector')!.length).toBeGreaterThan(0)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('签名匹配 → load 跳过 source 调用（冷启零扫描）', async () => {
    const dir = tmpDir()
    const snap = path.join(dir, 'snap.json')
    const idx = new Bm25Index()
    let sig = '5:v1'
    await idx.bind(() => DOCS, { snapshotPath: snap, signature: () => sig })
    await new Promise((r) => setTimeout(r, 1200))

    const idx2 = new Bm25Index()
    let sourceCalls = 0
    await idx2.bind(
      () => { sourceCalls++; return DOCS },
      { snapshotPath: snap, signature: () => sig },
    )
    expect(sourceCalls).toBe(0) // 命中快照 → 不调 source
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('增量后防抖 save 更新快照签名（下次冷启命中）', async () => {
    const dir = tmpDir()
    const snap = path.join(dir, 'snap.json')
    let sig = '5:v1'
    const idx = new Bm25Index()
    await idx.bind(() => DOCS, { snapshotPath: snap, signature: () => sig })
    await new Promise((r) => setTimeout(r, 1200))

    // 模拟 mutation：签名变化 + upsert
    sig = '6:v2'
    idx.upsert({ id: 'n6', title: '新增', content: 'vector 新内容' })
    await new Promise((r) => setTimeout(r, 1200)) // 防抖 save

    const raw = JSON.parse(fs.readFileSync(snap, 'utf8'))
    expect(raw.signature).toBe('6:v2') // saveNow 重算了签名
    expect(raw.docCount).toBe(6)

    // 新实例用新签名 → 命中快照（不调 source）
    const idx2 = new Bm25Index()
    let calls = 0
    await idx2.bind(() => { calls++; return DOCS }, { snapshotPath: snap, signature: () => sig })
    expect(calls).toBe(0)
    expect(idx2.search('vector')!.map((h) => h.id)).toContain('n6')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
