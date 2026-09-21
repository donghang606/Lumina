import { tags, tagsOnNotes } from '../db/schema.js'
import { eq, and } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'

type Db = { select: any; insert: any; delete: any }

/**
 * 自动标签：扫描笔记内容，匹配已有标签名（不区分大小写）。
 * 已有手动标签的笔记不覆盖；已自动打过的标签不重复。
 * 返回新打的 tagId 列表。
 */
export async function autoTagNote(db: Db, noteId: string, content: string): Promise<string[]> {
  // 1. 获取所有已有标签
  const allTags = await db.select().from(tags).all()
  if (!allTags.length) return []

  const contentLower = content.toLowerCase()

  // 2. 匹配：标签名出现在内容中（词边界匹配，避免子串误匹配）
  const matched: string[] = []
  for (const tag of allTags) {
    const name = (tag.name ?? '').trim()
    if (!name || name.length < 2) continue // 跳过太短的标签
    // 词边界正则（中文用包含匹配，英文用 \b）
    const isCjk = /[\u4e00-\u9fff]/.test(name)
    const pattern = isCjk
      ? new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
    if (pattern.test(contentLower) || pattern.test(content)) {
      matched.push(tag.id)
    }
  }
  if (!matched.length) return []

  // 3. 查询已有标签分配（手动+自动）
  const existing = await db.select().from(tagsOnNotes).where(eq(tagsOnNotes.noteId, noteId)).all()
  const existingSet = new Set(existing.map((e: any) => e.tagId))

  // 4. 只插入新的自动标签
  const toInsert = matched.filter((id) => !existingSet.has(id))
  if (!toInsert.length) return []

  await db.insert(tagsOnNotes).values(
    toInsert.map((tagId) => ({
      noteId,
      tagId,
      assignedBy: 'auto' as const,
      confidence: null,
    })),
  )

  return toInsert
}
