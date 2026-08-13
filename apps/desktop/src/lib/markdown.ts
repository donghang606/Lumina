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
