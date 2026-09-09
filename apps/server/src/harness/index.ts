import { spawn, type ChildProcess } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import net from 'node:net'
import { createRequire } from 'node:module'
import { eq } from 'drizzle-orm'
import { aiProviders, settings } from '../db/schema.js'
import { decryptSecret } from '../lib/secrets.js'
import {
  harnessPaths,
  syncHarnessConfiguration,
  normalizeOpenAIBaseUrl,
  harnessStartTimeout,
  type HarnessModel,
} from './config.js'

type Db = typeof import('../db/client.js').db

export interface HarnessStatus {
  status: 'idle' | 'starting' | 'ready' | 'stopping' | 'error' | 'config-required'
  url: string | null
  port: number | null
  model: { providerLabel: string; modelName: string } | null
  error: string | null
}

let sidecar: ChildProcess | null = null
let startPromise: Promise<HarnessStatus> | null = null
let generation = 0
let activeSignature: string | null = null
let recentOutput: string[] = []
let startupDiagnostic: string | null = null
let state: HarnessStatus = {
  status: 'idle',
  url: null,
  port: null,
  model: null,
  error: null,
}
let onStatusChange: ((s: HarnessStatus) => void) | null = null

export function setHarnessStatusListener(fn: ((s: HarnessStatus) => void) | null): void {
  onStatusChange = fn
}

function publicStatus(): HarnessStatus {
  return { ...state }
}

function updateState(patch: Partial<HarnessStatus>): HarnessStatus {
  state = { ...state, ...patch }
  if (onStatusChange) onStatusChange(publicStatus())
  return publicStatus()
}

/** Lumina MCP server 上会写库的工具：交给审批策略 ask。 */
const APPROVAL_MCP_TOOLS = ['create_note', 'propose_note']

const DEFAULT_BASE: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  ollama: 'http://localhost:11434/v1',
  anthropic: '',
}

async function resolveHarnessModel(db: Db): Promise<HarnessModel> {
  const conf = await db.select().from(settings).where(eq(settings.id, 'main')).get()
  let provider = conf?.defaultProviderId
    ? await db.select().from(aiProviders).where(eq(aiProviders.id, conf.defaultProviderId)).get()
    : undefined
  if (!provider?.isActive) {
    provider = (await db.select().from(aiProviders).where(eq(aiProviders.isActive, true)).limit(1).all())[0]
  }
  if (!provider || (!provider.apiKey && provider.type !== 'ollama')) {
    const e = new Error('请先在设置中配置并选择一个可用的 AI Provider')
    ;(e as Error & { code?: string }).code = 'HARNESS_MODEL_REQUIRED'
    throw e
  }
  const rawBase = (provider.baseUrl || DEFAULT_BASE[provider.type] || '').replace(/\/+$/, '')
  if (!rawBase) {
    const e = new Error(`Provider「${provider.name}」缺少 baseUrl，无法接入 Harness`)
    ;(e as Error & { code?: string }).code = 'HARNESS_MODEL_REQUIRED'
    throw e
  }
  const modelName = conf?.defaultModel || provider.models?.[0] || 'deepseek-chat'
  return {
    providerLabel: provider.name,
    apiKey: decryptSecret(provider.apiKey),
    modelName,
    baseUrl: normalizeOpenAIBaseUrl(rawBase),
  }
}

function modelSignature(m: HarnessModel): string {
  return JSON.stringify([m.providerLabel, m.apiKey, m.modelName, m.baseUrl])
}

function findOpenPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
}

function resolveHarnessCli(): string {
  const require = createRequire(import.meta.url)
  const manifest = require.resolve('@deepseek-ai/dsh/package.json')
  const cli = path.join(path.dirname(manifest), 'lib', 'bin.js')
  const unpacked = cli.replace(`${path.sep}app.asar${path.sep}`, `${path.sep}app.asar.unpacked${path.sep}`)
  return fs.existsSync(unpacked) ? unpacked : cli
}

function probe(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = http.get(url, (response) => {
      response.resume()
      const status = response.statusCode ?? 0
      resolve(status >= 200 && status < 500)
    })
    request.setTimeout(1000, () => request.destroy())
    request.on('error', () => resolve(false))
  })
}

function failureDetail(fallback: string): string {
  return (
    startupDiagnostic ||
    recentOutput.find((line) => line.includes('Error: dsh:')) ||
    recentOutput.find((line) => /^error(?:\s+\[[^\]]+\])?:/i.test(line)) ||
    recentOutput.find((line) => /cannot find package/i.test(line)) ||
    [...recentOutput].reverse().find((line) => !/^Node\.js v\d+(?:\.\d+){1,2}$/i.test(line)) ||
    fallback
  )
}

function captureOutput(stream: NodeJS.ReadableStream): void {
  stream.setEncoding('utf-8')
  stream.on('data', (chunk: string) => {
    for (const line of chunk.split(/\r?\n/)) {
      const value = line.trim()
      if (!value) continue
      if (
        !startupDiagnostic &&
        (value.includes('Error: dsh:') || /^error(?:\s+\[[^\]]+\])?:/i.test(value) || /cannot find package/i.test(value))
      ) {
        startupDiagnostic = value
      }
      recentOutput.push(value)
      if (recentOutput.length > 30) recentOutput.shift()
    }
  })
}

