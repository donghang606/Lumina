import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { eq } from 'drizzle-orm'
import type { Context } from '../trpc/context.js'
import { mcpServers } from '../db/schema.js'

export interface McpToolInfo {
  name: string
  description?: string
  server: string
}

export interface McpToolCall {
  server: string
  tool: string
  input: Record<string, unknown>
}

interface ConnectedServer {
  config: { id: string; name: string }
  client: Client
  transport: StdioClientTransport
}

let cachedServers: ConnectedServer[] | null = null

async function connect(ctx: Context, serverId: string): Promise<StdioClientTransport> {
  const [cfg] = await ctx.db.select().from(mcpServers).where(eq(mcpServers.id, serverId)).all()
  if (!cfg) throw new Error(`MCP server ${serverId} 不存在`)
  const transport = new StdioClientTransport({
    command: cfg.command,
    args: cfg.args ?? [],
    env: { ...(cfg.env ?? {}), PATH: process.env.PATH ?? '/usr/local/bin:/usr/bin:/bin' },
    cwd: process.cwd(),
  })
  return transport
}

async function ensureClients(ctx: Context): Promise<ConnectedServer[]> {
  if (cachedServers) return cachedServers
  const configs = await ctx.db.select().from(mcpServers).where(eq(mcpServers.isActive, true)).all()
  const clients: ConnectedServer[] = []
  for (const cfg of configs) {
    try {
      const transport = await connect(ctx, cfg.id)
      const client = new Client({ name: 'lumina-server', version: '0.1.0' })
      await client.connect(transport)
      clients.push({ config: { id: cfg.id, name: cfg.name }, client, transport })
    } catch (e) {
      console.error(`[MCP] connect ${cfg.name} failed:`, e instanceof Error ? e.message : e)
    }
  }
  cachedServers = clients
  return clients
}

export async function listMcpTools(ctx: Context): Promise<McpToolInfo[]> {
  const clients = await ensureClients(ctx)
  const tools: McpToolInfo[] = []
  for (const c of clients) {
    try {
      const res = await c.client.listTools()
      for (const t of res.tools) {
        tools.push({ name: t.name, description: t.description, server: c.config.name })
      }
    } catch (e) {
      console.error(`[MCP] listTools ${c.config.name} failed:`, e instanceof Error ? e.message : e)
    }
  }
  return tools
}

export async function callMcpTool(ctx: Context, call: McpToolCall): Promise<{ result: unknown; error?: string }> {
  const clients = await ensureClients(ctx)
  const c = clients.find((x) => x.config.name === call.server || x.config.id === call.server)
  if (!c) return { result: null, error: `MCP server '${call.server}' 未连接或不可用` }
  try {
    const res = (await c.client.callTool({ name: call.tool, arguments: call.input })) as {
      content: { type: string; text?: string }[]
    }
    const text = res.content
      .filter((x) => x.type === 'text')
      .map((x) => x.text ?? '')
      .join('\n')
    return { result: text || res.content }
  } catch (e) {
    return { result: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export async function disposeMcp() {
  if (!cachedServers) return
  for (const c of cachedServers) {
    try {
      await c.client.close()
      c.transport.close()
    } catch {
      /* ignore */
    }
  }
  cachedServers = null
}