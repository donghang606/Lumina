import path from 'node:path'
import os from 'node:os'

/**
 * 统一数据根目录：
 * - Electron 生产：LUMINA_DATA_DIR（userData）下挂 data 子目录
 * - 开发/裸跑：~/Library/Application Support/com.lumina.app（与 Tauri 壳老库兼容）
 */
export function dataRoot(): string {
  if (process.env.LUMINA_DATA_DIR) {
    return path.join(process.env.LUMINA_DATA_DIR, 'data')
  }
  return path.join(os.homedir(), 'Library', 'Application Support', 'com.lumina.app')
}
