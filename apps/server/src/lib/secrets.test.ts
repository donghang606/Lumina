import { describe, it, expect } from 'vitest'
import { encryptSecret, decryptSecret, maskSecret } from './secrets.js'

describe('secrets', () => {
  it('roundtrips an api key', () => {
    const enc = encryptSecret('sk-test-abc123456789')
    expect(enc.startsWith('enc:v1:')).toBe(true)
    expect(enc).not.toContain('sk-test')
    expect(decryptSecret(enc)).toBe('sk-test-abc123456789')
  })

  it('is randomized (different ciphertext each time)', () => {
    const a = encryptSecret('same-value')
    const b = encryptSecret('same-value')
    expect(a).not.toBe(b)
    expect(decryptSecret(a)).toBe('same-value')
    expect(decryptSecret(b)).toBe('same-value')
  })

  it('passes through legacy plaintext', () => {
    expect(decryptSecret('sk-legacy-raw')).toBe('sk-legacy-raw')
  })

  it('handles empty strings', () => {
    expect(encryptSecret('')).toBe('')
    expect(decryptSecret('')).toBe('')
  })

  it('returns empty on corrupted ciphertext', () => {
    expect(decryptSecret('enc:v1:!!!invalid!!!')).toBe('')
  })

  it('masks keys', () => {
    expect(maskSecret('sk-abcdef1234')).toBe('****1234')
    expect(maskSecret('ab')).toBe('****')
    expect(maskSecret('')).toBe('')
  })
})
