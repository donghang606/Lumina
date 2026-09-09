import { trpc } from '../lib/trpc'

export interface FileIngestRecord {
  id: string
  filePath: string
  fileName: string
  ext: string
  contentHash: string
  charCount: string
  noteId: string | null
  ingestedAt: string
}

export interface IngestFileResult {
  ok: boolean
  skipped?: boolean
  noteId?: string | null
  charCount?: number
  chunks?: number
  reason?: string
}

export interface IngestDirectoryResult {
  ok: boolean
  total: number
  imported: number
  skipped: number
  failed: number
  reason?: string
  results: Array<{ file: string; ok: boolean; skipped?: boolean; reason?: string }>
}

export const ingestService = {
  list(): Promise<FileIngestRecord[]> {
    return trpc.ingest.list.query()
  },
  ingestFile(filePath: string): Promise<IngestFileResult> {
    return trpc.ingest.ingestFile.mutate({ filePath, skipDup: true })
  },
  ingestDirectory(dirPath: string, maxFiles = 500): Promise<IngestDirectoryResult> {
    return trpc.ingest.ingestDirectory.mutate({ dirPath, maxFiles })
  },
  remove(id: string): Promise<{ ok: boolean; reason?: string }> {
    return trpc.ingest.remove.mutate({ id })
  },
}