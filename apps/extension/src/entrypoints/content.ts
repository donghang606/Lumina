import { defineContentScript } from 'wxt/sandbox'
import { browser } from 'wxt/browser'

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

      // Send the raw DOM so the server-side collector can extract & convert to markdown.
      // Also send a plain-text fallback for robustness.
      const clone = document.documentElement.cloneNode(true) as Document
      ;(clone as any).querySelectorAll?.('script,style,noscript,iframe,nav,footer,aside,form').forEach((n: any) => n.remove())
      const html = (clone.documentElement?.outerHTML ?? document.documentElement.outerHTML).slice(0, 2_000_000)
      const text = document.body?.innerText?.trim() ?? ''

      return { url, title, siteName, favicon, html, text }
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
    __LUMINA_COLLECT__?: () => { url: string; title: string; siteName: string; favicon: string | null; html: string; text: string }
  }
}