import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NotesPage from './NotesPage'
import type { Note, NoteDetail, TagWithCount } from '@lumina/shared'

const mkNote = (id: string, title: string): Note => ({
  id,
  title,
  content: '# 内容',
  type: 'note',
  summary: null,
  status: 'draft',
  meta: {},
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
})

const mkDetail = (id: string, title: string): NoteDetail => ({
  note: mkNote(id, title),
  tags: [],
  backlinks: [],
  outlinks: [],
  blocks: [],
})

const services = {
  getWithDetails: vi.fn(),
  listBlockRefs: vi.fn(),
  related: vi.fn(),
  list: vi.fn(),
  updateNote: vi.fn(),
  publishParsedLinks: vi.fn(),
  autoProcess: vi.fn(),
  remove: vi.fn(),
}

vi.mock('../../services/noteService', () => ({
  noteService: {
    getWithDetails: (...a: unknown[]) => services.getWithDetails(...a),
    listBlockRefs: (...a: unknown[]) => services.listBlockRefs(...a),
    related: (...a: unknown[]) => services.related(...a),
    list: (...a: unknown[]) => services.list(...a),
    updateNote: (...a: unknown[]) => services.updateNote(...a),
    publishParsedLinks: (...a: unknown[]) => services.publishParsedLinks(...a),
    autoProcess: (...a: unknown[]) => services.autoProcess(...a),
    remove: (...a: unknown[]) => services.remove(...a),
  },
}))

vi.mock('../../services/configService', () => ({
  configService: { getSettings: vi.fn().mockResolvedValue({ autoSummary: false, autoTag: false }) },
}))

const store: { notes: Note[]; selectedId: string | null; updateNote: ReturnType<typeof vi.fn> } = {
  notes: [] as Note[],
  selectedId: null,
  updateNote: vi.fn().mockResolvedValue({ id: 'a', title: 'x', content: 'x' }),
}
vi.mock('../../stores/noteStore', () => ({
  useNoteStore: () => ({
    notes: store.notes,
    loaded: true,
    loadNotes: vi.fn(),
    loadTags: vi.fn(),
    createNote: vi.fn(),
    updateNote: store.updateNote,
    setTagsForNote: vi.fn(),
    selectedId: store.selectedId,
    tags: [] as TagWithCount[],
  }),
}))

vi.mock('../../components/review/ReviewQueue', () => ({
  default: () => null,
  useReviewCount: () => ({ count: 0, refresh: vi.fn() }),
}))

vi.mock('../../stores/layoutStore', () => ({
  useLayoutStore: (selector: any) => selector({ setNav: vi.fn() }),
}))

describe('NotesPage 多标签页', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    store.notes = []
    store.selectedId = null
    services.getWithDetails.mockImplementation(async (id: string) => {
      const m: Record<string, string> = { a: '笔记A', b: '笔记B' }
      return mkDetail(id, m[id] ?? `笔记${id}`)
    })
    services.listBlockRefs.mockResolvedValue([])
    services.related.mockResolvedValue([])
    services.list.mockResolvedValue([])
    services.updateNote.mockResolvedValue(mkNote('a', 'x'))
    services.publishParsedLinks.mockResolvedValue({ ok: true })
    services.autoProcess.mockResolvedValue({ ok: true })
  })

  it('通过 selectedId 打开两篇笔记，标签栏出现两个标签页并可切换', async () => {
    store.notes = [mkNote('a', '笔记A'), mkNote('b', '笔记B')]
    store.selectedId = 'a'
    const { container, rerender } = render(<NotesPage />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('笔记A')).toBeDefined()
    })
    // 再打开 B（模拟从侧栏/图谱选中）
    store.selectedId = 'b'
    rerender(<NotesPage />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('笔记B')).toBeDefined()
    })
    expect(container.querySelectorAll('.lumina-tab')).toHaveLength(2)
    // 切回 A
    fireEvent.click(container.querySelectorAll('.lumina-tab')[0] as HTMLElement)
    await waitFor(() => {
      expect(screen.getByDisplayValue('笔记A')).toBeDefined()
    })
  })

  it('重复打开同一笔记只保留一个标签页', async () => {
    store.notes = [mkNote('a', '笔记A'), mkNote('b', '笔记B')]
    store.selectedId = 'a'
    const { container, rerender } = render(<NotesPage />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('笔记A')).toBeDefined()
    })
    expect(services.getWithDetails).toHaveBeenCalledTimes(1)
    // 再次触发 selectedId='a'（openNote 幂等：已打开则仅激活，不重复拉详情）
    rerender(<NotesPage />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('笔记A')).toBeDefined()
    })
    expect(services.getWithDetails).toHaveBeenCalledTimes(1)
    // 打开第二篇后出现 tab 栏，关闭其中一个回到剩余 tab
    store.selectedId = 'b'
    rerender(<NotesPage />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('笔记B')).toBeDefined()
    })
    expect(container.querySelectorAll('.lumina-tab')).toHaveLength(2)
    const closeBtn = container.querySelector('.lumina-tab-close') as HTMLButtonElement
    fireEvent.click(closeBtn)
    await waitFor(() => {
      // 关闭非激活 tab A 后：剩 B（激活态不变），tab 栏隐藏（只剩一篇）
      expect(screen.getByDisplayValue('笔记B')).toBeDefined()
    })
    expect(container.querySelectorAll('.lumina-tab')).toHaveLength(0)
  })

  it('保存时调用 updateNote 且保留标签页', async () => {
    store.notes = [mkNote('a', '笔记A')]
    store.selectedId = 'a'
    const { container } = render(<NotesPage />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('笔记A')).toBeDefined()
    })
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => {
      expect(store.updateNote).toHaveBeenCalled()
    })
    // 保存后不关闭：编辑器仍在（未回到列表），tab 栏因单篇隐藏
    expect(screen.getByDisplayValue('笔记A')).toBeDefined()
    expect(container.querySelectorAll('.lumina-tab')).toHaveLength(0)
  })
})