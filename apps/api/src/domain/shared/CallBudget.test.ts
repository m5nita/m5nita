import { describe, expect, it } from 'vitest'
import { CallBudget } from './CallBudget'

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

  it('enforces the cap across a sliding 60s window', () => {
    let t = 0
    const b = new CallBudget(10, () => t)
    // Fill the window: 10 grants, then none until the window slides.
    expect(b.take(10)).toBe(10)
    expect(b.available()).toBe(0)
    t = 30_000
    expect(b.take(5)).toBe(0) // still inside the 60s window → cap holds, none granted
    t = 60_001
    // The original 10 grants have aged out → budget refilled to the full 10.
    expect(b.take(5)).toBe(5)
    expect(b.available()).toBe(5)
  })
})
