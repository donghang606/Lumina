import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { migrateLegacyData, __seedLegacyDir } from './migrate.js'

let tmp: string

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-migrate-'))
})

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true })
})

describe('老库迁移（Tauri → Electron）', () => {
  it('老库完整时一次性迁移 5 项数据', () => {
    const legacy = path.join(tmp, 'legacy')
    __seedLegacyDir(legacy, ['lumina.db', 'lumina.key', 'agent/SOUL.md', 'deepseek-harness/home/settings.yaml'])
    fs.mkdirSync(path.join(legacy, 'zvec/collection'), { recursive: true })
    fs.writeFileSync(path.join(legacy, 'zvec/collection/meta.bin'), 'x')

    const userData = path.join(tmp, 'userData')
    fs.mkdirSync(userData, { recursive: true })

    const r = migrateLegacyData(userData, legacy)
    expect(r).not.toBeNull()
    expect(r!.migrated.sort()).toEqual(['agent', 'deepseek-harness', 'lumina.db', 'lumina.key', 'zvec'])
    expect(fs.existsSync(path.join(userData, 'data/lumina.db'))).toBe(true)
    expect(fs.existsSync(path.join(userData, 'data/agent/SOUL.md'))).toBe(true)
    expect(fs.existsSync(path.join(userData, 'data/zvec/collection/meta.bin'))).toBe(true)
  })

  it('目标已有 lumina.db 时不迁移（绝不覆盖）', () => {
    const legacy = path.join(tmp, 'legacy')
    __seedLegacyDir(legacy, ['lumina.db', 'lumina.key'])
    const userData = path.join(tmp, 'userData')
    fs.mkdirSync(path.join(userData, 'data'), { recursive: true })
    fs.writeFileSync(path.join(userData, 'data/lumina.db'), 'new-db')

    const r = migrateLegacyData(userData, legacy)
    expect(r).toBeNull()
    expect(fs.readFileSync(path.join(userData, 'data/lumina.db'), 'utf8')).toBe('new-db')
  })

  it('老库不存在返回 null', () => {
    const r = migrateLegacyData(path.join(tmp, 'userData'), path.join(tmp, 'nonexistent'))
    expect(r).toBeNull()
  })

  it('重复调用幂等（第二次不再迁移）', () => {
    const legacy = path.join(tmp, 'legacy')
    __seedLegacyDir(legacy, ['lumina.db'])
    const userData = path.join(tmp, 'userData')
    fs.mkdirSync(userData, { recursive: true })

    const first = migrateLegacyData(userData, legacy)
    expect(first!.migrated).toEqual(['lumina.db'])
    const second = migrateLegacyData(userData, legacy)
    expect(second).toBeNull()
  })

  it('老库无数据文件（仅缓存类）不迁移', () => {
    const legacy = path.join(tmp, 'legacy')
    __seedLegacyDir(legacy, ['Cache', 'Logs/something.log'])
    const r = migrateLegacyData(path.join(tmp, 'userData'), legacy)
    expect(r).toBeNull()
  })
})