async function waitUntilReady(url: string, child: ChildProcess, expectedGeneration: number): Promise<void> {
  const deadline = Date.now() + harnessStartTimeout()
  while (Date.now() < deadline) {
    if (expectedGeneration !== generation) throw new Error('Harness startup was superseded')
    if (child.exitCode !== null) {
      await new Promise((resolve) => setTimeout(resolve, 50))
      throw new Error(failureDetail(`Harness exited with code ${child.exitCode}`))
    }
    if (child !== sidecar) throw new Error(failureDetail('Harness stopped before becoming ready'))
    if (await probe(url)) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Harness startup timed out')
}

async function bootHarness(db: Db): Promise<HarnessStatus> {
  const expectedGeneration = ++generation
  updateState({ status: 'starting', error: null, url: null, port: null, model: null })

  let model: HarnessModel
  try {
    model = await resolveHarnessModel(db)
  } catch (error) {
    return updateState({
      status: 'config-required',
      url: null,
      port: null,
      model: null,
      error: error instanceof Error ? error.message : String(error),
    })
  }

  let launchedChild: ChildProcess | null = null
  try {
    const approvalTools = APPROVAL_MCP_TOOLS.map((t) => `mcp__lumina__${t}`)
    const paths = syncHarnessConfiguration({ model, mcpUrl: `http://127.0.0.1:3001/mcp`, approvalTools })

    const port = await findOpenPort()
    if (expectedGeneration !== generation) throw new Error('Harness startup was superseded')
    const url = `http://127.0.0.1:${port}`
    const cli = resolveHarnessCli()
    recentOutput = []
    startupDiagnostic = null

    const child = spawn(process.execPath, ['--expose-internals', cli, 'web', '--patch', paths.patch, '--host', '127.0.0.1', '--port', String(port)], {
      cwd: paths.workspace,
      env: {
        ...process.env,
        DSH_HOME: paths.home,
        DSH_CWD: paths.workspace,
        DSH_PERMISSION_MODE: 'workspace-write',
        DSH_TELEMETRY_DISABLED: '1',
        DSH_TOOLS_MODE: 'native',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    })
    launchedChild = child
    sidecar = child
    captureOutput(child.stdout!)
    captureOutput(child.stderr!)
    child.once('error', (error) => {
      ;(child as ChildProcess & { harnessSpawnError?: Error }).harnessSpawnError = error
      recentOutput.push(error.message)
    })
    child.once('exit', (code, signal) => {
      if (child !== sidecar || expectedGeneration !== generation) return
      sidecar = null
      activeSignature = null
      const intentional = state.status === 'stopping' || state.status === 'idle'
      updateState(
        intentional
          ? { status: 'idle', url: null, port: null, model: null, error: null }
          : {
              status: 'error',
              url: null,
              port: null,
              model: null,
              error: failureDetail(`Harness exited (${signal || code || 'unknown'})`),
            },
      )
    })

    await waitUntilReady(url, child, expectedGeneration)
    activeSignature = modelSignature(model)
    return updateState({
      status: 'ready',
      url,
      port,
      model: { providerLabel: model.providerLabel, modelName: model.modelName },
      error: null,
    })
  } catch (error) {
    if (launchedChild && launchedChild.exitCode === null) launchedChild.kill('SIGTERM')
    if (expectedGeneration === generation) {
      activeSignature = null
      if (sidecar === launchedChild) sidecar = null
      const code = (error as Error & { code?: string }).code
      updateState({
        status: code === 'HARNESS_MODEL_REQUIRED' ? 'config-required' : 'error',
        url: null,
        port: null,
        model: null,
        error: error instanceof Error ? error.message : String(error),
      })
      console.error(`[Harness] Startup failed: ${error instanceof Error ? error.message : String(error)}`)
    }
    return publicStatus()
  }
}

export function startHarness(db: Db): Promise<HarnessStatus> {
  if (sidecar && state.status === 'ready') return Promise.resolve(publicStatus())
  if (startPromise) return startPromise
  startPromise = bootHarness(db).finally(() => {
    startPromise = null
  })
  return startPromise
}

export async function stopHarness(): Promise<HarnessStatus> {
  generation += 1
  const child = sidecar
  sidecar = null
  startPromise = null
  activeSignature = null
  updateState({ status: child ? 'stopping' : 'idle', url: null, port: null, model: null, error: null })
  if (child && child.exitCode === null) {
    child.kill('SIGTERM')
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        if (child.exitCode === null) child.kill('SIGKILL')
        resolve()
      }, 3000)
      child.once('exit', () => {
        clearTimeout(timer)
        resolve()
      })
    })
  }
  return updateState({ status: 'idle', url: null, port: null, model: null, error: null })
}

export async function restartHarness(db: Db): Promise<HarnessStatus> {
  await stopHarness()
  return startHarness(db)
}

/** 模型配置变化时（若 sidecar 在跑）自动重启。 */
export async function syncHarnessIfRunning(db: Db): Promise<HarnessStatus> {
  if (!sidecar || state.status !== 'ready') return publicStatus()
  try {
    const model = await resolveHarnessModel(db)
    if (modelSignature(model) === activeSignature) return publicStatus()
    return restartHarness(db)
  } catch (error) {
    await stopHarness()
    return updateState({
      status: 'config-required',
      error: error instanceof Error ? error.message : String(error),
      url: null,
      port: null,
      model: null,
    })
  }
}

export function harnessStatus(): HarnessStatus {
  return publicStatus()
}