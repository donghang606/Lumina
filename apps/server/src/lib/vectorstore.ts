import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import {
  ZVecInitialize,
  ZVecCreateAndOpen,
  ZVecOpen,
  ZVecCollectionSchema,
  ZVecDataType,
  ZVecIndexType,
  ZVecMetricType,
  ZVecLogType,
  ZVecLogLevel,
  type ZVecCollection,
} from '@zvec/zvec'

/**
 * Lumina 向量索引（Zvec HNSW + COSINE）。
 *
 * 设计：
 * - 每个嵌入维度一个 collection：notes-d<dimension>（换模型/维度变化自动切换，旧维度数据保留）
 * - 标量字段：note_id（过滤/删除用，建倒排索引）、chunk_index、chunk_content、chunk_head
 * - 删除笔记按 note_id 过滤删除；单篇重嵌入 = 先删后插
 * - 维度 collection 不存在（或全空）时调用方回退 libSQL BLOB 暴力余弦
 */

let initialized = false
const collectionCache = new Map<string, ZVecCollection>()

export function zvecRoot(): string {
  return path.join(os.homedir(), 'Library', 'Application Support', 'com.lumina.app', 'zvec')
}

function ensureInit(): void {
  if (initialized) return
  ZVecInitialize({ logType: ZVecLogType.CONSOLE, logLevel: ZVecLogLevel.ERROR })
  initialized = true
}

function collectionDir(dimension: number): string {
  return path.join(zvecRoot(), `notes-d${dimension}`)
}

function openCollection(dimension: number): ZVecCollection {
  if (collectionCache.has(String(dimension))) {
    const cached = collectionCache.get(String(dimension))!
    return cached
  }
  ensureInit()
  const dir = collectionDir(dimension)
  const schema = new ZVecCollectionSchema({
    name: `notes-d${dimension}`,
    vectors: [
      {
        name: 'embedding',
        dataType: ZVecDataType.VECTOR_FP32,
        dimension,
        indexParams: { indexType: ZVecIndexType.HNSW, metricType: ZVecMetricType.COSINE },
      },
    ],
    fields: [
      { name: 'note_id', dataType: ZVecDataType.STRING },
      { name: 'chunk_index', dataType: ZVecDataType.INT32 },
      { name: 'chunk_content', dataType: ZVecDataType.STRING },
      { name: 'chunk_head', dataType: ZVecDataType.STRING },
    ],
  })
  const col = fs.existsSync(dir) ? ZVecOpen(dir) : ZVecCreateAndOpen(dir, schema)
  collectionCache.set(String(dimension), col)
  return col
}

export interface VectorChunkInput {
  id: string
  noteId: string
  chunkIndex: number
  content: string
  embedding: number[]
}

/** 插入一批块（FP32 化）。失败抛错由调用方决定回退。 */
export function insertChunks(dimension: number, chunks: VectorChunkInput[]): void {
  if (chunks.length === 0) return
  const col = openCollection(dimension)
  const docs = chunks.map((c) => ({
    id: c.id,
    fields: {
      note_id: c.noteId,
      chunk_index: c.chunkIndex,
      chunk_content: c.content,
      chunk_head: c.content.slice(0, 400),
    },
    vectors: { embedding: Float32Array.from(c.embedding) },
  }))
  col.insertSync(docs)
}

/** 删除某笔记的全部块。 */
export function deleteNoteChunks(dimension: number, noteId: string): void {
  const col = openCollection(dimension)
  col.deleteByFilterSync(`note_id = "${noteId}"`)
}

export interface VectorHit {
  id: string
  noteId: string
  chunkIndex: number
  content: string
  score: number
}

/** 语义 top-k 检索。collection 不存在/为空返回 null（调用方回退暴力余弦）。 */
export async function searchChunks(dimension: number, queryVector: number[], topk = 8): Promise<VectorHit[] | null> {
  if (!fs.existsSync(collectionDir(dimension))) return null
  const col = openCollection(dimension)
  const hits = await col.query({
    fieldName: 'embedding',
    vector: Float32Array.from(queryVector),
    topk,
  })
  if (!hits || hits.length === 0) return null
  return hits.map((h) => ({
    id: h.id,
    noteId: String(h.fields?.note_id ?? ''),
    chunkIndex: Number(h.fields?.chunk_index ?? 0),
    content: String(h.fields?.chunk_content ?? ''),
    // Zvec COSINE score 是距离（越小越近）；转相似度：sim = 1 - distance
    score: 1 - Number(h.score ?? 1),
  }))
}

/** 关闭全部缓存的 collection（进程退出时调用）。 */
export function closeAllCollections(): void {
  for (const col of collectionCache.values()) {
    try {
      col.closeSync()
    } catch {
      /* 已关闭 */
    }
  }
  collectionCache.clear()
}

/** 当前存在的维度 collection 列表（诊断/迁移用）。 */
export function listDimensions(): number[] {
  const root = zvecRoot()
  if (!fs.existsSync(root)) return []
  return fs
    .readdirSync(root)
    .filter((n) => /^notes-d(\d+)$/.test(n))
    .map((n) => Number(n.replace('notes-d', '')))
}