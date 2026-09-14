import { app, BrowserWindow, shell } from 'electron'
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import { migrateLegacyData } from './migrate.js'

declare const __dirname: string
const isDev = process.env.LUMINA_ELECTRON_DEV === '1'

const DEV_FRONTEND_URL = process.env.LUMINA_FRONTEND_URL ?? 'http://localhost:1420'
const HEALTH_TIMEOUT_MS = 30_000

let serverChild: ChildProcess | null = null
let mainWindow: BrowserWindow | null = null
let serverPort = 3001

/** 找一个空闲端口（3001 起，避开常见占用） */
async function findFreePort(preferred: number): Promise<number> {
  const tryPort = (port: number) =>
    new Promise<boolean>((resolve) => {
      const srv = net.createServer()
      srv.once('error', () => resolve(false))
      srv.once('listening', () => srv.close(() => resolve(true)))
      srv.listen(port, '127.0.0.1')
    })
  for (let p = preferred; p < preferred + 20; p++) {
    if (await tryPort(p)) return p
  }
  throw new Error(`No free port in range ${preferred}-${preferred + 19}`)
}

/** 轮询 server /health 直至就绪 */
async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(1500) })
      if (res.ok) return
    } catch {
      /* server 尚未监听，继续等 */
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Server health check timed out after ${timeoutMs}ms on port ${port}`)
}

/** 生产模式：从 resources/server-bundle.tar 首启解压 server 到 userData/server（版本指纹防重复） */
function extractServerBundle(): string {
  const resources = process.resourcesPath!
  const tarPath = path.join(resources, 'server-bundle.tar')
  const targetDir = path.join(app.getPath('userData'), 'server')
  const marker = path.join(targetDir, '.bundle-version')
  const appVersion = app.getVersion()

  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === appVersion && fs.existsSync(path.join(targetDir, 'dist/index.js'))) {
    return targetDir
  }
  if (!fs.existsSync(tarPath)) throw new Error(`server bundle not found: ${tarPath}`)

  console.log(`[electron] extracting server bundle to ${targetDir}`)
  fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })
  const r = spawnSync('tar', ['-xf', tarPath, '-C', targetDir], { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`server bundle extract failed: ${r.status}`)
  fs.writeFileSync(marker, appVersion)
  return targetDir
}

/** 在打包目录中定位 server 入口与前端产物 */
function resolvePackagedPaths(): { serverEntry: string; webDir: string | null } {
  const resources = process.resourcesPath!
  const serverDir = extractServerBundle()
  return {
    serverEntry: path.join(serverDir, 'dist/index.js'),
    webDir: fs.existsSync(path.join(resources, 'web/dist')) ? path.join(resources, 'web/dist') : null,
  }
}

/** 解析运行 server 的 Node 可执行文件：优先系统 node（避免 Electron 内置 Node 的 js2c loader 对第三方 CJS/ESM 混合包的兼容问题），回退 Electron 自身 */
function resolveNodeRuntime(): string {
  try {
    const which = spawnSync('/usr/bin/env', ['bash', '-lc', 'command -v node'], { encoding: 'utf8' })
    const p = which.stdout?.trim()
    if (p && fs.existsSync(p)) return p
  } catch {}
  return process.execPath
}

function startServer(port: number): ChildProcess {
  const entry = isDev
    ? path.join(__dirname, '../../server/dist/index.js')
    : resolvePackagedPaths().serverEntry
  const node = resolveNodeRuntime()
  const child = spawn(node, [entry], {
    cwd: path.dirname(entry),
    env: {
      ...process.env,
      LUMINA_PORT: String(port),
      LUMINA_DATA_DIR: app.getPath('userData'),
      NODE_ENV: 'production',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })
  child.stdout?.on('data', (d: Buffer) => process.stdout.write(`[server] ${d}`))
  child.stderr?.on('data', (d: Buffer) => process.stderr.write(`[server] ${d}`))
  child.once('exit', (code) => {
    console.log(`[electron] server exited with code ${code}`)
    serverChild = null
  })
  return child
}

function createWindow(frontendUrl: string) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    title: 'Lumina',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      additionalArguments: [`--lumina-server-port=${serverPort}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // 外链走系统浏览器
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://127.0.0.1') || url.startsWith('http://localhost')) return { action: 'allow' }
    void shell.openExternal(url)
    return { action: 'deny' }
  })

  void mainWindow.loadURL(frontendUrl)

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function bootstrap() {
  // 老库迁移（一次性）：Tauri com.lumina.app → userData/data
  try {
    const result = migrateLegacyData(app.getPath('userData'))
    if (result && result.migrated.length > 0) {
      console.log(`[electron] migrated legacy data: ${result.migrated.join(', ')}`)
    }
  } catch (err) {
    console.warn('[electron] legacy data migration skipped:', err)
  }

  serverPort = await findFreePort(3001)
  console.log(`[electron] starting server on port ${serverPort}`)

  serverChild = startServer(serverPort)
  await waitForHealth(serverPort, HEALTH_TIMEOUT_MS)
  console.log(`[electron] server healthy on ${serverPort}`)

  if (isDev) {
    createWindow(DEV_FRONTEND_URL)
  } else {
    // 生产：server 进程内托管静态前端（staging/web/dist 复制到 resources/web）
    const { webDir } = resolvePackagedPaths()
    if (webDir && fs.existsSync(webDir)) {
      process.env.LUMINA_WEB_DIST = webDir
      createWindow(`http://127.0.0.1:${serverPort}/`)
    } else {
      createWindow(`http://127.0.0.1:${serverPort}/`)
    }
  }
}

app.whenReady().then(() => {
  // 单实例锁：避免多开导致端口与数据目录冲突
  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  bootstrap().catch((err) => {
    console.error('[electron] bootstrap failed:', err)
    // 给用户可见错误后再退出
    if (mainWindow) mainWindow.webContents.executeJavaScript(
      `document.body.innerHTML = '<pre style="padding:2em;font:14px monospace">Lumina 启动失败: ${String(err).replace(/'/g, '')}</pre>'`
    ).catch(() => {})
    setTimeout(() => app.quit(), 500)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && isDev) void bootstrap()
  })
})

function cleanup() {
  if (serverChild && !serverChild.killed) {
    serverChild.kill('SIGTERM')
    const forceTimer = setTimeout(() => serverChild?.kill('SIGKILL'), 3000)
    serverChild.once('exit', () => clearTimeout(forceTimer))
  }
}

app.on('before-quit', cleanup)
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
  else cleanup() // mac 关窗即停 server，下次启动重建
})
