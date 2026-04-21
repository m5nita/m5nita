import { describe, expect, it } from 'vitest'
import { SystemClock } from '../../../infrastructure/clock/SystemClock'

describe('SystemClock', () => {
  it('returns a Date close to the current instant', () => {
    const clock = new SystemClock()
    const before = Date.now()
    const now = clock.now().getTime()
    const after = Date.now()
    expect(now).toBeGreaterThanOrEqual(before)
    expect(now).toBeLessThanOrEqual(after)
  })

  it('returns a fresh Date on each call', () => {
    const clock = new SystemClock()
    const a = clock.now()
    const b = clock.now()
    expect(a).not.toBe(b)
  })
})
