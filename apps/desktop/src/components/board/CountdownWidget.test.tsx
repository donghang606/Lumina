import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CountdownWidget from './widgets/CountdownWidget'

const mockRemoveWidget = vi.fn()
const mockUpdateWidget = vi.fn()

let storeState: any = {
  widgets: [{ id: 'w1', type: 'countdown' as const, title: '倒计时', countdown: undefined }],
  editing: false,
  removeWidget: mockRemoveWidget,
  updateWidget: mockUpdateWidget,
}

vi.mock('../../stores/boardStore', () => ({
  useBoardStore: (selector?: any) => (typeof selector === 'function' ? selector(storeState) : storeState),
}))

describe('CountdownWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    storeState = {
      widgets: [{ id: 'w1', type: 'countdown' as const, title: '倒计时', countdown: undefined }],
      editing: false,
      removeWidget: mockRemoveWidget,
      updateWidget: mockUpdateWidget,
    }
  })

  it('renders title', () => {
    render(<CountdownWidget widgetId="w1" title="倒计时" />)
    expect(screen.getByText('倒计时')).toBeDefined()
  })

  it('shows setup form when no countdown is set', () => {
    render(<CountdownWidget widgetId="w1" title="倒计时" />)
    expect(screen.getByPlaceholderText('目标名称（如 项目上线）')).toBeDefined()
    expect(screen.getByText('设置')).toBeDefined()
  })

  it('shows countdown display when countdown is configured', () => {
    const futureDate = new Date()
    futureDate.setDate(futureDate.getDate() + 10)
    const dateStr = futureDate.toISOString().slice(0, 10)

    storeState.widgets[0].countdown = { label: '项目上线', date: dateStr }
    const { container } = render(<CountdownWidget widgetId="w1" title="倒计时" />)
    expect(screen.getByText('项目上线')).toBeDefined()
    expect(container.textContent).toContain(dateStr)
  })

  it('calls updateWidget when setting countdown', () => {
    render(<CountdownWidget widgetId="w1" title="倒计时" />)
    const nameInput = screen.getByPlaceholderText('目标名称（如 项目上线）')
    fireEvent.change(nameInput, { target: { value: '新功能发布' } })
    const dateInputs = document.querySelectorAll('input[type="date"]')
    if (dateInputs.length > 0) {
      fireEvent.change(dateInputs[0], { target: { value: '2026-12-31' } })
    }
    fireEvent.click(screen.getByText('设置'))
    expect(mockUpdateWidget).toHaveBeenCalledWith('w1', {
      countdown: { label: '新功能发布', date: '2026-12-31' },
    })
  })
})
