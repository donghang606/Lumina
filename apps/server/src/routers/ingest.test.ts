import { describe, it, expect, vi, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ingestRouter } from './ingest.js'

const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-ingest-'))
const mdPath = path.join(fixtureDir, 'doc.md')
fs.writeFileSync(mdPath, '# 测试文档\n\n这是导入功能的正文内容，用于验证向量化流程。', 'utf-8')

function createMockDb() {
  const data: { notes: Array<Record<string, unknown>>; file_ingests: Array<Record<string, unknown>> } = { notes: [], file_ingests: [] }
  const db: any = {
    select: () => ({
      from: (t: any) => {
        const name = t?.[Symbol.for('drizzle:Name')]
        return {
          where: () => ({
            get: async () => data[name as keyof typeof data]?.[0],
            all: async () => data[name as keyof typeof data] ?? [],
          }),
          orderBy: () => ({
            limit: () => ({ all: async () => data[name as keyof typeof data] ?? [] }),
          }),
        }
      },
    }),
    insert: (t: any) => {
      const name = t?.[Symbol.for('drizzle:Name')]
      const doInsert = async (v: any) => {
        const rows = Array.isArray(v) ? v : [v]
        if (name === 'notes') data.notes.push(...rows)
        if (name === 'file_ingests') data.file_ingests.push(...rows)
      }
      return {
        values: (v: any) => {
          const p = doInsert(v)
          const handle = {
            run: () => p,
            then: (resolve: () => void, reject: (e: unknown) => void) => p.then(resolve, reject),
          }
          return handle
        },
      }
    },
    update: () => ({ set: () => ({ where: () => ({ run: async () => {} }) }) }),
    delete: () => ({ where: () => ({ run: async () => {} }) }),
  }
  return { db, data }
}

const caller = (db: any) => ingestRouter.createCaller({ db, req: {} as any, res: {} as any })

describe('ingestRouter', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('未配置 embedding provider 时返回明确原因', async () => {
    const { db } = createMockDb()
    vi.doMock('../llm/provider.js', () => ({
      getActiveProvider: async () => ({ ready: false, reason: '尚未配置', name: 'none' }),
      embedTexts: async () => [[0.1, 0.2]],
    }))
    const { ingestRouter: fresh } = await import('./ingest.js')
    const r = await fresh.createCaller({ db, req: {} as any, res: {} as any }).ingestFile({ filePath: mdPath })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('embedding Provider')
  })

  it('导入 md → 建笔记 + 记录（跳过索引失败）', async () => {
    const { db, data } = createMockDb()
    vi.doMock('../llm/provider.js', () => ({
      getActiveProvider: async () => ({ ready: true, name: 'test', model: 'm' }),
      embedTexts: async () => [[0.1, 0.2]],
    }))
    vi.doMock('./note.js', () => ({
      indexNoteChunks: async () => {},
    }))
    const { ingestRouter: fresh } = await import('./ingest.js')
    const r = await fresh.createCaller({ db, req: {} as any, res: {} as any }).ingestFile({ filePath: mdPath })
    expect(r.ok).toBe(true)
    expect(r.charCount).toBeGreaterThan(10)
    expect(data.notes).toHaveLength(1)
    expect(data.notes[0]).toMatchObject({ type: 'file', title: 'doc.md' })
    expect(data.file_ingests).toHaveLength(1)
  })

  it('重复导入相同内容跳过（hash 比对）', async () => {
    const { db } = createMockDb()
    vi.doMock('../llm/provider.js', () => ({
      getActiveProvider: async () => ({ ready: true, name: 'test' }),
      embedTexts: async () => [[0.1, 0.2]],
    }))
    vi.doMock('./note.js', () => ({ indexNoteChunks: async () => {} }))
    const { ingestRouter: fresh } = await import('./ingest.js')
    const c = fresh.createCaller({ db, req: {} as any, res: {} as any })
    const first = await c.ingestFile({ filePath: mdPath })
    expect(first.ok).toBe(true)
    expect(first.skipped).toBe(false)
    const second = await c.ingestFile({ filePath: mdPath })
    expect(second.ok).toBe(true)
    expect(second.skipped).toBe(true)
  })

  it('不支持的扩展名拒绝', async () => {
    const exePath = path.join(fixtureDir, 'x.exe')
    fs.writeFileSync(exePath, 'binary')
    const { db } = createMockDb()
    const r = await caller(db).ingestFile({ filePath: exePath })
    expect(r.ok).toBe(false)
    expect(r.reason).toContain('不支持的类型')
  })
})