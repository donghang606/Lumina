import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NoteEditor from './NoteEditor'

const storeMock = { deleteNote: vi.fn() }

vi.mock('../../stores/noteStore', () => ({
  useNoteStore: () => storeMock,
}))

vi.mock('../../services/noteService', () => ({
  noteService: { search: vi.fn().mockResolvedValue([]), getWithDetails: vi.fn().mockResolvedValue(null) },
}))

const props = () => ({
  noteId: 'note-1',
  title: '待办事项',
  content: '# 标题\n\n正文内容',
  onTitleChange: vi.fn(),
  onContentChange: vi.fn(),
  onSave: vi.fn(),
  onClose: vi.fn(),
  onOpenLink: vi.fn(),
})

describe('NoteEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders title input, editor body and toolbar', async () => {
    render(<NoteEditor {...props()} />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('待办事项')).toBeDefined()
    })
    expect(screen.getByText('保存')).toBeDefined()
    expect(screen.getByTitle('删除')).toBeDefined()
    expect(screen.getByTitle('返回')).toBeDefined()
    expect(screen.getByTitle('加粗')).toBeDefined()
    expect(screen.getByTitle('斜体')).toBeDefined()
    expect(screen.getByTitle('一级标题')).toBeDefined()
    expect(screen.getByTitle('代码块')).toBeDefined()
    expect(screen.getByTitle('插入链接')).toBeDefined()
    expect(document.querySelector('.lumina-editor-prosemirror')).not.toBeNull()
  })

  it('calls onTitleChange while typing', async () => {
    const p = props()
    render(<NoteEditor {...p} />)
    const input = await screen.findByDisplayValue('待办事项')
    fireEvent.change(input, { target: { value: '新标题' } })
    expect(p.onTitleChange).toHaveBeenCalledWith('新标题')
  })

  it('calls onSave on save click', async () => {
    const p = props()
    render(<NoteEditor {...p} />)
    fireEvent.click(screen.getByText('保存'))
    expect(p.onSave).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on back click', () => {
    const p = props()
    render(<NoteEditor {...p} />)
    fireEvent.click(screen.getByTitle('返回'))
    expect(p.onClose).toHaveBeenCalledTimes(1)
  })

  it('deletes note via store and closes on delete click', async () => {
    const p = props()
    storeMock.deleteNote.mockResolvedValue(true)
    render(<NoteEditor {...p} />)
    fireEvent.click(screen.getByTitle('删除'))
    await waitFor(() => {
      expect(storeMock.deleteNote).toHaveBeenCalledWith('note-1')
      expect(p.onClose).toHaveBeenCalledTimes(1)
    })
  })
})