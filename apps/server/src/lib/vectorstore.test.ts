import { describe, it, expect, beforeEach, afterAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { insertChunks, deleteNoteChunks, searchChunks, listDimensions, zvecRoot, closeAllCollections } from './vectorstore.js'

// 重定向 zvec 根目录到临时目录，避免污染真实数据
const realHomedir = os.homedir
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-zvec-test-'))

beforeEach(() => {
  os.homedir = () => tmpHome
})

afterAll(() => {
  closeAllCollections()
  os.homedir = realHomedir
  fs.rmSync(tmpHome, { recursive: true, force: true })
})

const dim = 8

describe('vectorstore（Zvec HNSW）', () => {
  it('插入 → top-k 语义检索 → 相似度排序正确', async () => {
    insertChunks(dim, [
      { id: 'n1-0', noteId: 'n1', chunkIndex: 0, content: '神经网络与反向传播', embedding: [1, 0, 0, 0, 0, 0, 0, 0] },
      { id: 'n2-0', noteId: 'n2', chunkIndex: 0, content: '红烧肉做法', embedding: [0, 1, 0, 0, 0, 0, 0, 0] },
      { id: 'n3-0', noteId: 'n3', chunkIndex: 0, content: '梯度下降优化', embedding: [0.95, 0.05, 0, 0, 0, 0, 0, 0] },
    ])
    const hits = await searchChunks(dim, [1, 0.02, 0, 0, 0, 0, 0, 0], 2)
    expect(hits).not.toBeNull()
    expect(hits!).toHaveLength(2)
    expect(hits![0].noteId).toBe('n1')
    expect(hits![0].score).toBeGreaterThan(hits![1].score)
    expect(typeof hits![0].content).toBe('string')
  })

  it('deleteNoteChunks 后检索不再命中该笔记', async () => {
    deleteNoteChunks(dim, 'n1')
    const hits = await searchChunks(dim, [1, 0.02, 0, 0, 0, 0, 0, 0], 10)
    expect(hits).not.toBeNull()
    expect(hits!.every((h) => h.noteId !== 'n1')).toBe(true)
  })

  it('collection 为空时返回 null（回退信号）', async () => {
    const hits = await searchChunks(999, [1, 0, 0], 3)
    expect(hits).toBeNull()
  })

  it('listDimensions 报告已建维度', () => {
    const dims = listDimensions()
    expect(dims).toContain(8)
  })
})