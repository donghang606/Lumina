import { describe, it, expect } from 'vitest'
import { migrateToCanvas, widgetsOverlap, createWidget, type BoardWidget } from './board'

describe('load() self-heal path', () => {
  it('multiple widgets at same spot (corrupt data) -> force relay yields clean layout', () => {
    const corrupt: BoardWidget[] = [
      createWidget('feed', { x: 0, y: 0, w: 620, h: 340 }),
      createWidget('stats', { x: 0, y: 0, w: 300, h: 200 }),
      createWidget('todo', { x: 0, y: 0, w: 300, h: 240 }),
      createWidget('query', { x: 0, y: 0, w: 320, h: 320 }),
    ]
    expect(widgetsOverlap(corrupt)).toBe(true)
    const healed = migrateToCanvas(corrupt, true)
    expect(widgetsOverlap(healed)).toBe(false)
  })

  it('stacked legacy data heals on load', () => {
    const stacked: BoardWidget[] = [
      createWidget('weekly', { x: 0, y: 16, w: 620, h: 300 }),
      createWidget('stats', { x: 0, y: 16, w: 300, h: 200 }),
      createWidget('activity', { x: 0, y: 16, w: 300, h: 220 }),
      createWidget('inspiration', { x: 0, y: 16, w: 300, h: 200 }),
      createWidget('quadrant', { x: 0, y: 16, w: 320, h: 240 }),
      createWidget('todo', { x: 0, y: 16, w: 300, h: 240 }),
      createWidget('countdown', { x: 0, y: 16, w: 300, h: 150 }),
      createWidget('feed', { x: 0, y: 16, w: 620, h: 340 }),
    ]
    expect(widgetsOverlap(stacked)).toBe(true)
    const healed = migrateToCanvas(stacked, true)
    expect(widgetsOverlap(healed)).toBe(false)
    expect(healed[0].y).toBe(0)
  })

  it('mixed coords flow below positioned widgets (regression for #1)', () => {
    const mixed: BoardWidget[] = [
      createWidget('stats', { x: 0, y: 0, w: 300, h: 200 }),
      createWidget('todo'),
      createWidget('activity', { x: 316, y: 0, w: 300, h: 220 }),
    ]
    const out = migrateToCanvas(mixed)
    expect(widgetsOverlap(out)).toBe(false)
    // missing-coord todo should not sit on top of positioned stats
    const todo = out.find((w) => w.type === 'todo')!
    expect(todo.y).toBeGreaterThanOrEqual(0)
  })
})
