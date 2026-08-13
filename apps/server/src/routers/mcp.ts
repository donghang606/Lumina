import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { mcpServers } from '../db/schema.js'
import { listMcpTools, callMcpTool } from '../mcp/runner.js'

export const mcpRouter = router({
  listTools: publicProcedure.query(async ({ ctx }) => {
    const servers = await ctx.db.select().from(mcpServers).where(eq(mcpServers.isActive, true)).all()
    if (servers.length === 0) return []
    return listMcpTools(ctx)
  }),

  callTool: publicProcedure
    .input(z.object({ server: z.string(), tool: z.string(), input: z.record(z.unknown()).default({}) }))
    .mutation(async ({ ctx, input }) => {
      return callMcpTool(ctx, { server: input.server, tool: input.tool, input: input.input })
    }),
})

export type McpRouter = typeof mcpRouter