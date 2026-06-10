import { describe, expect, it, vi } from 'vitest'
import type { MatchData } from '../../domain/match/MatchRepository.port'
import { DrizzleMatchRepository } from './DrizzleMatchRepository'

function repo() {
  // hasUnfinishedFor (single-match) only goes through findById, which we stub.
  return new DrizzleMatchRepository({} as never)
}

function stubFindById(r: DrizzleMatchRepository, status: string | null) {
  vi.spyOn(r, 'findById').mockResolvedValue(
    status === null ? null : ({ status } as unknown as MatchData),
  )
}

describe('DrizzleMatchRepository.hasUnfinishedFor — single-match', () => {
  it('a finished match is not unfinished', async () => {
    const r = repo()
    stubFindById(r, 'finished')
    expect(await r.hasUnfinishedFor({ kind: 'single-match', matchId: 'm1' })).toBe(false)
  })

  it('a cancelled match is terminal, so the pool can still close', async () => {
    const r = repo()
    stubFindById(r, 'cancelled')
    expect(await r.hasUnfinishedFor({ kind: 'single-match', matchId: 'm1' })).toBe(false)
  })

  it('a scheduled match is unfinished', async () => {
    const r = repo()
    stubFindById(r, 'scheduled')
    expect(await r.hasUnfinishedFor({ kind: 'single-match', matchId: 'm1' })).toBe(true)
  })

  it('a live match is unfinished', async () => {
    const r = repo()
    stubFindById(r, 'live')
    expect(await r.hasUnfinishedFor({ kind: 'single-match', matchId: 'm1' })).toBe(true)
  })

  it('a missing match counts as unfinished', async () => {
    const r = repo()
    stubFindById(r, null)
    expect(await r.hasUnfinishedFor({ kind: 'single-match', matchId: 'm1' })).toBe(true)
  })
})
