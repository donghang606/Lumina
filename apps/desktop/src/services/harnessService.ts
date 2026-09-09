import { trpc } from '../lib/trpc'

export interface HarnessStatus {
  status: 'idle' | 'starting' | 'ready' | 'stopping' | 'error' | 'config-required'
  url: string | null
  port: number | null
  model: { providerLabel: string; modelName: string } | null
  error: string | null
}

export const harnessService = {
  status(): Promise<HarnessStatus> {
    return trpc.harness.status.query()
  },
  start(): Promise<HarnessStatus> {
    return trpc.harness.start.mutate()
  },
  stop(): Promise<HarnessStatus> {
    return trpc.harness.stop.mutate()
  },
  restart(): Promise<HarnessStatus> {
    return trpc.harness.restart.mutate()
  },
  syncConfig(): Promise<HarnessStatus> {
    return trpc.harness.syncConfig.mutate()
  },
}