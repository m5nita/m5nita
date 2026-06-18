import { describe, expect, it, vi } from 'vitest'

// matches.ts pulls in the Drizzle client, the competition service and the auth
// middleware at module load. Stub the side-effecting ones so the pure unit
// under test (parseStatusFilter) can be imported without a real DB/env.
vi.mock('../../../db/client', () => ({ db: {} }))
vi.mock('../../../services/competition', () => ({ getFeaturedCompetitionIds: vi.fn() }))
vi.mock('../middleware/auth', () => ({ requireAuth: vi.fn((_c, next) => next()) }))

import { parseStatusFilter } from './matches'

describe('parseStatusFilter', () => {
  it('returns an empty list when the param is absent', () => {
    expect(parseStatusFilter(undefined)).toEqual([])
    expect(parseStatusFilter('')).toEqual([])
  })

  it('returns a single status unchanged (backward compatible)', () => {
    expect(parseStatusFilter('scheduled')).toEqual(['scheduled'])
  })

  it('splits a comma-separated list so the home can ask for upcoming + live', () => {
    expect(parseStatusFilter('scheduled,live')).toEqual(['scheduled', 'live'])
  })

  it('trims whitespace and drops empty entries', () => {
    expect(parseStatusFilter('scheduled, live ,')).toEqual(['scheduled', 'live'])
    expect(parseStatusFilter(',,')).toEqual([])
  })
})
