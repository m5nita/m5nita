import { describe, expect, it } from 'vitest'
import {
  IMMINENT_WINDOW_MS,
  imminentPollMs,
  isImminentKickoff,
  LATE_GRACE_MS,
  livePollMs,
  matchesPollMs,
  pollMsForPhase,
  pollPhase,
  poolsPollMs,
} from './poll'

const NOW = Date.parse('2026-06-26T18:00:00.000Z')
const iso = (ms: number) => new Date(NOW + ms).toISOString()

describe('livePollMs', () => {
  it('returns 30s base plus 0–10s jitter', () => {
    for (let i = 0; i < 200; i++) {
      const ms = livePollMs()
      expect(ms).toBeGreaterThanOrEqual(30_000)
      expect(ms).toBeLessThan(40_000)
    }
  })
})

describe('imminentPollMs', () => {
  it('returns 60s base plus 0–30s jitter', () => {
    for (let i = 0; i < 200; i++) {
      const ms = imminentPollMs()
      expect(ms).toBeGreaterThanOrEqual(60_000)
      expect(ms).toBeLessThan(90_000)
    }
  })
})

describe('isImminentKickoff', () => {
  it('is true within the pre-kickoff window', () => {
    expect(isImminentKickoff(iso(IMMINENT_WINDOW_MS - 1), NOW)).toBe(true)
  })
  it('is true up to the late grace after kickoff (backend not yet flipped to live)', () => {
    expect(isImminentKickoff(iso(-LATE_GRACE_MS + 1), NOW)).toBe(true)
  })
  it('is false before the window opens', () => {
    expect(isImminentKickoff(iso(IMMINENT_WINDOW_MS + 60_000), NOW)).toBe(false)
  })
  it('is false once the late grace has elapsed', () => {
    expect(isImminentKickoff(iso(-LATE_GRACE_MS - 60_000), NOW)).toBe(false)
  })
  it('is false for an unparseable date', () => {
    expect(isImminentKickoff('not-a-date', NOW)).toBe(false)
  })
})

describe('pollPhase / pollMsForPhase', () => {
  it('live beats imminent', () => {
    expect(pollPhase({ hasLive: true, hasImminent: true })).toBe('live')
  })
  it('imminent when not live', () => {
    expect(pollPhase({ hasLive: false, hasImminent: true })).toBe('imminent')
  })
  it('idle when neither', () => {
    expect(pollPhase({ hasLive: false, hasImminent: false })).toBe('idle')
  })
  it('maps idle to false (no polling)', () => {
    expect(pollMsForPhase('idle')).toBe(false)
  })
  it('maps live/imminent to numbers in range', () => {
    const live = pollMsForPhase('live')
    const imm = pollMsForPhase('imminent')
    expect(live).toBeGreaterThanOrEqual(30_000)
    expect(live).toBeLessThan(40_000)
    expect(imm).toBeGreaterThanOrEqual(60_000)
    expect(imm).toBeLessThan(90_000)
  })
})

describe('matchesPollMs', () => {
  it('polls live cadence when any match is live', () => {
    const ms = matchesPollMs([{ status: 'live', matchDate: iso(-60_000) }], NOW)
    expect(ms).toBeGreaterThanOrEqual(30_000)
    expect(ms).toBeLessThan(40_000)
  })
  it('polls imminent cadence when a scheduled match is about to start', () => {
    const ms = matchesPollMs([{ status: 'scheduled', matchDate: iso(5 * 60_000) }], NOW)
    expect(ms).toBeGreaterThanOrEqual(60_000)
    expect(ms).toBeLessThan(90_000)
  })
  it('does not poll when nothing is live or imminent', () => {
    expect(matchesPollMs([{ status: 'scheduled', matchDate: iso(6 * 60 * 60_000) }], NOW)).toBe(
      false,
    )
  })
  it('does not poll for an empty/undefined list', () => {
    expect(matchesPollMs(undefined, NOW)).toBe(false)
    expect(matchesPollMs([], NOW)).toBe(false)
  })
})

describe('poolsPollMs', () => {
  it('polls live cadence when any pool has a live match', () => {
    const ms = poolsPollMs([{ hasLiveMatch: true, nextMatchAt: null }], NOW)
    expect(ms).toBeGreaterThanOrEqual(30_000)
    expect(ms).toBeLessThan(40_000)
  })
  it('polls imminent cadence when a pool has an imminent next match', () => {
    const ms = poolsPollMs([{ hasLiveMatch: false, nextMatchAt: iso(5 * 60_000) }], NOW)
    expect(ms).toBeGreaterThanOrEqual(60_000)
    expect(ms).toBeLessThan(90_000)
  })
  it('does not poll when idle', () => {
    expect(poolsPollMs([{ hasLiveMatch: false, nextMatchAt: iso(6 * 60 * 60_000) }], NOW)).toBe(
      false,
    )
    expect(poolsPollMs([{ hasLiveMatch: false, nextMatchAt: null }], NOW)).toBe(false)
  })
})
