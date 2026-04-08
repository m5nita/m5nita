import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('magic link per-email rate limiting', () => {
  const rateLimitMap = new Map<string, { count: number; resetAt: number }>()
  const MAX_REQUESTS = 3
  const WINDOW_MS = 300_000

  function checkRateLimit(email: string): boolean {
    const now = Date.now()
    const entry = rateLimitMap.get(email)
    if (entry && now < entry.resetAt && entry.count >= MAX_REQUESTS) {
      return false
    }
    if (!entry || now >= entry.resetAt) {
      rateLimitMap.set(email, { count: 1, resetAt: now + WINDOW_MS })
    } else {
      entry.count++
    }
    return true
  }

  beforeEach(() => {
    rateLimitMap.clear()
  })

  it('allows up to 3 requests per email', () => {
    expect(checkRateLimit('a@test.com')).toBe(true)
    expect(checkRateLimit('a@test.com')).toBe(true)
    expect(checkRateLimit('a@test.com')).toBe(true)
    expect(checkRateLimit('a@test.com')).toBe(false)
  })

  it('tracks emails independently', () => {
    expect(checkRateLimit('a@test.com')).toBe(true)
    expect(checkRateLimit('a@test.com')).toBe(true)
    expect(checkRateLimit('a@test.com')).toBe(true)
    expect(checkRateLimit('b@test.com')).toBe(true)
    expect(checkRateLimit('a@test.com')).toBe(false)
    expect(checkRateLimit('b@test.com')).toBe(true)
  })

  it('resets after window expires', () => {
    vi.useFakeTimers()
    expect(checkRateLimit('a@test.com')).toBe(true)
    expect(checkRateLimit('a@test.com')).toBe(true)
    expect(checkRateLimit('a@test.com')).toBe(true)
    expect(checkRateLimit('a@test.com')).toBe(false)

    vi.advanceTimersByTime(WINDOW_MS + 1)

    expect(checkRateLimit('a@test.com')).toBe(true)
    vi.useRealTimers()
  })
})
