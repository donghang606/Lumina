import { router, publicProcedure } from '../trpc/context.js'
import { startHarness, stopHarness, restartHarness, harnessStatus, syncHarnessIfRunning } from '../harness/index.js'
import { db } from '../db/client.js'

export const harnessRouter = router({
  start: publicProcedure.mutation(() => startHarness(db)),
  stop: publicProcedure.mutation(() => stopHarness()),
  restart: publicProcedure.mutation(() => restartHarness(db)),
  status: publicProcedure.query(() => harnessStatus()),
  /** Provider 配置变化后调用：sidecar 在跑且签名变化时自动重启。 */
  syncConfig: publicProcedure.mutation(() => syncHarnessIfRunning(db)),
})