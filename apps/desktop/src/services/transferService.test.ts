import { describe, it, expect, vi, beforeEach } from 'vitest'
import { trpc } from '../lib/trpc'
import { transferService, type ExportItem } from './transferService'

const { mockExportNotes, mockImportNotes } = vi.hoisted(() => ({
  mockExportNotes: vi.fn(),
  mockImportNotes: vi.fn(),
}))

vi.mock('../lib/trpc', () => ({
  trpc: {
    transfer: {
      exportNotes: { query: mockExportNotes },
      importNotes: { mutate: mockImportNotes },
    },
  },
}))

describe('transferService', () => {
  const item: ExportItem = {
    title: 'A',
    type: 'note',
    content: 'hello',
    tags: ['t'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    meta: {},
  }

  beforeEach(() => {
    mockExportNotes.mockReset()
    mockImportNotes.mockReset()
  })

  it('delegates exportNotes to trpc.transfer.exportNotes.query', async () => {
    mockExportNotes.mockResolvedValue({ items: [item], exportedAt: '2026-01-02T00:00:00.000Z' })
    const res = await transferService.exportNotes()
    expect(mockExportNotes).toHaveBeenCalledTimes(1)
    expect(res.items).toEqual([item])
  })

  it('delegates importNotes to trpc.transfer.importNotes.mutate with the items payload', async () => {
    mockImportNotes.mockResolvedValue({ ok: true, imported: 1 })
    const res = await transferService.importNotes([item])
    expect(mockImportNotes).toHaveBeenCalledWith({ items: [item] })
    expect(res.imported).toBe(1)
  })

  it('propagates errors from trpc', async () => {
    mockImportNotes.mockRejectedValue(new Error('network'))
    await expect(transferService.importNotes([item])).rejects.toThrow('network')
  })
})
