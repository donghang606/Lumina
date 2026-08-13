import { describe, it, expect, beforeEach } from 'vitest'
import { useBoardStore } from './boardStore'
import { createWidget } from '../lib/board'
import type { BoardWidget } from '../lib/board'

function fresh() {
  return [
    createWidget('stats'),
    createWidget('todo'),
    createWidget('countdown'),
  ] as BoardWidget[]
}

describe('boardStore', () => {
  beforeEach(() => {
    useBoardStore.setState({ widgets: fresh(), editing: false })
  })

  it('addWidget 追加指定类型组件', () => {
    useBoardStore.getState().addWidget('links')
    const widgets = useBoardStore.getState().widgets
    expect(widgets.length).toBe(4)
    expect(widgets[3].type).toBe('links')
    expect(widgets[3].links).toEqual([])
  })

  it('removeWidget 按 id 移除', () => {
    const before = useBoardStore.getState().widgets
    useBoardStore.getState().removeWidget(before[1].id)
    expect(useBoardStore.getState().widgets.map((w) => w.type)).toEqual(['stats', 'countdown'])
  })

  it('moveWidget 交换顺序', () => {
    useBoardStore.getState().moveWidget(0, 2)
    expect(useBoardStore.getState().widgets.map((w) => w.type)).toEqual(['todo', 'countdown', 'stats'])
  })

  it('addTodoItem / toggleTodoItem 维护待办', () => {
    const todo = useBoardStore.getState().widgets.find((w) => w.type === 'todo')!
    useBoardStore.getState().addTodoItem(todo.id, ' 写周报 ')
    let items = useBoardStore.getState().widgets.find((w) => w.id === todo.id)!.todoItems!
    expect(items.length).toBe(1)
    expect(items[0].text).toBe('写周报')
    expect(items[0].done).toBe(false)

    useBoardStore.getState().toggleTodoItem(todo.id, items[0].id)
    items = useBoardStore.getState().widgets.find((w) => w.id === todo.id)!.todoItems!
    expect(items[0].done).toBe(true)
  })

  it('updateWidget 写入倒计时目标', () => {
    const cd = useBoardStore.getState().widgets.find((w) => w.type === 'countdown')!
    useBoardStore.getState().updateWidget(cd.id, { countdown: { label: '发布', date: '2026-09-01' } })
    expect(useBoardStore.getState().widgets.find((w) => w.id === cd.id)!.countdown).toEqual({ label: '发布', date: '2026-09-01' })
  })

  it('addLink 追加链接', () => {
    useBoardStore.getState().addWidget('links')
    const links = useBoardStore.getState().widgets.find((w) => w.type === 'links')!
    useBoardStore.getState().addLink(links.id, 'GitHub', 'https://github.com')
    const list = useBoardStore.getState().widgets.find((w) => w.id === links.id)!.links!
    expect(list.length).toBe(1)
    expect(list[0].title).toBe('GitHub')
  })
})
