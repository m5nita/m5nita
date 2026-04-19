import { randomBytes } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { decryptPixKey, encryptPixKey, isEncryptedPixKey, resetPixKeyCache } from '../pixKeyCrypto'

const TEST_KEY = randomBytes(32).toString('base64')

describe('pixKeyCrypto', () => {
  const originalKey = process.env.PIX_ENCRYPTION_KEY

  beforeEach(() => {
    process.env.PIX_ENCRYPTION_KEY = TEST_KEY
    resetPixKeyCache()
  })

  afterEach(() => {
    process.env.PIX_ENCRYPTION_KEY = originalKey
    resetPixKeyCache()
  })

  it('roundtrips CPF plaintext', () => {
    const cpf = '12345678909'
    const enc = encryptPixKey(cpf)
    expect(isEncryptedPixKey(enc)).toBe(true)
    expect(enc.startsWith('v1:')).toBe(true)
    expect(decryptPixKey(enc)).toBe(cpf)
  })

  it('produces distinct ciphertexts for same input (random IV)', () => {
    const plaintext = 'user@example.com'
    const a = encryptPixKey(plaintext)
    const b = encryptPixKey(plaintext)
    expect(a).not.toBe(b)
    expect(decryptPixKey(a)).toBe(plaintext)
    expect(decryptPixKey(b)).toBe(plaintext)
  })

  it('treats unprefixed value as legacy plaintext (backward compat)', () => {
    const legacy = '12345678909'
    expect(isEncryptedPixKey(legacy)).toBe(false)
    expect(decryptPixKey(legacy)).toBe(legacy)
  })

  it('throws when authTag is tampered', () => {
    const enc = encryptPixKey('secret-key')
    const parts = enc.split(':')
    // Flip the last byte of the auth tag
    const tagBuf = Buffer.from(parts[2]!, 'base64')
    tagBuf[tagBuf.length - 1] = tagBuf[tagBuf.length - 1]! ^ 0x01
    parts[2] = tagBuf.toString('base64')
    const tampered = parts.join(':')
    expect(() => decryptPixKey(tampered)).toThrow()
  })

  it('throws on malformed structure', () => {
    expect(() => decryptPixKey('v1:only:two')).toThrow('Malformed')
  })

  it('throws when key env is missing', () => {
    process.env.PIX_ENCRYPTION_KEY = undefined
    resetPixKeyCache()
    expect(() => encryptPixKey('x')).toThrow('PIX_ENCRYPTION_KEY')
  })

  it('throws when key has wrong byte length', () => {
    process.env.PIX_ENCRYPTION_KEY = Buffer.from('short').toString('base64')
    resetPixKeyCache()
    expect(() => encryptPixKey('x')).toThrow('32 bytes')
  })
})
