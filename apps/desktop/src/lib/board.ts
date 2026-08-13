export type WidgetType = 'todo' | 'countdown' | 'stats' | 'inspiration' | 'links' | 'weekly' | 'activity' | 'quadrant' | 'feed'

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
  /** 全宽组件，占据整行 */
  wide?: boolean
  todoItems?: TodoItem[]
  countdown?: { label: string; date: string } | null
  links?: LinkItem[]
}

export const WIDGET_TYPES: WidgetType[] = ['weekly', 'stats', 'activity', 'inspiration', 'quadrant', 'todo', 'countdown', 'links', 'feed']

export const WIDGET_INFO: Record<WidgetType, { title: string; desc: string; wide?: boolean }> = {
  weekly: { title: '每周洞察', desc: '重点领域 · 概念连接 · 值得追问', wide: true },
  stats: { title: '统计', desc: '笔记、标签与待办概览' },
  activity: { title: '活跃热力图', desc: '近 90 天创作活跃度' },
  inspiration: { title: '灵感片段', desc: '最近的灵感与卡片' },
  quadrant: { title: '四象限', desc: '重要 / 紧急自动归类' },
  todo: { title: '待办清单', desc: '勾选式任务清单' },
  countdown: { title: '倒计时', desc: '目标日期倒计时' },
  links: { title: '快捷链接', desc: '常用链接快速入口' },
  feed: { title: '信息流', desc: '全部笔记与卡片动态', wide: true },
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  return `w-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createWidget(type: WidgetType, overrides?: Partial<BoardWidget>): BoardWidget {
  const base: BoardWidget = {
    id: uid(),
    type,
    title: WIDGET_INFO[type].title,
    wide: WIDGET_INFO[type].wide ?? false,
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
      todoItems: type === 'todo' && Array.isArray(candidate.todoItems) ? (candidate.todoItems as TodoItem[]) : undefined,
      countdown: type === 'countdown' ? (candidate.countdown as BoardWidget['countdown']) : undefined,
      links: type === 'links' && Array.isArray(candidate.links) ? (candidate.links as LinkItem[]) : undefined,
    })
  }
  return out
}
