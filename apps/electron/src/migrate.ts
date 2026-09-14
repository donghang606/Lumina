import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

/** Tauri 时代老数据目录（db/key/zvec/agent/harness） */
export function legacyDataDir(): string {
  return path.join(os.homedir(), 'Library', 'Application Support', 'com.lumina.app')
}

/**
 * 一次性迁移老库到 userData/data。
 * 仅当：老目录存在数据 且 目标尚未初始化（无 lumina.db）。
 * 返回迁移明细；无需迁移返回 null。legacyDir 可注入（单测）。
 */
export function migrateLegacyData(
  userDataDir: string,
  legacyDirInput?: string,
): { migrated: string[]; skipped: string[] } | null {
  const legacy = legacyDirInput ?? legacyDataDir()
  if (!fs.existsSync(legacy)) return null

  const targetData = path.join(userDataDir, 'data')
  const targetDb = path.join(targetData, 'lumina.db')
  if (fs.existsSync(targetDb)) return null // 已有库，绝不覆盖

  // 老库也空 → 无需迁移
  const entries = fs.readdirSync(legacy)
  const dataEntries = entries.filter((e) => ['lumina.db', 'lumina.key', 'zvec', 'agent', 'deepseek-harness'].includes(e))
  if (dataEntries.length === 0) return null

  fs.mkdirSync(targetData, { recursive: true })
  const migrated: string[] = []
  const skipped: string[] = []

  for (const name of dataEntries) {
    const src = path.join(legacy, name)
    const dst = path.join(targetData, name)
    if (fs.existsSync(dst)) {
      skipped.push(name)
      continue
    }
    const stat = fs.statSync(src)
    if (stat.isDirectory()) {
      fs.cpSync(src, dst, { recursive: true })
    } else {
      fs.copyFileSync(src, dst)
    }
    migrated.push(name)
  }

  return { migrated, skipped }
}

/** 单测辅助：在指定目录伪造老库结构 */
export function __seedLegacyDir(dir: string, files: string[]): void {
  fs.mkdirSync(dir, { recursive: true })
  for (const f of files) {
    const p = path.join(dir, f)
    if (f.includes('/')) {
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, 'x')
    } else {
      fs.writeFileSync(p, 'x')
    }
  }
}

export const _internal = { spawnSync }
