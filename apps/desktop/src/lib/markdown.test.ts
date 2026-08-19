import { describe, it, expect } from 'vitest'
import { parseMarkdown, toMarkdown, sanitizeFilename, mdToPlainText, mdToHtml } from './markdown'

describe('parseMarkdown', () => {
  it('parses frontmatter with array tags', () => {
    const md = `---
title: "我的笔记"
type: card
tags: [AI, 知识管理]
created: 2026-05-01T10:00:00.000Z
---

正文内容 #inline
`
    const note = parseMarkdown(md, 'fallback')
    expect(note.title).toBe('我的笔记')
    expect(note.type).toBe('card')
    expect(note.tags).toEqual(['AI', '知识管理'])
    expect(note.createdAt).toBe('2026-05-01T10:00:00.000Z')
    expect(note.content).toBe('正文内容 #inline')
  })

  it('parses comma-separated tags', () => {
    const md = `---
tags: a, b
---
body`
    const note = parseMarkdown(md, 'f')
    expect(note.tags).toEqual(['a', 'b'])
    expect(note.content).toBe('body')
  })

  it('falls back to filename title without frontmatter', () => {
    const note = parseMarkdown('plain body', '文件名')
    expect(note.title).toBe('文件名')
    expect(note.content).toBe('plain body')
    expect(note.tags).toEqual([])
    expect(note.type).toBe('note')
  })

  it('handles CRLF line endings', () => {
    const md = '---\r\ntitle: X\r\n---\r\nbody\r\n'
    const note = parseMarkdown(md, 'f')
    expect(note.title).toBe('X')
    expect(note.content).toBe('body')
  })
})

describe('toMarkdown / sanitizeFilename', () => {
  it('roundtrips an export item through frontmatter', () => {
    const md = toMarkdown({
      title: '笔记 A',
      type: 'note',
      content: '[[双链]] 内容',
      tags: ['技术'],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
      meta: {},
    })
    expect(md.startsWith('---')).toBe(true)
    expect(md).toContain('title: 笔记 A')
    expect(md).toContain('tags: ["技术"]')
    const parsed = parseMarkdown(md, 'f')
    expect(parsed.title).toBe('笔记 A')
    expect(parsed.tags).toEqual(['技术'])
    expect(parsed.content).toBe('[[双链]] 内容')
  })

  it('sanitizes filenames', () => {
    expect(sanitizeFilename('a/b:c*d?')).toBe('a-b-c-d-')
    expect(sanitizeFilename('正常文件名')).toBe('正常文件名')
  })
})

describe('mdToPlainText', () => {
  it('strips markdown syntax', () => {
    const md = '# 标题\n\n**加粗** 和 `代码` 以及 - 列表项\n\n> 引用\n\n[链接文字](https://example.com)'
    const out = mdToPlainText(md)
    expect(out).toContain('标题')
    expect(out).toContain('加粗')
    expect(out).toContain('列表项')
    expect(out).toContain('引用')
    expect(out).toContain('链接文字')
    expect(out).not.toContain('#')
    expect(out).not.toContain('**')
  })

  it('keeps wiki link display text and drops the href', () => {
    const out = mdToPlainText('参考 [B 笔记](lumina://note/abc-123)')
    expect(out).toBe('参考 B 笔记')
  })

  it('passes through plain text and collapses whitespace', () => {
    expect(mdToPlainText('  a\n\n  b  ')).toBe('a b')
  })

  it('handles legacy HTML content', () => {
    const out = mdToPlainText('<p>Hello <strong>world</strong></p><ul><li>item</li></ul>')
    expect(out).toBe('Hello world item')
  })

  it('strips script/style blocks', () => {
    const out = mdToPlainText('text <script>alert(1)</script> tail')
    expect(out).not.toContain('alert')
    expect(out).toContain('text')
  })

  it('tolerates empty input', () => {
    expect(mdToPlainText('')).toBe('')
  })
})

describe('mdToHtml', () => {
  it('renders markdown into a standalone HTML document', () => {
    const html = mdToHtml('# 你好\n\n正文 **加粗**', '测试笔记')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('<title>测试笔记</title>')
    expect(html).toContain('<h1>你好</h1>')
    expect(html).toContain('<strong>加粗</strong>')
  })

  it('escapes unsafe title', () => {
    const html = mdToHtml('', '<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('tolerates empty input', () => {
    const html = mdToHtml('', 'x')
    expect(html).toContain('</html>')
  })
})
