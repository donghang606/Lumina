import { notes, noteLinks, tagsOnNotes, tags } from '../db/schema.js'
import type * as schemaNS from '../db/schema.js'
import type { LibSQLDatabase } from 'drizzle-orm/libsql'
import { randomUUID } from 'node:crypto'

export type Db = LibSQLDatabase<typeof schemaNS>

export interface ImportItem {
  title: string
  type: 'card' | 'note' | 'bookmark' | 'file'
  content: string
  tags: string[]
  createdAt?: string | null
}

export interface ExportNote extends ImportItem {
  createdAt: string | null
  updatedAt: string | null
  meta: Record<string, unknown>
}

export async function buildExport(db: Db): Promise<{ app: string; version: number; exportedAt: string; items: ExportNote[] }> {
  const rows = await db.select().from(notes).orderBy(notes.createdAt).all()
  const rels = await db.select().from(tagsOnNotes).all()
  const tagRows = await db.select().from(tags).all()
  const tagNameById = new Map(tagRows.map((t) => [t.id, t.name]))
  const tagNamesByNote = new Map<string, string[]>()
  for (const r of rels) {
    if (!r.noteId || !r.tagId) continue
    const name = tagNameById.get(r.tagId)
    if (!name) continue
    const arr = tagNamesByNote.get(r.noteId) ?? []
    arr.push(name)
    tagNamesByNote.set(r.noteId, arr)
  }

  return {
    app: 'lumina',
    version: 1,
    exportedAt: new Date().toISOString(),
    items: rows.map((n) => ({
      title: n.title,
      type: n.type,
      content: n.content,
      tags: tagNamesByNote.get(n.id) ?? [],
      createdAt: n.createdAt,
      updatedAt: n.updatedAt,
      meta: n.meta ?? {},
    })),
  }
}

export async function runImport(db: Db, items: ImportItem[]): Promise<{ ok: boolean; imported: number }> {
  const now = new Date().toISOString()

  const existingRows = await db.select({ title: notes.title }).from(notes).all()
  const existingTitles = new Set(existingRows.map((r) => r.title.trim().toLowerCase()))
  const allTags = await db.select().from(tags).all()
  const tagByName = new Map(allTags.map((t) => [t.name.trim().toLowerCase(), t]))

  const createdIds = new Map<string, string>()

  for (const item of items) {
    const title = item.title.trim() || '(无标题)'
    const key = title.toLowerCase()
    if (existingTitles.has(key) || createdIds.has(key)) continue
    const id = randomUUID()
    const createdAt = item.createdAt ?? now
    await db.insert(notes).values({ id, title, content: item.content, type: item.type, createdAt, updatedAt: createdAt })
    createdIds.set(key, id)

    const tagIds: string[] = []
    for (const rawName of item.tags) {
      const name = rawName.trim()
      if (!name) continue
      const lower = name.toLowerCase()
      let t = tagByName.get(lower)
      if (!t) {
        const tid = randomUUID()
        t = { id: tid, name, slug: tid, color: null, parentId: null, order: 0, createdAt: now }
        await db.insert(tags).values(t)
        tagByName.set(lower, t)
      }
      tagIds.push(t.id)
    }
    if (tagIds.length) {
      await db.insert(tagsOnNotes).values(tagIds.map((tagId) => ({ noteId: id, tagId, assignedBy: 'manual' as const })))
    }
  }

  const idByTitleLower = new Map<string, string>()
  const linkKeys = new Set<string>()
  const allLinks = await db.select().from(noteLinks).all()
  for (const l of allLinks) {
    if (l.sourceNoteId && l.targetNoteId) linkKeys.add(`${l.sourceNoteId}|${l.targetNoteId}`)
  }
  const allExisting = await db.select({ id: notes.id, title: notes.title }).from(notes).all()
  for (const n of allExisting) idByTitleLower.set(n.title.trim().toLowerCase(), n.id)

  for (const [lowerTitle, sourceId] of createdIds) {
    const item = items.find((i) => i.title.trim().toLowerCase() === lowerTitle)
    if (!item) continue
    const targets = [...item.content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1].trim())
    for (const target of targets) {
      if (!target) continue
      const targetId = idByTitleLower.get(target.toLowerCase())
      if (!targetId || targetId === sourceId) continue
      const key = `${sourceId}|${targetId}`
      if (linkKeys.has(key)) continue
      linkKeys.add(key)
      await db.insert(noteLinks).values({ id: randomUUID(), sourceNoteId: sourceId, targetNoteId: targetId, context: null, createdAt: now })
    }
  }

  return { ok: true, imported: createdIds.size }
}

export function parseWikiLinks(content: string): string[] {
  return [...content.matchAll(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g)].map((m) => m[1].trim())
}

export function dedupeByTitle(items: ImportItem[]): ImportItem[] {
  const seen = new Set<string>()
  const out: ImportItem[] = []
  for (const item of items) {
    const key = (item.title || '(无标题)').trim().toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}
