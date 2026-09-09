import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { load as yamlLoad, dump as yamlDump } from 'js-yaml'
import {
  normalizeOpenAIBaseUrl,
  syncHarnessConfiguration,
  harnessPaths,
  ensureHarnessDirectories,
  type HarnessModel,
} from './config.js'

// 把 harness 根目录重定向到临时目录，避免污染真实数据目录
const realHomedir = os.homedir
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-harness-test-'))

beforeEach(() => {
  os.homedir = () => tmpHome
})

afterEach(() => {
  os.homedir = realHomedir
})

const MODEL: HarnessModel = {
  providerLabel: 'DeepSeek 官方',
  apiKey: 'sk-test-123',
  modelName: 'deepseek-chat',
  baseUrl: 'https://api.deepseek.com/v1',
}

describe('normalizeOpenAIBaseUrl', () => {
  it('补齐缺失的 /v1 后缀', () => {
    expect(normalizeOpenAIBaseUrl('https://api.deepseek.com')).toBe('https://api.deepseek.com/v1')
  })

  it('剥掉端点路径并去尾斜杠', () => {
    expect(normalizeOpenAIBaseUrl('https://api.x.com/v1/chat/completions/')).toBe('https://api.x.com/v1')
    expect(normalizeOpenAIBaseUrl('https://api.x.com/v1/embeddings')).toBe('https://api.x.com/v1')
  })

  it('保留已有的版本后缀（v2 等自定义网关）', () => {
    expect(normalizeOpenAIBaseUrl('https://gw.example.com/v2')).toBe('https://gw.example.com/v2')
  })
})

describe('syncHarnessConfiguration', () => {
  it('生成 settings/credentials/patch/policy 四份文件且内容正确', () => {
    const paths = syncHarnessConfiguration({ model: MODEL, mcpUrl: 'http://127.0.0.1:3001/mcp', approvalTools: ['mcp__lumina__create_note'] })

    const settings = yamlLoad(fs.readFileSync(paths.settings, 'utf-8')) as Record<string, any>
    expect(settings['agent-default-model']).toEqual({ provider: 'lumina', model: 'deepseek-chat' })
    expect(settings['llm-pi-ai'].providers.lumina).toMatchObject({
      api: 'openai-completions',
      baseURL: 'https://api.deepseek.com/v1',
      apiKeyEnv: 'LUMINA_HARNESS_API_KEY',
    })
    expect(settings['ui-theme']).toEqual({ preference: 'system' })

    const credentials = yamlLoad(fs.readFileSync(paths.credentials, 'utf-8')) as Record<string, any>
    expect(credentials.version).toBe(1)
    expect(credentials.refs.LUMINA_HARNESS_API_KEY).toBe('sk-test-123')
    expect(Object.keys(credentials).filter((k) => !['version', 'refs'].includes(k))).toEqual([])

    const patch = yamlLoad(fs.readFileSync(paths.patch, 'utf-8')) as Array<Record<string, any>>
    expect(patch.some((p) => p.id === 'llm-deepseek' && p.disabled === true)).toBe(true)
    expect(patch.some((p) => p.id === 'ui-settings-models' && p.disabled === true)).toBe(true)

    const insert = patch.find((p) => Array.isArray(p.insert))?.insert as Array<Record<string, any>>
    const mcp = insert.find((e) => e.id === 'mcp-lumina')!
    expect(mcp.name).toBe('@deepseek-ai/dsh-mcp-client')
    expect(mcp.config).toMatchObject({ serverName: 'lumina', transport: 'streamable-http', url: 'http://127.0.0.1:3001/mcp' })

    const approval = insert.find((e) => e.id === 'lumina-tool-approval')!
    expect(approval.config.approvalTools).toEqual(['mcp__lumina__create_note'])
    expect(approval.name.startsWith('file://')).toBe(true)

    expect(fs.readFileSync(paths.policy, 'utf-8')).toContain('lumina-tool-approval-policy')
  })

  it('幂等：重复调用覆盖而不报错，settings 保留其余键，credentials refs 合并', () => {
    const paths = harnessPaths()
    ensureHarnessDirectories(paths)
    fs.writeFileSync(paths.settings, 'custom-key: keep-me\n', 'utf-8')
    fs.writeFileSync(paths.credentials, 'version: 1\nrefs:\n  OTHER_KEY: v1\n', 'utf-8')

    syncHarnessConfiguration({ model: MODEL, mcpUrl: 'http://127.0.0.1:3001/mcp' })
    syncHarnessConfiguration({ model: MODEL, mcpUrl: 'http://127.0.0.1:3001/mcp' })

    const settings = yamlLoad(fs.readFileSync(paths.settings, 'utf-8')) as Record<string, any>
    expect(settings['custom-key']).toBe('keep-me')
    const credentials = yamlLoad(fs.readFileSync(paths.credentials, 'utf-8')) as Record<string, any>
    expect(credentials.refs.OTHER_KEY).toBe('v1')
    expect(credentials.refs.LUMINA_HARNESS_API_KEY).toBe('sk-test-123')
  })

  it('无 apiKey（ollama）时不写空 ref', () => {
    const paths = syncHarnessConfiguration({
      model: { ...MODEL, apiKey: '' },
      mcpUrl: 'http://127.0.0.1:3001/mcp',
    })
    const credentials = yamlLoad(fs.readFileSync(paths.credentials, 'utf-8')) as Record<string, any>
    expect(credentials.refs.LUMINA_HARNESS_API_KEY).toBeUndefined()
  })

  it('目录权限为 0700', () => {
    const paths = harnessPaths()
    ensureHarnessDirectories(paths)
    if (process.platform !== 'win32') {
      expect(fs.statSync(paths.home).mode & 0o777).toBe(0o700)
    }
  })
})

describe('harness/index 状态机', () => {
  it('未配置 provider 时 start 返回 config-required', async () => {
    vi.resetModules()
    const { startHarness } = await import('./index.js')
    const db = {
      select: () => ({
        from: () => ({
          where: () => ({
            get: async () => undefined,
            limit: () => ({ all: async () => [] }),
          }),
        }),
      }),
    }
    const status = await startHarness(db as never)
    expect(status.status).toBe('config-required')
    expect(status.error).toContain('AI Provider')
  })
})