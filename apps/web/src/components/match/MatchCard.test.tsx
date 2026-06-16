import type { Match } from '@m5nita/shared'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MatchCard } from './MatchCard'

function liveMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: 'm1',
    competitionId: 'c1',
    homeTeam: 'BRA',
    awayTeam: 'ARG',
    homeFlag: null,
    awayFlag: null,
    homeScore: 1,
    awayScore: 0,
    stage: 'group',
    group: 'A',
    matchday: 1,
    matchDate: '2026-06-15T20:00:00Z',
    status: 'live',
    minute: 67,
    injuryTime: null,
    ...overrides,
  }
}

describe('<MatchCard /> live minute', () => {
  afterEach(() => cleanup())

  it('appends the running minute to the "Ao Vivo" badge when live', () => {
    render(<MatchCard match={liveMatch()} />)
    expect(screen.getByText(/Ao Vivo 67'/)).toBeInTheDocument()
  })

  it('shows stoppage time as MM+N', () => {
    render(<MatchCard match={liveMatch({ minute: 90, injuryTime: 4 })} />)
    expect(screen.getByText(/Ao Vivo 90\+4'/)).toBeInTheDocument()
  })

  it('shows no minute for a scheduled match', () => {
    render(<MatchCard match={liveMatch({ status: 'scheduled', minute: null })} />)
    expect(screen.queryByText(/\d+'/)).not.toBeInTheDocument()
  })
})
