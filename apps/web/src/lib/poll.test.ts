import { describe, expect, it } from 'vitest'
import { livePollMs } from './poll'

describe('livePollMs', () => {
  it('returns 30s base plus 0–10s jitter', () => {
    for (let i = 0; i < 200; i++) {
      const ms = livePollMs()
      expect(ms).toBeGreaterThanOrEqual(30_000)
      expect(ms).toBeLessThan(40_000)
    }
  })

  it('does not return the same value every call (jitter is applied)', () => {
    const values = new Set(Array.from({ length: 50 }, () => livePollMs()))
    expect(values.size).toBeGreaterThan(1)
  })
})
