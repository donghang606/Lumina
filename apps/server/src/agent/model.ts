import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { ChatOpenAI } from '@langchain/openai'
import { getActiveProvider } from '../llm/provider.js'
import type { Context } from '../trpc/context.js'

export interface AgentModelConfig {
  baseUrl: string
  apiKey: string
  modelName: string
  providerLabel: string
}

/** 从 Lumina Provider 体系解析 Agent 模型配置（复用 getActiveProvider 的路由与解密）。 */
export async function resolveAgentModel(ctx: Context): Promise<AgentModelConfig> {
  const p = await getActiveProvider(ctx)
  if (!p.ready || !p.baseUrl) {
    throw new Error(`Agent 需要可用的 AI Provider（当前：${p.reason ?? p.name}）。请在设置中配置。`)
  }
  return { baseUrl: p.baseUrl, apiKey: p.apiKey, modelName: p.model, providerLabel: p.name }
}

/** 适配为 LangChain ChatOpenAI（OpenAI 兼容端点）。空 key（本地模型）用占位符绕过 SDK 校验。 */
export function createLangChainModel(config: AgentModelConfig): ChatOpenAI {
  return new ChatOpenAI({
    configuration: { baseURL: config.baseUrl, apiKey: config.apiKey || 'sk-local-placeholder' },
    model: config.modelName,
    temperature: 0.4,
  })
}

/** Agent 沙箱根目录：{userData}/agent（SKILL/memories/SANDBOX 都在其下）。 */
export function getAgentRootDir(): string {
  return path.join(os.homedir(), 'Library', 'Application Support', 'com.lumina.app', 'agent')
}

export interface MemoryFile {
  fileName: string
  content: string
}

const MEMORY_FILES = ['SOUL.md', 'USER.md', 'MEMORY.md', 'Agent.md'] as const

/** 确保四份记忆文件存在（首次生成骨架内容）。 */
export function ensureMemoryFiles(): void {
  const dir = path.join(getAgentRootDir(), 'memories')
  fs.mkdirSync(dir, { recursive: true })
  const defaults: Record<string, string> = {
    'SOUL.md': '# Lumina Agent 人格\n\n你是 Lumina Agent，Lumina 知识库应用的内置助手。务实、简洁、以中文回答。\n',
    'USER.md': '# 用户偏好\n\n（Agent 会在对话中逐步补充）\n',
    'MEMORY.md': '# 跨会话记忆\n\n（Agent 会用 edit 工具更新此文件）\n',
    'Agent.md': '# 经验与技巧\n\n（Agent 积累的做法与教训）\n',
  }
  for (const name of MEMORY_FILES) {
    const file = path.join(dir, name)
    if (!fs.existsSync(file)) fs.writeFileSync(file, defaults[name], 'utf-8')
  }
}

/** 从磁盘实时读取记忆文件（每次 invoke 前刷新，不进 checkpointer 缓存——HFL 踩过的坑）。 */
export function listMemoryFiles(): MemoryFile[] {
  ensureMemoryFiles()
  const dir = path.join(getAgentRootDir(), 'memories')
  return MEMORY_FILES.map((fileName) => ({
    fileName,
    content: fs.readFileSync(path.join(dir, fileName), 'utf-8'),
  }))
}