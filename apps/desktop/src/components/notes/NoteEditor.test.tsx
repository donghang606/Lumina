import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import NoteEditor from './NoteEditor'

const storeMock = { deleteNote: vi.fn() }
const aiTransformMock = vi.fn()

vi.mock('../../stores/noteStore', () => ({
  useNoteStore: () => storeMock,
}))

vi.mock('../../services/noteService', () => ({
  noteService: { search: vi.fn().mockResolvedValue([]), getWithDetails: vi.fn().mockResolvedValue(null) },
}))

vi.mock('../../services/aiService', () => ({
  aiService: { transform: (...a: unknown[]) => aiTransformMock(...a) },
}))

vi.mock('../../lib/download', () => ({
  download: vi.fn(),
}))

let fakeEditor: any = null
vi.mock('@tiptap/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tiptap/react')>()
  return {
    ...actual,
    useEditor: (opts?: any) => fakeEditor ?? actual.useEditor(opts),
  }
})

function installFakeEditor(text = '选中文本') {
  const base = {
    getMarkdown: vi.fn(() => '# 标题\n\n正文内容'),
    isActive: () => false,
    getAttributes: () => ({}),
    setEditable: vi.fn(),
    view: {
      dom: document.createElement('div'),
      setProps: vi.fn(),
      state: {
        selection: { empty: text.length === 0, from: 0, to: text.length, $from: { pos: 0 } },
        doc: { textBetween: () => text },
      },
    },
    state: {
      selection: { empty: text.length === 0, from: 0, to: text.length },
      doc: { textBetween: () => text },
    },
    chain: () => ({
      focus: () => ({
        deleteRange: () => ({
          insertContent: () => fakeEditor,
        }),
      }),
    }),
    editorProps: {
      attributes: { class: 'lumina-editor-prosemirror' },
    },
  }
  fakeEditor = base
  return fakeEditor
}

const props = () => ({
  noteId: 'note-1',
  title: '待办事项',
  content: '# 标题\n\n正文内容',
  onTitleChange: vi.fn(),
  onContentChange: vi.fn(),
  onSave: vi.fn(),
  onAutoSave: vi.fn(),
  onClose: vi.fn(),
  onOpenLink: vi.fn(),
})

describe('NoteEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
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

  it('auto-saves after ~2s idle and shows flash', async () => {
    vi.useFakeTimers()
    const p = props()
    render(<NoteEditor {...p} />)
    expect(p.onAutoSave).not.toHaveBeenCalled()
    act(() => {
      vi.advanceTimersByTime(2100)
    })
    expect(p.onAutoSave).toHaveBeenCalledTimes(1)
    expect(screen.getByText('已自动保存')).toBeDefined()
  })

  it('auto-save is disabled without onAutoSave prop', async () => {
    vi.useFakeTimers()
    const p = props()
    const { onAutoSave, ...rest } = p
    render(<NoteEditor {...rest} />)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(onAutoSave).not.toHaveBeenCalled()
  })

  it('toggles read mode via ⌘E and button label', async () => {
    const p = props()
    render(<NoteEditor {...p} />)
    const toggle = screen.getByTitle('⌘E 切换编辑 / 阅读')
    expect(toggle.textContent).toContain('编辑中')
    fireEvent.click(toggle)
    expect(screen.getByTitle('⌘E 切换编辑 / 阅读').textContent).toContain('阅读')
    fireEvent.click(screen.getByTitle('⌘E 切换编辑 / 阅读'))
    expect(screen.getByTitle('⌘E 切换编辑 / 阅读').textContent).toContain('编辑中')
  })

  it('exports HTML via download util', async () => {
    const p = props()
    render(<NoteEditor {...p} />)
    fireEvent.click(screen.getByText('HTML'))
    const { download } = await import('../../lib/download')
    expect(download).toHaveBeenCalledTimes(1)
    const [name, html] = (download as ReturnType<typeof vi.fn>).mock.calls[0] as [string, string]
    expect(name).toBe('待办事项.html')
    expect(html).toContain('<!DOCTYPE html>')
  })

  it('runs AI transform on toolbar click', async () => {
    const p = props()
    installFakeEditor()
    aiTransformMock.mockResolvedValue('改写结果')
    render(<NoteEditor {...p} />)
    fireEvent.click(screen.getByTitle('润色（需选中文本）'))
    await waitFor(() => {
      expect(aiTransformMock).toHaveBeenCalledWith('选中文本', 'polish', undefined)
    })
  })

  it('alerts when no text selected for AI transform', async () => {
    const p = props()
    installFakeEditor('')
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {})
    render(<NoteEditor {...p} />)
    fireEvent.click(screen.getByTitle('润色（需选中文本）'))
    expect(alertSpy).toHaveBeenCalled()
    expect(aiTransformMock).not.toHaveBeenCalled()
    alertSpy.mockRestore()
  })
})