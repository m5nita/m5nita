import {
  type NotificationPreferenceEntry,
  NotificationPreferences,
} from '../../domain/notification/NotificationPreferences'
import type { NotificationPreferencesRepository } from '../../domain/notification/NotificationPreferencesRepository.port'

type Input = {
  userId: string
}

type Output = {
  types: NotificationPreferenceEntry[]
}

/**
 * What the settings screen shows: the whole catalog in display order, each entry
 * resolved against this user's overrides. A user who never chose anything still
 * gets the full list — the defaults — never an empty one.
 */
export class GetNotificationPreferencesUseCase {
  constructor(private readonly preferences: NotificationPreferencesRepository) {}

  async execute(input: Input): Promise<Output> {
    const [types, overrides] = await Promise.all([
      this.preferences.listTypes(),
      this.preferences.findOverrides(input.userId),
    ])
    return { types: NotificationPreferences.of(types, overrides).list() }
  }
}
