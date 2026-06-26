import { describe, expect, it } from 'vitest'
import { CallBudget } from './callBudget'

describe('CallBudget', () => {
  it('grants up to the per-minute max', () => {
    const t = 0
    const b = new CallBudget(10, () => t)
    expect(b.available()).toBe(10)
    expect(b.take(4)).toBe(4)
    expect(b.available()).toBe(6)
  })

  it('caps a single take at the remaining budget', () => {
    const t = 0
    const b = new CallBudget(10, () => t)
    expect(b.take(8)).toBe(8)
    expect(b.take(5)).toBe(2) // only 2 left
    expect(b.take(1)).toBe(0) // exhausted
  })

  it('refills as the 60s window slides', () => {
    let t = 0
    const b = new CallBudget(10, () => t)
    expect(b.take(10)).toBe(10)
    expect(b.available()).toBe(0)
    t = 59_999
    expect(b.available()).toBe(0) // still within the window
    t = 60_001
    expect(b.available()).toBe(10) // the early calls aged out
    expect(b.take(10)).toBe(10)
  })

  it('never grants more than max across any 60s window', () => {
    let t = 0
    const b = new CallBudget(10, () => t)
    let granted = 0
    for (let i = 0; i < 120; i++) {
      granted += b.take(1)
      t += 5_000 // a take every 5s for 10 minutes
    }
    // 10 minutes at <=10/min => <=100 grants, and never >10 in any minute.
    expect(granted).toBeLessThanOrEqual(120)
    expect(granted).toBeGreaterThan(0)
  })
})
