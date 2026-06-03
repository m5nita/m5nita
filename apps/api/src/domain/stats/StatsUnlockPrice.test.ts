import { describe, expect, it } from 'vitest'
import { StatsUnlockPrice } from './StatsUnlockPrice'

describe('StatsUnlockPrice', () => {
  it('default_price_is_199_centavos', () => {
    expect(StatsUnlockPrice.default().centavos).toBe(199)
  })

  it('of_accepts_configured_override', () => {
    expect(StatsUnlockPrice.of(500).centavos).toBe(500)
  })

  it('of_rejects_negative_or_fractional_centavos', () => {
    expect(() => StatsUnlockPrice.of(-1)).toThrow()
    expect(() => StatsUnlockPrice.of(1.5)).toThrow()
  })

  it('formatted_renders_brl_string', () => {
    const formatted = StatsUnlockPrice.of(199).formatted()
    expect(formatted).toContain('1,99')
    expect(formatted).toContain('R$')
  })
})
