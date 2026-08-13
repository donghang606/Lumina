export interface Note {
  id: string
  title: string
  content: string
  type: 'card' | 'note' | 'bookmark' | 'file'
  summary: string | null
  status: 'draft' | 'indexed' | 'failed'
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export interface Tag {
  id: string
  name: string
  slug: string
  color: string | null
  parentId: string | null
  order: number
  createdAt: string
}

export interface TagWithCount extends Tag {
  useCount: number
}

export interface NoteTag {
  id: string
  name: string
  color: string | null
}

export interface NoteDetail {
  note: Note
  tags: NoteTag[]
  backlinks: { id: string; title: string }[]
  outlinks: { id: string; title: string; context: string | null }[]
  blocks: unknown[]
}

export interface FeedItem extends Note {
  noteTags: NoteTag[]
}

export interface FeedPage {
  items: FeedItem[]
  total: number
  hasMore: boolean
}

export interface GraphNode {
  id: string
  title: string
  type: Note['type']
  summary: string | null
  createdAt: string
  degree: number
  tagCount: number
}

export interface GraphLink {
  id: string
  sourceNoteId: string | null
  targetNoteId: string | null
  context: string | null
  createdAt: string
}

export interface GraphData {
  nodes: GraphNode[]
  edges: GraphLink[]
}

export interface Stats {
  total: number
  today: number
  byType: Record<string, number>
}

export interface NoteLink {
  id: string
  sourceNoteId: string
  targetNoteId: string
  context: string | null
  createdAt: string
}

export interface AiProvider {
  id: string
  name: string
  type: 'openai' | 'anthropic' | 'ollama' | 'deepseek' | 'custom'
  apiKey: string
  baseUrl: string | null
  models: string[]
  isActive: boolean
  order: number
}

export interface McpServer {
  id: string
  name: string
  command: string
  args: string[]
  env: Record<string, string>
  tools: string[]
  isActive: boolean
  createdAt: string
}

export interface SearchResult {
  id: string
  title: string
}

export interface ActivityDay {
  date: string
  count: number
}

export interface Insights {
  focusAreas: string[]
  connections: { a: string; b: string }[]
  questions: string[]
  quote: string
  _meta: { noteCount: number; linkCount: number }
}

export type FeedType = 'card' | 'note' | 'bookmark' | 'file'