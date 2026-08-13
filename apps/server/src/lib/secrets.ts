import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { homedir } from 'node:os'

const DATA_DIR = path.join(homedir(), 'Library', 'Application Support', 'com.lumina.app')
const KEY_FILE = path.join(DATA_DIR, 'lumina.key')

const ALGO = 'aes-256-gcm'
const PREFIX = 'enc:v1:'

function getOrCreateKey(): Buffer {
  try {
    if (fs.existsSync(KEY_FILE)) {
      const buf = Buffer.from(fs.readFileSync(KEY_FILE, 'utf8').trim(), 'base64')
      if (buf.length === 32) return buf
    }
  } catch {
    /* fall through to regenerate */
  }
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  const key = crypto.randomBytes(32)
  fs.writeFileSync(KEY_FILE, key.toString('base64'), { mode: 0o600 })
  return key
}

export function encryptSecret(plaintext: string): string {
  if (!plaintext) return ''
  const key = getOrCreateKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGO, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export function decryptSecret(stored: string): string {
  if (!stored) return ''
  if (!stored.startsWith(PREFIX)) return stored
  const parts = stored.slice(PREFIX.length).split(':')
  if (parts.length !== 3) return ''
  try {
    const [ivB64, tagB64, dataB64] = parts
    const decipher = crypto.createDecipheriv(ALGO, getOrCreateKey(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
    return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
  } catch {
    return ''
  }
}

export function maskSecret(plaintext: string): string {
  if (!plaintext) return ''
  if (plaintext.length <= 4) return '****'
  return `****${plaintext.slice(-4)}`
}
