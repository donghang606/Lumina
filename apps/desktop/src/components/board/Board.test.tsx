import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Board from './Board'

const mockWidgets = [
  { id: 'w1', type: 'todo' as const, title: '待办', x: 0, y: 0, w: 300, h: 240 },
  { id: 'w2', type: 'countdown' as const, title: '倒计时', x: 316, y: 0, w: 300, h: 150 },
  { id: 'w3', type: 'stats' as const, title: '统计', x: 0, y: 256, w: 300, h: 200 },
  { id: 'w4', type: 'feed' as const, title: '动态', x: 0, y: 472, w: 620, h: 340, wide: true },
]

let storeState: any = {
  widgets: mockWidgets,
  editing: false,
  setEditing: vi.fn(),
  addWidget: vi.fn(),
  updateLayout: vi.fn(),
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
      updateLayout: vi.fn(),
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

  it('positions widgets with absolute left/top/width/height', () => {
    const { container } = render(<Board />)
    const pos = container.querySelectorAll('[style*="position: absolute"]')
    expect(pos.length).toBeGreaterThanOrEqual(4)
    const wide = [...pos].some((el) => el.getAttribute('style')?.includes('width: 620px'))
    expect(wide).toBe(true)
  })

  it('shows move and resize handles in editing mode', () => {
    storeState = { ...storeState, editing: true }
    render(<Board />)
    expect(screen.getAllByTitle('拖动移动').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('拖动调整大小').length).toBeGreaterThan(0)
  })
})
