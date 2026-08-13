import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Board from './Board'

const mockWidgets = [
  { id: 'w1', type: 'todo' as const, title: '待办' },
  { id: 'w2', type: 'countdown' as const, title: '倒计时' },
  { id: 'w3', type: 'stats' as const, title: '统计' },
  { id: 'w4', type: 'feed' as const, title: '动态', wide: true },
]

let storeState: any = {
  widgets: mockWidgets,
  editing: false,
  setEditing: vi.fn(),
  addWidget: vi.fn(),
  moveWidget: vi.fn(),
  resetBoard: vi.fn(),
}

vi.mock('../../stores/boardStore', () => ({
  useBoardStore: (selector?: any) => (typeof selector === 'function' ? selector(storeState) : storeState),
}))

describe('Board', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      widgets: mockWidgets,
      editing: false,
      setEditing: vi.fn(),
      addWidget: vi.fn(),
      moveWidget: vi.fn(),
      resetBoard: vi.fn(),
    }
  })

  it('renders the title', () => {
    render(<Board />)
    expect(screen.getByText('工作台')).toBeDefined()
  })

  it('renders edit and add buttons', () => {
    render(<Board />)
    expect(screen.getByText('编辑')).toBeDefined()
    expect(screen.getByText('添加组件')).toBeDefined()
  })

  it('renders all widget titles from the store', () => {
    render(<Board />)
    expect(screen.getByText('待办')).toBeDefined()
    expect(screen.getByText('倒计时')).toBeDefined()
    expect(screen.getByText('统计')).toBeDefined()
    expect(screen.getByText('动态')).toBeDefined()
  })

  it('renders wide widget with full-width grid column', () => {
    const { container } = render(<Board />)
    const wideDiv = container.querySelector('[style*="1 / -1"]')
    expect(wideDiv).not.toBeNull()
  })
})
