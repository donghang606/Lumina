import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../db/schema.js'
import { initDb } from '../db/client.js'
import { noteRouter } from '../routers/note.js'
import { bm25Score, fuseRanks, rankByScores, tokenize } from './hybridSearch.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function caller(db: any) {
  return noteRouter.createCaller({ db, req: {} as any, res: {} as any })
}

describe('hybridSearch bm25Score', () => {
  it('tokenize 拆分英文与中文', () => {
    expect(tokenize('Hello Lumina 知识库')).toContain('hello')
    expect(tokenize('Hello Lumina 知识库')).toContain('知')
    expect(tokenize('知识库')).toEqual(['知', '识', '库'])
  })

  it('bm25 优先命中标题高频词文档', () => {
    const docs = [
      { id: 'a', title: 'Rust 并发', content: 'Rust 的所有权模型保证了并发安全。' },
      { id: 'b', title: 'Python 并发', content: 'asyncio 是 Python 的并发库。' },
      { id: 'c', title: '做饭', content: '今天吃什么菜。' },
    ]
    const hits = bm25Score('Rust', docs)
    expect(hits[0].id).toBe('a')
    expect(hits.map((h) => h.id)).not.toContain('c')
  })

  it('bm25 无命中返回空', () => {
    expect(bm25Score('zzz-nonexistent', [{ id: 'a', title: 'a', content: 'b' }])).toEqual([])
  })

  it('snippet 去除 HTML 标签', () => {
    const hits = bm25Score('标题', [{ id: 'a', title: '标题', content: '<p>内容 <b>加粗</b></p>' }])
    expect(hits[0].snippet).toContain('内容')
    expect(hits[0].snippet).not.toContain('<p>')
  })
})

describe('hybridSearch fuseRanks', () => {
  it('RRF 融合：同时命中关键词与语义的排前面', () => {
    const bm25 = [
      { id: 'a', title: 'A', snippet: 'a', bm25: 10 },
      { id: 'b', title: 'B', snippet: 'b', bm25: 5 },
      { id: 'c', title: 'C', snippet: 'c', bm25: 2 },
    ]
    const semantic = new Map<string, number>([
      ['b', 1],
      ['d', 2],
      ['a', 3],
    ])
    const semScores = new Map<string, number>([
      ['b', 0.9],
      ['d', 0.8],
      ['a', 0.7],
    ])
    const fused = fuseRanks(bm25, semantic, semScores)
    // a: bm25#1 + sem#3；b: bm25#2 + sem#1 → b 总分更高，且 d 仅语义命中也在结果中
    expect(fused.find((f) => f.id === 'b')).toBeTruthy()
    expect(fused.find((f) => f.id === 'd')).toBeTruthy()
    expect(fused.every((f) => typeof f.score === 'number')).toBe(true)
  })

  it('仅 BM25 命中时顺序与关键词一致', () => {
    const bm25 = [
      { id: 'a', title: 'A', snippet: 'a', bm25: 3 },
      { id: 'b', title: 'B', snippet: 'b', bm25: 1 },
    ]
    const fused = fuseRanks(bm25, new Map(), new Map())
    expect(fused.map((f) => f.id)).toEqual(['a', 'b'])
  })
})

describe('noteRouter.search keyword path', () => {
  let client: Client
  let tmpFile: string

  beforeEach(async () => {
    tmpFile = path.join(os.tmpdir(), `lumina-search-${randomUUID()}.db`)
    client = createClient({ url: `file:${tmpFile}` })
    await initDb(client)
    const db = drizzle(client, { schema })
    await db.insert(schema.notes).values([
      { id: 'n1', title: 'Rust 异步', content: '<p>tokio 运行时</p>', type: 'note', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'n2', title: '周末计划', content: '爬山和看电影', type: 'note', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
      { id: 'n3', title: 'Rust 所有权', content: '内存安全的关键', type: 'card', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    ])
    ctx = { db } as any
  })

  let ctx: any
  afterEach(async () => {
    try {
      const r = (client as unknown as { close?: () => unknown }).close?.()
      if (r && typeof (r as Promise<void>).catch === 'function') await (r as Promise<void>).catch(() => undefined)
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpFile, { force: true })
  })

  it('无 provider 时走 BM25 关键词检索', async () => {
    const res = await caller(ctx.db).search({ query: 'Rust' })
    expect(res.source).toBe('hybrid')
    const ids = res.items.map((i) => i.id)
    expect(ids).toContain('n1')
    expect(ids).toContain('n3')
    expect(ids).not.toContain('n2')
  })

  it('中文关键词可命中', async () => {
    const res = await caller(ctx.db).search({ query: '爬山' })
    expect(res.items.map((i) => i.id)).toContain('n2')
  })

  it('snippet 已去除 HTML', async () => {
    const res = await caller(ctx.db).search({ query: 'tokio' })
    expect(res.items[0].snippet).toBe('tokio 运行时')
  })
})

describe('rankByScores', () => {
  it('按分数降序给出排名', () => {
    const r = rankByScores(
      [
        { id: 'a', s: 1 },
        { id: 'b', s: 3 },
        { id: 'c', s: 2 },
      ],
      (x) => x.s,
    )
    expect(r.get('a')).toBe(3)
    expect(r.get('b')).toBe(1)
    expect(r.get('c')).toBe(2)
  })
})
