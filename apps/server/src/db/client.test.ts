import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { initDb } from './client.js'
import { decryptSecret } from '../lib/secrets.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const TABLES = ['notes', 'tags', 'tags_on_notes', 'note_links', 'attachments', 'conversations', 'messages', 'collections', 'ai_providers', 'settings', 'mcp_servers', 'note_blocks']

describe('db client', () => {
  let client: Client
  let tmpFile: string

  beforeEach(async () => {
    tmpFile = path.join(os.tmpdir(), `lumina-client-${randomUUID()}.db`)
    client = createClient({ url: `file:${tmpFile}` })
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

  it('creates all tables', async () => {
    await initDb(client)
    const res = await client.execute(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
    const names = res.rows.map((r) => String(r.name))
    for (const t of TABLES) expect(names).toContain(t)
  })

  it('encrypts legacy plaintext api keys on init', async () => {
    await initDb(client)
    await client.execute({
      sql: `INSERT INTO ai_providers (id, name, type, api_key, is_active, "order") VALUES ('p1', 'test', 'openai', 'sk-plain-123', 0, 0)`,
    })
    await initDb(client)
    const res = await client.execute(`SELECT api_key FROM ai_providers WHERE id = 'p1'`)
    const stored = String(res.rows[0].api_key)
    expect(stored.startsWith('enc:v1:')).toBe(true)
    expect(decryptSecret(stored)).toBe('sk-plain-123')
  })

  it('is idempotent (does not re-encrypt on repeated init)', async () => {
    await initDb(client)
    await client.execute({
      sql: `INSERT INTO ai_providers (id, name, type, api_key, is_active, "order") VALUES ('p2', 'test', 'deepseek', 'sk-plain-456', 0, 0)`,
    })
    await initDb(client)
    await initDb(client)
    const res = await client.execute(`SELECT api_key FROM ai_providers WHERE id = 'p2'`)
    const stored = String(res.rows[0].api_key)
    expect(stored.startsWith('enc:v1:')).toBe(true)
    expect(decryptSecret(stored)).toBe('sk-plain-456')
  })

  it('leaves already-encrypted keys untouched', async () => {
    await initDb(client)
    await client.execute({
      sql: `INSERT INTO ai_providers (id, name, type, api_key, is_active, "order") VALUES ('p3', 'test', 'ollama', 'enc:v1:abc', 0, 0)`,
    })
    await initDb(client)
    const res = await client.execute(`SELECT api_key FROM ai_providers WHERE id = 'p3'`)
    expect(String(res.rows[0].api_key)).toBe('enc:v1:abc')
  })

  it('skips empty keys', async () => {
    await initDb(client)
    await client.execute({
      sql: `INSERT INTO ai_providers (id, name, type, api_key, is_active, "order") VALUES ('p4', 'test', 'custom', '', 0, 0)`,
    })
    await initDb(client)
    const res = await client.execute(`SELECT api_key FROM ai_providers WHERE id = 'p4'`)
    expect(String(res.rows[0].api_key)).toBe('')
  })
})
