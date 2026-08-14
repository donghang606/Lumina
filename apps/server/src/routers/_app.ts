import { router } from '../trpc/context.js'
import { noteRouter } from './note.js'
import { tagRouter } from './tag.js'
import { feedRouter } from './feed.js'
import { graphRouter } from './graph.js'
import { aiRouter } from './ai.js'
import { configRouter } from './config.js'
import { extensionRouter } from './extension.js'
import { insightRouter } from './insight.js'
import { mcpRouter } from './mcp.js'
import { transferRouter } from './transfer.js'
import { viewRouter } from './view.js'
import { syncRouter } from './sync.js'

export const appRouter = router({
  note: noteRouter,
  tag: tagRouter,
  feed: feedRouter,
  graph: graphRouter,
  ai: aiRouter,
  config: configRouter,
  extension: extensionRouter,
  insight: insightRouter,
  mcp: mcpRouter,
  transfer: transferRouter,
  view: viewRouter,
  sync: syncRouter,
})

export type AppRouter = typeof appRouter