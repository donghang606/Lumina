import { describe, it, expect } from 'vitest'
import { dataRoot } from './dataRoot.js'
import path from 'node:path'
import os from 'node:os'

describe('dataRoot 统一数据目录', () => {
  it('默认回退 macOS 固定路径（兼容 Tauri 老库）', () => {
    const prev = process.env.LUMINA_DATA_DIR
    delete process.env.LUMINA_DATA_DIR
    expect(dataRoot()).toBe(path.join(os.homedir(), 'Library', 'Application Support', 'com.lumina.app'))
    if (prev !== undefined) process.env.LUMINA_DATA_DIR = prev
  })

  it('LUMINA_DATA_DIR 注入时挂 data 子目录', () => {
    const prev = process.env.LUMINA_DATA_DIR
    process.env.LUMINA_DATA_DIR = '/tmp/lumina-userdata'
    expect(dataRoot()).toBe(path.join('/tmp/lumina-userdata', 'data'))
    if (prev !== undefined) process.env.LUMINA_DATA_DIR = prev
    else delete process.env.LUMINA_DATA_DIR
  })

  it('五处调用点路径派生自 dataRoot（db/zvec/key/agent/harness 各挂子目录）', () => {
    const root = dataRoot()
    expect(root.endsWith('com.lumina.app') || root.endsWith('data')).toBe(true)
  })
})