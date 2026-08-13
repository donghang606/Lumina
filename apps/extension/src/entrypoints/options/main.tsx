import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { browser } from 'wxt/browser'

const DEFAULT = 'http://localhost:3001'

function App() {
  const [server, setServer] = useState(DEFAULT)
  const [saved, setSaved] = useState(false)
  const [testing, setTesting] = useState(false)
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    void (async () => {
      const s = await browser.storage.local.get('serverUrl')
      if (typeof s.serverUrl === 'string' && s.serverUrl) setServer(s.serverUrl)
    })()
  }, [])

  const save = async () => {
    const url = server.trim().replace(/\/+$/, '') || DEFAULT
    await browser.storage.local.set({ serverUrl: url })
    setServer(url)
    setSaved(true)
    setStatus(null)
    setTimeout(() => setSaved(false), 1600)
  }

  const test = async () => {
    const url = server.trim().replace(/\/+$/, '') || DEFAULT
    setTesting(true)
    setStatus(null)
    try {
      const res = await fetch(`${url}/health`)
      const json = await res.json()
      if (res.ok && json.status === 'ok') {
        setStatus({ ok: true, text: `连接正常（${url}/health）` })
      } else {
        setStatus({ ok: false, text: `服务端响应异常：HTTP ${res.status}` })
      }
    } catch {
      setStatus({ ok: false, text: `无法连接 ${url}，请确认 Lumina 桌面端已启动` })
    } finally {
      setTesting(false)
    }
  }

  return (
    <>
      <style>{`
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f6fa; margin: 0; padding: 24px; }
        .card { max-width: 460px; margin: 0 auto; background: #fff; border: 1px solid #e3e6ef; border-radius: 12px; padding: 20px 22px; box-shadow: 0 2px 12px rgba(30,40,80,0.06); }
        h1 { font-size: 16px; margin: 0 0 4px; }
        p.desc { margin: 0 0 16px; font-size: 13px; color: #667; }
        label { display: block; font-size: 13px; margin-bottom: 6px; color: #333; }
        input { width: 100%; box-sizing: border-box; padding: 8px 10px; border: 1px solid #ccd3e0; border-radius: 8px; font-size: 13px; }
        input:focus { outline: none; border-color: #4c6fff; }
        .row { display: flex; gap: 8px; margin-top: 14px; }
        button { padding: 8px 14px; border-radius: 8px; font-size: 13px; cursor: pointer; border: 1px solid #ccd3e0; background: #fff; }
        button.primary { background: #4c6fff; color: #fff; border-color: #4c6fff; }
        button.primary:disabled { opacity: 0.6; cursor: default; }
        .status { margin-top: 12px; font-size: 13px; }
        .status.ok { color: #16a34a; }
        .status.err { color: #dc2626; }
        .status.saved { color: #16a34a; }
        .hint { margin-top: 14px; font-size: 12px; color: #99a; line-height: 1.6; }
      `}</style>

      <div className="card">
        <h1>Lumina 收藏 · 设置</h1>
        <p className="desc">配置收藏内容要发送到哪台本地服务。</p>

        <label htmlFor="server">Lumina 服务地址</label>
        <input
          id="server"
          value={server}
          onChange={(e) => setServer(e.target.value)}
          placeholder={DEFAULT}
        />

        <div className="row">
          <button className="primary" onClick={() => void save()}>保存</button>
          <button onClick={() => void test()} disabled={testing}>{testing ? '测试中…' : '测试连接'}</button>
        </div>

        {status && <div className={`status ${status.ok ? 'ok' : 'err'}`}>{status.text}</div>}
        {saved && <div className="status saved">已保存</div>}

        <div className="hint">
          默认连接桌面端本地服务（http://localhost:3001）。如果你在 Tauri 端启用了本地代理（http://localhost:3002），可在此填入代理地址。
        </div>
      </div>
    </>
  )
}

createRoot(document.getElementById('app')!).render(<App />)
