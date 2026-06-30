import { describe, expect, it, vi } from 'vitest'
import type { MatchData, MatchRepository } from '../../domain/match/MatchRepository.port'
import { FinalizeMatchUseCase } from './FinalizeMatchUseCase'

function matchData(overrides: Partial<MatchData> = {}): MatchData {
  return {
    id: 'm1',
    externalId: '537418',
    competitionId: 'c1',
    homeTeam: 'Netherlands',
    awayTeam: 'Morocco',
    homeFlag: '',
    awayFlag: '',
    homeScore: 1,
    awayScore: 1,
    extraTimeHomeScore: 0,
    extraTimeAwayScore: 0,
    penaltyHomeScore: 2,
    penaltyAwayScore: 3,
    winner: null,
    duration: 'penalty_shootout',
    stage: 'round-of-32',
    group: null,
    matchday: null,
    matchDate: new Date('2026-06-30T01:00:00Z'),
    status: 'live',
    ...overrides,
  }
}

function makeUseCase(match: MatchData | null) {
  const finalizeWithWinner = vi.fn(async () => {})
  const rescore = vi.fn(async () => {})
  const matchRepo = {
    findById: vi.fn(async () => match),
    finalizeWithWinner,
  } as unknown as MatchRepository
  return { uc: new FinalizeMatchUseCase({ matchRepo, rescore }), finalizeWithWinner, rescore }
}

describe('FinalizeMatchUseCase', () => {
  it('sets the winner, finishes, and re-scores', async () => {
    const { uc, finalizeWithWinner, rescore } = makeUseCase(matchData())
    await uc.execute('m1', 'away')
    expect(finalizeWithWinner).toHaveBeenCalledWith('m1', 'away')
    expect(rescore).toHaveBeenCalledWith('m1')
  })

  it('rejects an invalid winner without touching the match', async () => {
    const { uc, finalizeWithWinner, rescore } = makeUseCase(matchData())
    await expect(uc.execute('m1', 'nobody')).rejects.toThrow('INVALID_WINNER')
    expect(finalizeWithWinner).not.toHaveBeenCalled()
    expect(rescore).not.toHaveBeenCalled()
  })

  it('rejects a draw on a knockout match', async () => {
    const { uc, finalizeWithWinner } = makeUseCase(matchData({ stage: 'round-of-32' }))
    await expect(uc.execute('m1', 'draw')).rejects.toThrow('KNOCKOUT_CANNOT_DRAW')
    expect(finalizeWithWinner).not.toHaveBeenCalled()
  })

  it('allows a draw on a group-stage match', async () => {
    const { uc, finalizeWithWinner, rescore } = makeUseCase(matchData({ stage: 'group' }))
    await uc.execute('m1', 'draw')
    expect(finalizeWithWinner).toHaveBeenCalledWith('m1', 'draw')
    expect(rescore).toHaveBeenCalledWith('m1')
  })

  it('throws when the match does not exist', async () => {
    const { uc, finalizeWithWinner } = makeUseCase(null)
    await expect(uc.execute('missing', 'home')).rejects.toThrow('MATCH_NOT_FOUND')
    expect(finalizeWithWinner).not.toHaveBeenCalled()
  })
})
