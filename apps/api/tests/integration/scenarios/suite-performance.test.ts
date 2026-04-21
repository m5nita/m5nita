import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { buildTestApp } from '../support/app'
import { signInViaPhoneOtp } from '../support/auth-helper'
import { TEMPLATE_DB_NAME, workerConnectionString, workerDbName } from '../support/db-utils'
import { makeCompetition } from '../support/fixtures/makeCompetition'

describe('US7 — suite operational guarantees', () => {
  let sql: ReturnType<typeof postgres>

  beforeEach(() => {
    sql = postgres(workerConnectionString(), { max: 2, onnotice: () => {} })
  })

  afterEach(async () => {
    await sql.end({ timeout: 2 })
  })

  it('scenario 1 — tests run against a per-worker clone, never the base test DB', () => {
    const workerDb = workerDbName()
    expect(workerDb).toMatch(/^m5nita_test_w\d+$/)

    const baseUrl = process.env.BASE_DATABASE_URL
    expect(baseUrl).toBeDefined()
    if (!baseUrl) return

    const base = new URL(baseUrl)
    const worker = new URL(workerConnectionString())

    // Same Postgres server, different database name.
    expect(worker.host).toBe(base.host)
    expect(worker.pathname).toBe(`/${workerDb}`)
    expect(worker.pathname).not.toBe(base.pathname)
    expect(worker.pathname).not.toBe(`/${TEMPLATE_DB_NAME}`)

    // process.env.DATABASE_URL was rewritten by per-worker-setup.ts so app
    // code loaded in this worker talks to the clone, not the base DB.
    expect(process.env.DATABASE_URL).toBe(workerConnectionString())
  })

  it('scenario 2a — writes a sentinel competition the next test must not observe', async () => {
    const sentinel = 'Sentinel Competition 2a'
    const before = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "competition" WHERE name = ${sentinel}
    `
    expect(before).toMatchObject([{ count: 0 }])

    // Deliberately write state that would leak into the next test if the
    // per-test DB reset were broken.
    await makeCompetition(sql, { name: sentinel })

    const after = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "competition" WHERE name = ${sentinel}
    `
    expect(after).toMatchObject([{ count: 1 }])
  })

  it('scenario 2b — starts from a pristine DB: 2a sentinel is gone, seed competition restored', async () => {
    const sentinel = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "competition" WHERE name = 'Sentinel Competition 2a'
    `
    expect(sentinel).toMatchObject([{ count: 0 }])

    // The baseline Copa do Mundo 2026 seed (migration 0004) is always present.
    const seed = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "competition" WHERE name = 'Copa do Mundo 2026'
    `
    expect(seed).toMatchObject([{ count: 1 }])

    // Better-Auth tables reset too — every test gets a zeroed user table.
    const users = await sql`SELECT id FROM "user"`
    expect(users).toHaveLength(0)
  })

  it('scenario 3 — signs in a user and inserts a sentinel; next test must see neither', async () => {
    const { app } = buildTestApp()
    await signInViaPhoneOtp(app, { phoneNumber: '+5511977770001' })
    await makeCompetition(sql, { name: 'Sentinel Competition 3' })

    const users = await sql`SELECT id FROM "user"`
    expect(users.length).toBeGreaterThan(0)
  })

  it('scenario 3b — state from scenario 3 was wiped on the per-test reset', async () => {
    const users = await sql`SELECT id FROM "user"`
    expect(users).toHaveLength(0)

    const sentinel = await sql<{ count: number }[]>`
      SELECT count(*)::int AS count FROM "competition" WHERE name = 'Sentinel Competition 3'
    `
    expect(sentinel).toMatchObject([{ count: 0 }])
  })
})
