import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

// ── Config ──────────────────────────────────────────
const LUMINA_URL = process.env.LUMINA_URL ?? 'http://localhost:3001'
const TRPC_URL = `${LUMINA_URL}/trpc`

// ── tRPC caller (minimal, no batch) ─────────────────
async function tRPC<T>(procedure: string, input?: unknown): Promise<T> {
  const url = new URL(`${TRPC_URL}/${procedure}`)
  if (input !== undefined) url.searchParams.set('input', JSON.stringify(input))
  const res = await fetch(url.toString(), {
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`tRPC ${procedure} failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return (json as any).result?.data ?? json
}

async function tRPCMutate<T>(procedure: string, input: unknown): Promise<T> {
  const res = await fetch(`${TRPC_URL}/${procedure}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input }),
  })
  if (!res.ok) throw new Error(`tRPC ${procedure} failed: ${res.status} ${await res.text()}`)
  const json = await res.json()
  return (json as any).result?.data ?? json
}

// ── MCP Server ──────────────────────────────────────
const server = new McpServer({
  name: 'lumina',
  version: '0.1.0',
})

// ── Tools ───────────────────────────────────────────

server.tool(
  'search_notes',
  '搜索 Lumina 知识库中的笔记（混合检索：BM25 + 语义）',
  { query: z.string().describe('搜索关键词'), limit: z.number().optional().describe('返回数量上限，默认 10') },
  async ({ query, limit }) => {
    const results = await tRPC<any>('note.search', { q: query, limit: limit ?? 10 })
    return { content: [{ type: 'text', text: JSON.stringify(results, null, 2) }] }
  },
)

server.tool(
  'list_notes',
  '列出 Lumina 知识库中的所有笔记',
  {},
  async () => {
    const notes = await tRPC<any>('note.list')
    return { content: [{ type: 'text', text: JSON.stringify(notes, null, 2) }] }
  },
)

server.tool(
  'get_note',
  '获取单个笔记的完整内容',
  { id: z.string().describe('笔记 ID') },
  async ({ id }) => {
    const note = await tRPC<any>('note.getById', { id })
    return { content: [{ type: 'text', text: JSON.stringify(note, null, 2) }] }
  },
)

server.tool(
  'create_note',
  '在 Lumina 中创建新笔记',
  {
    title: z.string().describe('笔记标题'),
    content: z.string().describe('笔记正文（Markdown）'),
    type: z.enum(['card', 'note', 'bookmark', 'file']).optional().describe('笔记类型'),
  },
  async ({ title, content, type }) => {
    const result = await tRPCMutate<any>('note.create', { title, content, type: type ?? 'note' })
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }
  },
)

server.tool(
  'list_tags',
  '列出所有标签及每个标签的笔记数量',
  {},
  async () => {
    const tags = await tRPC<any>('tag.list')
    return { content: [{ type: 'text', text: JSON.stringify(tags, null, 2) }] }
  },
)

server.tool(
  'search_wiki',
  '搜索 Lumina Wiki 页面',
  {},
  async () => {
    const pages = await tRPC<any>('wiki.list')
    return { content: [{ type: 'text', text: JSON.stringify(pages, null, 2) }] }
  },
)

server.tool(
  'get_memory',
  '获取用户跨会话长期记忆',
  {},
  async () => {
    const memories = await tRPC<any>('memory.list')
    return { content: [{ type: 'text', text: JSON.stringify(memories, null, 2) }] }
  },
)

// ── Start ───────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error(`[lumina-mcp] connected to ${LUMINA_URL}`)
}

main().catch((err) => {
  console.error('[lumina-mcp] fatal:', err)
  process.exit(1)
})
