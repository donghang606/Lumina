import { eq, desc } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { conversations, messages } from '../db/schema.js'
import type { Context } from '../trpc/context.js'
import { createLuminaAgent } from './index.js'
import type { ToolContext } from './registry.js'
import { buildLangChainTools } from './registry.js'

export interface AgentEvent {
  type: 'delta' | 'tool-call' | 'tool-result' | 'interrupt' | 'done' | 'error'
  payload?: unknown
}

export interface RunOptions {
  message: string
  conversationId?: string
  /** HITL 恢复：审批通过后继续（传上一次返回的 threadId 与 resumeValue） */
  resume?: { threadId: string; decision: 'approve' | 'reject' }
}

export interface RunResult {
  conversationId: string
  threadId: string
  reply: string
  /** pending 的工具审批（HITL 中断时返回，前端弹确认框） */
  pendingApproval?: { toolCallId: string; name: string; args: unknown; response?: string }[]
  events: AgentEvent[]
}

/**
 * 运行一轮 Agent 对话。
 * - 新对话：建 conversation + 存 user 消息
 * - HITL：interruptOn 工具触发 LangGraph interrupt，返回 pendingApproval；
 *   用户决定后带 resume.threadId 再次调用（approve→Command resume / reject→写拒绝 ToolMessage）
 */
export async function runAgentTurn(ctx: Context, options: RunOptions, emit: (e: AgentEvent) => void = () => {}): Promise<RunResult> {
  // 1. 会话
  let conversationId = options.conversationId
  if (!conversationId) {
    conversationId = randomUUID()
    const now = new Date().toISOString()
    await ctx.db.insert(conversations).values({ id: conversationId, title: options.message.slice(0, 30), model: 'lumina-agent', createdAt: now, updatedAt: now })
  }
  const threadId = options.resume?.threadId ?? `conv-${conversationId}`

  // 2. 存 user 消息（resume 时不再存）
  if (!options.resume) {
    await ctx.db.insert(messages).values({ id: randomUUID(), conversationId, role: 'user', content: options.message, createdAt: new Date().toISOString() })
  }

  // 3. 装配 Agent（工具 ctx 带 emit 推流）
  const runtime = await createLuminaAgent(ctx)
  const emitToolEvent: ToolContext['emit'] = (event, payload) => {
    if (event === 'agent-tool-call') emit({ type: 'tool-call', payload })
    if (event === 'agent-tool-result') emit({ type: 'tool-result', payload })
  }
  runtime.toolCtx.emit = emitToolEvent
  runtime.toolCtx.threadId = threadId
  runtime.toolCtx.requestId = conversationId

  const { Command } = await import('@langchain/langgraph')

  try {
    let result: unknown
    if (options.resume) {
      if (options.resume.decision === 'approve') {
        result = await runtime.agent.invoke(new Command({ resume: { decisions: [{ type: 'approve' }] } }), { configurable: { thread_id: threadId } })
      } else {
        result = await runtime.agent.invoke(new Command({ resume: { decisions: [{ type: 'reject', message: '用户拒绝执行该工具，请说明原因并继续。' }] } }), { configurable: { thread_id: threadId } })
      }
    } else {
      result = await runtime.agent.invoke({ messages: [{ role: 'user', content: options.message }] }, { configurable: { thread_id: threadId } })
    }

    const state = result as { messages?: Array<{ content?: unknown; type?: string }> }
    const lastAi = [...(state.messages ?? [])].reverse().find((m) => m.type === 'ai')
    const reply = typeof lastAi?.content === 'string' ? lastAi.content : JSON.stringify(lastAi?.content ?? '')

    // HITL 中断检测：langchain HITLRequest = { actionRequests: [{id,name,args}], reviewConfigs }
    interface HitlValue {
      actionRequests?: Array<{ id?: string; name?: string; args?: unknown }>
    }
    const resultWithInterrupt = result as { __interrupt__?: Array<{ value?: HitlValue }> }
    const interrupts = resultWithInterrupt.__interrupt__
    let pendingApproval: RunResult['pendingApproval'] | undefined
    if (Array.isArray(interrupts) && interrupts.length > 0) {
      const actions = interrupts[0]?.value?.actionRequests ?? []
      if (actions.length > 0) {
        pendingApproval = actions.map((a) => ({
          toolCallId: String(a.id ?? ''),
          name: String(a.name ?? ''),
          args: a.args,
        }))
        emit({ type: 'interrupt', payload: pendingApproval })
        return { conversationId, threadId, reply, pendingApproval, events: [] }
      }
    }

    // 4. 存 assistant 消息
    await ctx.db.insert(messages).values({ id: randomUUID(), conversationId, role: 'assistant', content: reply, createdAt: new Date().toISOString() })
    await ctx.db.update(conversations).set({ updatedAt: new Date().toISOString() }).where(eq(conversations.id, conversationId)).run()

    emit({ type: 'done', payload: { conversationId, reply, threadId } })
    return { conversationId, threadId, reply, pendingApproval, events: [] }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    emit({ type: 'error', payload: error })
    throw e
  }
}

/** 列出 Agent 会话（model='lumina-agent'）。 */
export async function listAgentConversations(ctx: Context) {
  const rows = await ctx.db.select().from(conversations).where(eq(conversations.model, 'lumina-agent')).orderBy(desc(conversations.updatedAt)).limit(50).all()
  return rows
}