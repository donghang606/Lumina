import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import * as schema from '../db/schema.js'
import { initDb } from '../db/client.js'
import { syncRouter } from './sync.js'
import type { Context } from '../trpc/context.js'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function caller(db: any) {
  return syncRouter.createCaller({ db, req: {} as any, res: {} as any })
}

describe('syncRouter', () => {
  let client: Client
  let ctx: Context
  let tmpFile: string

  beforeEach(async () => {
    tmpFile = path.join(os.tmpdir(), `lumina-sync-${randomUUID()}.db`)
    client = createClient({ url: `file:${tmpFile}` })
    await initDb(client)
    const db = drizzle(client, { schema })
    ctx = { db } as unknown as Context
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

  it('registers a device and heartbeats', async () => {
    const r = await caller(ctx.db).registerDevice({ name: 'laptop' })
    expect(r.deviceId).toBeTruthy()
    await expect(caller(ctx.db).heartbeat({ deviceId: r.deviceId })).resolves.toEqual({ ok: true })
  })

  it('push applies LWW notes and pull returns them since cursor', async () => {
    const { deviceId } = await caller(ctx.db).registerDevice({ name: 'dev-a' })
    const now = new Date().toISOString()
    await caller(ctx.db).push({
      deviceId,
      notes: [
        { id: 'n1', title: '标题', content: '内容', type: 'note', summary: null, createdAt: now, updatedAt: now },
      ],
    })

    const before = new Date(Date.now() - 1000).toISOString()
    const pulled = await caller(ctx.db).pull({ since: before, deviceId })
    expect(pulled.notes).toHaveLength(1)
    expect(pulled.notes[0].title).toBe('标题')
    expect(pulled.notes[0].id).toBe('n1')
  })

  it('LWW: older push is ignored', async () => {
    const { deviceId } = await caller(ctx.db).registerDevice({ name: 'dev-a' })
    const newer = new Date().toISOString()
    const older = new Date(Date.now() - 60000).toISOString()
    await caller(ctx.db).push({
      deviceId,
      notes: [{ id: 'n1', title: '新', content: '', type: 'note', createdAt: older, updatedAt: newer }],
    })
    const r = await caller(ctx.db).push({
      deviceId,
      notes: [{ id: 'n1', title: '旧', content: '', type: 'note', createdAt: older, updatedAt: older }],
    })
    expect(r.applied).toBe(0)
    const pulled = await caller(ctx.db).pull({ since: '2000-01-01T00:00:00.000Z', deviceId })
    expect(pulled.notes[0].title).toBe('新')
  })

  it('tombstone deletes note across devices', async () => {
    const { deviceId } = await caller(ctx.db).registerDevice({ name: 'dev-a' })
    const now = new Date().toISOString()
    await caller(ctx.db).push({
      deviceId,
      notes: [{ id: 'n1', title: '将被删', content: '', type: 'note', createdAt: now, updatedAt: now }],
    })
    await caller(ctx.db).push({
      deviceId,
      tombstones: [{ noteId: 'n1', deletedAt: new Date(Date.now() + 1000).toISOString() }],
    })
    const pulled = await caller(ctx.db).pull({ since: '2000-01-01T00:00:00.000Z', deviceId })
    expect(pulled.notes).toHaveLength(0)
    expect(pulled.tombstones).toHaveLength(1)
  })
})