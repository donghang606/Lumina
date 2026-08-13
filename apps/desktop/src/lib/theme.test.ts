import { describe, it, expect } from 'vitest'
import { SKINS, skinMode, isSkin } from './theme'

describe('skinMode', () => {
  it('glass 皮肤固定浅色', () => {
    expect(skinMode('glass')).toBe('light')
  })

  it('nothing / bloomberg / effect 皮肤固定深色', () => {
    expect(skinMode('nothing')).toBe('dark')
    expect(skinMode('bloomberg')).toBe('dark')
    expect(skinMode('effect')).toBe('dark')
  })
})

describe('isSkin', () => {
  it('识别合法皮肤值', () => {
    expect(isSkin('glass')).toBe(true)
    expect(isSkin('nothing')).toBe(true)
    expect(isSkin('bloomberg')).toBe(true)
    expect(isSkin('effect')).toBe(true)
    expect(isSkin('weird')).toBe(false)
    expect(isSkin(undefined)).toBe(false)
    expect(isSkin('glass')).toBe(true)
  })

  it('SKINS 覆盖全部皮肤且有标签', () => {
    for (const [key, info] of Object.entries(SKINS)) {
      expect(key).toMatch(/^(glass|nothing|bloomberg|effect)$/)
      expect(info.label.length).toBeGreaterThan(0)
    }
  })
})
