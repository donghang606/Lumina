import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../db/schema.js'
import { initDb } from '../db/client.js'
import { runImport, buildExport, parseWikiLinks, dedupeByTitle, type Db } from './importExport.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

describe('importExport', () => {
  let client: Client
  let db: Db
  let tmpFile: string

  beforeEach(async () => {
    tmpFile = path.join(os.tmpdir(), `lumina-test-${randomUUID()}.db`)
    client = createClient({ url: `file:${tmpFile}` })
    await initDb(client)
    db = drizzle(client, { schema }) as unknown as Db
  })

  afterEach(async () => {
    try {
      const r = (client as unknown as { close?: () => unknown }).close?.()
      if (r && typeof (r as Promise<void>).catch === 'function') await (r as Promise<void>).catch(() => undefined)
    } catch {
      /* ignore */
    }
    fs.rmSync(tmpFile, { force: true })
  })

  it('imports notes with tags and wiki links', async () => {
    const res = await runImport(db, [
      { title: 'A 笔记', type: 'note', content: '参考 [[B 笔记]]', tags: ['技术', 'AI'], createdAt: '2026-01-02T00:00:00.000Z' },
      { title: 'B 笔记', type: 'card', content: '指向 [[A 笔记]]', tags: [], createdAt: null },
    ])
    expect(res.imported).toBe(2)

    const notes = await db.select().from(schema.notes).all()
    expect(notes.length).toBe(2)
    expect(notes.find((n) => n.title === 'A 笔记')?.createdAt).toBe('2026-01-02T00:00:00.000Z')

    const tags = await db.select().from(schema.tags).all()
    expect(tags.map((t) => t.name).sort()).toEqual(['AI', '技术'])

    const rels = await db.select().from(schema.tagsOnNotes).all()
    expect(rels.length).toBe(2)

    const links = await db.select().from(schema.noteLinks).all()
    expect(links.length).toBe(2)
  })

  it('dedupes by title across runs', async () => {
    const items = [{ title: 'X', type: 'note' as const, content: '', tags: [] as string[], createdAt: null }]
    const first = await runImport(db, items)
    const second = await runImport(db, items)
    expect(first.imported).toBe(1)
    expect(second.imported).toBe(0)
  })

  it('export returns tags and metadata', async () => {
    await runImport(db, [{ title: 'C', type: 'note', content: 'hello', tags: ['tag1'], createdAt: '2026-03-01T00:00:00.000Z' }])
    const out = await buildExport(db)
    expect(out.app).toBe('lumina')
    expect(out.items.length).toBe(1)
    expect(out.items[0].tags).toEqual(['tag1'])
    expect(out.items[0].createdAt).toBe('2026-03-01T00:00:00.000Z')
  })

  it('skip empty-title empty-content items', () => {
    const deduped = dedupeByTitle([{ title: 'A', type: 'note', content: '', tags: [], createdAt: null }, { title: 'A', type: 'note', content: '', tags: [], createdAt: null }])
    expect(deduped.length).toBe(1)
  })

  it('parses wiki links with and without alias', () => {
    expect(parseWikiLinks('see [[笔记 1]] and [[笔记 2|别名]] x [[none]]')).toEqual(['笔记 1', '笔记 2', 'none'])
    expect(parseWikiLinks('no links here')).toEqual([])
  })
})
