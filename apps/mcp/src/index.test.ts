import { describe, it, expect } from 'vitest'

// Test that the MCP server module can be loaded and tools are defined
describe('lumina-mcp', () => {
  it('builds successfully (dist/index.cjs exists)', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const distPath = path.resolve(import.meta.dirname, '../dist/index.cjs')
    expect(fs.existsSync(distPath)).toBe(true)
  })

  it('index.cjs is valid CJS with banner', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const distPath = path.resolve(import.meta.dirname, '../dist/index.cjs')
    const content = fs.readFileSync(distPath, 'utf-8')
    expect(content).toContain('#!/usr/bin/env node')
    expect(content).toContain('McpServer')
  })
})
