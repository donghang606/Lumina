import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@lumina/server'

const TRPC_PATH = '/trpc'
const DEFAULT_URL = `http://localhost:3001${TRPC_PATH}`

/** Electron 注入的运行时信息（preload bridge） */
interface LuminaBridge {
  serverPort: number | null
  electron: boolean
}
declare global {
  interface Window {
    lumina?: LuminaBridge
  }
}

/** Electron 主进程动态选端口时，优先用注入端口 */
function getInjectedUrl(): string | null {
  const port = typeof window !== 'undefined' ? window.lumina?.serverPort : null
  if (port && Number.isFinite(port) && port > 0) {
    return `http://127.0.0.1:${port}${TRPC_PATH}`
  }
  return null
}

function getServerUrl(): string {
  const injected = getInjectedUrl()
  if (injected) return injected
  try {
    const stored = localStorage.getItem('lumina.serverUrl')
    if (stored && stored.trim()) {
      const base = stored.trim().replace(/\/+$/, '')
      return `${base}${TRPC_PATH}`
    }
  } catch {}
  return DEFAULT_URL
}

function buildClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: getServerUrl(),
      }),
    ],
  })
}

export let trpc = buildClient()

export function setServerUrl(url: string | null) {
  const next = url && url.trim() ? url.trim() : ''
  if (next === getServerUrlRaw()) return
  if (next) {
    localStorage.setItem('lumina.serverUrl', next)
  } else {
    localStorage.removeItem('lumina.serverUrl')
  }
  trpc = buildClient()
}

export function getServerUrlRaw(): string {
  const injected = getInjectedUrl()
  if (injected) return injected.replace(/\/trpc\/?$/, '')
  try {
    return localStorage.getItem('lumina.serverUrl') ?? ''
  } catch {
    return ''
  }
}

/** 解析后端 origin（无 /trpc 尾缀）：Electron 注入 > localStorage > 默认 3001 */
export function resolveServerBase(): string {
  const raw = getServerUrlRaw()
  return raw || 'http://localhost:3001'
}
