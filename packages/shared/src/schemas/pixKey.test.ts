import { describe, expect, it } from 'vitest'
import { validatePixKey } from './index'

describe('validatePixKey (cpf)', () => {
  it('accepts a CPF with valid check digits', () => {
    expect(validatePixKey('cpf', '12345678909').success).toBe(true)
    expect(validatePixKey('cpf', '123.456.789-09').success).toBe(true)
  })

  it('rejects an 11-digit CPF with invalid check digits', () => {
    const result = validatePixKey('cpf', '12345678901')
    expect(result.success).toBe(false)
    expect(result.error).toBe('CPF inválido')
  })

  it('rejects a repeated-digit CPF', () => {
    const result = validatePixKey('cpf', '00000000000')
    expect(result.success).toBe(false)
    expect(result.error).toBe('CPF inválido')
  })

  it('reports the format error first when the length is wrong', () => {
    const result = validatePixKey('cpf', '123')
    expect(result.success).toBe(false)
    expect(result.error).toBe('CPF deve ter 11 dígitos')
  })

  it('rejects a formatted CPF with invalid check digits', () => {
    const result = validatePixKey('cpf', '111.444.777-00')
    expect(result.success).toBe(false)
    expect(result.error).toBe('CPF inválido')
  })

  it('still accepts the other key types', () => {
    expect(validatePixKey('email', 'a@b.com').success).toBe(true)
    expect(validatePixKey('phone', '+5511999999999').success).toBe(true)
    expect(validatePixKey('random', '550e8400-e29b-41d4-a716-446655440000').success).toBe(true)
  })
})
