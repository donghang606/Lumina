import { trpc } from '../lib/trpc'

export interface ChatSource {
  noteId: string
  title: string
  content: string
  score: number
}

export interface ChatReply {
  reply: string
  source?: string
  conversationId?: string
  sources?: ChatSource[]
}

export interface ConversationSummary {
  id: string
  title: string
  model: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  createdAt: string
}

export interface ConversationDetail extends Omit<ConversationSummary, 'messageCount'> {
  messages: ConversationMessage[]
}

export interface AiStatus {
  ready: boolean
  provider: string
  model: string
  reason?: string | null
  rag?: { hasEmbeddings: boolean }
}

export const aiService = {
  async chat(message: string, noteContext?: string, conversationId?: string): Promise<ChatReply> {
    return trpc.ai.chat.mutate({ message, noteContext, conversationId })
  },
  async status(): Promise<AiStatus> {
    return trpc.ai.status.query()
  },
  async summarize(text: string): Promise<string> {
    return trpc.ai.summarize.mutate({ text })
  },
  async transform(text: string, mode: 'polish' | 'rewrite' | 'translate' | 'shorten' | 'expand', targetLang?: string): Promise<string> {
    return trpc.ai.transform.mutate({ text, mode, targetLang })
  },
  async suggestTags(title: string, text: string): Promise<string[]> {
    return trpc.ai.suggestTags.mutate({ title, text })
  },
  async listConversations(): Promise<ConversationSummary[]> {
    return trpc.ai.listConversations.query()
  },
  async getConversation(id: string): Promise<ConversationDetail | null> {
    return trpc.ai.getConversation.query({ id })
  },
  async deleteConversation(id: string): Promise<{ ok: boolean }> {
    return trpc.ai.deleteConversation.mutate({ id })
  },
  async renameConversation(id: string, title: string): Promise<{ ok: boolean }> {
    return trpc.ai.renameConversation.mutate({ id, title })
  },
}