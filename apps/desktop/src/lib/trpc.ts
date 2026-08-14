import { createTRPCClient, httpBatchLink } from '@trpc/client'
import type { AppRouter } from '@lumina/server'

const TRPC_PATH = '/trpc'
const DEFAULT_URL = `http://localhost:3001${TRPC_PATH}`

function getServerUrl(): string {
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
  try {
    return localStorage.getItem('lumina.serverUrl') ?? ''
  } catch {
    return ''
  }
}
