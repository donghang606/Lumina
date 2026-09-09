import '@testing-library/jest-dom/vitest'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AgentPanel from './AgentPanel'
import { agentService, streamAgentChat } from '../../services/agentService'
import { useLayoutStore } from '../../stores/layoutStore'

vi.mock('../../services/agentService', () => ({
  agentService: {
    listConversations: vi.fn(async () => [{ id: 'c1', title: '旧会话', model: 'lumina-agent', createdAt: '2026-01-01', updatedAt: '2026-01-01' }]),
    getConversation: vi.fn(async () => ({ conversation: {}, messages: [{ id: 'm1', role: 'user', content: '你好', createdAt: '2026-01-01' }] })),
    deleteConversation: vi.fn(async () => ({ ok: true })),
    renameConversation: vi.fn(async () => ({ ok: true })),
  },
  streamAgentChat: vi.fn(),
}))

describe('AgentPanel', () => {
  beforeEach(() => {
    vi.mocked(streamAgentChat).mockReset()
    useLayoutStore.setState({ agentPanelOpen: true })
  })

  it('打开时显示空态与历史会话', async () => {
    render(<AgentPanel open onClose={() => {}} />)
    await waitFor(() => expect(screen.getByText('旧会话')).toBeInTheDocument())
    expect(screen.getByText('Lumina Agent')).toBeInTheDocument()
    expect(screen.getByText(/我是 Lumina Agent/)).toBeInTheDocument()
  })

  it('发送消息 → 流式工具事件 → 最终回复', async () => {
    vi.mocked(streamAgentChat).mockImplementation(async (_body, onEvent) => {
      onEvent?.({ type: 'tool-call', payload: { toolName: 'search_notes', toolCallId: 'tc1', arguments: { query: 'x' } } })
      onEvent?.({ type: 'tool-result', payload: { toolName: 'search_notes', toolCallId: 'tc1', output: '[]', status: 'success' } })
      return { conversationId: 'c-new', reply: '找到了 2 条', pendingApproval: null, threadId: 'th1' }
    })
    render(<AgentPanel open onClose={() => {}} />)
    const textarea = screen.getByPlaceholderText(/让 Agent 帮你查笔记/)
    fireEvent.change(textarea, { target: { value: '帮我查笔记' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('找到了 2 条')).toBeInTheDocument())
    expect(screen.getByText('帮我查笔记')).toBeInTheDocument()
    expect(screen.getByText('search_notes')).toBeInTheDocument()
    expect(streamAgentChat).toHaveBeenCalledWith({ message: '帮我查笔记', conversationId: undefined }, expect.any(Function))
  })

  it('HITL 中断时展示审批条，同意后走 resume', async () => {
    vi.mocked(streamAgentChat)
      .mockImplementationOnce(async () => ({
        conversationId: 'c1',
        reply: '',
        threadId: 'th-hitl',
        pendingApproval: [{ toolCallId: 't1', name: 'create_note', args: { title: '新笔记' } }],
      }))
      .mockImplementationOnce(async () => ({ conversationId: 'c1', reply: '已创建', pendingApproval: null, threadId: 'th-hitl' }))
    render(<AgentPanel open onClose={() => {}} />)
    const textarea = screen.getByPlaceholderText(/让 Agent 帮你查笔记/)
    fireEvent.change(textarea, { target: { value: '建个笔记' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/Agent 请求执行写操作/)).toBeInTheDocument())
    expect(screen.getByText(/"title": "新笔记"/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('同意执行'))
    await waitFor(() => expect(screen.getByText('已创建')).toBeInTheDocument())
    expect(streamAgentChat).toHaveBeenLastCalledWith({ resume: { threadId: 'th-hitl', decision: 'approve' } }, expect.any(Function))
  })

  it('流错误时展示错误消息', async () => {
    vi.mocked(streamAgentChat).mockRejectedValue(new Error('连接失败'))
    render(<AgentPanel open onClose={() => {}} />)
    const textarea = screen.getByPlaceholderText(/让 Agent 帮你查笔记/)
    fireEvent.change(textarea, { target: { value: 'hi' } })
    fireEvent.keyDown(textarea, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText(/⚠️ 连接失败/)).toBeInTheDocument())
  })
})