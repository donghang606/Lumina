#!/usr/bin/env node
/**
 * Electron 开发/打包编排：
 *   dev         —— 起 vite(1420) + tsx watch server(3001) + electron（开发模式）
 *   --no-rebuild —— 复用已构建产物直接拉起 electron（调试主进程用）
 *   --package   —— electron-builder 打 dmg
 */
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import net from 'node:net'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '../../..')
const doPackage = process.argv.includes('--package')
const noRebuild = process.argv.includes('--no-rebuild')

const pnpm = (args, opts = {}) => {
  const r = spawnSync('pnpm', args, { stdio: 'inherit', cwd: root, shell: process.platform === 'win32', ...opts })
  if (r.status !== 0) throw new Error(`pnpm ${args.join(' ')} failed with ${r.status}`)
}

const isFree = (port) =>
  new Promise((resolve) => {
    const s = net.createServer()
    s.once('error', () => resolve(false))
    s.once('listening', () => s.close(() => resolve(true)))
    s.listen(port, '127.0.0.1')
  })

async function dev() {
  if (!noRebuild) {
    console.log('[dev] building electron main/preload...')
    pnpm(['--filter', '@lumina/electron', 'build'])
  }
  const distMain = path.join(root, 'apps/electron/dist/main.js')
  if (!existsSync(distMain)) throw new Error('electron dist missing, run: pnpm --filter @lumina/electron build')

  console.log('[dev] starting vite...')
  const vite = spawn('pnpm', ['--filter', '@lumina/desktop', 'dev'], { stdio: 'inherit', shell: process.platform === 'win32', cwd: root })
  await new Promise((r) => setTimeout(r, 2500))

  console.log('[dev] starting server (tsx watch)...')
  const server = spawn('pnpm', ['--filter', '@lumina/server', 'dev'], { stdio: 'inherit', shell: process.platform === 'win32', cwd: root })
  await new Promise((r) => setTimeout(r, 2500))

  console.log('[dev] launching electron...')
  const electronBin = path.join(root, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  const electron = spawn(electronBin, [path.join(root, 'apps/electron')], {
    stdio: 'inherit',
    cwd: path.join(root, 'apps/electron'),
    env: { ...process.env, LUMINA_ELECTRON_DEV: '1', LUMINA_SERVER_PORT: '3001' },
  })

  const cleanup = () => {
    for (const p of [vite, server, electron]) {
      try { p.kill('SIGTERM') } catch {}
    }
    setTimeout(() => process.exit(0), 300)
  }
  process.on('SIGINT', cleanup)
  electron.once('exit', cleanup)
  vite.once('exit', cleanup)
  server.once('exit', cleanup)
}

async function packageApp() {
  console.log('[package] building server + electron main + web...')
  pnpm(['--filter', '@lumina/server', 'build'])
  pnpm(['--filter', '@lumina/electron', 'build'])
  pnpm(['--filter', '@lumina/desktop', 'build'])

  const webDist = path.join(root, 'apps/desktop/dist')
  if (!existsSync(webDist)) throw new Error('web dist missing')
  mkdirSync(path.join(root, 'apps/electron/staging/web'), { recursive: true })
  spawnSync('cp', ['-R', webDist, path.join(root, 'apps/electron/staging/web/dist')], { stdio: 'inherit' })
  spawnSync('cp', ['-R', path.join(root, 'apps/server/dist'), path.join(root, 'apps/electron/staging/server')], { stdio: 'inherit' })
  spawnSync('cp', ['-R', path.join(root, 'apps/server/node_modules'), path.join(root, 'apps/electron/staging/server/node_modules')], { stdio: 'inherit' })

  console.log('[package] running electron-builder...')
  const electronBuilder = path.join(root, 'node_modules/.bin/electron-builder')
  const r = spawnSync(electronBuilder, ['--mac', 'dmg', '--config', 'builder.yml'], {
    stdio: 'inherit',
    cwd: path.join(root, 'apps/electron'),
  })
  if (r.status !== 0) throw new Error(`electron-builder failed: ${r.status}`)
  console.log('[package] done: apps/electron/dist/')
}

if (doPackage) {
  packageApp().catch((e) => { console.error(e); process.exit(1) })
} else {
  if (!(await isFree(1420))) console.warn('[dev] warning: port 1420 in use, vite may fail')
  dev().catch((e) => { console.error(e); process.exit(1) })
}
