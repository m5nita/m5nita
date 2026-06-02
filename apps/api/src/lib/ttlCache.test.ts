import { describe, expect, it, vi } from 'vitest'
import { createTtlCache } from './ttlCache'

describe('createTtlCache', () => {
  it('computes on miss and returns the value', async () => {
    const cache = createTtlCache<string, number>(1000)
    const compute = vi.fn(async () => 42)

    const value = await cache.getOrCompute('k', compute)

    expect(value).toBe(42)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('returns the cached value within the TTL without recomputing', async () => {
    let now = 0
    const cache = createTtlCache<string, number>(1000, () => now)
    const compute = vi.fn(async () => 42)

    await cache.getOrCompute('k', compute)
    now = 999
    const value = await cache.getOrCompute('k', compute)

    expect(value).toBe(42)
    expect(compute).toHaveBeenCalledTimes(1)
  })

  it('recomputes after the TTL expires', async () => {
    let now = 0
    const cache = createTtlCache<string, number>(1000, () => now)
    let n = 0
    const compute = vi.fn(async () => ++n)

    expect(await cache.getOrCompute('k', compute)).toBe(1)
    now = 1001
    expect(await cache.getOrCompute('k', compute)).toBe(2)
    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight computation across concurrent callers (single-flight)', async () => {
    const cache = createTtlCache<string, string>(1000)
    let calls = 0
    let release!: () => void
    const compute = () => {
      calls++
      return new Promise<string>((res) => {
        release = () => res(`v${calls}`)
      })
    }

    const a = cache.getOrCompute('k', compute)
    const b = cache.getOrCompute('k', compute)

    expect(calls).toBe(1)
    release()
    expect(await a).toBe('v1')
    expect(await b).toBe('v1')
  })

  it('caches per key independently', async () => {
    const cache = createTtlCache<string, string>(1000)
    const compute = vi.fn(async (): Promise<string> => 'x')

    await cache.getOrCompute('a', compute)
    await cache.getOrCompute('b', compute)

    expect(compute).toHaveBeenCalledTimes(2)
  })

  it('invalidate(key) forces a recompute for that key only', async () => {
    const cache = createTtlCache<string, number>(10_000)
    let a = 0
    let b = 0
    const computeA = vi.fn(async () => ++a)
    const computeB = vi.fn(async () => ++b)

    expect(await cache.getOrCompute('a', computeA)).toBe(1)
    expect(await cache.getOrCompute('b', computeB)).toBe(1)

    cache.invalidate('a')

    expect(await cache.getOrCompute('a', computeA)).toBe(2) // recomputed
    expect(await cache.getOrCompute('b', computeB)).toBe(1) // still cached
    expect(computeA).toHaveBeenCalledTimes(2)
    expect(computeB).toHaveBeenCalledTimes(1)
  })

  it('does not cache failures — a later call retries', async () => {
    const cache = createTtlCache<string, string>(1000)
    const compute = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok')

    await expect(cache.getOrCompute('k', compute)).rejects.toThrow('boom')
    await expect(cache.getOrCompute('k', compute)).resolves.toBe('ok')
    expect(compute).toHaveBeenCalledTimes(2)
  })
})
