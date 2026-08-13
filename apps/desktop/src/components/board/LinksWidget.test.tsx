import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import LinksWidget from './widgets/LinksWidget'

const mockRemoveWidget = vi.fn()
const mockAddLink = vi.fn()
const mockRemoveLink = vi.fn()

let storeState: any = {
  widgets: [{ id: 'w1', type: 'links' as const, title: '快捷链接', links: [] }],
  editing: false,
  removeWidget: mockRemoveWidget,
  addLink: mockAddLink,
  removeLink: mockRemoveLink,
}

vi.mock('../../stores/boardStore', () => ({
  useBoardStore: (selector?: any) => (typeof selector === 'function' ? selector(storeState) : storeState),
}))

describe('LinksWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      widgets: [{ id: 'w1', type: 'links' as const, title: '快捷链接', links: [] }],
      editing: false,
      removeWidget: mockRemoveWidget,
      addLink: mockAddLink,
      removeLink: mockRemoveLink,
    }
  })

  it('renders title', () => {
    render(<LinksWidget widgetId="w1" title="快捷链接" />)
    expect(screen.getByText('快捷链接')).toBeDefined()
  })

  it('shows empty state when no links', () => {
    render(<LinksWidget widgetId="w1" title="快捷链接" />)
    expect(screen.getByText('暂无链接，添加常用入口吧')).toBeDefined()
  })

  it('renders add link input fields', () => {
    render(<LinksWidget widgetId="w1" title="快捷链接" />)
    expect(screen.getByPlaceholderText('名称（可选）')).toBeDefined()
    expect(screen.getByPlaceholderText('https://…')).toBeDefined()
  })

  it('calls addLink when clicking add button', () => {
    render(<LinksWidget widgetId="w1" title="快捷链接" />)
    const urlInput = screen.getByPlaceholderText('https://…')
    fireEvent.change(urlInput, { target: { value: 'https://example.com' } })
    const addBtn = screen.getByTitle('添加')
    fireEvent.click(addBtn)
    expect(mockAddLink).toHaveBeenCalledWith('w1', 'https://example.com', 'https://example.com')
  })

  it('shows existing links', () => {
    storeState.widgets[0].links = [
      { id: 'l1', title: 'GitHub', url: 'https://github.com' },
      { id: 'l2', title: 'Docs', url: 'https://docs.example.com' },
    ]
    render(<LinksWidget widgetId="w1" title="快捷链接" />)
    expect(screen.getByText('GitHub')).toBeDefined()
    expect(screen.getByText('Docs')).toBeDefined()
  })
})
