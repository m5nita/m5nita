import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Prediction } from '../../../src/domain/prediction/Prediction'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makeMatch } from '../support/fixtures/makeMatch'
import { makePool } from '../support/fixtures/makePool'
import { deliverInfinitePayPaidWebhook } from '../support/payments'

const KICKOFF = new Date('2026-06-15T18:00:00.000Z')
const BEFORE = new Date('2026-06-15T17:00:00.000Z')

describe('prediction upsert race (regression)', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  // Production repro: two overlapping PUTs both pass `findByUserPoolMatch`
  // before either INSERTs, so both reach `save()` with id=null for the same
  // (user, pool, match) triple. The second INSERT used to violate
  // `prediction_user_id_pool_id_match_id_idx` → 500 + a lost prediction.
  // Post-fix: last write wins, exactly one row, no throw.
  it('two id=null saves for the same triple → one row, last-write-wins, no duplicate-key error', async () => {
    const { app, container } = buildTestApp({ initialNow: BEFORE })
    const comp = await makeCompetition(sql)
    const admin = await signInViaPhoneOtp(app, { phoneNumber: '+5511933330051' })
    const pool = await makePool({ admin, competitionId: comp.id, entryFeeCentavos: 10_000 })
    await deliverInfinitePayPaidWebhook(app, pool.paymentId)
    const match = await makeMatch(sql, { competitionId: comp.id, matchDate: KICKOFF })

    // Both "requests" observed no existing row, so both carry id=null.
    const first = new Prediction(null, admin.id, pool.id, match.id, 2, 1, null, null)
    const second = new Prediction(null, admin.id, pool.id, match.id, 0, 3, null, null)

    await container.predictionRepo.save(first)
    // Pre-fix this throws PostgresError 23505 (duplicate key); post-fix it upserts.
    await expect(container.predictionRepo.save(second)).resolves.toBeDefined()

    const rows = await sql`
      SELECT home_score, away_score, points FROM "prediction"
      WHERE user_id = ${admin.id} AND pool_id = ${pool.id} AND match_id = ${match.id}
    `
    // Exactly one row for the triple — the unique index still holds.
    expect(rows).toHaveLength(1)
    // Last write wins.
    expect(rows[0]).toMatchObject({ home_score: 0, away_score: 3 })
    // Points untouched (predictions are pre-kickoff, so points are null).
    expect(rows[0]?.points).toBeNull()
  })
})
