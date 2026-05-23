import { Hono } from 'hono'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockFindUpcoming, mockGetCompetitionById, mockClockNow } = vi.hoisted(() => ({
  mockFindUpcoming: vi.fn(),
  mockGetCompetitionById: vi.fn(),
  mockClockNow: vi.fn(() => new Date('2026-05-22T12:00:00Z')),
}))

vi.mock('../middleware/auth', () => ({
  requireAuth: vi.fn((c, next) => {
    c.set('user', { id: 'user-1' })
    c.set('session', { id: 'session-1' })
    return next()
  }),
}))

vi.mock('../../../services/competition', () => ({
  getActiveCompetitions: vi.fn(),
  getCompetitionById: mockGetCompetitionById,
}))

vi.mock('../../../container', () => ({
  getContainer: () => ({
    matchRepo: { findUpcomingByCompetition: mockFindUpcoming },
    clock: { now: mockClockNow },
  }),
}))

import { competitionsRoutes } from './competitions'

describe('GET /api/competitions/:competitionId/upcoming-matches', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockClockNow.mockReturnValue(new Date('2026-05-22T12:00:00Z'))
  })

  function makeApp() {
    const app = new Hono()
    app.route('/api', competitionsRoutes)
    return app
  }

  it('returns upcoming matches for an active competition', async () => {
    mockGetCompetitionById.mockResolvedValue({ id: 'comp-1', status: 'active' })
    mockFindUpcoming.mockResolvedValue([
      {
        id: 'm-1',
        competitionId: 'comp-1',
        homeTeam: 'A',
        awayTeam: 'B',
        homeFlag: 'a.png',
        awayFlag: 'b.png',
        matchday: 30,
        stage: 'league',
        matchDate: new Date('2026-05-23T18:00:00Z'),
        status: 'scheduled',
        group: null,
        homeScore: null,
        awayScore: null,
        externalId: 'x',
      },
    ])

    const res = await makeApp().request('/api/competitions/comp-1/upcoming-matches')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { matches: unknown[] }
    expect(body.matches).toHaveLength(1)
    expect(mockFindUpcoming).toHaveBeenCalledWith('comp-1', expect.any(Date))
  })

  it('returns 404 when competition is unknown or inactive', async () => {
    mockGetCompetitionById.mockResolvedValue(null)
    const res = await makeApp().request('/api/competitions/nope/upcoming-matches')
    expect(res.status).toBe(404)
  })

  it('returns 404 when competition exists but is not active', async () => {
    mockGetCompetitionById.mockResolvedValue({ id: 'comp-1', status: 'archived' })
    const res = await makeApp().request('/api/competitions/comp-1/upcoming-matches')
    expect(res.status).toBe(404)
  })

  it('returns empty array when no upcoming matches', async () => {
    mockGetCompetitionById.mockResolvedValue({ id: 'comp-1', status: 'active' })
    mockFindUpcoming.mockResolvedValue([])
    const res = await makeApp().request('/api/competitions/comp-1/upcoming-matches')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { matches: unknown[] }
    expect(body.matches).toHaveLength(0)
  })
})
