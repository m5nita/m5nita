import { afterEach, describe, expect, it, vi } from 'vitest'
import { claimUncelebrated, prefersReducedMotion, vibrate } from './celebrate'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('claimUncelebrated', () => {
  it('returns all keys the first time and marks them', () => {
    expect(claimUncelebrated(['a', 'b'])).toEqual(['a', 'b'])
  })

  it('returns only unseen keys on later calls', () => {
    claimUncelebrated(['a'])
    expect(claimUncelebrated(['a', 'b'])).toEqual(['b'])
    expect(claimUncelebrated(['a', 'b'])).toEqual([])
  })

  it('never throws when localStorage.setItem fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    expect(() => claimUncelebrated(['x'])).not.toThrow()
  })
})

describe('vibrate', () => {
  it('calls navigator.vibrate when motion is allowed', () => {
    const spy = vi.fn()
    vi.stubGlobal('navigator', { vibrate: spy })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: false } as MediaQueryList)
    vibrate(30)
    expect(spy).toHaveBeenCalledWith(30)
  })

  it('is a no-op under prefers-reduced-motion', () => {
    const spy = vi.fn()
    vi.stubGlobal('navigator', { vibrate: spy })
    vi.spyOn(window, 'matchMedia').mockReturnValue({ matches: true } as MediaQueryList)
    vibrate(30)
    expect(spy).not.toHaveBeenCalled()
    expect(prefersReducedMotion()).toBe(true)
  })
})
