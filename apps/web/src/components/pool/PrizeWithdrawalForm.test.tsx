import { describe, expect, it } from 'vitest'

describe('PrizeWithdrawalForm', () => {
  it('exports a component function', async () => {
    const mod = await import('./PrizeWithdrawalForm')
    expect(typeof mod.PrizeWithdrawalForm).toBe('function')
  })
})
