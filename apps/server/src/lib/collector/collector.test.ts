import { describe, it, expect } from 'vitest'
import { htmlCollector, collectDocument } from './index.js'

describe('collector', () => {
  it('extracts title and converts main content to markdown', async () => {
    const html = `<!DOCTYPE html><html><head><title>原文标题</title>
      <meta property="og:site_name" content="示例站">
      <meta property="og:title" content="OG 标题">
    </head><body>
      <nav><a href="/a">导航</a></nav>
      <main><h1>第一段标题</h1><p>这是正文内容。</p><ul><li>项目 A</li><li>项目 B</li></ul></main>
      <footer>版权信息</footer>
    </body></html>`
    const r = await htmlCollector.collect({ url: 'https://example.com/x', html })
    expect(r.title).toBe('OG 标题')
    expect(r.siteName).toBe('示例站')
    expect(r.content).toContain('# 第一段标题')
    expect(r.content).toContain('这是正文内容')
    expect(r.content).toMatch(/-+\s*项目 A/)
    expect(r.content).toMatch(/-+\s*项目 B/)
    expect(r.content).not.toContain('版权信息')
    expect(r.content).not.toContain('导航')
  })

  it('uses html collector when html provided', async () => {
    const r = await collectDocument({ url: 'https://example.com/a', html: '<html><body><main><h1>H</h1><p>正文</p></main></body></html>' })
    expect(r.content).toContain('# H')
  })

  it('falls back to text content when no html', async () => {
    const r = await collectDocument({ url: 'https://example.com/b', text: '<p>hello <b>world</b></p>' })
    expect(r.content).toBe('hello world')
  })
})
