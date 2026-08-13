import { trpc } from '../lib/trpc'
import type { Note } from '@lumina/shared'

export interface ExportItem {
  title: string
  type: Note['type']
  content: string
  tags: string[]
  createdAt: string | null
  updatedAt: string | null
  meta: Record<string, unknown>
}

export const transferService = {
  async exportNotes(): Promise<{ items: ExportItem[]; exportedAt: string }> {
    return trpc.transfer.exportNotes.query()
  },
  async importNotes(items: ExportItem[]): Promise<{ ok: boolean; imported: number }> {
    return trpc.transfer.importNotes.mutate({ items })
  },
}
