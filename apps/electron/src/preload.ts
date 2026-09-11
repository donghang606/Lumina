import { contextBridge } from 'electron'

// 最小暴露面：后端端口 + 应用版本。前端据此拼 tRPC/AI/SSE URL。
// 端口经 main 的 additionalArguments 注入（process.argv 尾部）
const portArg = process.argv.find((a) => a.startsWith('--lumina-server-port='))
const serverPort = portArg ? Number(portArg.split('=')[1]) : null

contextBridge.exposeInMainWorld('lumina', {
  serverPort,
  electron: true,
})
