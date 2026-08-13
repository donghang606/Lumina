import { create } from 'zustand'
import { createWidget, normalizeBoard, uid, type BoardWidget, type TodoItem, type LinkItem, type WidgetType } from '../lib/board'

const LS_KEY = 'lumina.board.v2'
const LS_KEY_V1 = 'lumina.board.v1'

export const DEFAULT_BOARD: WidgetType[] = ['weekly', 'stats', 'activity', 'inspiration', 'quadrant', 'todo', 'countdown', 'feed']

/** 从工作台移除被淘汰的组件类型 */
function stripObsolete(widgets: BoardWidget[]): BoardWidget[] {
  return widgets.filter((w) => w.type !== 'links')
}

/** 从 v1 迁移：保留原组件，追加总览类新组件 */
function migrateV1(v1: unknown): BoardWidget[] {
  const base = normalizeBoard(v1)
  const types = new Set(base.map((w) => w.type))
  for (const t of DEFAULT_BOARD) {
    if (!types.has(t)) base.push(createWidget(t))
  }
  return base
}

function load(): BoardWidget[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (raw) {
      const parsed = normalizeBoard(JSON.parse(raw))
      const cleansed = stripObsolete(parsed)
      if (cleansed.length !== parsed.length) persist(cleansed)
      return cleansed.length ? cleansed : DEFAULT_BOARD.map((t) => createWidget(t))
    }
    const v1 = localStorage.getItem(LS_KEY_V1)
    if (v1) {
      try {
        const migrated = stripObsolete(migrateV1(JSON.parse(v1)))
        persist(migrated)
        return migrated
      } catch {
        /* ignore */
      }
    }
    return DEFAULT_BOARD.map((t) => createWidget(t))
  } catch {
    return DEFAULT_BOARD.map((t) => createWidget(t))
  }
}

function persist(widgets: BoardWidget[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(widgets))
  } catch {
    /* storage full / unavailable */
  }
}

interface BoardState {
  widgets: BoardWidget[]
  editing: boolean
  setEditing: (v: boolean) => void
  addWidget: (type: WidgetType) => void
  removeWidget: (id: string) => void
  moveWidget: (from: number, to: number) => void
  updateWidget: (id: string, patch: Partial<BoardWidget>) => void
  addTodoItem: (widgetId: string, text: string) => void
  toggleTodoItem: (widgetId: string, itemId: string) => void
  removeTodoItem: (widgetId: string, itemId: string) => void
  addLink: (widgetId: string, title: string, url: string) => void
  removeLink: (widgetId: string, id: string) => void
  resetBoard: () => void
}

export const useBoardStore = create<BoardState>((set, get) => ({
  widgets: load(),
  editing: false,
  setEditing: (v) => set({ editing: v }),
  addWidget: (type) => {
    const widgets = [...get().widgets, createWidget(type)]
    set({ widgets })
    persist(widgets)
  },
  removeWidget: (id) => {
    const widgets = get().widgets.filter((w) => w.id !== id)
    set({ widgets })
    persist(widgets)
  },
  moveWidget: (from, to) => {
    if (from === to || to < 0 || to >= get().widgets.length) return
    const widgets = [...get().widgets]
    const [item] = widgets.splice(from, 1)
    widgets.splice(to, 0, item)
    set({ widgets })
    persist(widgets)
  },
  updateWidget: (id, patch) => {
    const widgets = get().widgets.map((w) => (w.id === id ? { ...w, ...patch } : w))
    set({ widgets })
    persist(widgets)
  },
  addTodoItem: (widgetId, text) => {
    const t = text.trim()
    if (!t) return
    const widgets = get().widgets.map((w) =>
      w.id === widgetId ? { ...w, todoItems: [...(w.todoItems ?? []), { id: uid(), text: t, done: false } as TodoItem] } : w,
    )
    set({ widgets })
    persist(widgets)
  },
  toggleTodoItem: (widgetId, itemId) => {
    const widgets = get().widgets.map((w) =>
      w.id === widgetId
        ? { ...w, todoItems: (w.todoItems ?? []).map((i) => (i.id === itemId ? { ...i, done: !i.done } : i)) }
        : w,
    )
    set({ widgets })
    persist(widgets)
  },
  removeTodoItem: (widgetId, itemId) => {
    const widgets = get().widgets.map((w) =>
      w.id === widgetId ? { ...w, todoItems: (w.todoItems ?? []).filter((i) => i.id !== itemId) } : w,
    )
    set({ widgets })
    persist(widgets)
  },
  addLink: (widgetId, title, url) => {
    const widgets = get().widgets.map((w) =>
      w.id === widgetId ? { ...w, links: [...(w.links ?? []), { id: uid(), title, url } as LinkItem] } : w,
    )
    set({ widgets })
    persist(widgets)
  },
  removeLink: (widgetId, id) => {
    const widgets = get().widgets.map((w) =>
      w.id === widgetId ? { ...w, links: (w.links ?? []).filter((l) => l.id !== id) } : w,
    )
    set({ widgets })
    persist(widgets)
  },
  resetBoard: () => {
    localStorage.removeItem(LS_KEY)
    set({ widgets: DEFAULT_BOARD.map((t) => createWidget(t)), editing: false })
  },
}))
