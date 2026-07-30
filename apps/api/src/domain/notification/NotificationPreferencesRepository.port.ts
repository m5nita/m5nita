import type { NotificationOverrides } from './NotificationPreferences'
import type { NotificationType } from './NotificationType'

/**
 * Reads the notification catalog and the per-user overrides that diverge from
 * it. Deliberately narrow: everything a caller needs to build a
 * `NotificationPreferences` for one user or for a whole broadcast, and nothing
 * else.
 *
 * `findOverridesForUsers` exists so a broadcast costs one query instead of one
 * per recipient.
 */
export interface NotificationPreferencesRepository {
  /** The whole catalog, in display order. Expected to be cached by the adapter. */
  listTypes(): Promise<NotificationType[]>

  /** One user's stored choices. Missing keys mean "never chose". */
  findOverrides(userId: string): Promise<NotificationOverrides>

  /** One entry per user id that has at least one stored choice. */
  findOverridesForUsers(userIds: string[]): Promise<Map<string, NotificationOverrides>>

  /** Idempotent upsert on (userId, code); refreshes the change timestamp. */
  upsert(userId: string, code: string, enabled: boolean): Promise<void>
}
