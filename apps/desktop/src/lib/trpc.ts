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

export function setServerUrl(url: string | null) {
  if (url && url.trim()) {
    localStorage.setItem('lumina.serverUrl', url.trim())
  } else {
    localStorage.removeItem('lumina.serverUrl')
  }
}

export function getServerUrlRaw(): string {
  try {
    return localStorage.getItem('lumina.serverUrl') ?? ''
  } catch {
    return ''
  }
}

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: getServerUrl(),
    }),
  ],
})
