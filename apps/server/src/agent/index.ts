import path from 'node:path'
import fs from 'node:fs'
import { createDeepAgent, FilesystemBackend, CompositeBackend } from 'deepagents'
import { MemorySaver, InMemoryStore } from '@langchain/langgraph'
import type { Context } from '../trpc/context.js'
import { createLangChainModel, listMemoryFiles, getAgentRootDir, ensureMemoryFiles } from './model.js'
import { buildLangChainTools, buildToolContext, buildInterruptConfig } from './registry.js'
import './tools/index.js'

// 单例：checkpointer（每 thread 独立 checkpoint）/ store（跨会话记忆）/ backend（文件沙箱）
let sharedCheckpointer: MemorySaver | null = null
let sharedStore: InMemoryStore | null = null
let sharedBackend: CompositeBackend | null = null

export interface AgentRuntime {
  agent: Awaited<ReturnType<typeof createDeepAgent>>
  toolCtx: ReturnType<typeof buildToolContext>
  rootDir: string
}

function getBackend(): CompositeBackend {
  if (sharedBackend) return sharedBackend
  const rootDir = getAgentRootDir()
  fs.mkdirSync(rootDir, { recursive: true })
  fs.mkdirSync(path.join(rootDir, 'SANDBOX'), { recursive: true })
  sharedBackend = new CompositeBackend(new FilesystemBackend({ rootDir, virtualMode: true }), {})
  return sharedBackend
}

/**
 * 创建 Lumina Agent（每次 invoke 调用，装配开销小）。
 * 记忆注入采用「磁盘实时读取进 systemPrompt」而非 SDK memory: 参数——
 * 避免 checkpointer 缓存 memoryContents 导致 Agent 看到过期内容的坑（HFL postmortem）。
 */
export async function createLuminaAgent(ctx: Context, options: { unattended?: boolean } = {}): Promise<AgentRuntime> {
  ensureMemoryFiles()

  const modelConfig = await import('./model.js').then((m) => m.resolveAgentModel(ctx))
  const model = createLangChainModel(modelConfig)

  const rootDir = getAgentRootDir()
  const toolCtx = buildToolContext(ctx.db, '', '', () => {})
  const tools = buildLangChainTools(toolCtx)
  const interruptOn = options.unattended ? {} : buildInterruptConfig()

  const memoryBlock = listMemoryFiles()
    .map((f) => `### /memories/${f.fileName}\n${f.content || '(空)'}`)
    .join('\n\n')

  const agent = await createDeepAgent({
    model,
    tools,
    backend: getBackend(),
    interruptOn,
    checkpointer: (sharedCheckpointer ??= new MemorySaver()),
    store: (sharedStore ??= new InMemoryStore()),
    systemPrompt:
      '你是 Lumina Agent，集成在 Lumina 个人知识库中的智能助手。\n\n' +
      '## 核心能力\n' +
      '- 混合检索笔记（search_notes，BM25）\n' +
      '- 读取笔记详情/反链/出链（get_note）\n' +
      '- 建议创建笔记（suggest_note：进审核队列，用户确认后落库，安全）\n' +
      '- 直接创建笔记（create_note：需审批，仅在用户明确要求时用）\n' +
      '- 标签管理（list_tags / set_tags，写操作需审批）\n' +
      '- 知识图谱（get_graph）与查询视图（run_query_view）\n' +
      '- 笔记库统计（get_note_stats / list_recent）\n' +
      '- 日程管理（list_events / create_event / get_event / delete_event；建/删需审批，适合"提醒我""安排"类请求）\n\n' +
      '## 文件沙箱\n' +
      `Agent 工作区根目录：${rootDir}（虚拟路径 /）\n` +
      '- /SANDBOX/：Agent 生成的文件（write_file 等）必须存放于此\n' +
      '- /memories/：跨会话记忆（SOUL/USER/MEMORY/Agent.md，用 edit 工具更新）\n\n' +
      '## 行为准则\n' +
      '1. 回答用户问题优先检索笔记库，引用笔记时给出 id 与标题\n' +
      '2. 用户想保存内容时优先 suggest_note（进审核队列），而不是直接 create_note\n' +
      '3. 涉及用户隐私的信息不得外泄；用中文回答\n\n' +
      '## 记忆系统（每次对话前从磁盘刷新）\n\n' +
      memoryBlock +
      '\n\n**更新规则**：学到新的用户偏好/重要事实时，立即用 edit 工具更新对应记忆文件（以当前片段为 old_string，新内容为 new_string），精炼去重。',
  })

  return { agent, toolCtx, rootDir }
}