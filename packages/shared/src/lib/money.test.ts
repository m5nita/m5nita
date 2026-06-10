import { describe, expect, it } from 'vitest'
import { formatBrl } from './money'

describe('formatBrl', () => {
  it('formats centavos as BRL currency', () => {
    expect(formatBrl(18000)).toContain('180,00')
    expect(formatBrl(18000)).toMatch(/^R\$/)
  })

  it('formats zero', () => {
    expect(formatBrl(0)).toContain('0,00')
  })

  it('always shows two fraction digits', () => {
    expect(formatBrl(500)).toContain('5,00')
    expect(formatBrl(550)).toContain('5,50')
  })

  it('groups thousands', () => {
    expect(formatBrl(123456)).toContain('1.234,56')
  })
})
