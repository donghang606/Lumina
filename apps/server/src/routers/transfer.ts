import { router, publicProcedure } from '../trpc/context.js'
import { z } from 'zod'
import { buildExport, runImport, type ImportItem } from '../lib/importExport.js'

export const transferRouter = router({
  exportNotes: publicProcedure.query(async ({ ctx }) => {
    return buildExport(ctx.db)
  }),

  importNotes: publicProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            title: z.string().default(''),
            type: z.enum(['card', 'note', 'bookmark', 'file']).default('note'),
            content: z.string().default(''),
            tags: z.array(z.string()).default([]),
            createdAt: z.string().nullable().optional(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const items = input.items as ImportItem[]
      return runImport(ctx.db, items)
    }),
})
