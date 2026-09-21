import { autoUpdater, UpdateInfo } from 'electron-updater'
import { app, BrowserWindow, dialog } from 'electron'
import log from 'electron-log'

autoUpdater.logger = log
autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = true

/** 初始化自动更新：监听事件，暴露 checkForUpdates 到 IPC。 */
export function initUpdater(mainWindow: BrowserWindow) {
  // ── 事件 ──────────────────────────────────────────
  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('updater:status', 'checking')
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    mainWindow.webContents.send('updater:status', 'available', {
      version: info.version,
      releaseDate: info.releaseDate,
      releaseNotes: info.releaseNotes,
    })
    // 弹窗询问是否下载
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: '发现新版本',
        message: `Lumina ${info.version} 已发布`,
        detail: typeof info.releaseNotes === 'string' ? info.releaseNotes.slice(0, 500) : '是否立即下载？',
        buttons: ['下载', '稍后'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.downloadUpdate()
      })
  })

  autoUpdater.on('update-not-available', () => {
    mainWindow.webContents.send('updater:status', 'up-to-date')
  })

  autoUpdater.on('download-progress', (progress) => {
    mainWindow.webContents.send('updater:status', 'downloading', {
      percent: Math.round(progress.percent),
      transferred: progress.transferred,
      total: progress.total,
    })
  })

  autoUpdater.on('update-downloaded', () => {
    mainWindow.webContents.send('updater:status', 'downloaded')
    dialog
      .showMessageBox(mainWindow, {
        type: 'info',
        title: '更新已就绪',
        message: '新版本已下载完成，重启后生效。',
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall()
      })
  })

  autoUpdater.on('error', (err) => {
    log.error('AutoUpdater error:', err)
    mainWindow.webContents.send('updater:status', 'error', { message: err.message })
  })

  // ── IPC ──────────────────────────────────────────
  const { ipcMain } = require('electron')

  ipcMain.handle('updater:check', async () => {
    try {
      await autoUpdater.checkForUpdates()
    } catch (err: any) {
      log.error('Check for updates failed:', err)
      mainWindow.webContents.send('updater:status', 'error', { message: err.message })
    }
  })

  ipcMain.handle('updater:download', () => {
    autoUpdater.downloadUpdate()
  })

  ipcMain.handle('updater:install', () => {
    autoUpdater.quitAndInstall()
  })

  // ── 启动后延迟检查（30s） ─────────────────────────
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {})
  }, 30_000)
}

/** 获取当前版本号 */
export function getCurrentVersion(): string {
  return app.getVersion()
}
