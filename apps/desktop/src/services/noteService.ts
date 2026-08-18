import { trpc } from '../lib/trpc'
import type { Note, NoteDetail, Stats, Tag, TagWithCount, RelatedNote, BlockRef } from '@lumina/shared'

export const noteService = {
  async list(): Promise<Note[]> {
    return trpc.note.list.query()
  },
  async recent(): Promise<Note[]> {
    return trpc.note.recent.query()
  },
  async stats(): Promise<Stats> {
    return trpc.note.stats.query()
  },
  async getById(id: string): Promise<Note | null> {
    return trpc.note.getById.query({ id })
  },
  async getWithDetails(id: string): Promise<NoteDetail | null> {
    return trpc.note.getWithDetails.query({ id })
  },
  async create(input: { title: string; content?: string; type?: Note['type']; tagIds?: string[] }): Promise<{ id: string }> {
    return trpc.note.create.mutate({ title: input.title, content: input.content ?? '', type: input.type ?? 'note', tagIds: input.tagIds })
  },
  async update(input: { id: string; title?: string; content?: string; type?: Note['type']; meta?: Record<string, unknown> }): Promise<Note | null> {
    return trpc.note.update.mutate(input)
  },
  async remove(id: string): Promise<{ ok: boolean }> {
    return trpc.note.remove.mutate({ id })
  },
  async setTags(noteId: string, tagIds: string[]): Promise<{ ok: boolean }> {
    return trpc.note.setTags.mutate({ noteId, tagIds })
  },
  async getBacklinks(noteId: string): Promise<{ id: string; title: string }[]> {
    return trpc.note.getBacklinks.query({ noteId })
  },
  async search(keyword: string): Promise<{ id: string; title: string; snippet?: string; score?: number }[]> {
    if (!keyword.trim()) return []
    const res = await trpc.note.search.query({ query: keyword, limit: 8 })
    return res.items.map((i) => ({ id: i.id, title: i.title, snippet: i.snippet, score: i.score }))
  },
  async related(noteId: string, limit?: number): Promise<RelatedNote[]> {
    const res = await trpc.note.related.query({ noteId, limit: limit ?? 5 })
    return res.items
  },
  async listBlockRefs(noteId: string): Promise<BlockRef[]> {
    return trpc.note.listBlockRefs.query({ noteId })
  },
  async createBlockRef(input: { sourceNoteId: string; targetNoteId: string; targetBlockId?: string | null; context?: string }): Promise<{ ok: boolean }> {
    return trpc.note.createBlockRef.mutate(input)
  },
  async deleteBlockRef(id: string): Promise<{ ok: boolean }> {
    return trpc.note.deleteBlockRef.mutate({ id })
  },
  async createLink(sourceNoteId: string, targetNoteId: string, context?: string): Promise<{ ok: boolean }> {
    return trpc.note.createLink.mutate({ sourceNoteId, targetNoteId, context })
  },
  async publishParsedLinks(noteId: string, links: { targetNoteId: string; context?: string }[]): Promise<{ ok: boolean }> {
    return trpc.note.publishParsedLinks.mutate({ noteId, links })
  },
  async autoProcess(noteId: string): Promise<{ ok: boolean; results?: { summary?: string; tags?: string[] }; reason?: string }> {
    return trpc.note.autoProcess.mutate({ noteId })
  },
  async embed(id: string): Promise<{ ok: boolean; chunks?: number; reason?: string }> {
    return trpc.note.embed.mutate({ id })
  },
  async embedAll(): Promise<{ ok: boolean; embedded?: number; reason?: string }> {
    return trpc.note.embedAll.mutate()
  },
}

export const tagService = {
  async list(): Promise<TagWithCount[]> {
    return trpc.tag.list.query()
  },
  async create(name: string, color?: string, parentId?: string): Promise<{ id: string; ok: boolean }> {
    return trpc.tag.create.mutate({ name, color, parentId })
  },
  async rename(id: string, name: string): Promise<{ ok: boolean }> {
    return trpc.tag.rename.mutate({ id, name })
  },
  async remove(id: string): Promise<{ ok: boolean }> {
    return trpc.tag.remove.mutate({ id })
  },
  async setParent(id: string, parentId: string | null): Promise<{ ok: boolean; reason?: string }> {
    return trpc.tag.setParent.mutate({ id, parentId })
  },
  async reorder(id: string, parentId: string | null, beforeId: string | null): Promise<{ ok: boolean; reason?: string }> {
    return trpc.tag.reorder.mutate({ id, parentId, beforeId })
  },
}

export type { Tag }