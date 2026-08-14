import { parseHTML } from 'linkedom'
import TurndownService from 'turndown'

export interface CollectInput {
  url: string
  html?: string
  text?: string
}

export interface CollectResult {
  title?: string
  content: string
  siteName?: string
}

export interface Collector {
  name: string
  collect(input: CollectInput): Promise<CollectResult>
}

const SCRUB = 'script,style,noscript,iframe,nav,footer,aside,form,header,noscript'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})
turndown.remove(['script', 'style', 'noscript', 'iframe', 'nav', 'footer', 'aside', 'form'])

export const htmlCollector: Collector = {
  name: 'html',
  async collect(input) {
    const doc = parseHTML(input.html ?? '').document
    const title =
      doc.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="twitter:title"]')?.getAttribute('content') ||
      doc.title?.trim() ||
      ''
    const siteName =
      doc.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
      doc.querySelector('meta[name="application-name"]')?.getAttribute('content') ||
      ''
    let main = (doc.querySelector('main') ?? doc.body ?? doc) as HTMLElement
    ;(main as any).querySelectorAll?.(SCRUB).forEach((n: any) => n.remove())
    let markdown = ''
    try {
      markdown = turndown.turndown(main)
    } catch {
      markdown = (main.textContent ?? '').replace(/\s+/g, ' ').trim()
    }
    return {
      title: title || undefined,
      content: markdown.replace(/\n{3,}/g, '\n\n').trim() || (main.textContent ?? '').replace(/\s+/g, ' ').trim(),
      siteName: siteName || undefined,
    }
  },
}

export const textCollector: Collector = {
  name: 'text',
  async collect(input) {
    const clean = (input.text ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    return { content: clean }
  },
}

const registry: Record<string, Collector> = { html: htmlCollector, text: textCollector }

export function getCollector(name?: string): Collector {
  return (name && registry[name]) || htmlCollector
}

export async function collectDocument(input: CollectInput & { collector?: string }): Promise<CollectResult> {
  const c = getCollector(input.collector)
  if (c.name === 'html' && input.html) return htmlCollector.collect(input)
  return textCollector.collect(input)
}