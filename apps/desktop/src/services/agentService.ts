import { trpc } from '../lib/trpc'
import { getServerUrlRaw } from '../lib/trpc'

export interface AgentPendingApproval {
  toolCallId: string
  name: string
  args: unknown
}

export interface AgentToolEvent {
  requestId: string
  toolCallId: string
  toolName: string
  arguments?: unknown
  output?: string
  status?: string
  durationMs?: number
}

export interface AgentChatResult {
  conversationId: string
  reply: string
  pendingApproval: AgentPendingApproval[] | null
  threadId?: string
}

export interface AgentConversationSummary {
  id: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
}

export interface AgentConversationDetail {
  conversation: AgentConversationSummary & { [k: string]: unknown }
  messages: Array<{ id: string; role: string; content: string; createdAt: string }>
}

type AgentSSEHandler = (event: { type: 'tool-call' | 'tool-result' | 'interrupt' | 'done' | 'error'; payload?: unknown }) => void

/** SSE 消费 /api/agent/chat：resolve 最终结果，期间经 onEvent 推流工具事件。 */
export function streamAgentChat(
  body: { message?: string; conversationId?: string; resume?: { threadId: string; decision: 'approve' | 'reject' } },
  onEvent?: AgentSSEHandler,
  signal?: AbortSignal,
): Promise<AgentChatResult> {
  return new Promise((resolve, reject) => {
    const base = getServerUrlRaw().replace(/\/trpc\/?$/, '')
    void fetch(`${base}/api/agent/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    })
      .then(async (resp) => {
        if (!resp.ok || !resp.body) {
          const text = await resp.text().catch(() => '')
          reject(new Error(text || `HTTP ${resp.status}`))
          return
        }
        const reader = resp.body.getReader()
        const decoder = new TextDecoder()
        let buf = ''
        let finalResult: AgentChatResult | null = null
        let lastError: string | null = null

        const handleFrame = (eventType: string, data: string) => {
          let payload: unknown
          try {
            payload = data ? JSON.parse(data) : {}
          } catch {
            payload = {}
          }
          if (eventType === 'done') {
            finalResult = {
              conversationId: (payload as { conversationId?: string })?.conversationId ?? '',
              reply: (payload as { reply?: string })?.reply ?? '',
              pendingApproval: (payload as { pendingApproval?: AgentPendingApproval[] })?.pendingApproval ?? null,
              threadId: (payload as { threadId?: string })?.threadId,
            }
          } else if (eventType === 'error') {
            lastError = (payload as { error?: string })?.error ?? String(payload)
          } else if (eventType !== 'ping') {
            onEvent?.({ type: eventType as 'tool-call' | 'tool-result' | 'interrupt', payload })
          }
        }

        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          buf += decoder.decode(value, { stream: true })
          // SSE 帧解析：event: <type>\ndata: <json>\n\n（容忍 : ping 心跳）
          let idx
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const frame = buf.slice(0, idx)
            buf = buf.slice(idx + 2)
            let evType = ''
            const dataLines: string[] = []
            for (const line of frame.split('\n')) {
              if (line.startsWith('event: ')) evType = line.slice(7).trim()
              else if (line.startsWith('data: ')) dataLines.push(line.slice(6))
            }
            if (evType) handleFrame(evType, dataLines.join('\n'))
          }
        }

        if (finalResult) resolve(finalResult)
        else reject(new Error(lastError ?? 'Agent 流异常终止'))
      })
      .catch((e) => reject(e))
  })
}

export const agentService = {
  listConversations(): Promise<AgentConversationSummary[]> {
    return trpc.agent.listConversations.query()
  },
  getConversation(id: string): Promise<AgentConversationDetail | null> {
    return trpc.agent.getConversation.query({ id })
  },
  deleteConversation(id: string): Promise<{ ok: boolean }> {
    return trpc.agent.deleteConversation.mutate({ id })
  },
  renameConversation(id: string, title: string): Promise<{ ok: boolean }> {
    return trpc.agent.renameConversation.mutate({ id, title })
  },
}