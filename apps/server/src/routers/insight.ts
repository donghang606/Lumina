import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { notes, tags, tagsOnNotes, noteLinks } from '../db/schema.js'
import { eq, desc, count, sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

const STOPWORDS = new Set([
  '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着',
  '没有', '看', '好', '自己', '这', '那', '与', '及', '及至', '把', '被', '让', '给', '对', '因为', '所以', '但是', '而且', '如果',
  'the', 'a', 'an', 'of', 'to', 'in', 'and', 'is', 'that', 'for', 'on', 'with', 'as', 'by', 'at',
])

export const insightRouter = router({
  get: publicProcedure.query(async ({ ctx }) => {
    const allNotes = await ctx.db.select().from(notes).all()

    // ---- 1. 重点领域: 基于标题/内容的词频 + 标签使用率 ----
    const wordFreq = new Map<string, number>()
    const titleFreq = new Map<string, number>()
    const addWords = (text: string, freq: Map<string, number>, weight: number) => {
      const words = text.match(/[\u4e00-\u9fa5]{2,6}|[a-zA-Z]{3,20}/g) ?? []
      for (const w of words) {
        if (STOPWORDS.has(w.toLowerCase())) continue
        const key = w.toLowerCase()
        freq.set(key, (freq.get(key) ?? 0) + weight)
      }
    }
    for (const n of allNotes) {
      const strip = (s: string) => (s ?? '').replace(/<[^>]+>/g, ' ').replace(/\[\[|\]\]/g, ' ')
      addWords(strip(n.title ?? ''), titleFreq, 3)
      addWords(strip(n.content ?? ''), wordFreq, 1)
    }
    const merged = new Map<string, number>()
    for (const [k, v] of titleFreq) merged.set(k, v)
    for (const [k, v] of wordFreq) merged.set(k, (merged.get(k) ?? 0) + v)
    const topWords = [...merged.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([w]) => w)

    const tagRows = await ctx.db
      .select({ name: tags.name, cnt: count(tagsOnNotes.tagId) })
      .from(tags)
      .innerJoin(tagsOnNotes, eq(tags.id, tagsOnNotes.tagId))
      .groupBy(tags.id)
      .orderBy(desc(count(tagsOnNotes.tagId)))
      .limit(4)
      .all()
    const topTags = tagRows.map((t) => t.name)

    const focusAreas = [...new Set([...topTags, ...topWords])].slice(0, 4)
    if (focusAreas.length === 0) focusAreas.push('尚未积累')

    // ---- 2. 概念连接: 使用 note_links 的 next hop ----
    const links = await ctx.db.select().from(noteLinks).all()
    const id2title = new Map(allNotes.map((n) => [n.id, n.title ?? '(未命名)']))
    const connections: { a: string; b: string }[] = []
    for (const l of links) {
      if (!l.sourceNoteId || !l.targetNoteId) continue
      const a = id2title.get(l.sourceNoteId) ?? '未知'
      const b = id2title.get(l.targetNoteId) ?? '未知'
      connections.push({ a, b })
    }

    // ---- 3. 值得追问: 从短卡片/含疑问的标题 + 连接数低的孤立节点 ----
    const questions: string[] = []
    for (const n of allNotes) {
      const t = n.title ?? ''
      if (/\?|？|如何|为什么|怎样|怎么/.test(t)) {
        questions.push(t)
      }
    }
    const connected = new Set<string>()
    for (const l of links) {
      if (l.sourceNoteId) connected.add(l.sourceNoteId)
      if (l.targetNoteId) connected.add(l.targetNoteId)
    }
    if (questions.length === 0) {
      for (const n of allNotes) {
        if (!connected.has(n.id) && (n.title ?? '').length > 0) {
          questions.push(`${n.title} —— 目前还没有与其他笔记建立连接`)
          if (questions.length >= 3) break
        }
      }
    }
    if (questions.length === 0) questions.push('积累更多笔记后，这里会出现值得深入的问题')
    if (questions.length < 3) {
      const recent = allNotes.slice().sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))[0]
      if (recent?.title) questions.push(`“${recent.title}”这篇最近刚记录，要不要深入展开？`)
    }

    // ---- 4. 引用「金句」: 取一条最近且有内容的首行段落 ----
    let quote = ''
    for (const n of allNotes) {
      const clean = (n.content ?? '').replace(/<[^>]+>/g, ' ').replace(/\[\[.*?\]\]/g, '').replace(/\s+/g, ' ').trim()
      if (clean.length >= 8) {
        quote = clean.slice(0, 40) + (clean.length > 40 ? '…' : '')
        break
      }
    }
    if (!quote && allNotes[0]) {
      quote = (allNotes[0].title ?? '').slice(0, 40) || '知识值得被连接'
    }
    if (!quote) quote = '知识的价值不在于储存，而在于连接。'

    return {
      focusAreas,
      connections: connections.slice(0, 6),
      questions: questions.slice(0, 3),
      quote,
      _meta: { noteCount: allNotes.length, linkCount: links.length },
    }
  }),

  // 手动入库一条「心跳」心声，供将来 AI 使用
  heartbeat: publicProcedure
    .input(z.object({ text: z.string().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const now = new Date().toISOString()
      await ctx.db.insert(notes).values({
        id: randomUUID(),
        title: '💭 心声',
        content: `<p>${input.text}</p>`,
        type: 'card',
        createdAt: now,
        updatedAt: now,
      })
      return { ok: true }
    }),
})

export type InsightRouter = typeof insightRouter