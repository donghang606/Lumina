export type WidgetType = 'todo' | 'countdown' | 'stats' | 'inspiration' | 'links' | 'weekly' | 'activity' | 'quadrant' | 'feed' | 'query'

export interface TodoItem {
  id: string
  text: string
  done: boolean
}

export interface LinkItem {
  id: string
  title: string
  url: string
}

export interface BoardWidget {
  id: string
  type: WidgetType
  title: string
  /** 全宽组件，占据整行（v2 遗留，v3 起用 x/y/w/h） */
  wide?: boolean
  /** 自由画布坐标与尺寸（v3） */
  x?: number
  y?: number
  w?: number
  h?: number
  todoItems?: TodoItem[]
  countdown?: { label: string; date: string } | null
  links?: LinkItem[]
}

export const WIDGET_TYPES: WidgetType[] = ['weekly', 'stats', 'activity', 'inspiration', 'quadrant', 'todo', 'countdown', 'links', 'feed', 'query']

export interface WidgetSize {
  w: number
  h: number
}

export const WIDGET_INFO: Record<WidgetType, { title: string; desc: string; size: WidgetSize }> = {
  weekly: { title: '每周洞察', desc: '重点领域 · 概念连接 · 值得追问', size: { w: 620, h: 300 } },
  stats: { title: '统计', desc: '笔记、标签与待办概览', size: { w: 300, h: 200 } },
  activity: { title: '活跃热力图', desc: '近 90 天创作活跃度', size: { w: 300, h: 220 } },
  inspiration: { title: '灵感片段', desc: '最近的灵感与卡片', size: { w: 300, h: 200 } },
  quadrant: { title: '四象限', desc: '重要 / 紧急自动归类', size: { w: 320, h: 240 } },
  todo: { title: '待办清单', desc: '勾选式任务清单', size: { w: 300, h: 240 } },
  countdown: { title: '倒计时', desc: '目标日期倒计时', size: { w: 300, h: 150 } },
  links: { title: '快捷链接', desc: '常用链接快速入口', size: { w: 300, h: 200 } },
  feed: { title: '信息流', desc: '全部笔记与卡片动态', size: { w: 620, h: 340 } },
  query: { title: '查询视图', desc: '按标签 / 关键词动态聚合笔记', size: { w: 320, h: 320 } },
}

/** 自由画布网格：用于给新组件计算默认摆放位置 */
export const CANVAS_GAP = 16

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

/** 为新建组件计算默认位置：放在画布底部空位 */
export function placeWidget(existing: BoardWidget[], type: WidgetType): { x: number; y: number; w: number; h: number } {
  const size = WIDGET_INFO[type].size
  const bottom = existing.reduce((max, w) => Math.max(max, (w.y ?? 0) + (w.h ?? 0)), 0)
  return { x: 0, y: bottom + CANVAS_GAP, w: size.w, h: size.h }
}

export function createWidget(type: WidgetType, overrides?: Partial<BoardWidget>): BoardWidget {
  const base: BoardWidget = {
    id: uid(),
    type,
    title: WIDGET_INFO[type].title,
    wide: WIDGET_INFO[type].size.w >= 600,
    ...(type === 'todo' ? { todoItems: [] } : {}),
    ...(type === 'countdown' ? { countdown: null } : {}),
    ...(type === 'links' ? { links: [] } : {}),
  }
  return { ...base, ...overrides }
}

/** 目标日期距今的天数（本地时区，按日取整）。已到期返回负值。 */
export function daysUntil(dateStr: string | null | undefined): number {
  if (!dateStr) return 0
  const target = new Date(`${dateStr}T00:00:00`)
  if (Number.isNaN(target.getTime())) return 0
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target.getTime() - today.getTime()) / 86400000)
}

function isWidgetType(v: unknown): v is WidgetType {
  return typeof v === 'string' && (WIDGET_TYPES as string[]).includes(v)
}

/** 校验并规整 localStorage 读取的看板数据 */
export function normalizeBoard(raw: unknown): BoardWidget[] {
  if (!Array.isArray(raw)) return []
  const out: BoardWidget[] = []
  for (const w of raw) {
    if (!w || typeof w !== 'object') continue
    const candidate = w as Record<string, unknown>
    const type = candidate.type
    if (!isWidgetType(type)) continue
    out.push({
      id: typeof candidate.id === 'string' && candidate.id ? candidate.id : uid(),
      type,
      title: typeof candidate.title === 'string' && candidate.title ? candidate.title : WIDGET_INFO[type].title,
      wide: candidate.wide === true,
      x: typeof candidate.x === 'number' && Number.isFinite(candidate.x) ? candidate.x : undefined,
      y: typeof candidate.y === 'number' && Number.isFinite(candidate.y) ? candidate.y : undefined,
      w: typeof candidate.w === 'number' && Number.isFinite(candidate.w) ? candidate.w : undefined,
      h: typeof candidate.h === 'number' && Number.isFinite(candidate.h) ? candidate.h : undefined,
      todoItems: type === 'todo' && Array.isArray(candidate.todoItems) ? (candidate.todoItems as TodoItem[]) : undefined,
      countdown: type === 'countdown' ? (candidate.countdown as BoardWidget['countdown']) : undefined,
      links: type === 'links' && Array.isArray(candidate.links) ? (candidate.links as LinkItem[]) : undefined,
    })
  }
  return out
}

const FLOW_COLS = 2

/** v2（仅 wide）→ v3（自由画布 x/y/w/h）迁移：按行流式排布 */
export function migrateToCanvas(widgets: BoardWidget[], force = false): BoardWidget[] {
  // 不强制重排时：已定位的组件保留原位，缺失坐标的组件从「已定位组件下方」开始流式排布，避免与既有组件重叠
  const baseY = force
    ? 0
    : widgets.reduce((max, w) => {
        if (w.x === undefined || w.y === undefined || w.w === undefined || w.h === undefined) return max
        return Math.max(max, w.y + w.h)
      }, 0)
  let cursorX = 0
  let cursorY = baseY
  let rowMaxH = 0
  return widgets.map((w) => {
    if (!force && w.x !== undefined && w.y !== undefined && w.w !== undefined && w.h !== undefined) return w
    const size = WIDGET_INFO[w.type].size
    const wide = w.wide === true || size.w >= 600
    if (wide) {
      if (cursorX > 0) {
        cursorY += rowMaxH + CANVAS_GAP
        rowMaxH = 0
        cursorX = 0
      }
      const result = { ...w, x: 0, y: cursorY, w: size.w, h: size.h }
      cursorX = 0
      cursorY += size.h + CANVAS_GAP
      rowMaxH = 0
      return result
    }
    if (cursorX > 0 && cursorX + size.w > FLOW_COLS * 320) {
      cursorX = 0
      cursorY += rowMaxH + CANVAS_GAP
      rowMaxH = 0
    }
    rowMaxH = Math.max(rowMaxH, size.h)
    const result = { ...w, x: cursorX, y: cursorY, w: size.w, h: size.h }
    cursorX += size.w + CANVAS_GAP
    return result
  })
}

/** 检测组件是否发生重叠（用于判断旧数据是否挤在一起） */
export function widgetsOverlap(list: BoardWidget[]): boolean {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]
      const b = list[j]
      if (a.x === undefined || a.y === undefined || a.w === undefined || a.h === undefined) continue
      if (b.x === undefined || b.y === undefined || b.w === undefined || b.h === undefined) continue
      const overlapX = a.x < b.x + b.w && b.x < a.x + a.w
      const overlapY = a.y < b.y + b.h && b.y < a.y + a.h
      if (overlapX && overlapY) return true
    }
  }
  return false
}
