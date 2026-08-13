import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'

interface CollectData {
  url: string
  title: string
  siteName: string
  favicon: string | null
  content: string
}

const SERVER_DEFAULT = 'http://localhost:3001'

function App() {
  const [data, setData] = useState<CollectData | null>(null)
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [duplicate, setDuplicate] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void (async () => {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true })
      if (!tab?.id) return
      const res = (await browser.tabs.sendMessage(tab.id, { type: 'LUMINA_COLLECT' }).catch(() => undefined)) as CollectData | undefined
      const fallback = { url: tab.url ?? '', title: tab.title ?? '', siteName: '', favicon: null, content: '' }
      const d = res && res.url ? res : fallback
      setData(d)
      setTitle(d.title)
    })()
  }, [])

  const save = async () => {
    if (!data || saving) return
    setSaving(true)
    setError('')
    try {
      const settings = await browser.storage.local.get('serverUrl')
      const server = (settings.serverUrl as string) || SERVER_DEFAULT
      const res = await fetch(`${server}/api/extension/collect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: data.url,
          title: title.trim() || data.title,
          content: data.content,
          siteName: data.siteName,
          favicon: data.favicon,
          note: note.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      setDuplicate(Boolean(json.duplicate))
      setDone(true)
    } catch (e) {
      const settings = await browser.storage.local.get('serverUrl')
      const server = (settings.serverUrl as string) || SERVER_DEFAULT
      setError(`收藏失败：${e instanceof Error ? e.message : String(e)}。请确认 Lumina 桌面端已启动（${server}）`)
    } finally {
      setSaving(false)
    }
  }

  if (done) {
    return (
      <div className="done">
        <div className="icon">{duplicate ? '♻️' : '✅'}</div>
        <div className="msg">{duplicate ? '该页面已收藏过' : '已收藏到 Lumina'}</div>
        {duplicate && <div className="dup">重复收藏不会重复入库</div>}
        <div style={{ marginTop: 16 }}>
          <button className="primary" onClick={() => window.close()}>完成</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <header>
        {data?.favicon ? <img className="logo" src={data.favicon} alt="" style={{ width: 18, height: 18 }} /> : <span className="logo">🔖</span>}
        <h1>收藏到 Lumina</h1>
        <span className="status">{data?.siteName || ''}</span>
      </header>
      <div className="body">
        <div className="url">{data?.url}</div>
        <div className="field">
          <label>标题</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field">
          <label>备注（可选）</label>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="为什么收藏这篇？" />
        </div>
        {error && <div className="err">{error}</div>}
        <div className="actions">
          <button className="ghost" onClick={() => window.close()}>取消</button>
          <button className="primary" disabled={saving} onClick={() => void save()}>
            {saving ? '收藏中…' : '确认收藏'}
          </button>
        </div>
      </div>
    </>
  )
}

createRoot(document.getElementById('app')!).render(<App />)