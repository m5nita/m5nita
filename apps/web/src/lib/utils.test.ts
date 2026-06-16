import { computePlatformFee } from '@m5nita/shared'
import { describe, expect, it } from 'vitest'
import { formatMatchMinute } from './utils'

describe('computePlatformFee (shared)', () => {
  it('returns full fee with 0% discount', () => {
    expect(computePlatformFee(5000, 0)).toBe(250)
  })

  it('returns half fee with 50% discount', () => {
    expect(computePlatformFee(5000, 50)).toBe(125)
  })

  it('returns zero with 100% discount', () => {
    expect(computePlatformFee(5000, 100)).toBe(0)
  })

  it('floors fee with non-integer rate result', () => {
    expect(computePlatformFee(1000, 33)).toBe(Math.floor(1000 * 0.05 * (1 - 33 / 100)))
  })

  it('handles large entry fee', () => {
    expect(computePlatformFee(100000, 50)).toBe(2500)
  })
})

describe('formatMatchMinute', () => {
  it('formats a plain running minute', () => {
    expect(formatMatchMinute(67, null)).toBe("67'")
  })

  it('formats stoppage time as MM+N', () => {
    expect(formatMatchMinute(45, 2)).toBe("45+2'")
    expect(formatMatchMinute(90, 4)).toBe("90+4'")
  })

  it('ignores zero injury time', () => {
    expect(formatMatchMinute(90, 0)).toBe("90'")
  })

  it('returns null when there is no minute', () => {
    expect(formatMatchMinute(null, null)).toBeNull()
    expect(formatMatchMinute(undefined, 3)).toBeNull()
  })
})
