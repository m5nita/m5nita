import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../../src/db/client'
import { DrizzleMatchPointsNotifiedStore } from '../../../src/infrastructure/persistence/DrizzleMatchPointsNotifiedStore'
import { DrizzlePoolRepository } from '../../../src/infrastructure/persistence/DrizzlePoolRepository'
import { DrizzlePushSubscriptionRepository } from '../../../src/infrastructure/persistence/DrizzlePushSubscriptionRepository'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makeMatch } from '../support/fixtures/makeMatch'

/**
 * Web Push — persistence layer against real Postgres: the subscription repo
 * (idempotent upsert, multi-device, delete), the at-most-once dedupe store, and
 * the pool-scope query that drives "pontos conquistados".
 */
describe('Web Push — persistence', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  async function makeUser(id: string): Promise<string> {
    await sql`INSERT INTO "user" (id, name) VALUES (${id}, ${`User ${id}`})`
    return id
  }

  async function makePoolRow(opts: {
    competitionId: string
    ownerId: string
    matchId?: string | null
    from?: number | null
    to?: number | null
  }): Promise<string> {
    const id = crypto.randomUUID()
    await sql`
      INSERT INTO "pool"
        (id, name, entry_fee, owner_id, invite_code, competition_id,
         matchday_from, matchday_to, match_id, status, is_open)
      VALUES
        (${id}, ${`Pool ${id.slice(0, 4)}`}, 10000, ${opts.ownerId}, ${`INV${id.slice(0, 8)}`},
         ${opts.competitionId}, ${opts.from ?? null}, ${opts.to ?? null}, ${opts.matchId ?? null},
         'active', true)
    `
    return id
  }

  describe('DrizzlePushSubscriptionRepository', () => {
    it('upserts idempotently by endpoint and lists a user’s devices', async () => {
      const repo = new DrizzlePushSubscriptionRepository(db)
      const userId = await makeUser('u-push-1')

      await repo.upsert({ userId, endpoint: 'e1', p256dh: 'p', auth: 'a', userAgent: 'A' })
      await repo.upsert({ userId, endpoint: 'e1', p256dh: 'p2', auth: 'a2', userAgent: 'B' })
      await repo.upsert({ userId, endpoint: 'e2', p256dh: 'p', auth: 'a', userAgent: null })

      const subs = await repo.findByUserId(userId)
      expect(subs).toHaveLength(2)
      expect(subs.find((s) => s.endpoint === 'e1')?.p256dh).toBe('p2')
    })

    it('deletes by endpoint (scoped to the user) and in bulk', async () => {
      const repo = new DrizzlePushSubscriptionRepository(db)
      const userId = await makeUser('u-push-2')
      await repo.upsert({ userId, endpoint: 'x1', p256dh: 'p', auth: 'a', userAgent: null })
      await repo.upsert({ userId, endpoint: 'x2', p256dh: 'p', auth: 'a', userAgent: null })

      await repo.deleteByEndpoint(userId, 'x1')
      expect(await repo.findByUserId(userId)).toHaveLength(1)

      await repo.deleteByEndpoints(['x2'])
      expect(await repo.findByUserId(userId)).toHaveLength(0)
    })
  })

  describe('DrizzleMatchPointsNotifiedStore.recordOnce', () => {
    it('records once per (user, pool, match): true then false', async () => {
      const store = new DrizzleMatchPointsNotifiedStore(db)
      const comp = await makeCompetition(sql)
      const match = await makeMatch(sql, {
        competitionId: comp.id,
        matchDate: new Date('2026-06-20T18:00:00Z'),
        status: 'finished',
        matchday: 1,
        homeScore: 2,
        awayScore: 1,
      })
      const userId = await makeUser('u-points-1')
      const poolId = await makePoolRow({
        competitionId: comp.id,
        ownerId: userId,
        matchId: match.id,
      })

      expect(await store.recordOnce(userId, poolId, match.id)).toBe(true)
      expect(await store.recordOnce(userId, poolId, match.id)).toBe(false)
    })
  })

  describe('PoolRepository.findActivePoolsForMatch', () => {
    it('returns active single-match and in-range pools, excludes out-of-range', async () => {
      const poolRepo = new DrizzlePoolRepository(db)
      const comp = await makeCompetition(sql)
      const match = await makeMatch(sql, {
        competitionId: comp.id,
        matchDate: new Date('2026-06-21T18:00:00Z'),
        status: 'finished',
        matchday: 3,
      })
      const owner = await makeUser('u-owner-1')
      const singlePool = await makePoolRow({
        competitionId: comp.id,
        ownerId: owner,
        matchId: match.id,
      })
      const rangePool = await makePoolRow({
        competitionId: comp.id,
        ownerId: owner,
        from: 1,
        to: 5,
      })
      const wholeCompPool = await makePoolRow({ competitionId: comp.id, ownerId: owner })
      const outOfRangePool = await makePoolRow({
        competitionId: comp.id,
        ownerId: owner,
        from: 10,
        to: 12,
      })

      const found = await poolRepo.findActivePoolsForMatch({
        id: match.id,
        competitionId: comp.id,
        matchday: 3,
      })
      const ids = found.map((p) => p.id)

      expect(ids).toContain(singlePool)
      expect(ids).toContain(rangePool)
      expect(ids).toContain(wholeCompPool)
      expect(ids).not.toContain(outOfRangePool)
    })
  })
})
