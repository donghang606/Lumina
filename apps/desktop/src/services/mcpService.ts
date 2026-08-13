import { trpc } from '../lib/trpc'

export interface McpToolInfo {
  name: string
  description?: string
  server: string
}

export const mcpService = {
  async listTools(): Promise<McpToolInfo[]> {
    try {
      const r = await trpc.mcp.listTools.query()
      return (r ?? []) as McpToolInfo[]
    } catch {
      return []
    }
  },
  async callTool(input: { server: string; tool: string; input: Record<string, unknown> }): Promise<{ result?: unknown; error?: string }> {
    return trpc.mcp.callTool.mutate(input)
  },
}