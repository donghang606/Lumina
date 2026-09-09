export const name = 'lumina-tool-approval-policy'
export const inject = ['tools']

export function apply(ctx, config = {}) {
  const approvalTools = new Set(Array.isArray(config.approvalTools) ? config.approvalTools : [])

  ctx.on('tools/pre-execute', async (execution, next) => {
    if (!approvalTools.has(execution.name)) return next()
    return {
      kind: 'ask',
      reason: `Lumina 工具 "${execution.name}" 会写入笔记数据，需要确认。`,
    }
  })
}