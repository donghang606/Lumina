import { tool } from '@langchain/core/tools'
import type { z } from 'zod'
import type { db as LuminaDb } from '../db/client.js'

type Db = typeof LuminaDb

export interface ToolContext {
  db: Db
  threadId: string
  requestId: string
  emit: (event: 'agent-tool-call' | 'agent-tool-result' | 'agent-delta', payload: unknown) => void
}

export interface ToolDefinition {
  name: string
  description: string
  schema: z.ZodObject<z.ZodRawShape>
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>
  meta: {
    /** 写操作：需用户在 HITL 弹层确认后执行 */
    requireApproval?: boolean
  }
}

const registry = new Map<string, ToolDefinition>()

export function registerTool(def: ToolDefinition): void {
  if (registry.has(def.name)) throw new Error(`Agent 工具重复注册: ${def.name}`)
  registry.set(def.name, def)
}

export function listRegisteredTools(): ToolDefinition[] {
  return Array.from(registry.values())
}

export function listToolNames(): string[] {
  return Array.from(registry.keys())
}

export function buildToolContext(db: Db, threadId: string, requestId: string, emit: ToolContext['emit']): ToolContext {
  return { db, threadId, requestId, emit }
}

/** 把注册表转为 LangChain 工具集，包装日志 + 审计 + 事件推送。 */
export function buildLangChainTools(ctx: ToolContext) {
  return listRegisteredTools().map((def) => {
    const wrapped = async (args: Record<string, unknown>) => {
      const start = Date.now()
      const toolCallId = `${def.name}_${start}_${Math.random().toString(36).slice(2, 8)}`
      ctx.emit('agent-tool-call', { requestId: ctx.requestId, toolCallId, toolName: def.name, arguments: args })
      let output = ''
      let status = 'success'
      try {
        output = await def.handler(args, ctx)
      } catch (e) {
        status = 'error'
        output = `工具执行失败: ${e instanceof Error ? e.message : String(e)}`
      }
      ctx.emit('agent-tool-result', { requestId: ctx.requestId, toolCallId, toolName: def.name, output, status, durationMs: Date.now() - start })
      return output
    }
    return tool(wrapped, { name: def.name, description: def.description, schema: def.schema })
  })
}

/** 需审批工具 → createDeepAgent 的 interruptOn 配置。 */
export function buildInterruptConfig(): Record<string, boolean> {
  const config: Record<string, boolean> = {}
  for (const def of registry.values()) {
    if (def.meta.requireApproval) config[def.name] = true
  }
  return config
}