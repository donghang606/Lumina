import { describe, it, expect } from 'vitest'
import { daysUntil, createWidget, normalizeBoard, migrateToCanvas, placeWidget, WIDGET_INFO, type BoardWidget } from './board'

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

describe('migrateToCanvas', () => {
  it('为 v2 遗留数据分配流式坐标尺寸', () => {
    const legacy: BoardWidget[] = [
      { id: 'a', type: 'weekly', title: '周', wide: true },
      { id: 'b', type: 'stats', title: '统计' },
      { id: 'c', type: 'todo', title: '待办' },
    ]
    const out = migrateToCanvas(legacy)
    const a = out[0]
    const b = out[1]
    expect(a.x).toBe(0)
    expect(a.y).toBe(0)
    expect(a.w).toBe(WIDGET_INFO.weekly.size.w)
    expect(b.x).toBe(0)
    expect(b.y).toBeGreaterThan(0)
    expect(b.w).toBe(WIDGET_INFO.stats.size.w)
    expect(b.h).toBe(WIDGET_INFO.stats.size.h)
    expect(out.every((w) => w.x !== undefined && w.y !== undefined && w.w !== undefined && w.h !== undefined)).toBe(true)
  })

  it('跳过已有坐标的组件', () => {
    const placed = migrateToCanvas([
      { id: 'a', type: 'stats' as const, title: 'S', x: 10, y: 20, w: 300, h: 200 },
    ])
    expect(placed[0]).toMatchObject({ x: 10, y: 20, w: 300, h: 200 })
  })
})

describe('placeWidget', () => {
  it('新组件放在画布底部空位', () => {
    const existing = [{ id: 'a', type: 'stats' as const, title: 'S', x: 0, y: 0, w: 300, h: 200 }]
    const pos = placeWidget(existing, 'todo')
    expect(pos.y).toBeGreaterThanOrEqual(200)
    expect(pos.w).toBe(WIDGET_INFO.todo.size.w)
    expect(pos.h).toBe(WIDGET_INFO.todo.size.h)
  })
})
