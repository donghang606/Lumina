import { describe, it, expect } from 'vitest'
import { daysUntil, createWidget, normalizeBoard, WIDGET_INFO } from './board'

describe('daysUntil', () => {
  it('返回今天与目标日期的天数差', () => {
    const today = new Date()
    const target = new Date(today.getTime() + 3 * 86400000)
    const iso = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
    expect(daysUntil(iso)).toBe(3)
  })

  it('空值 / 非法日期返回 0', () => {
    expect(daysUntil(null)).toBe(0)
    expect(daysUntil(undefined)).toBe(0)
    expect(daysUntil('')).toBe(0)
    expect(daysUntil('not-a-date')).toBe(0)
  })
})

describe('createWidget', () => {
  it('按类型生成带默认字段的组件', () => {
    const todo = createWidget('todo')
    expect(todo.type).toBe('todo')
    expect(todo.title).toBe(WIDGET_INFO.todo.title)
    expect(todo.todoItems).toEqual([])

    const cd = createWidget('countdown')
    expect(cd.countdown).toBeNull()

    const links = createWidget('links')
    expect(links.links).toEqual([])
  })

  it('支持覆盖字段', () => {
    const w = createWidget('stats', { title: '我的统计' })
    expect(w.title).toBe('我的统计')
  })

  it('全宽组件自动标记 wide，窄组件默认 false', () => {
    expect(createWidget('weekly').wide).toBe(true)
    expect(createWidget('feed').wide).toBe(true)
    expect(createWidget('stats').wide).toBe(false)
    expect(createWidget('todo').wide).toBe(false)
  })
})

describe('normalizeBoard', () => {
  it('规整合法数据并丢弃非法条目', () => {
    const raw = [
      createWidget('todo', { title: '任务' }),
      { id: 123, type: 'bogus' },
      null,
      'x',
      { id: 'a', type: 'stats', title: 'S' },
    ]
    const list = normalizeBoard(raw)
    expect(list.length).toBe(2)
    expect(list[0].title).toBe('任务')
    expect(list[1].id).toBe('a')
  })

  it('非数组返回空', () => {
    expect(normalizeBoard(null)).toEqual([])
    expect(normalizeBoard({})).toEqual([])
    expect(normalizeBoard('x')).toEqual([])
  })

  it('保留 wide 标记', () => {
    const list = normalizeBoard([createWidget('feed'), createWidget('links')])
    expect(list[0].wide).toBe(true)
    expect(list[1].wide).toBe(false)
  })
})
