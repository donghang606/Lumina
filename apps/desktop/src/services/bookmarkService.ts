import { trpc } from '../lib/trpc'

export interface BookmarkHealthItem {
  collectionId: string
  noteId: string | null
  title: string
  url: string
  ok: boolean
  status: number
  error: string | null
}

export const bookmarkService = {
  list(): Promise<BookmarkHealthItem[]> {
    return trpc.bookmark.list.query()
  },
  checkHealth(timeoutMs?: number): Promise<{ checked: number; broken: BookmarkHealthItem[]; ok: boolean }> {
    return trpc.bookmark.checkHealth.mutate({ timeoutMs })
  },
}