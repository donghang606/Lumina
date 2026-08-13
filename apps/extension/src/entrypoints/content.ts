import { defineContentScript } from 'wxt/sandbox'
import { browser } from 'wxt/browser'
import { Readability } from '@mozilla/readability'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    const collect = () => {
      const url = window.location.href
      const title = document.title || ''
      const siteName =
        document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ||
        document.querySelector('meta[name="application-name"]')?.getAttribute('content') ||
        new URL(url).hostname
      const faviconRaw =
        document.querySelector('link[rel="icon"]')?.getAttribute('href') ||
        document.querySelector('link[rel="shortcut icon"]')?.getAttribute('href') ||
        ''
      const favicon = faviconRaw ? new URL(faviconRaw, url).href : null

      let content = ''
      try {
        const clone = document.documentElement.cloneNode(true) as Document
        ;(clone.body as HTMLElement)?.querySelectorAll?.('script,style,noscript,iframe,nav,footer,aside,form').forEach((n) => n.remove())
        const article = new Readability(clone).parse()
        content = article?.textContent?.trim() ?? ''
      } catch {
        content = document.body?.innerText?.trim() ?? ''
      }

      return { url, title, siteName, favicon, content }
    }

    window.__LUMINA_COLLECT__ = collect

    browser.runtime.onMessage.addListener((msg: unknown) => {
      if ((msg as { type?: string })?.type === 'LUMINA_COLLECT') {
        return Promise.resolve(collect())
      }
    })
  },
})

declare global {
  interface Window {
    __LUMINA_COLLECT__?: () => { url: string; title: string; siteName: string; favicon: string | null; content: string }
  }
}