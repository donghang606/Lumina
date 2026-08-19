import type { Note } from '@lumina/shared'
import { marked } from 'marked'

export interface MdNote {
  title: string
  content: string
  tags: string[]
  type: Note['type']
  createdAt?: string
}

const TYPES: Note['type'][] = ['card', 'note', 'bookmark', 'file']

export function parseMarkdown(raw: string, fallbackName: string): MdNote {
  let body = raw.replace(/\r\n/g, '\n')
  let title = fallbackName
  const tags: string[] = []
  let type: Note['type'] = 'note'
  let createdAt: string | undefined

  const front = body.match(/^---\n([\s\S]*?)\n---\n?/)
  if (front) {
    body = body.slice(front[0].length)
    for (const line of front[1].split('\n')) {
      const m = line.match(/^(\w+)\s*:\s*(.*)$/)
      if (!m) continue
      const key = m[1].toLowerCase()
      const rawVal = m[2].trim()
      if (key === 'title') {
        title = rawVal.replace(/^["']|["']$/g, '')
      } else if (key === 'type') {
        type = (TYPES as string[]).includes(rawVal) ? (rawVal as Note['type']) : 'note'
      } else if (key === 'created' || key === 'date') {
        createdAt = rawVal
      } else if (key === 'tags') {
        if (rawVal.startsWith('[')) {
          tags.push(
            ...rawVal
              .slice(1, -1)
              .split(',')
              .map((s) => s.trim().replace(/^["']|["']$/g, ''))
              .filter(Boolean),
          )
        } else {
          tags.push(...rawVal.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))
        }
      }
    }
  }

  return { title: title || fallbackName, content: body.trim(), tags, type, createdAt }
}

export interface ExportNote {
  title: string
  type: Note['type']
  content: string
  tags: string[]
  createdAt: string | null
  updatedAt: string | null
  meta: Record<string, unknown>
}

export function toMarkdown(item: ExportNote): string {
  const lines = [
    '---',
    `title: ${item.title.replace(/["':\n]/g, (c) => (c === ':' ? '：' : ' '))}`,
    `type: ${item.type}`,
    item.tags.length ? `tags: [${item.tags.map((t) => JSON.stringify(t)).join(', ')}]` : '',
    item.createdAt ? `created: ${item.createdAt}` : '',
    '---',
    '',
    item.content,
  ]
  return lines.filter((l) => l !== '').join('\n') + '\n'
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[\\/:*?"<>|\n\r]/g, '-').slice(0, 120) || 'untitled'
}

// 渲染为独立可分享的 HTML 文档（KnowMe/HTML 导出借鉴）
export function mdToHtml(src: string, title: string): string {
  let body: string
  try {
    body = marked.parse(src ?? '', { async: false }) as string
  } catch {
    body = `<p>${(src ?? '').replace(/</g, '&lt;').replace(/\n/g, '<br/>')}</p>`
  }
  const safeTitle = title.replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${safeTitle}</title>
<style>
  body { font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; max-width: 780px; margin: 0 auto; padding: 40px 24px; color: #24292f; line-height: 1.7; }
  h1 { font-size: 1.6em; border-bottom: 1px solid #e1e4e8; padding-bottom: .3em; }
  h2 { border-bottom: 1px solid #e1e4e8; padding-bottom: .3em; }
  a { color: #0969da; }
  code { background: #f6f8fa; padding: .15em .35em; border-radius: 6px; font-size: .9em; }
  pre { background: #f6f8fa; padding: 14px; border-radius: 8px; overflow: auto; }
  pre code { background: none; padding: 0; }
  blockquote { border-left: 4px solid #d0d7de; margin-left: 0; padding-left: 14px; color: #57606a; }
  table { border-collapse: collapse; }
  th, td { border: 1px solid #d0d7de; padding: 6px 12px; }
  img { max-width: 100%; }
  hr { border: none; border-top: 1px solid #e1e4e8; }
</style>
</head>
<body>
${body}
</body>
</html>`
}

export function mdToPlainText(src: string): string {
  let html: string
  try {
    html = marked.parse(src ?? '', { async: false }) as string
  } catch {
    return (src ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
  }
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}
