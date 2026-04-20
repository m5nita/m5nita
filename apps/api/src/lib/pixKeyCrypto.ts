import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const KEY_LENGTH = 32
const VERSION = 'v1'

let cachedKey: Buffer | null = null

function loadKey(): Buffer {
  if (cachedKey) return cachedKey
  const raw = process.env.PIX_ENCRYPTION_KEY
  if (!raw) {
    throw new Error('PIX_ENCRYPTION_KEY not set. Generate with: openssl rand -base64 32')
  }
  const buf = Buffer.from(raw, 'base64')
  if (buf.length !== KEY_LENGTH) {
    throw new Error(
      `PIX_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${buf.length}). Generate with: openssl rand -base64 32`,
    )
  }
  cachedKey = buf
  return buf
}

export function resetPixKeyCache(): void {
  cachedKey = null
}

export function encryptPixKey(plaintext: string): string {
  const key = loadKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${VERSION}:${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`
}

export function isEncryptedPixKey(stored: string): boolean {
  return stored.startsWith(`${VERSION}:`)
}

export function decryptPixKey(stored: string): string {
  if (!isEncryptedPixKey(stored)) {
    return stored
  }
  const parts = stored.split(':')
  if (parts.length !== 4) {
    throw new Error('Malformed encrypted PIX key')
  }
  const [, ivB64, tagB64, ctB64] = parts
  const key = loadKey()
  const iv = Buffer.from(ivB64!, 'base64')
  const tag = Buffer.from(tagB64!, 'base64')
  const ct = Buffer.from(ctB64!, 'base64')
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)
  const dec = Buffer.concat([decipher.update(ct), decipher.final()])
  return dec.toString('utf8')
}
