import { describe, expect, it } from 'vitest'
import { isValidCpf } from './cpf'

describe('isValidCpf', () => {
  it('accepts a CPF with valid check digits', () => {
    expect(isValidCpf('11144477735')).toBe(true)
    expect(isValidCpf('52998224725')).toBe(true)
    expect(isValidCpf('12345678909')).toBe(true)
  })

  it('rejects a CPF with invalid check digits', () => {
    // 11-digit string whose verification digits do not match.
    expect(isValidCpf('12345678901')).toBe(false)
    expect(isValidCpf('11144477700')).toBe(false)
  })

  it('rejects CPFs made of a single repeated digit (pass the math, but invalid)', () => {
    expect(isValidCpf('00000000000')).toBe(false)
    expect(isValidCpf('11111111111')).toBe(false)
    expect(isValidCpf('99999999999')).toBe(false)
  })

  it('rejects values that are not 11 digits', () => {
    expect(isValidCpf('1234567890')).toBe(false) // 10 digits
    expect(isValidCpf('123456789012')).toBe(false) // 12 digits
    expect(isValidCpf('')).toBe(false)
    expect(isValidCpf('abcdefghijk')).toBe(false)
  })

  it('ignores formatting (dots and dash)', () => {
    expect(isValidCpf('111.444.777-35')).toBe(true)
    expect(isValidCpf('123.456.789-09')).toBe(true)
  })
})
