import { contextBridge, ipcRenderer } from 'electron'

// 最小暴露面：后端端口 + 应用版本。前端据此拼 tRPC/AI/SSE URL。
// 端口经 main 的 additionalArguments 注入（process.argv 尾部）
const portArg = process.argv.find((a) => a.startsWith('--lumina-server-port='))
const serverPort = portArg ? Number(portArg.split('=')[1]) : null

contextBridge.exposeInMainWorld('lumina', {
  serverPort,
  electron: true,
  // 自动更新 API
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    onStatus: (cb: (status: string, data?: any) => void) => {
      ipcRenderer.on('updater:status', (_event, status, data) => cb(status, data))
    },
  },
})
