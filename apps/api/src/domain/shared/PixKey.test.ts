import { describe, expect, it } from 'vitest'
import { PixKey } from './PixKey'

describe('PixKey', () => {
  describe('PixKey.create()', () => {
    it('creates a valid CPF key with 11 digits', () => {
      const key = PixKey.create('cpf', '12345678901')
      expect(key.type).toBe('cpf')
      expect(key.value).toBe('12345678901')
    })

    it('rejects CPF with wrong length', () => {
      expect(() => PixKey.create('cpf', '1234567890')).toThrow('CPF must be exactly 11 digits')
    })

    it('creates a valid email key', () => {
      const key = PixKey.create('email', 'user@example.com')
      expect(key.type).toBe('email')
      expect(key.value).toBe('user@example.com')
    })

    it('creates a valid phone key', () => {
      const key = PixKey.create('phone', '+5511999999999')
      expect(key.type).toBe('phone')
      expect(key.value).toBe('+5511999999999')
    })

    it('creates a valid random key in UUID format', () => {
      const uuid = '550e8400-e29b-41d4-a716-446655440000'
      const key = PixKey.create('random', uuid)
      expect(key.type).toBe('random')
      expect(key.value).toBe(uuid)
    })

    it('rejects invalid type', () => {
      expect(() => PixKey.create('cnpj', '12345678000100')).toThrow('Invalid PIX key type: cnpj')
    })
  })

  describe('masked()', () => {
    it('hides all but last 4 characters', () => {
      const key = PixKey.create('cpf', '12345678901')
      expect(key.masked()).toBe('*******8901')
    })

    it('returns full value when length is 4 or less', () => {
      const key = PixKey.create('email', 'a@b.')
      expect(key.masked()).toBe('a@b.')
    })
  })
})
