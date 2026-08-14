import { describe, it, expect, vi } from 'vitest'
import { createLuminaMcpServer } from './luminaServer.js'

function createMockDb() {
  const getQueue: unknown[] = []
  const allQueue: unknown[] = []
  const db: any = {
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    orderBy: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    groupBy: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    get: vi.fn(() => getQueue.shift() ?? null),
    all: vi.fn(() => Promise.resolve(allQueue.shift() ?? [])),
    insert: vi.fn(() => ({ values: vi.fn().mockReturnThis(), run: vi.fn().mockResolvedValue({}), onConflictDoNothing: vi.fn(() => ({ run: vi.fn().mockResolvedValue({}) })) })),
  }
  return { db, getQueue, allQueue }
}

function buildServer(db: any) {
  const server = createLuminaMcpServer(db)
  const registered = (server as any)._registeredTools as Record<string, { handler?: (args: any, extra?: any) => Promise<any> }>
  return { server, registered }
}

async function callTool(server: any, name: string, args: any) {
  const registered = (server as any)._registeredTools as Record<string, { handler?: (args: any, extra?: any) => Promise<any> }>
  const found = registered[name]
  if (!found?.handler) throw new Error(`tool ${name} not registered`)
  return found.handler(args, {})
}

describe('lumina MCP server', () => {
  it('registers the expected tools', () => {
    const { registered } = buildServer(createMockDb())
    for (const name of ['search_notes', 'get_note', 'create_note', 'list_recent', 'get_graph', 'get_note_stats']) {
      expect(registered[name], name).toBeTruthy()
    }
  })

  it('search_notes returns keyword matches with scores', async () => {
    const { db, allQueue } = createMockDb()
    allQueue.push([
      { id: 'a', title: 'Lumina 架构', content: '本地优先 语义检索' },
      { id: 'b', title: '周末计划', content: '爬山' },
    ])
    const server = createLuminaMcpServer(db)
    const res = await callTool(server, 'search_notes', { query: '语义' })
    const text = res.content[0].text
    const data = JSON.parse(text)
    expect(data.items.length).toBe(1)
    expect(data.items[0].id).toBe('a')
  })

  it('create_note rejects empty title and content', async () => {
    const server = createLuminaMcpServer(createMockDb().db)
    const res = await callTool(server, 'create_note', { title: '', content: '' })
    expect(JSON.parse(res.content[0].text).error).toBeTruthy()
  })

  it('get_note returns note details when found', async () => {
    const { db, getQueue, allQueue } = createMockDb()
    getQueue.push({ id: 'n1', title: '标题', content: '正文', type: 'note', summary: null, createdAt: '2026', updatedAt: '2026' })
    allQueue.push([], [], [], [])
    const server = createLuminaMcpServer(db)
    const res = await callTool(server, 'get_note', { noteId: 'n1' })
    const data = JSON.parse(res.content[0].text)
    expect(data.title).toBe('标题')
    expect(data.id).toBe('n1')
  })

  it('get_note returns error for missing note', async () => {
    const { db, getQueue } = createMockDb()
    getQueue.push(null)
    const server = createLuminaMcpServer(db)
    const res = await callTool(server, 'get_note', { noteId: 'nope' })
    expect(JSON.parse(res.content[0].text).error).toBe('note not found')
  })
})