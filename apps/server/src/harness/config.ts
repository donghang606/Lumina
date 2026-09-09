import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export const HARNESS_PROVIDER = 'lumina'
export const HARNESS_CREDENTIAL = 'LUMINA_HARNESS_API_KEY'
const START_TIMEOUT_MS = 45_000

export function harnessRoot(): string {
  return path.join(os.homedir(), 'Library', 'Application Support', 'com.lumina.app', 'deepseek-harness')
}

export function harnessPaths() {
  const root = harnessRoot()
  return {
    root,
    home: path.join(root, 'home'),
    workspace: path.join(root, 'workspace'),
    settings: path.join(root, 'home', 'settings.yaml'),
    credentials: path.join(root, 'home', '.credentials.yaml'),
    patch: path.join(root, 'home', 'lumina.patch.yml'),
    policy: path.join(root, 'home', 'lumina-tool-policy.mjs'),
  }
}

export function ensureHarnessDirectories(paths: ReturnType<typeof harnessPaths>): void {
  fs.mkdirSync(paths.root, { recursive: true, mode: 0o700 })
  fs.mkdirSync(paths.home, { recursive: true, mode: 0o700 })
  fs.mkdirSync(paths.workspace, { recursive: true, mode: 0o700 })
  if (process.platform !== 'win32') {
    fs.chmodSync(paths.root, 0o700)
    fs.chmodSync(paths.home, 0o700)
    fs.chmodSync(paths.workspace, 0o700)
  }
}

export function harnessStartTimeout(): number {
  return START_TIMEOUT_MS
}

/** 兼容 readYamlMapping 的幂等写：临时文件 + rename，权限 600。 */
function writeAtomic(filename: string, content: string, mode: fs.Mode = 0o600): void {
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${process.pid}.${Date.now()}.tmp`)
  fs.writeFileSync(temporary, content, { encoding: 'utf-8', mode })
  if (process.platform !== 'win32') fs.chmodSync(temporary, mode)
  fs.renameSync(temporary, filename)
  if (process.platform !== 'win32') fs.chmodSync(filename, mode)
}

function readYamlMapping(filename: string): Record<string, unknown> {
  if (!fs.existsSync(filename)) return {}
  const parsed = yamlLoad(fs.readFileSync(filename, 'utf-8'))
  if (parsed === null || parsed === undefined) return {}
  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path.basename(filename)} must contain a mapping`)
  }
  return parsed as Record<string, unknown>
}

/** 把 baseUrl 归一化到以 /v1 结尾（DSH pi-ai 网关要求 openai 兼容根地址）。 */
export function normalizeOpenAIBaseUrl(baseUrl: string): string {
  let url = baseUrl.trim().replace(/\/+$/, '')
  url = url.replace(/\/chat\/completions$/, '')
  url = url.replace(/\/embeddings$/, '')
  if (!/\/v\d+$/.test(url)) url += '/v1'
  return url
}

export interface HarnessModel {
  providerLabel: string
  apiKey: string
  modelName: string
  baseUrl: string
}

export interface SyncConfigInput {
  model: HarnessModel
  mcpUrl: string
  approvalTools?: string[]
  theme?: 'light' | 'dark' | 'system'
  locale?: 'zh' | 'en'
}

/**
 * 生成 DSH sidecar 的 settings/credentials/patch 三份配置。
 * patch 内容：
 *  - 禁用官方 deepseek adapter（模型改走 pi-ai openai-completions 网关）
 *  - 禁用官方模型设置页（模型由 Lumina 管理）
 *  - 挂 mcp-client 连接 Lumina 的 /mcp（笔记/图谱/视图工具）
 *  - 挂工具审批策略（敏感工具 ask，其余放行）
 */
export function syncHarnessConfiguration(input: SyncConfigInput): ReturnType<typeof harnessPaths> {
  const paths = harnessPaths()
  ensureHarnessDirectories(paths)
  const { model, mcpUrl } = input
  const theme = input.theme ?? 'system'
  const locale = input.locale ?? 'zh'

  const settings = readYamlMapping(paths.settings)
  settings['ui-theme'] = { preference: theme }
  settings.locale = { preference: locale }
  settings['agent-default-model'] = { provider: HARNESS_PROVIDER, model: model.modelName }
  settings['llm-pi-ai'] = {
    providers: {
      [HARNESS_PROVIDER]: {
        displayName: model.providerLabel,
        apiKeyEnv: HARNESS_CREDENTIAL,
        api: 'openai-completions',
        baseURL: model.baseUrl,
        models: [{ id: model.modelName, name: model.modelName }],
      },
    },
  }
  writeAtomic(paths.settings, yamlDump(settings, { noRefs: true, lineWidth: 120 }))

  const credentials = readYamlMapping(paths.credentials)
  const refs: Record<string, unknown> = { ...(credentials.refs as Record<string, unknown> | undefined) }
  // 空 key 会触发 credentials-local 报错；无 key（ollama）时移除该 ref
  if (model.apiKey) refs[HARNESS_CREDENTIAL] = model.apiKey
  else delete refs[HARNESS_CREDENTIAL]
  writeAtomic(paths.credentials, yamlDump({ version: 1, refs }, { noRefs: true, lineWidth: -1 }))

  fs.copyFileSync(path.join(__dirname, 'toolApprovalPolicy.mjs'), paths.policy)
  if (process.platform !== 'win32') fs.chmodSync(paths.policy, 0o600)

  const patch = [
    { id: 'llm-deepseek', disabled: true },
    { id: 'ui-settings-models', disabled: true },
    {
      insert: [
        {
          id: 'mcp-lumina',
          name: '@deepseek-ai/dsh-mcp-client',
          config: {
            serverName: 'lumina',
            transport: 'streamable-http',
            url: mcpUrl,
            toolCallTimeoutMs: 300000,
            failOnStartupError: true,
          },
        },
        {
          id: 'lumina-tool-approval',
          name: pathToFileURL(paths.policy).href,
          inject: ['tools'],
          config: { approvalTools: input.approvalTools ?? [] },
        },
      ],
    },
  ]
  writeAtomic(paths.patch, yamlDump(patch, { noRefs: true, lineWidth: 120 }))
  return paths
}