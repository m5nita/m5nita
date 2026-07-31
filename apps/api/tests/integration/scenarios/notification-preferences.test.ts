import postgres from 'postgres'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../../../src/db/client'
import { NotificationPreferences } from '../../../src/domain/notification/NotificationPreferences'
import { NOTIFICATION_TYPE_CODES } from '../../../src/domain/notification/NotificationType'
import { DrizzleNotificationPreferencesRepository } from '../../../src/infrastructure/persistence/DrizzleNotificationPreferencesRepository'
import { workerConnectionString } from '../support/db-utils'

/**
 * Notification preferences against real Postgres: the catalog seeded by
 * migration 0016, the override adapter (default resolution, idempotent upsert,
 * batched read), and the consistency gate that stops a forgotten seed from
 * silencing a notification in production.
 */
describe('Notification preferences — persistence', () => {
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

  describe('catalog seeded by migration 0016', () => {
    it('holds exactly the codes the application sends', async () => {
      const rows = await sql<{ code: string }[]>`SELECT code FROM notification_type`
      expect(rows.map((r) => r.code).sort()).toEqual([...NOTIFICATION_TYPE_CODES].sort())
    })

    it('marks the money-related types as the ones that cannot be silenced', async () => {
      const rows = await sql<
        { code: string; opt_outable: boolean }[]
      >`SELECT code, opt_outable FROM notification_type ORDER BY sort_order`
      expect(rows.filter((r) => !r.opt_outable).map((r) => r.code)).toEqual([
        'pool_result',
        'withdrawal_paid',
      ])
    })

    it('defaults every type to on, so existing users need no backfill', async () => {
      const rows = await sql<
        { default_enabled: boolean }[]
      >`SELECT default_enabled FROM notification_type`
      expect(rows.every((r) => r.default_enabled)).toBe(true)
    })

    it('describes withdrawal_paid with the label the settings screen renders', async () => {
      const rows = await sql<
        { label: string; default_enabled: boolean }[]
      >`SELECT label, default_enabled FROM notification_type WHERE code = 'withdrawal_paid'`
      expect(rows).toMatchObject([{ label: 'Prêmio pago', default_enabled: true }])
    })
  })

  describe('DrizzleNotificationPreferencesRepository', () => {
    it('lists the catalog in display order', async () => {
      const repo = new DrizzleNotificationPreferencesRepository(db)
      const types = await repo.listTypes()
      expect(types.map((t) => t.code)).toEqual([
        'new_pool',
        'prediction_reminder',
        'match_points',
        'pool_result',
        'withdrawal_paid',
      ])
    })

    it('resolves to the catalog default when the user has no stored row', async () => {
      const repo = new DrizzleNotificationPreferencesRepository(db)
      const userId = await makeUser('u-pref-default')

      const overrides = await repo.findOverrides(userId)
      expect(overrides).toEqual({})

      const prefs = NotificationPreferences.of(await repo.listTypes(), overrides)
      expect(prefs.allows('new_pool')).toBe(true)
      expect(prefs.allows('prediction_reminder')).toBe(true)
    })

    it('upserts twice without duplicating the row, refreshing updated_at', async () => {
      const repo = new DrizzleNotificationPreferencesRepository(db)
      const userId = await makeUser('u-pref-upsert')

      await repo.upsert(userId, 'new_pool', false)
      const [first] = await sql<
        { enabled: boolean; updated_at: Date }[]
      >`SELECT enabled, updated_at FROM notification_preference WHERE user_id = ${userId}`

      await repo.upsert(userId, 'new_pool', true)
      const rows = await sql<
        { enabled: boolean; updated_at: Date }[]
      >`SELECT enabled, updated_at FROM notification_preference WHERE user_id = ${userId}`

      expect(rows).toHaveLength(1)
      expect(rows[0]?.enabled).toBe(true)
      expect(rows[0]?.updated_at.getTime()).toBeGreaterThanOrEqual(first?.updated_at.getTime() ?? 0)
    })

    it('leaves the other types untouched when one is toggled', async () => {
      const repo = new DrizzleNotificationPreferencesRepository(db)
      const userId = await makeUser('u-pref-isolated')

      await repo.upsert(userId, 'new_pool', false)
      await repo.upsert(userId, 'match_points', true)

      expect(await repo.findOverrides(userId)).toEqual({
        new_pool: false,
        match_points: true,
      })
    })

    it('reads a whole broadcast’s overrides in one call, skipping users with none', async () => {
      const repo = new DrizzleNotificationPreferencesRepository(db)
      const withOverride = await makeUser('u-pref-batch-1')
      const untouched = await makeUser('u-pref-batch-2')
      await repo.upsert(withOverride, 'new_pool', false)

      const byUser = await repo.findOverridesForUsers([withOverride, untouched])

      expect(byUser.get(withOverride)).toEqual({ new_pool: false })
      expect(byUser.has(untouched)).toBe(false)
    })

    it('returns an empty map for an empty audience without querying', async () => {
      const repo = new DrizzleNotificationPreferencesRepository(db)
      expect(await repo.findOverridesForUsers([])).toEqual(new Map())
    })

    it('drops a user’s preferences when the account is deleted', async () => {
      const repo = new DrizzleNotificationPreferencesRepository(db)
      const userId = await makeUser('u-pref-cascade')
      await repo.upsert(userId, 'new_pool', false)

      await sql`DELETE FROM "user" WHERE id = ${userId}`

      const rows = await sql`SELECT 1 FROM notification_preference WHERE user_id = ${userId}`
      expect(rows).toHaveLength(0)
    })
  })
})
