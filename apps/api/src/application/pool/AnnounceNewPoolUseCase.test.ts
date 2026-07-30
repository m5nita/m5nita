import { describe, expect, it, vi } from 'vitest'
import type { PoolRepository, PoolWithDetails } from '../../domain/pool/PoolRepository.port'
import type { NewPoolData, NotificationService } from '../ports/NotificationService.port'
import type { UserDirectory } from '../ports/UserDirectory.port'
import { AnnounceNewPoolUseCase, type FixtureFinder } from './AnnounceNewPoolUseCase'

const MATCH_ID = '11111111-1111-4111-8111-111111111111'

function poolDetails(over: Partial<PoolWithDetails> = {}): PoolWithDetails {
  return {
    id: 'pool-1',
    name: 'Bolão da firma',
    entryFee: 5000,
    ownerId: 'owner-1',
    inviteCode: 'ABC123',
    competitionId: 'comp-1',
    matchdayFrom: 5,
    matchdayTo: 8,
    matchId: null,
    status: 'active',
    isOpen: true,
    notifyOnCreate: true,
    couponId: null,
    owner: { id: 'owner-1', name: 'Igor Túllio' },
    competitionName: 'Brasileirão Série A',
    coupon: null,
    memberCount: 1,
    prizeTotal: 5000,
    hasLiveMatch: false,
    ...over,
  }
}

function makeUseCase(over?: {
  pool?: PoolWithDetails | null
  recipients?: Array<{ userId: string; phoneNumber: string | null }>
  fixture?: FixtureFinder
}) {
  // `pool: null` must mean "gone", not "use the default" — hence the key check.
  const resolvedPool = over && 'pool' in over ? over.pool : poolDetails()
  const findByIdWithDetails = vi.fn(async () => resolvedPool)
  const poolRepo = { findByIdWithDetails } as unknown as PoolRepository
  const users = {
    listAllExcept: vi.fn(
      async () => over?.recipients ?? [{ userId: 'r1', phoneNumber: '+5511999999999' }],
    ),
  } satisfies UserDirectory
  const notifyNewPool = vi.fn(async () => {})
  const notifications = { notifyNewPool } as unknown as NotificationService
  const findFixture: FixtureFinder = over?.fixture ?? vi.fn(async () => null)

  return {
    users,
    notifyNewPool,
    findFixture,
    useCase: new AnnounceNewPoolUseCase(poolRepo, users, notifications, findFixture),
  }
}

function payload(notifyNewPool: ReturnType<typeof vi.fn>): NewPoolData {
  return notifyNewPool.mock.calls[0]?.[0] as NewPoolData
}

describe('AnnounceNewPoolUseCase', () => {
  it('announces to every user except the creator', async () => {
    const { useCase, users, notifyNewPool } = makeUseCase({
      recipients: [
        { userId: 'r1', phoneNumber: null },
        { userId: 'r2', phoneNumber: '+5511888888888' },
      ],
    })

    await useCase.execute({ poolId: 'pool-1' })

    expect(users.listAllExcept).toHaveBeenCalledWith('owner-1')
    expect(payload(notifyNewPool).recipients).toHaveLength(2)
  })

  it('carries the pool, competition, entry fee and invite code', async () => {
    const { useCase, notifyNewPool } = makeUseCase()

    await useCase.execute({ poolId: 'pool-1' })

    expect(payload(notifyNewPool)).toMatchObject({
      poolId: 'pool-1',
      poolName: 'Bolão da firma',
      inviteCode: 'ABC123',
      competitionName: 'Brasileirão Série A',
      entryFee: 5000,
    })
  })

  it('uses only the creator’s first name', async () => {
    const { useCase, notifyNewPool } = makeUseCase()

    await useCase.execute({ poolId: 'pool-1' })

    expect(payload(notifyNewPool).creatorFirstName).toBe('Igor')
  })

  it('falls back to a neutral name when the creator has none', async () => {
    const { useCase, notifyNewPool } = makeUseCase({
      pool: poolDetails({ owner: { id: 'owner-1', name: '' } }),
    })

    await useCase.execute({ poolId: 'pool-1' })

    expect(payload(notifyNewPool).creatorFirstName).toBe('Alguém')
  })

  it('does nothing when the creator did not ask for it', async () => {
    const { useCase, notifyNewPool, users } = makeUseCase({
      pool: poolDetails({ notifyOnCreate: false }),
    })

    await useCase.execute({ poolId: 'pool-1' })

    expect(notifyNewPool).not.toHaveBeenCalled()
    expect(users.listAllExcept).not.toHaveBeenCalled()
  })

  it('does nothing when the pool no longer exists', async () => {
    const { useCase, notifyNewPool } = makeUseCase({ pool: null })

    await expect(useCase.execute({ poolId: 'gone' })).resolves.toBeUndefined()
    expect(notifyNewPool).not.toHaveBeenCalled()
  })

  it('does not notify when the creator is the only registered user', async () => {
    const { useCase, notifyNewPool } = makeUseCase({ recipients: [] })

    await useCase.execute({ poolId: 'pool-1' })

    expect(notifyNewPool).not.toHaveBeenCalled()
  })

  describe('scope wording', () => {
    it('describes a matchday range', async () => {
      const { useCase, notifyNewPool } = makeUseCase()

      await useCase.execute({ poolId: 'pool-1' })

      expect(payload(notifyNewPool).scopeLabel).toBe('Rodadas 5 a 8')
    })

    it('describes a whole-competition pool', async () => {
      const { useCase, notifyNewPool } = makeUseCase({
        pool: poolDetails({ matchdayFrom: null, matchdayTo: null }),
      })

      await useCase.execute({ poolId: 'pool-1' })

      expect(payload(notifyNewPool).scopeLabel).toBe('Campeonato completo')
    })

    it('resolves the fixture for a single-match pool', async () => {
      const findFixture = vi.fn(async () => ({ homeTeam: 'Flamengo', awayTeam: 'Palmeiras' }))
      const { useCase, notifyNewPool } = makeUseCase({
        pool: poolDetails({ matchdayFrom: null, matchdayTo: null, matchId: MATCH_ID }),
        fixture: findFixture,
      })

      await useCase.execute({ poolId: 'pool-1' })

      expect(findFixture).toHaveBeenCalledWith(MATCH_ID)
      expect(payload(notifyNewPool).scopeLabel).toBe('Flamengo x Palmeiras')
    })

    it('never looks up a fixture for a non-single-match pool', async () => {
      const { useCase, findFixture } = makeUseCase()

      await useCase.execute({ poolId: 'pool-1' })

      expect(findFixture).not.toHaveBeenCalled()
    })

    it('degrades to a generic label when the fixture lookup fails', async () => {
      const { useCase, notifyNewPool } = makeUseCase({
        pool: poolDetails({ matchdayFrom: null, matchdayTo: null, matchId: MATCH_ID }),
        fixture: vi.fn(async () => {
          throw new Error('match feed down')
        }),
      })

      await useCase.execute({ poolId: 'pool-1' })

      expect(payload(notifyNewPool).scopeLabel).toBe('Jogo único')
    })
  })
})
