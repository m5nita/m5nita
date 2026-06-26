import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../../src/db/client'
import { DrizzleMatchRepository } from '../../../src/infrastructure/persistence/DrizzleMatchRepository'
import { workerConnectionString } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'
import { makeMatch } from '../support/fixtures/makeMatch'

const PRE = 10 * 60_000
const GRACE = 30 * 60_000

describe('findCompetitionIdsWithLiveOrImminent', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('returns competitions with a live or imminent match, excludes far-off / finished', async () => {
    const now = new Date('2026-06-26T18:00:00.000Z')
    const compLive = await makeCompetition(sql)
    const compImminent = await makeCompetition(sql)
    const compFar = await makeCompetition(sql)
    const compFinished = await makeCompetition(sql)

    await makeMatch(sql, { competitionId: compLive.id, status: 'live', matchDate: now })
    await makeMatch(sql, {
      competitionId: compImminent.id,
      status: 'scheduled',
      matchDate: new Date(now.getTime() + 5 * 60_000),
    })
    await makeMatch(sql, {
      competitionId: compFar.id,
      status: 'scheduled',
      matchDate: new Date(now.getTime() + 6 * 60 * 60_000),
    })
    await makeMatch(sql, {
      competitionId: compFinished.id,
      status: 'finished',
      matchDate: new Date(now.getTime() - 3 * 60 * 60_000),
    })

    const matchRepo = new DrizzleMatchRepository(db)
    const ids = await matchRepo.findCompetitionIdsWithLiveOrImminent(PRE, GRACE, now)

    expect(ids.sort()).toEqual([compLive.id, compImminent.id].sort())
  })
})
