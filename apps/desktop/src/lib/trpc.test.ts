import { describe, it, expect, beforeEach } from 'vitest'
import { setServerUrl, getServerUrlRaw, trpc } from './trpc'

describe('trpc server url', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('stores and reads the configured url', () => {
    setServerUrl('http://192.168.1.10:3001')
    expect(getServerUrlRaw()).toBe('http://192.168.1.10:3001')
  })

  it('clears the url when null is passed', () => {
    setServerUrl('http://192.168.1.10:3001')
    setServerUrl(null)
    expect(getServerUrlRaw()).toBe('')
  })

  it('rebuilds the trpc client on change so new url takes effect immediately', () => {
    const before = trpc
    setServerUrl('http://192.168.1.10:3001')
    expect(trpc).not.toBe(before)
  })

  it('rebuild only happens once for repeated same-value sets', () => {
    const before = trpc
    setServerUrl('http://same:3001')
    const afterFirst = trpc
    setServerUrl('http://same:3001')
    expect(afterFirst).not.toBe(before)
    expect(trpc).toBe(afterFirst)
  })
})