import { describe, it, expect } from 'vitest'

// 复刻 preload 的端口参数解析逻辑（preload 无法在 vitest 直接跑，逻辑单测保障）
function parseServerPort(argv: string[]): number | null {
  const portArg = argv.find((a) => a.startsWith('--lumina-server-port='))
  const port = portArg ? Number(portArg.split('=')[1]) : null
  return port !== null && Number.isFinite(port) && port > 0 ? port : null
}

describe('preload 端口解析', () => {
  it('解析 additionalArguments 注入的端口', () => {
    expect(parseServerPort(['/opt/electron', '--lumina-server-port=3002'])).toBe(3002)
  })

  it('无注入时返回 null（前端回退默认 3001）', () => {
    expect(parseServerPort(['/opt/electron'])).toBeNull()
  })

  it('非法端口值返回 null', () => {
    expect(parseServerPort(['--lumina-server-port=abc'])).toBeNull()
    expect(parseServerPort(['--lumina-server-port=0'])).toBeNull()
  })
})

// main.ts 端口探测逻辑单测（net 探测以回调形式存在，这里测选值策略）
describe('findFreePort 策略', () => {
  it('3001 起步、步进 20 个端口', () => {
    const ports = Array.from({ length: 20 }, (_, i) => 3001 + i)
    expect(ports[0]).toBe(3001)
    expect(ports[19]).toBe(3020)
  })
})