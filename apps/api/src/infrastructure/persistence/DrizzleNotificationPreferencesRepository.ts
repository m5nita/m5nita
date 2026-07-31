import { eq, inArray, sql } from 'drizzle-orm'
import type { DbExecutor } from '../../db/client'
import { notificationPreference } from '../../db/schema/notificationPreference'
import { notificationType } from '../../db/schema/notificationType'
import type { NotificationOverrides } from '../../domain/notification/NotificationPreferences'
import type { NotificationPreferencesRepository } from '../../domain/notification/NotificationPreferencesRepository.port'
import { NotificationType } from '../../domain/notification/NotificationType'
import { createTtlCache } from '../../lib/ttlCache'

// The catalog is read on every notification and changes approximately never, so
// it is cached rather than re-queried per recipient — that is what keeps a
// broadcast at 2 queries total. The TTL (not "forever") means a newly seeded
// type appears in settings without restarting the API. The cache is per instance
// so tests get a fresh one by constructing a new repository.
const CATALOG_TTL_MS = 5 * 60_000
const CATALOG_KEY = 'catalog'

export class DrizzleNotificationPreferencesRepository implements NotificationPreferencesRepository {
  private readonly catalog = createTtlCache<string, NotificationType[]>(CATALOG_TTL_MS)

  constructor(private readonly db: DbExecutor) {}

  listTypes(): Promise<NotificationType[]> {
    return this.catalog.getOrCompute(CATALOG_KEY, () => this.loadTypes())
  }

  private async loadTypes(): Promise<NotificationType[]> {
    const rows = await this.db.select().from(notificationType).orderBy(notificationType.sortOrder)
    return rows.map((row) => NotificationType.of(row))
  }

  async findOverrides(userId: string): Promise<NotificationOverrides> {
    const rows = await this.db
      .select({
        typeCode: notificationPreference.typeCode,
        enabled: notificationPreference.enabled,
      })
      .from(notificationPreference)
      .where(eq(notificationPreference.userId, userId))
    return Object.fromEntries(rows.map((row) => [row.typeCode, row.enabled]))
  }

  async findOverridesForUsers(userIds: string[]): Promise<Map<string, NotificationOverrides>> {
    if (userIds.length === 0) return new Map()
    const rows = await this.db
      .select({
        userId: notificationPreference.userId,
        typeCode: notificationPreference.typeCode,
        enabled: notificationPreference.enabled,
      })
      .from(notificationPreference)
      .where(inArray(notificationPreference.userId, userIds))

    const byUser = new Map<string, Record<string, boolean>>()
    for (const row of rows) {
      const overrides = byUser.get(row.userId) ?? {}
      overrides[row.typeCode] = row.enabled
      byUser.set(row.userId, overrides)
    }
    return byUser
  }

  // `updatedAt` comes from the database on both branches: the insert uses the
  // column's `defaultNow()`, so the update must use `NOW()` too. Stamping it
  // with the application's `new Date()` mixes two clocks — when they disagree
  // (a container drifting from the host), an update can land *before* the
  // insert it replaces.
  async upsert(userId: string, code: string, enabled: boolean): Promise<void> {
    await this.db
      .insert(notificationPreference)
      .values({ userId, typeCode: code, enabled })
      .onConflictDoUpdate({
        target: [notificationPreference.userId, notificationPreference.typeCode],
        set: { enabled, updatedAt: sql`NOW()` },
      })
  }
}
