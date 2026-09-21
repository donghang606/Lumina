import { z } from 'zod'
import { eq, ne, and, inArray, sql } from 'drizzle-orm'
import { notes, noteLinks, tagsOnNotes } from '../../db/schema.js'
import { registerTool } from '../registry.js'

registerTool({
  name: 'find_orphan_notes',
  description:
    '找出没有任何双链连接的"孤岛"笔记（既无出链也无入链）。适合"哪些笔记还没连上图谱""整理孤立知识"场景。返回 id/标题列表。',
  schema: z.object({
    limit: z.number().int().min(1).max(200).optional().describe('上限，默认 50'),
  }),
  meta: {},
  handler: async (args, ctx) => {
    const limit = (args.limit as number) ?? 50
    // 收集所有参与连接的 note id（source + target）
    const links = await ctx.db
      .select({ s: noteLinks.sourceNoteId, t: noteLinks.targetNoteId })
      .from(noteLinks)
      .all()
    const connected = new Set<string>()
    for (const l of links) {
      if (l.s) connected.add(l.s)
      if (l.t) connected.add(l.t)
    }
    const allNotes = await ctx.db.select({ id: notes.id, title: notes.title }).from(notes).all()
    const orphans = allNotes.filter((n) => !connected.has(n.id)).slice(0, limit)
    return JSON.stringify({
      totalNotes: allNotes.length,
      orphanCount: allNotes.filter((n) => !connected.has(n.id)).length,
      returned: orphans.length,
      items: orphans.map((n) => ({ id: n.id, title: n.title || '(无标题)' })),
    })
  },
})

registerTool({
  name: 'suggest_connections',
  description:
    '基于标签共现推荐笔记间连接：两篇笔记共享标签但无直接双链 → 建议建立 [[链接]]。返回候选对（source/target/共享标签数）。适合"帮我发现哪些笔记该连起来"。',
  schema: z.object({
    limit: z.number().int().min(1).max(50).optional().describe('建议对上限，默认 15'),
  }),
  meta: {},
  handler: async (args, ctx) => {
    const limit = (args.limit as number) ?? 15

    // 笔记 → 标签集合
    const ton = await ctx.db
      .select({ noteId: tagsOnNotes.noteId, tagId: tagsOnNotes.tagId })
      .from(tagsOnNotes)
      .all()
    const noteTags = new Map<string, Set<string>>()
    for (const t of ton) {
      if (!t.noteId) continue
      let s = noteTags.get(t.noteId)
      if (!s) { s = new Set(); noteTags.set(t.noteId, s) }
      if (t.tagId) s.add(t.tagId)
    }

    // 现有直接双链集合（source→target）
    const links = await ctx.db
      .select({ s: noteLinks.sourceNoteId, t: noteLinks.targetNoteId })
      .from(noteLinks)
      .all()
    const existing = new Set<string>()
    for (const l of links) existing.add(`${l.s}->${l.t}`)

    // 遍历标签组：同标签的笔记两两候选
    const byTag = new Map<string, string[]>()
    for (const [noteId, tags] of noteTags) {
      for (const tag of tags) {
        const arr = byTag.get(tag) ?? []
        arr.push(noteId)
        byTag.set(tag, arr)
      }
    }

    const pairShared = new Map<string, number>() // "a|b"（有序） → 共享标签数
    for (const [, noteIds] of byTag) {
      for (let i = 0; i < noteIds.length; i++) {
        for (let j = i + 1; j < noteIds.length; j++) {
          const [a, b] = [noteIds[i], noteIds[j]].sort()
          const key = `${a}|${b}`
          pairShared.set(key, (pairShared.get(key) ?? 0) + 1)
        }
      }
    }

    // 过滤已有连接，取 top
    const candidates: { source: string; target: string; sharedTags: number }[] = []
    for (const [key, shared] of pairShared) {
      const [a, b] = key.split('|')
      if (existing.has(`${a}->${b}`) || existing.has(`${b}->${a}`)) continue
      candidates.push({ source: a, target: b, sharedTags: shared })
    }
    candidates.sort((x, y) => y.sharedTags - x.sharedTags)

    // 补标题
    const titleMap = new Map<string, string>()
    if (candidates.length > 0) {
      const ids = candidates.slice(0, limit).flatMap((c) => [c.source, c.target])
      const rows = await ctx.db.select({ id: notes.id, title: notes.title }).from(notes).all()
      for (const r of rows) titleMap.set(r.id, r.title || '(无标题)')
    }

    const result = candidates.slice(0, limit).map((c) => ({
      source: { id: c.source, title: titleMap.get(c.source) ?? '' },
      target: { id: c.target, title: titleMap.get(c.target) ?? '' },
      sharedTags: c.sharedTags,
    }))

    return JSON.stringify({
      suggestionCount: result.length,
      items: result,
    })
  },
})
