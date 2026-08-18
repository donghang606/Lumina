import { createClient } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from './schema'
import path from 'node:path'
import { homedir } from 'node:os'
import { encryptSecret } from '../lib/secrets.js'

const dbPath = path.join(homedir(), 'Library', 'Application Support', 'com.lumina.app', 'lumina.db')
const dbDir = path.dirname(dbPath)
import fs from 'node:fs'
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

const client = createClient({ url: `file:${dbPath}` })

export const db = drizzle(client, { schema })

export async function initDb(c = client) {
  const sql = c

  await sql.execute(`CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '', content TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'note', summary TEXT,
    status TEXT NOT NULL DEFAULT 'draft', meta TEXT DEFAULT '{}',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, slug TEXT NOT NULL UNIQUE,
    color TEXT, parent_id TEXT, "order" INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS tags_on_notes (
    note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE,
    assigned_by TEXT NOT NULL DEFAULT 'manual', confidence REAL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS note_links (
    id TEXT PRIMARY KEY,
    source_note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    context TEXT, created_at TEXT NOT NULL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY, note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    filename TEXT NOT NULL, mime_type TEXT NOT NULL DEFAULT 'application/octet-stream',
    size INTEGER NOT NULL DEFAULT 0, storage_key TEXT NOT NULL, created_at TEXT NOT NULL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY, title TEXT NOT NULL DEFAULT '',
    model TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY, conversation_id TEXT REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
    tool_calls TEXT, created_at TEXT NOT NULL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY, url TEXT NOT NULL, title TEXT NOT NULL DEFAULT '',
    description TEXT, site_name TEXT, favicon TEXT,
    content TEXT NOT NULL DEFAULT '',
    note_id TEXT REFERENCES notes(id) ON DELETE CASCADE, collected_at TEXT NOT NULL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS ai_providers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
    api_key TEXT NOT NULL DEFAULT '', base_url TEXT,
    models TEXT DEFAULT '[]',
    is_active INTEGER NOT NULL DEFAULT 0, "order" INTEGER NOT NULL DEFAULT 0
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS settings (
    id TEXT PRIMARY KEY, theme TEXT NOT NULL DEFAULT 'light',
    skin TEXT NOT NULL DEFAULT 'glass',
    locale TEXT NOT NULL DEFAULT 'zh-CN',
    auto_tag INTEGER NOT NULL DEFAULT 1, auto_summary INTEGER NOT NULL DEFAULT 1,
    auto_classify INTEGER NOT NULL DEFAULT 0,
    default_provider_id TEXT, default_model TEXT, server_url TEXT,
    stt_enabled INTEGER NOT NULL DEFAULT 0, stt_base_url TEXT,
    stt_api_key TEXT, stt_model TEXT,
    web_search_provider TEXT NOT NULL DEFAULT 'none',
    web_search_api_key TEXT
  )`)

  await migrateSettingsColumns(sql)

  await sql.execute(`CREATE TABLE IF NOT EXISTS mcp_servers (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, command TEXT NOT NULL,
    args TEXT DEFAULT '[]', env TEXT DEFAULT '{}',
    tools TEXT DEFAULT '[]', is_active INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS note_blocks (
    id TEXT PRIMARY KEY, note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    idx INTEGER NOT NULL DEFAULT 0, chunk_content TEXT NOT NULL,
    embedding BLOB, token_count INTEGER NOT NULL DEFAULT 0
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS block_refs (
    id TEXT PRIMARY KEY,
    source_note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    target_note_id TEXT REFERENCES notes(id) ON DELETE CASCADE,
    target_block_id TEXT REFERENCES note_blocks(id) ON DELETE CASCADE,
    context TEXT, created_at TEXT NOT NULL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS views (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'keyword',
    config TEXT DEFAULT '{}',
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS sync_devices (
    id TEXT PRIMARY KEY, name TEXT NOT NULL,
    last_seen_at TEXT NOT NULL, created_at TEXT NOT NULL
  )`)

  await sql.execute(`CREATE TABLE IF NOT EXISTS note_tombstones (
    note_id TEXT PRIMARY KEY, deleted_at TEXT NOT NULL,
    deleted_by TEXT NOT NULL
  )`)

  await migrateLegacyApiKeys(sql)
}

async function migrateLegacyApiKeys(sql: ReturnType<typeof createClient>) {
  const rows = await sql.execute(
    `SELECT id, api_key FROM ai_providers WHERE api_key IS NOT NULL AND api_key != '' AND api_key NOT LIKE 'enc:v1:%'`,
  )
  for (const row of rows.rows) {
    const enc = encryptSecret(String(row.api_key))
    await sql.execute({
      sql: 'UPDATE ai_providers SET api_key = ? WHERE id = ?',
      args: [enc, String(row.id)],
    })
  }
}

async function migrateSettingsColumns(sql: ReturnType<typeof createClient>) {
  try {
    await sql.execute(`ALTER TABLE settings ADD COLUMN skin TEXT NOT NULL DEFAULT 'glass'`)
  } catch {
    // column already exists
  }
  for (const stmt of [
    `ALTER TABLE settings ADD COLUMN stt_enabled INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE settings ADD COLUMN stt_base_url TEXT`,
    `ALTER TABLE settings ADD COLUMN stt_api_key TEXT`,
    `ALTER TABLE settings ADD COLUMN stt_model TEXT`,
    `ALTER TABLE settings ADD COLUMN task_models TEXT NOT NULL DEFAULT '{}'`,
    `ALTER TABLE settings ADD COLUMN web_search_provider TEXT NOT NULL DEFAULT 'none'`,
    `ALTER TABLE settings ADD COLUMN web_search_api_key TEXT`,
  ]) {
    try {
      await sql.execute(stmt)
    } catch {
      // column already exists
    }
  }
}